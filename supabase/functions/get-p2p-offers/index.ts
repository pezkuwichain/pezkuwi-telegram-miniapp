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

interface GetP2POffersRequest {
  sessionToken: string;
  adType?: 'buy' | 'sell';
  token?: 'HEZ' | 'PEZ';
  fiatCurrency?: string;
  page?: number;
  limit?: number;
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
    const body: GetP2POffersRequest = await req.json();
    const {
      sessionToken,
      adType,
      token,
      fiatCurrency,
      page = 1,
      limit = 20,
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

    // Create Supabase admin client (bypasses RLS)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get auth user ID for this telegram user
    const telegramEmail = `telegram_${telegramId}@pezkuwichain.io`;
    const {
      data: { users: authUsers },
    } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const authUser = authUsers?.find((u) => u.email === telegramEmail);

    if (!authUser) {
      return new Response(JSON.stringify({ error: 'User not found. Please authenticate first.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = authUser.id;

    // Calculate pagination
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(Math.max(1, limit), 100);
    const offset = (safePage - 1) * safeLimit;

    // Build query for p2p_fiat_offers
    let query = supabase
      .from('p2p_fiat_offers')
      .select('*', { count: 'exact' })
      .eq('status', 'open')
      .gt('remaining_amount', 0)
      .gt('expires_at', new Date().toISOString())
      .neq('seller_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + safeLimit - 1);

    // Apply optional filters
    if (adType) {
      query = query.eq('ad_type', adType);
    }
    if (token) {
      query = query.eq('token', token);
    }
    if (fiatCurrency) {
      query = query.eq('fiat_currency', fiatCurrency);
    }

    const { data: offers, error: offersError, count } = await query;

    if (offersError) {
      console.error('Offers query error:', offersError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch offers: ' + offersError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (!offers || offers.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          offers: [],
          total: 0,
          page: safePage,
          limit: safeLimit,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Collect unique payment method IDs and seller IDs
    const paymentMethodIds = [...new Set(offers.map((o) => o.payment_method_id).filter(Boolean))];
    const sellerIds = [...new Set(offers.map((o) => o.seller_id).filter(Boolean))];

    // Fetch payment method names in a separate query
    let paymentMethodMap: Record<string, string> = {};
    if (paymentMethodIds.length > 0) {
      const { data: paymentMethods } = await supabase
        .from('payment_methods')
        .select('id, method_name')
        .in('id', paymentMethodIds);

      if (paymentMethods) {
        paymentMethodMap = Object.fromEntries(
          paymentMethods.map((pm) => [pm.id, pm.method_name])
        );
      }
    }

    // Fetch seller reputation data in a separate query
    let reputationMap: Record<string, any> = {};
    if (sellerIds.length > 0) {
      const { data: reputations } = await supabase
        .from('p2p_reputation')
        .select('user_id, total_trades, completed_trades, reputation_score, trust_level, avg_confirmation_time_minutes')
        .in('user_id', sellerIds);

      if (reputations) {
        reputationMap = Object.fromEntries(
          reputations.map((r) => [r.user_id, r])
        );
      }
    }

    // Enrich offers with payment method name and seller reputation
    const enrichedOffers = offers.map((offer) => ({
      ...offer,
      payment_method_name: paymentMethodMap[offer.payment_method_id] || null,
      seller_reputation: reputationMap[offer.seller_id] || null,
    }));

    return new Response(
      JSON.stringify({
        success: true,
        offers: enrichedOffers,
        total: count || 0,
        page: safePage,
        limit: safeLimit,
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
