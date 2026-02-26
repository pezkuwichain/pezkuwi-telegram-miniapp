// request-withdraw-telegram Edge Function
// For Telegram MiniApp users - creates a withdrawal request with session token auth
// The actual blockchain TX is handled by process-withdraw (cron/admin)

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
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

// Minimum withdrawal amounts
const MIN_WITHDRAW: Record<string, number> = {
  HEZ: 1,
  PEZ: 10,
};

// Withdrawal fee (in tokens)
const WITHDRAW_FEE: Record<string, number> = {
  HEZ: 0.1,
  PEZ: 1,
};

interface WithdrawRequest {
  sessionToken: string;
  token: 'HEZ' | 'PEZ';
  amount: number;
  walletAddress: string;
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
      return verifyLegacyToken(token);
    }

    const [payloadB64, signature] = parts;

    const secret = getSessionSecret(botToken);
    const expectedSig = createHmac('sha256', secret).update(payloadB64).digest('hex');

    if (signature !== expectedSig) {
      return null;
    }

    const payload = JSON.parse(atob(payloadB64));

    if (Date.now() > payload.exp) {
      return null;
    }

    return payload.tgId;
  } catch {
    return null;
  }
}

// Legacy token format (Base64 only)
function verifyLegacyToken(token: string): number | null {
  try {
    const decoded = atob(token);
    const [telegramId, timestamp] = decoded.split(':');
    const ts = parseInt(timestamp);
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

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let body: WithdrawRequest;
    try {
      const text = await req.text();
      body = JSON.parse(text);
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid JSON in request body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { sessionToken, token, amount, walletAddress } = body;

    // Get bot token for session verification
    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
    if (!botToken) {
      return new Response(
        JSON.stringify({ success: false, error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate session token
    if (!sessionToken) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing session token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const telegramId = verifySessionToken(sessionToken, botToken);
    if (!telegramId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid or expired session token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase service client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // Get auth user for telegram user
    const telegramEmail = `telegram_${telegramId}@pezkuwichain.io`;
    const {
      data: { users: existingUsers },
    } = await serviceClient.auth.admin.listUsers();
    const authUser = existingUsers?.find((u) => u.email === telegramEmail);

    if (!authUser) {
      return new Response(
        JSON.stringify({ success: false, error: 'User not found. Please deposit first.' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = authUser.id;

    // Validate input
    if (!token || !amount || !walletAddress) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing required fields: token, amount, walletAddress',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!['HEZ', 'PEZ'].includes(token)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid token. Must be HEZ or PEZ' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (amount <= 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Amount must be greater than 0' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (amount < MIN_WITHDRAW[token]) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Minimum withdrawal is ${MIN_WITHDRAW[token]} ${token}`,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate wallet address format (Substrate SS58)
    if (!walletAddress.match(/^5[A-HJ-NP-Za-km-z1-9]{47}$/)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid wallet address format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const fee = WITHDRAW_FEE[token];
    const netAmount = amount - fee;

    if (netAmount <= 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Amount too small after fee deduction' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check user's available balance
    const { data: balanceData } = await serviceClient
      .from('user_internal_balances')
      .select('available_balance')
      .eq('user_id', userId)
      .eq('token', token)
      .single();

    if (!balanceData || balanceData.available_balance < amount) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Insufficient balance',
          available: balanceData?.available_balance || 0,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create withdrawal request using DB function (moves available -> locked)
    const { data: requestResult, error: requestError } = await serviceClient.rpc(
      'request_withdraw',
      {
        p_user_id: userId,
        p_token: token,
        p_amount: amount,
        p_wallet_address: walletAddress,
      }
    );

    if (requestError || !requestResult?.success) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            requestResult?.error || requestError?.message || 'Failed to create withdrawal request',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(
      `Withdraw request created: TelegramID=${telegramId}, Amount=${amount} ${token}, Fee=${fee}, Net=${netAmount}, Wallet=${walletAddress}`
    );

    return new Response(
      JSON.stringify({
        success: true,
        requestId: requestResult.request_id,
        amount,
        fee,
        netAmount,
        token,
        status: 'pending',
        message: 'Withdrawal request created. Processing will begin shortly.',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Edge function error:', error);
    const origin = req.headers.get('origin');
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { ...getCorsHeaders(origin), 'Content-Type': 'application/json' } }
    );
  }
});
