// request-withdraw-telegram Edge Function
// For Telegram MiniApp users - creates withdrawal request AND processes blockchain TX
// Uses @pezkuwi/api for Asset Hub blockchain transactions

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createHmac } from 'https://deno.land/std@0.177.0/node/crypto.ts';
import { ApiPromise, WsProvider, Keyring } from 'npm:@pezkuwi/api@16.5.36';
import { cryptoWaitReady } from 'npm:@pezkuwi/util-crypto@14.0.25';

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

// Platform hot wallet address
const PLATFORM_WALLET = '5H18ZZBU4LwPYbeEZ1JBGvibCU2edhhM8HNUtFi7GgC36CgS';

// RPC endpoint — Asset Hub
const RPC_ENDPOINT = 'wss://asset-hub-rpc.pezkuwichain.io';

// Token decimals
const DECIMALS = 12;

// PEZ asset ID
const PEZ_ASSET_ID = 1;

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

// Send tokens from hot wallet to user wallet
async function sendTokens(
  api: ApiPromise,
  privateKey: string,
  toAddress: string,
  token: string,
  amount: number
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  try {
    await cryptoWaitReady();

    const keyring = new Keyring({ type: 'sr25519' });
    const hotWallet = keyring.addFromUri(privateKey);

    // Verify hot wallet address matches expected
    if (hotWallet.address !== PLATFORM_WALLET) {
      return {
        success: false,
        error: 'CRITICAL: Private key does not match platform wallet address!',
      };
    }

    // Convert amount to chain units (12 decimals)
    const amountBN = BigInt(Math.floor(amount * Math.pow(10, DECIMALS)));

    console.log(`Sending ${amount} ${token}: ${hotWallet.address} → ${toAddress}`);

    let tx;
    if (token === 'HEZ') {
      tx = api.tx.balances.transferKeepAlive(toAddress, amountBN);
    } else if (token === 'PEZ') {
      tx = api.tx.assets.transfer(PEZ_ASSET_ID, toAddress, amountBN);
    } else {
      return { success: false, error: 'Invalid token' };
    }

    // Fetch nonce
    const accountInfo = await api.query.system.account(hotWallet.address);
    const nonce = accountInfo.nonce;

    // Sign and send transaction
    return new Promise((resolve) => {
      let txHash: string;

      tx.signAndSend(
        hotWallet,
        { nonce },
        (result: {
          txHash: { toHex: () => string };
          status: { isInBlock: boolean; asInBlock: { toHex: () => string }; isFinalized: boolean };
          dispatchError:
            | { isModule: boolean; asModule: unknown; toString: () => string }
            | undefined;
          isError: boolean;
        }) => {
          txHash = result.txHash.toHex();

          if (result.status.isInBlock) {
            console.log(`TX in block: ${result.status.asInBlock.toHex()}`);
          }

          if (result.status.isFinalized) {
            const dispatchError = result.dispatchError;

            if (dispatchError) {
              if (dispatchError.isModule) {
                const decoded = api.registry.findMetaError(dispatchError.asModule);
                resolve({
                  success: false,
                  txHash,
                  error: `${decoded.section}.${decoded.name}: ${decoded.docs.join(' ')}`,
                });
              } else {
                resolve({
                  success: false,
                  txHash,
                  error: dispatchError.toString(),
                });
              }
            } else {
              resolve({ success: true, txHash });
            }
          }

          if (result.isError) {
            resolve({
              success: false,
              txHash,
              error: 'Transaction failed',
            });
          }
        }
      ).catch((error: Error) => {
        resolve({ success: false, error: error.message });
      });

      // Timeout after 60 seconds
      setTimeout(() => {
        resolve({
          success: false,
          txHash,
          error: 'Transaction timeout - please check explorer for status',
        });
      }, 60000);
    });
  } catch (error) {
    console.error('Send tokens error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
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

    // Resolve P2P user ID: prefer p2p_user_id (citizen/visa UUID, same as pwap/web)
    // fallback to tg_users.id (legacy Supabase Auth UUID)
    const { data: tgUser, error: tgUserError } = await serviceClient
      .from('tg_users')
      .select('id, p2p_user_id')
      .eq('telegram_id', telegramId)
      .single();

    if (tgUserError || !tgUser) {
      return new Response(
        JSON.stringify({ success: false, error: 'User not found. Please deposit first.' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = tgUser.p2p_user_id ?? tgUser.id;

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

    const requestId = requestResult.request_id;

    console.log(
      `Withdraw request created: ID=${requestId}, TelegramID=${telegramId}, Amount=${amount} ${token}, Fee=${fee}, Net=${netAmount}, Wallet=${walletAddress}`
    );

    // ==================== PROCESS BLOCKCHAIN TX ====================

    // Get hot wallet private key or mnemonic
    const hotWalletPrivateKey =
      Deno.env.get('PLATFORM_PRIVATE_KEY') || Deno.env.get('PLATFORM_WALLET_MNEMONIC');

    if (!hotWalletPrivateKey) {
      // No private key/mnemonic configured — leave as pending for admin to process
      console.warn(
        'Neither PLATFORM_PRIVATE_KEY nor PLATFORM_WALLET_MNEMONIC configured. Withdrawal left as pending.'
      );
      return new Response(
        JSON.stringify({
          success: true,
          requestId,
          amount,
          fee,
          netAmount,
          token,
          status: 'pending',
          message: 'Withdrawal request created. Will be processed by admin.',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update request status to processing
    await serviceClient
      .from('p2p_deposit_withdraw_requests')
      .update({ status: 'processing' })
      .eq('id', requestId);

    console.log(`Processing withdrawal: ${netAmount} ${token} to ${walletAddress}`);

    // Connect to blockchain and send tokens
    const api = await getApi();

    const sendResult = await sendTokens(api, hotWalletPrivateKey, walletAddress, token, netAmount);

    if (!sendResult.success) {
      // TX failed — refund locked balance back to available
      console.error(`Withdrawal TX failed: ${sendResult.error}`);

      await serviceClient.rpc('refund_escrow_internal', {
        p_user_id: userId,
        p_token: token,
        p_amount: amount,
        p_reference_type: 'withdraw_failed',
        p_reference_id: requestId,
      });

      await serviceClient
        .from('p2p_deposit_withdraw_requests')
        .update({
          status: 'failed',
          error_message: sendResult.error,
          processed_at: new Date().toISOString(),
        })
        .eq('id', requestId);

      return new Response(
        JSON.stringify({
          success: false,
          error: sendResult.error || 'Blockchain transaction failed',
          txHash: sendResult.txHash,
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // TX success — complete the withdrawal in DB
    const { error: completeError } = await serviceClient.rpc('complete_withdraw', {
      p_user_id: userId,
      p_token: token,
      p_amount: amount,
      p_tx_hash: sendResult.txHash,
      p_request_id: requestId,
    });

    if (completeError) {
      console.error('Failed to complete withdrawal in DB:', completeError);
      // TX was sent but DB update failed — log for manual reconciliation
    }

    // Update request record with TX details
    await serviceClient
      .from('p2p_deposit_withdraw_requests')
      .update({
        status: 'completed',
        blockchain_tx_hash: sendResult.txHash,
        fee_amount: fee,
        net_amount: netAmount,
        processed_at: new Date().toISOString(),
      })
      .eq('id', requestId);

    console.log(`Withdrawal successful: ${sendResult.txHash}`);

    return new Response(
      JSON.stringify({
        success: true,
        txHash: sendResult.txHash,
        requestId,
        amount: netAmount,
        fee,
        token,
        walletAddress,
        status: 'completed',
        message: 'Withdrawal processed successfully',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Edge function error:', error);
    const origin = req.headers.get('origin');
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      }),
      { status: 500, headers: { ...getCorsHeaders(origin), 'Content-Type': 'application/json' } }
    );
  }
});
