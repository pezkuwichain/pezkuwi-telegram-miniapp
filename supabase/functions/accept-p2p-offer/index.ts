import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createHmac } from 'https://deno.land/std@0.177.0/node/crypto.ts';

// CORS - Production domain only
const ALLOWED_ORIGINS = [
  'https://telegram.pezkuwichain.io',
  'https://telegram.pezkiwi.app',
  'https://t.me',
];

function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigin =
    origin && ALLOWED_ORIGINS.some((o) => origin.startsWith(o)) ? origin : ALLOWED_ORIGINS[0];

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-supabase-client-platform',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

interface AcceptP2POfferRequest {
  sessionToken: string;
  offerId: string;
  amount: number;
  buyerWallet: string;
}

// Session token secret (derived from bot token)
function getSessionSecret(botToken: string): Uint8Array {
  return createHmac('sha256', 'SessionTokenSecret').update(botToken).digest();
}

// Verify HMAC-signed session token
function verifySessionToken(token: string, botToken: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) {
      // Try legacy format for backwards compatibility
      return verifyLegacyToken(token);
    }

    const [payloadB64, signature] = parts;

    // Verify signature
    const secret = getSessionSecret(botToken);
    const expectedSig = createHmac('sha256', secret).update(payloadB64).digest('hex');

    if (signature !== expectedSig) {
      return null;
    }

    // Parse payload
    const payload = JSON.parse(atob(payloadB64));

    // Check expiration
    if (Date.now() > payload.exp) {
      return null;
    }

    return payload.tgId;
  } catch {
    return null;
  }
}

// Legacy token format (Base64 only) - for backwards compatibility
function verifyLegacyToken(token: string): number | null {
  try {
    const decoded = atob(token);
    const [telegramId, timestamp] = decoded.split(':');
    const ts = parseInt(timestamp);
    // Token valid for 7 days
    if (Date.now() - ts > 7 * 24 * 60 * 60 * 1000) {
      return null;
    }
    return parseInt(telegramId);
  } catch {
    return null;
  }
}

serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body: AcceptP2POfferRequest = await req.json();
    const { sessionToken, offerId, amount, buyerWallet } = body;

    // Get bot tokens for session verification (dual bot support)
    const botTokens: string[] = [];
    const _mainToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const _krdToken = Deno.env.get('TELEGRAM_BOT_TOKEN_KRD');
    if (_mainToken) botTokens.push(_mainToken);
    if (_krdToken) botTokens.push(_krdToken);
    if (botTokens.length === 0) {
      return new Response(JSON.stringify({ error: 'Server configuration error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate session token
    if (!sessionToken) {
      return new Response(JSON.stringify({ error: 'Missing session token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let telegramId: number | null = null;
    for (const bt of botTokens) {
      telegramId = verifySessionToken(sessionToken, bt);
      if (telegramId) break;
    }
    if (!telegramId) {
      return new Response(JSON.stringify({ error: 'Invalid or expired session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate required fields
    if (!offerId || !amount || !buyerWallet) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: offerId, amount, buyerWallet' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (amount <= 0) {
      return new Response(JSON.stringify({ error: 'Amount must be greater than 0' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create Supabase admin client (bypasses RLS)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Resolve P2P user ID: prefer p2p_user_id (citizen/visa UUID, same as pwap/web)
    // fallback to tg_users.id (legacy Supabase Auth UUID)
    const { data: tgUser, error: tgUserError } = await supabase
      .from('tg_users')
      .select('id, p2p_user_id')
      .eq('telegram_id', telegramId)
      .single();

    if (tgUserError || !tgUser) {
      return new Response(JSON.stringify({ error: 'User not found. Please authenticate first.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = tgUser.p2p_user_id ?? tgUser.id;

    // Call the accept_p2p_offer RPC function
    const { data: rpcResult, error: rpcError } = await supabase.rpc('accept_p2p_offer', {
      p_offer_id: offerId,
      p_buyer_id: userId,
      p_buyer_wallet: buyerWallet,
      p_amount: amount,
    });

    if (rpcError) {
      console.error('Accept offer RPC error:', rpcError);
      return new Response(
        JSON.stringify({ error: 'Failed to accept offer: ' + rpcError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Parse the JSON result
    const result = typeof rpcResult === 'string' ? JSON.parse(rpcResult) : rpcResult;

    if (!result.success) {
      return new Response(JSON.stringify({ error: result.error || 'Failed to accept offer' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Log to p2p_audit_log
    await supabase.from('p2p_audit_log').insert({
      user_id: userId,
      action: 'accept_offer',
      entity_type: 'trade',
      entity_id: result.trade_id,
      details: {
        offer_id: offerId,
        amount,
        buyer_wallet: buyerWallet,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        tradeId: result.trade_id,
        trade: result.trade || result,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error:', error);
    const origin = req.headers.get('origin');
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      {
        status: 500,
        headers: { ...getCorsHeaders(origin), 'Content-Type': 'application/json' },
      }
    );
  }
});
