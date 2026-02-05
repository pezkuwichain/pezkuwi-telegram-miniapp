import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform',
};

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
  adType?: 'buy' | 'sell'; // Default: 'sell'
}

// Verify session token and get telegram_id
function verifySessionToken(token: string): number | null {
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

    // Validate session token
    if (!sessionToken) {
      return new Response(JSON.stringify({ error: 'Missing session token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const telegramId = verifySessionToken(sessionToken);
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
        seller_wallet: '', // No longer needed with internal ledger
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
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
