/**
 * Check Deposits - Monitors incoming USDT deposits on TON, Polkadot, and TRC20
 * Can be called by cron (every 1 min) or manually by user
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createHmac } from 'https://deno.land/std@0.177.0/node/crypto.ts';
import { HDKey } from 'https://esm.sh/@scure/bip32@1.3.2';
import * as bip39 from 'https://esm.sh/@scure/bip39@1.2.1';
import { keccak_256 } from 'https://esm.sh/@noble/hashes@1.3.2/sha3';
import { sha256 } from 'https://esm.sh/@noble/hashes@1.3.2/sha256';
import { bytesToHex } from 'https://esm.sh/@noble/hashes@1.3.2/utils';
import { secp256k1 } from 'https://esm.sh/@noble/curves@1.2.0/secp256k1';

const ALLOWED_ORIGINS = ['https://telegram.pezkuwichain.io', 'https://telegram.pezkiwi.app'];
const MIN_DEPOSIT = 10; // Minimum 10 USDT

// Platform fees per network
const TON_FEE = 0.1; // $0.1 fee for TON
const POLKADOT_FEE = 0.1; // $0.1 fee for Polkadot
const TRC20_FEE = 3; // $3 fee for TRC20

// API endpoints
const TON_API = 'https://tonapi.io/v2';
const TRON_API = 'https://api.trongrid.io';
const SUBSCAN_API = 'https://assethub-polkadot.api.subscan.io';

// Contract addresses - raw format from TonAPI
const TON_USDT_MASTER = '0:b113a994b5024a16719f69139328eb759596c38a25f59028b146fecdc3621dfe'; // TON USDT Jetton
const TRON_USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'; // TRC20 USDT

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function getCorsHeaders(origin?: string | null): Record<string, string> {
  const allowedOrigin =
    origin && ALLOWED_ORIGINS.some((o) => origin.startsWith(o)) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-supabase-client-platform',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

// Base58Check encode for TRON
function base58CheckEncode(payload: Uint8Array): string {
  const hash1 = sha256(payload);
  const hash2 = sha256(hash1);
  const checksum = hash2.slice(0, 4);

  const data = new Uint8Array(payload.length + 4);
  data.set(payload);
  data.set(checksum, payload.length);

  let zeros = 0;
  for (let i = 0; i < data.length && data[i] === 0; i++) zeros++;

  let num = BigInt('0x' + bytesToHex(data));
  let result = '';
  while (num > 0n) {
    result = BASE58_ALPHABET[Number(num % 58n)] + result;
    num = num / 58n;
  }

  return '1'.repeat(zeros) + result;
}

// Derive TRC20 address from HD wallet
function deriveTronAddress(mnemonic: string, index: number): string {
  const seed = bip39.mnemonicToSeedSync(mnemonic, '');
  const hdKey = HDKey.fromMasterSeed(seed);
  const derivedKey = hdKey.derive(`m/44'/195'/0'/0/${index}`);

  if (!derivedKey.privateKey) throw new Error('Failed to derive private key');

  const publicKey = secp256k1.getPublicKey(derivedKey.privateKey, false);
  const hash = keccak_256(publicKey.slice(1));
  const addressBytes = hash.slice(-20);

  const addressWithPrefix = new Uint8Array(21);
  addressWithPrefix[0] = 0x41;
  addressWithPrefix.set(addressBytes, 1);

  return base58CheckEncode(addressWithPrefix);
}

// Check TON deposits
async function checkTonDeposits(
  supabase: any,
  depositAddress: string
): Promise<{ found: number; processed: number; errors: string[] }> {
  const result = { found: 0, processed: 0, errors: [] as string[] };

  try {
    // Get recent transactions
    const response = await fetch(`${TON_API}/accounts/${depositAddress}/events?limit=50`, {
      headers: { Authorization: `Bearer ${Deno.env.get('TONAPI_KEY') || ''}` },
    });

    if (!response.ok) {
      result.errors.push(`TON API error: ${response.status}`);
      return result;
    }

    const data = await response.json();
    const events = data.events || [];

    for (const event of events) {
      // Look for jetton transfers (USDT)
      for (const action of event.actions || []) {
        if (action.type !== 'JettonTransfer') continue;
        if (action.JettonTransfer?.jetton?.address !== TON_USDT_MASTER) continue;

        const txHash = event.event_id;
        const amount = parseInt(action.JettonTransfer.amount) / 1e6; // USDT has 6 decimals
        const comment = action.JettonTransfer.comment || '';

        if (amount < MIN_DEPOSIT) continue;

        // Find user by memo code
        const { data: depositCode } = await supabase
          .from('tg_user_deposit_codes')
          .select('user_id')
          .eq('code', comment.trim().toUpperCase())
          .single();

        if (!depositCode) {
          result.errors.push(`TON: Unknown memo "${comment}" for ${amount} USDT`);
          continue;
        }

        // Calculate net amount after platform fee
        const netAmount = Math.max(0, amount - TON_FEE);

        // Create deposit record with net amount. tx_hash has a unique DB
        // constraint - on conflict (already processed on a prior run) this
        // is a no-op, avoiding the check-then-insert race that used to
        // produce runaway duplicate rows.
        const { error, data: inserted } = await supabase
          .from('tg_deposits')
          .upsert(
            {
              user_id: depositCode.user_id,
              network: 'ton',
              amount: netAmount,
              tx_hash: txHash,
              memo: comment,
              status: 'confirming',
            },
            { onConflict: 'tx_hash', ignoreDuplicates: true }
          )
          .select('id');

        if (!error && inserted && inserted.length > 0) {
          result.found++;
          result.processed++;
        }
      }
    }
  } catch (err) {
    result.errors.push(`TON error: ${err}`);
  }

  return result;
}

// Check Polkadot deposits
async function checkPolkadotDeposits(
  supabase: any,
  depositAddress: string
): Promise<{ found: number; processed: number; errors: string[] }> {
  const result = { found: 0, processed: 0, errors: [] as string[] };

  try {
    const response = await fetch(`${SUBSCAN_API}/api/v2/scan/transfers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': Deno.env.get('SUBSCAN_API_KEY') || '',
      },
      body: JSON.stringify({
        address: depositAddress,
        direction: 'received',
        row: 50,
        page: 0,
        asset_symbol: 'USDT',
      }),
    });

    if (!response.ok) {
      result.errors.push(`Polkadot API error: ${response.status}`);
      return result;
    }

    const data = await response.json();
    const transfers = data.data?.transfers || [];

    for (const tx of transfers) {
      const txHash = tx.hash;
      const amount = parseFloat(tx.amount);

      if (amount < MIN_DEPOSIT) continue;

      // Calculate net amount after platform fee
      const netAmount = Math.max(0, amount - POLKADOT_FEE);

      // For Polkadot, memo might be in extrinsic data
      // Try to find user by checking system.remark in same block
      // For now, create as pending without user
      const { error, data: inserted } = await supabase
        .from('tg_deposits')
        .upsert(
          {
            network: 'polkadot',
            amount: netAmount,
            tx_hash: txHash,
            status: 'confirming',
          },
          { onConflict: 'tx_hash', ignoreDuplicates: true }
        )
        .select('id');

      if (!error && inserted && inserted.length > 0) {
        result.found++;
        result.processed++;
      }
    }
  } catch (err) {
    result.errors.push(`Polkadot error: ${err}`);
  }

  return result;
}

// Check TRC20 deposits (HD wallet addresses)
async function checkTrc20Deposits(
  supabase: any,
  hdMnemonic: string
): Promise<{ found: number; processed: number; errors: string[] }> {
  const result = { found: 0, processed: 0, errors: [] as string[] };

  try {
    // Get all users with deposit_index. deposit_index 0 belongs to the
    // platform admin account and doubles as the treasury sweep destination -
    // excluded here so internal sweep transfers landing on it are never
    // mistaken for a customer deposit.
    const { data: users } = await supabase
      .from('tg_users')
      .select('id, deposit_index')
      .not('deposit_index', 'is', null)
      .neq('deposit_index', 0)
      .order('deposit_index', { ascending: true });

    if (!users || users.length === 0) return result;

    // Check each user's derived address, with bounded concurrency so we
    // don't exceed the edge function's CPU/time budget on large user counts.
    const CONCURRENCY = 8;
    for (let i = 0; i < users.length; i += CONCURRENCY) {
      const batch = users.slice(i, i + CONCURRENCY);
      await Promise.all(
        batch.map(async (user) => {
          try {
            const address = deriveTronAddress(hdMnemonic, user.deposit_index);

            // Get TRC20 transfers to this address
            const response = await fetch(
              `${TRON_API}/v1/accounts/${address}/transactions/trc20?limit=20&contract_address=${TRON_USDT_CONTRACT}`,
              {
                headers: { 'TRON-PRO-API-KEY': Deno.env.get('TRONGRID_API_KEY') || '' },
              }
            );

            if (!response.ok) return;

            const data = await response.json();
            const transfers = data.data || [];

            for (const tx of transfers) {
              // Only incoming transfers
              if (tx.to?.toLowerCase() !== address.toLowerCase()) continue;

              const txHash = tx.transaction_id;
              const amount = parseInt(tx.value) / 1e6; // USDT has 6 decimals

              if (amount < MIN_DEPOSIT) continue;

              // Create deposit record (with fee deduction note). tx_hash
              // has a unique DB constraint - on conflict this is a no-op,
              // avoiding the check-then-insert race that used to produce
              // runaway duplicate rows.
              const netAmount = Math.max(0, amount - TRC20_FEE);

              const { error, data: inserted } = await supabase
                .from('tg_deposits')
                .upsert(
                  {
                    user_id: user.id,
                    network: 'trc20',
                    amount: netAmount, // Store net amount after fee
                    tx_hash: txHash,
                    status: 'confirming',
                  },
                  { onConflict: 'tx_hash', ignoreDuplicates: true }
                )
                .select('id');

              if (!error && inserted && inserted.length > 0) {
                result.found++;
                result.processed++;
              }
            }
          } catch (err) {
            // Skip individual user errors
            return;
          }
        })
      );
    }
  } catch (err) {
    result.errors.push(`TRC20 error: ${err}`);
  }

  return result;
}

serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const tonAddress =
      Deno.env.get('DEPOSIT_TON_ADDRESS') || Deno.env.get('VITE_DEPOSIT_TON_ADDRESS');
    const polkadotAddress =
      Deno.env.get('DEPOSIT_POLKADOT_ADDRESS') || Deno.env.get('VITE_DEPOSIT_POLKADOT_ADDRESS');
    const tronHdMnemonic = Deno.env.get('DEPOSIT_TRON_HD_MNEMONIC');

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const results = {
      ton: { found: 0, processed: 0, errors: [] as string[] },
      polkadot: { found: 0, processed: 0, errors: [] as string[] },
      trc20: { found: 0, processed: 0, errors: [] as string[] },
    };

    // Check all networks in parallel
    const [tonResult, polkadotResult, trc20Result] = await Promise.all([
      tonAddress ? checkTonDeposits(supabase, tonAddress) : Promise.resolve(results.ton),
      polkadotAddress
        ? checkPolkadotDeposits(supabase, polkadotAddress)
        : Promise.resolve(results.polkadot),
      tronHdMnemonic
        ? checkTrc20Deposits(supabase, tronHdMnemonic)
        : Promise.resolve(results.trc20),
    ]);

    results.ton = tonResult;
    results.polkadot = polkadotResult;
    results.trc20 = trc20Result;

    const totalFound = results.ton.found + results.polkadot.found + results.trc20.found;
    const totalProcessed =
      results.ton.processed + results.polkadot.processed + results.trc20.processed;

    return new Response(
      JSON.stringify({
        success: true,
        summary: { found: totalFound, processed: totalProcessed },
        results,
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Check deposits error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
