// verify-deposit-telegram Edge Function
// For Telegram MiniApp users - uses session token authentication
// Verifies blockchain transactions before crediting balances

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { ApiPromise, WsProvider } from 'npm:@pezkuwi/api@16.5.36';
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

// Platform hot wallet address (PRODUCTION) - Treasury_3
const PLATFORM_WALLET = '5H18ZZBU4LwPYbeEZ1JBGvibCU2edhhM8HNUtFi7GgC36CgS';

// RPC endpoint — defaults to Asset Hub where user balances live
const RPC_ENDPOINT = Deno.env.get('RPC_ENDPOINT') || 'wss://asset-hub-rpc.pezkuwichain.io';

// Token decimals
const DECIMALS = 12;

// PEZ asset ID
const PEZ_ASSET_ID = 1;

interface DepositRequest {
  sessionToken: string;
  txHash: string;
  token: 'HEZ' | 'PEZ';
  expectedAmount: number;
  blockNumber?: number; // Optional: for faster verification of old transactions
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

// Cache API connection
let apiInstance: ApiPromise | null = null;

async function getApi(): Promise<ApiPromise> {
  if (apiInstance && apiInstance.isConnected) {
    return apiInstance;
  }

  const provider = new WsProvider(RPC_ENDPOINT);
  apiInstance = await ApiPromise.create({ provider });
  return apiInstance;
}

// Verify transaction on blockchain using @pezkuwi/api
async function verifyTransactionOnChain(
  txHash: string,
  token: string,
  expectedAmount: number,
  knownBlockNumber?: number
): Promise<{ valid: boolean; actualAmount?: number; from?: string; error?: string }> {
  try {
    // Validate transaction hash format (0x + 64 hex chars)
    if (!txHash.match(/^0x[a-fA-F0-9]{64}$/)) {
      return { valid: false, error: 'Invalid transaction hash format' };
    }

    const api = await getApi();

    let foundBlock = null;
    let foundExtrinsicIndex = -1;

    // If block number is provided, search directly there
    if (knownBlockNumber) {
      const blockHash = await api.rpc.chain.getBlockHash(knownBlockNumber);
      const signedBlock = await api.rpc.chain.getBlock(blockHash);

      for (let j = 0; j < signedBlock.block.extrinsics.length; j++) {
        const ext = signedBlock.block.extrinsics[j];
        if (ext.hash.toHex() === txHash) {
          foundBlock = { hash: blockHash, number: knownBlockNumber, block: signedBlock };
          foundExtrinsicIndex = j;
          break;
        }
      }
    } else {
      // Search recent blocks
      const latestHeader = await api.rpc.chain.getHeader();
      const latestBlockNumber = latestHeader.number.toNumber();
      const searchDepth = 100; // Reduced for speed, use blockNumber param for old TXs

      for (let i = 0; i < searchDepth; i++) {
        const blockNumber = latestBlockNumber - i;
        if (blockNumber < 0) break;

        const blockHash = await api.rpc.chain.getBlockHash(blockNumber);
        const signedBlock = await api.rpc.chain.getBlock(blockHash);

        for (let j = 0; j < signedBlock.block.extrinsics.length; j++) {
          const ext = signedBlock.block.extrinsics[j];
          if (ext.hash.toHex() === txHash) {
            foundBlock = { hash: blockHash, number: blockNumber, block: signedBlock };
            foundExtrinsicIndex = j;
            break;
          }
        }

        if (foundBlock) break;
      }
    }

    if (!foundBlock) {
      return {
        valid: false,
        error: 'Transaction not found in recent blocks. It may be too old or not yet finalized.',
      };
    }

    // Get events for this block
    const apiAt = await api.at(foundBlock.hash);
    const events = await apiAt.query.system.events();

    // Find transfer events for our extrinsic
    const extrinsicEvents = events.filter(
      (event: {
        phase: { isApplyExtrinsic: boolean; asApplyExtrinsic: { toNumber: () => number } };
      }) => {
        const { phase } = event;
        return phase.isApplyExtrinsic && phase.asApplyExtrinsic.toNumber() === foundExtrinsicIndex;
      }
    );

    // Check for success
    const successEvent = extrinsicEvents.find((event: { event: unknown }) =>
      api.events.system.ExtrinsicSuccess.is(event.event)
    );

    if (!successEvent) {
      const failedEvent = extrinsicEvents.find((event: { event: unknown }) =>
        api.events.system.ExtrinsicFailed.is(event.event)
      );
      if (failedEvent) {
        return { valid: false, error: 'Transaction failed on-chain' };
      }
      return { valid: false, error: 'Transaction status unknown' };
    }

    // Find transfer event
    let transferEvent = null;
    let from = '';
    let to = '';
    let amount = BigInt(0);

    if (token === 'HEZ') {
      // Native token transfer (balances.Transfer)
      transferEvent = extrinsicEvents.find((event: { event: unknown }) =>
        api.events.balances.Transfer.is(event.event)
      );

      if (transferEvent) {
        const [fromAddr, toAddr, value] = transferEvent.event.data;
        from = fromAddr.toString();
        to = toAddr.toString();
        amount = BigInt(value.toString());
      }
    } else if (token === 'PEZ') {
      // Asset transfer (assets.Transferred)
      transferEvent = extrinsicEvents.find((event: { event: unknown }) =>
        api.events.assets.Transferred.is(event.event)
      );

      if (transferEvent) {
        const [assetId, fromAddr, toAddr, value] = transferEvent.event.data;

        // Verify it's the correct asset
        if (assetId.toNumber() !== PEZ_ASSET_ID) {
          return { valid: false, error: 'Wrong asset transferred' };
        }

        from = fromAddr.toString();
        to = toAddr.toString();
        amount = BigInt(value.toString());
      }
    }

    if (!transferEvent) {
      return { valid: false, error: 'No transfer event found in transaction' };
    }

    // Verify recipient is platform wallet
    if (to !== PLATFORM_WALLET) {
      return {
        valid: false,
        error: `Transaction recipient (${to}) does not match platform wallet`,
      };
    }

    // Convert amount to human readable
    const actualAmount = Number(amount) / Math.pow(10, DECIMALS);

    // Verify amount matches (allow 0.1% tolerance)
    const tolerance = expectedAmount * 0.001;
    if (Math.abs(actualAmount - expectedAmount) > tolerance) {
      return {
        valid: false,
        error: `Amount mismatch. Expected: ${expectedAmount}, Actual: ${actualAmount}`,
        actualAmount,
      };
    }

    // Check if block is finalized
    const finalizedHash = await api.rpc.chain.getFinalizedHead();
    const finalizedHeader = await api.rpc.chain.getHeader(finalizedHash);
    const finalizedNumber = finalizedHeader.number.toNumber();

    if (foundBlock.number > finalizedNumber) {
      return {
        valid: false,
        error: 'Transaction not yet finalized. Please wait a few more blocks.',
      };
    }

    return {
      valid: true,
      actualAmount,
      from,
    };
  } catch (error) {
    console.error('Blockchain verification error:', error);
    return {
      valid: false,
      error: `Verification failed: ${(error as Error).message}`,
    };
  }
}

serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Parse request body with error handling
    let body: DepositRequest;
    try {
      const text = await req.text();
      body = JSON.parse(text);
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid JSON in request body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const { sessionToken, txHash, token, expectedAmount, blockNumber } = body;

    // Get bot tokens for session verification (dual bot support)
    const botTokens: string[] = [];
    const _mainToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const _krdToken = Deno.env.get('TELEGRAM_BOT_TOKEN_KRD');
    if (_mainToken) botTokens.push(_mainToken);
    if (_krdToken) botTokens.push(_krdToken);
    if (botTokens.length === 0) {
      return new Response(JSON.stringify({ success: false, error: 'Server configuration error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate session token
    if (!sessionToken) {
      return new Response(JSON.stringify({ success: false, error: 'Missing session token' }), {
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
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid or expired session token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase service client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // Get or create auth user for telegram user
    // The p2p system uses auth.users for foreign keys
    const telegramEmail = `telegram_${telegramId}@pezkuwichain.io`;

    // Try to get existing auth user
    const {
      data: { users: existingUsers },
    } = await serviceClient.auth.admin.listUsers({ perPage: 1000 });
    let authUser = existingUsers?.find((u) => u.email === telegramEmail);

    if (!authUser) {
      // Get user info from users table
      const { data: mainUser } = await serviceClient
        .from('users')
        .select('telegram_id, username, first_name, last_name')
        .eq('telegram_id', telegramId)
        .single();

      if (!mainUser) {
        return new Response(
          JSON.stringify({ success: false, error: `User not found for telegram_id ${telegramId}` }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Create auth user
      const { data: newAuthUser, error: authError } = await serviceClient.auth.admin.createUser({
        email: telegramEmail,
        email_confirm: true,
        user_metadata: {
          telegram_id: telegramId,
          username: mainUser.username,
          first_name: mainUser.first_name,
        },
      });

      if (authError) {
        console.error('Failed to create auth user:', authError);
        return new Response(
          JSON.stringify({
            success: false,
            error: `Failed to create auth user: ${authError.message}`,
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      authUser = newAuthUser.user;
    }

    const user = { id: authUser!.id, telegram_id: telegramId };

    // Validate input
    if (!txHash || !token || !expectedAmount) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing required fields: txHash, token, expectedAmount',
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

    if (expectedAmount <= 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Amount must be greater than 0' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if TX hash already processed
    const { data: existingRequest } = await serviceClient
      .from('p2p_deposit_withdraw_requests')
      .select('id, status')
      .eq('blockchain_tx_hash', txHash)
      .single();

    if (existingRequest) {
      if (existingRequest.status === 'completed') {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'This transaction has already been processed',
            existingRequestId: existingRequest.id,
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Create deposit request if not exists, or use existing one
    let depositRequest = existingRequest;
    if (!depositRequest) {
      const { data: newRequest, error: requestError } = await serviceClient
        .from('p2p_deposit_withdraw_requests')
        .insert({
          user_id: user.id,
          request_type: 'deposit',
          token,
          amount: expectedAmount,
          wallet_address: PLATFORM_WALLET,
          blockchain_tx_hash: txHash,
          status: 'processing',
        })
        .select()
        .single();

      if (requestError) {
        console.error('Failed to create deposit request:', requestError);
        return new Response(
          JSON.stringify({
            success: false,
            error: `Failed to create deposit request: ${requestError.message}`,
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      depositRequest = newRequest;
    } else {
      // Update existing request to processing
      await serviceClient
        .from('p2p_deposit_withdraw_requests')
        .update({ status: 'processing' })
        .eq('id', depositRequest.id);
    }

    // Verify transaction on blockchain
    console.log(
      `Verifying deposit: TX=${txHash}, Token=${token}, Amount=${expectedAmount}, TelegramID=${telegramId}`
    );
    const verification = await verifyTransactionOnChain(txHash, token, expectedAmount, blockNumber);

    if (!verification.valid) {
      // Update request status to failed
      await serviceClient
        .from('p2p_deposit_withdraw_requests')
        .update({
          status: 'failed',
          error_message: verification.error,
          processed_at: new Date().toISOString(),
        })
        .eq('id', depositRequest.id);

      return new Response(
        JSON.stringify({
          success: false,
          error: verification.error || 'Transaction verification failed',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Transaction verified! Process deposit using service role
    const { data: processResult, error: processError } = await serviceClient.rpc(
      'process_deposit',
      {
        p_user_id: user.id,
        p_token: token,
        p_amount: verification.actualAmount || expectedAmount,
        p_tx_hash: txHash,
        p_request_id: depositRequest.id,
      }
    );

    if (processError) {
      console.error('Failed to process deposit:', processError);

      await serviceClient
        .from('p2p_deposit_withdraw_requests')
        .update({
          status: 'failed',
          error_message: processError.message,
          processed_at: new Date().toISOString(),
        })
        .eq('id', depositRequest.id);

      return new Response(JSON.stringify({ success: false, error: 'Failed to process deposit' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!processResult?.success) {
      return new Response(
        JSON.stringify({
          success: false,
          error: processResult?.error || 'Deposit processing failed',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Success!
    console.log(
      `Deposit successful: TelegramID=${telegramId}, Amount=${verification.actualAmount || expectedAmount} ${token}`
    );

    return new Response(
      JSON.stringify({
        success: true,
        amount: verification.actualAmount || expectedAmount,
        token,
        newBalance: processResult.new_balance,
        txHash,
        message: 'Deposit verified and credited successfully',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Edge function error:', error);
    const origin = req.headers.get('origin');
    return new Response(JSON.stringify({ success: false, error: 'Internal server error' }), {
      status: 500,
      headers: { ...getCorsHeaders(origin), 'Content-Type': 'application/json' },
    });
  }
});
