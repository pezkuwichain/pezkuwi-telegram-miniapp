// process-withdraw Edge Function
// Processes pending withdrawal requests by sending tokens from platform wallet to user wallets
// This should be called by a cron job or manually by admins
// SECURITY: This is a backend-only function - no user session needed

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { ApiPromise, WsProvider, Keyring } from 'npm:@pezkuwi/api@16.5.36';
import { cryptoWaitReady } from 'npm:@pezkuwi/util-crypto@14.0.25';

// CORS - Restricted for security (cron/admin only)
const ALLOWED_ORIGINS = [
  'https://telegram.pezkuwichain.io',
  'https://telegram.pezkiwi.app',
  'https://supabase.com',
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

// RPC endpoint for PezkuwiChain
const RPC_ENDPOINT = 'wss://rpc.pezkuwichain.io';

// Token decimals
const DECIMALS = 12;

// PEZ asset ID
const PEZ_ASSET_ID = 1;

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

interface ProcessWithdrawRequest {
  adminKey?: string; // Optional admin key for manual processing
  requestId?: string; // Optional: process specific request
  batchSize?: number; // How many requests to process (default: 10)
}

serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Parse request body
    let body: ProcessWithdrawRequest = {};
    try {
      const text = await req.text();
      if (text) {
        body = JSON.parse(text);
      }
    } catch {
      // Empty body is OK for cron triggers
    }

    const { requestId, batchSize = 10 } = body;

    // Create Supabase service client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // Get platform wallet seed phrase from environment
    const escrowSeedPhrase = Deno.env.get('ESCROW_SEED_PHRASE');
    if (!escrowSeedPhrase) {
      console.error('ESCROW_SEED_PHRASE not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Platform wallet not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize crypto
    await cryptoWaitReady();

    // Create keyring and add platform wallet
    const keyring = new Keyring({ type: 'sr25519' });
    const platformWallet = keyring.addFromUri(escrowSeedPhrase);
    console.log(`Platform wallet address: ${platformWallet.address}`);

    // Connect to blockchain
    const api = await getApi();
    console.log(`Connected to chain: ${api.runtimeChain.toString()}`);

    // Get pending withdrawal requests
    let query = serviceClient
      .from('p2p_deposit_withdraw_requests')
      .select('*')
      .eq('request_type', 'withdraw')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(batchSize);

    if (requestId) {
      query = serviceClient
        .from('p2p_deposit_withdraw_requests')
        .select('*')
        .eq('id', requestId)
        .eq('request_type', 'withdraw')
        .in('status', ['pending', 'failed']); // Allow retry of failed
    }

    const { data: pendingRequests, error: queryError } = await query;

    if (queryError) {
      console.error('Failed to query pending requests:', queryError);
      return new Response(JSON.stringify({ success: false, error: 'Failed to query requests' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!pendingRequests || pendingRequests.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No pending withdrawal requests', processed: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing ${pendingRequests.length} withdrawal requests`);

    const results: Array<{
      requestId: string;
      success: boolean;
      txHash?: string;
      error?: string;
    }> = [];

    for (const request of pendingRequests) {
      try {
        console.log(
          `Processing withdrawal: ID=${request.id}, Token=${request.token}, Amount=${request.amount}, To=${request.wallet_address}`
        );

        // Mark as processing
        await serviceClient
          .from('p2p_deposit_withdraw_requests')
          .update({ status: 'processing' })
          .eq('id', request.id);

        // Convert amount to chain units
        const amountInUnits = BigInt(Math.floor(request.amount * Math.pow(10, DECIMALS)));

        let tx;
        if (request.token === 'HEZ') {
          // Native token transfer
          tx = api.tx.balances.transferKeepAlive(request.wallet_address, amountInUnits);
        } else if (request.token === 'PEZ') {
          // Asset transfer
          tx = api.tx.assets.transfer(PEZ_ASSET_ID, request.wallet_address, amountInUnits);
        } else {
          throw new Error(`Unsupported token: ${request.token}`);
        }

        // Sign and send transaction
        const txHash = await new Promise<string>((resolve, reject) => {
          let resolved = false;

          tx.signAndSend(platformWallet, ({ status, txHash, dispatchError }) => {
            if (resolved) return;

            if (dispatchError) {
              resolved = true;
              if (dispatchError.isModule) {
                const decoded = api.registry.findMetaError(dispatchError.asModule);
                reject(new Error(`${decoded.section}.${decoded.name}: ${decoded.docs.join(' ')}`));
              } else {
                reject(new Error(dispatchError.toString()));
              }
              return;
            }

            if (status.isInBlock || status.isFinalized) {
              resolved = true;
              resolve(txHash.toHex());
            }
          }).catch(reject);

          // Timeout after 60 seconds
          setTimeout(() => {
            if (!resolved) {
              resolved = true;
              reject(new Error('Transaction timeout'));
            }
          }, 60000);
        });

        console.log(`Withdrawal TX sent: ${txHash}`);

        // Update user's locked balance (reduce locked, track withdrawal)
        const { error: balanceError } = await serviceClient.rpc('complete_withdraw', {
          p_user_id: request.user_id,
          p_token: request.token,
          p_amount: request.amount,
          p_tx_hash: txHash,
          p_request_id: request.id,
        });

        // If complete_withdraw function doesn't exist, manually update
        if (balanceError && balanceError.message.includes('does not exist')) {
          // Manual update
          await serviceClient
            .from('user_internal_balances')
            .update({
              locked_balance: serviceClient.raw(`locked_balance - ${request.amount}`),
              total_withdrawn: serviceClient.raw(`total_withdrawn + ${request.amount}`),
              last_withdraw_at: new Date().toISOString(),
            })
            .eq('user_id', request.user_id)
            .eq('token', request.token);

          // Log transaction
          await serviceClient.from('p2p_balance_transactions').insert({
            user_id: request.user_id,
            token: request.token,
            transaction_type: 'withdraw',
            amount: -request.amount,
            balance_before: 0, // We don't have this info here
            balance_after: 0, // We don't have this info here
            reference_type: 'withdraw_request',
            reference_id: request.id,
            description: `Withdrawal to ${request.wallet_address}: ${txHash}`,
          });
        }

        // Update request status to completed
        await serviceClient
          .from('p2p_deposit_withdraw_requests')
          .update({
            status: 'completed',
            blockchain_tx_hash: txHash,
            processed_at: new Date().toISOString(),
          })
          .eq('id', request.id);

        results.push({
          requestId: request.id,
          success: true,
          txHash,
        });

        console.log(`Withdrawal completed: ${request.id} -> ${txHash}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Withdrawal failed for ${request.id}:`, errorMessage);

        // Update request status to failed
        await serviceClient
          .from('p2p_deposit_withdraw_requests')
          .update({
            status: 'failed',
            error_message: errorMessage,
            processed_at: new Date().toISOString(),
          })
          .eq('id', request.id);

        // Don't refund locked balance on failure - admin should review
        // They can manually retry or refund

        results.push({
          requestId: request.id,
          success: false,
          error: errorMessage,
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    return new Response(
      JSON.stringify({
        success: true,
        message: `Processed ${results.length} requests: ${successCount} succeeded, ${failCount} failed`,
        processed: results.length,
        succeeded: successCount,
        failed: failCount,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Process withdraw error:', error);
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
