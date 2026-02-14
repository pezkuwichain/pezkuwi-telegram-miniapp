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

interface CreateOfferRequest {
  sessionToken: string;
  token: 'HEZ' | 'PEZ';
  amountCrypto: number;
  fiatCurrency: 'TRY' | 'IQD' | 'IRR' | 'EUR' | 'USD';
  fiatAmount: number;
  paymentMethodId: string;
  paymentDetailsEncrypted: string;
  minOrderAmount?: number;
  maxOrderAmount?: number;
  timeLimitMinutes?: number;
  adType?: 'buy' | 'sell';
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
    const body: CreateOfferRequest = await req.json();
    const {
      sessionToken,
      token,
      amountCrypto,
      fiatCurrency,
      fiatAmount,
      paymentMethodId,
      paymentDetailsEncrypted,
      minOrderAmount,
      maxOrderAmount,
      timeLimitMinutes = 30,
      adType = 'sell',
    } = body;

    // Get bot token for session verification
    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
    if (!botToken) {
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

    const telegramId = verifySessionToken(sessionToken, botToken);
    if (!telegramId) {
      return new Response(JSON.stringify({ error: 'Invalid or expired session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate required fields
    if (!token || !amountCrypto || !fiatCurrency || !fiatAmount || !paymentMethodId) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create Supabase admin client (bypasses RLS)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get auth user ID for this telegram user
    const telegramEmail = `telegram_${telegramId}@pezkuwichain.io`;
    const {
      data: { users: authUsers },
    } = await supabase.auth.admin.listUsers();
    const authUser = authUsers?.find((u) => u.email === telegramEmail);

    if (!authUser) {
      return new Response(JSON.stringify({ error: 'User not found. Please authenticate first.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = authUser.id;

    // 1. Lock escrow from internal balance
    const { data: lockResult, error: lockError } = await supabase.rpc('lock_escrow_internal', {
      p_user_id: userId,
      p_token: token,
      p_amount: amountCrypto,
    });

    if (lockError) {
      console.error('Lock escrow error:', lockError);
      return new Response(
        JSON.stringify({ error: 'Failed to lock escrow: ' + lockError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Parse result
    const lockResponse = typeof lockResult === 'string' ? JSON.parse(lockResult) : lockResult;

    if (!lockResponse.success) {
      return new Response(
        JSON.stringify({ error: lockResponse.error || 'Failed to lock balance' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 2. Create offer in database (using service role bypasses RLS)
    const { data: offer, error: offerError } = await supabase
      .from('p2p_fiat_offers')
      .insert({
        seller_id: userId,
        seller_wallet: '',
        token,
        amount_crypto: amountCrypto,
        fiat_currency: fiatCurrency,
        fiat_amount: fiatAmount,
        payment_method_id: paymentMethodId,
        payment_details_encrypted: paymentDetailsEncrypted,
        min_order_amount: minOrderAmount || null,
        max_order_amount: maxOrderAmount || null,
        time_limit_minutes: timeLimitMinutes,
        status: 'open',
        remaining_amount: amountCrypto,
        escrow_locked_at: new Date().toISOString(),
        ad_type: adType,
      })
      .select()
      .single();

    if (offerError) {
      console.error('Create offer error:', offerError);

      // Rollback: refund escrow
      try {
        await supabase.rpc('refund_escrow_internal', {
          p_user_id: userId,
          p_token: token,
          p_amount: amountCrypto,
        });
      } catch (refundErr) {
        console.error('Failed to refund escrow:', refundErr);
      }

      return new Response(
        JSON.stringify({ error: 'Failed to create offer: ' + offerError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 3. Log to audit
    await supabase.from('p2p_audit_log').insert({
      user_id: userId,
      action: 'create_offer',
      entity_type: 'offer',
      entity_id: offer.id,
      details: {
        token,
        amount_crypto: amountCrypto,
        fiat_currency: fiatCurrency,
        fiat_amount: fiatAmount,
        escrow_type: 'internal_ledger',
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        offer_id: offer.id,
        offer,
        locked_balance: lockResponse.locked_balance,
        available_balance: lockResponse.available_balance,
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
