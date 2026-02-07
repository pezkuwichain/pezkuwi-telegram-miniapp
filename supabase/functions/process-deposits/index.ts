/**
 * Process Deposits - Cron job to check for incoming USDT deposits
 * Checks TRC20 (TRON) and Polkadot Asset Hub for incoming transfers
 * Then transfers wUSDT to user's Asset Hub address
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TRON_API = 'https://api.trongrid.io';
const USDT_TRC20_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'; // USDT TRC20 contract

interface TRC20Transfer {
  transaction_id: string;
  from: string;
  to: string;
  value: string;
  block_timestamp: number;
}

interface DepositCode {
  code: string;
  user_id: string;
  user_address: string;
}

serve(async (req) => {
  // Verify this is called by Supabase cron or with secret
  const authHeader = req.headers.get('Authorization');
  const cronSecret = Deno.env.get('CRON_SECRET');

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    // Also allow service role
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (authHeader !== `Bearer ${supabaseServiceKey}`) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const tronAddress = Deno.env.get('DEPOSIT_TRON_ADDRESS');
  const polkadotAddress = Deno.env.get('DEPOSIT_POLKADOT_ADDRESS');

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const results = {
    trc20: { checked: 0, found: 0, processed: 0, errors: [] as string[] },
    polkadot: { checked: 0, found: 0, processed: 0, errors: [] as string[] },
  };

  // Get all deposit codes with user addresses
  const { data: depositCodes } = await supabase.from('tg_user_deposit_codes').select(`
      code,
      user_id,
      tg_users!inner(wallet_address)
    `);

  const codeMap = new Map<string, { userId: string; walletAddress: string }>();
  if (depositCodes) {
    for (const dc of depositCodes) {
      const userAddress = (dc as any).tg_users?.wallet_address;
      if (userAddress) {
        codeMap.set(dc.code, { userId: dc.user_id, walletAddress: userAddress });
      }
    }
  }

  // ==================== TRC20 DEPOSITS ====================
  if (tronAddress) {
    try {
      // Get recent TRC20 transfers to our deposit address
      const response = await fetch(
        `${TRON_API}/v1/accounts/${tronAddress}/transactions/trc20?limit=50&contract_address=${USDT_TRC20_CONTRACT}`,
        {
          headers: { 'TRON-PRO-API-KEY': Deno.env.get('TRONGRID_API_KEY') || '' },
        }
      );

      if (response.ok) {
        const data = await response.json();
        const transfers = (data.data || []) as TRC20Transfer[];
        results.trc20.checked = transfers.length;

        for (const tx of transfers) {
          // Only incoming transfers
          if (tx.to.toLowerCase() !== tronAddress.toLowerCase()) continue;

          // Check if already processed
          const { data: existing } = await supabase
            .from('tg_deposits')
            .select('id')
            .eq('tx_hash', tx.transaction_id)
            .single();

          if (existing) continue;

          results.trc20.found++;

          // USDT has 6 decimals
          const amount = parseInt(tx.value) / 1e6;

          // For TRC20, we need to check the memo in the transaction
          // Unfortunately, TRC20 transfers don't have memo field directly
          // We'll need to match by amount or create pending deposits that admin confirms

          // Create pending deposit for manual review or amount matching
          const { error: insertError } = await supabase.from('tg_deposits').insert({
            user_id: null, // Will be matched later
            network: 'trc20',
            amount,
            tx_hash: tx.transaction_id,
            status: 'confirming',
            created_at: new Date(tx.block_timestamp).toISOString(),
          });

          if (insertError) {
            results.trc20.errors.push(`Insert error: ${insertError.message}`);
          } else {
            results.trc20.processed++;
          }
        }
      }
    } catch (err) {
      results.trc20.errors.push(`TRC20 error: ${err}`);
    }
  }

  // ==================== POLKADOT DEPOSITS ====================
  if (polkadotAddress) {
    try {
      // Use Subscan API for Polkadot Asset Hub
      const subscanResponse = await fetch(
        'https://assethub-polkadot.api.subscan.io/api/v2/scan/transfers',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': Deno.env.get('SUBSCAN_API_KEY') || '',
          },
          body: JSON.stringify({
            address: polkadotAddress,
            direction: 'received',
            row: 50,
            page: 0,
            asset_symbol: 'USDT',
          }),
        }
      );

      if (subscanResponse.ok) {
        const data = await subscanResponse.json();
        const transfers = data.data?.transfers || [];
        results.polkadot.checked = transfers.length;

        for (const tx of transfers) {
          // Check if already processed
          const { data: existing } = await supabase
            .from('tg_deposits')
            .select('id')
            .eq('tx_hash', tx.hash)
            .single();

          if (existing) continue;

          results.polkadot.found++;

          // Polkadot USDT has 6 decimals
          const amount = parseFloat(tx.amount) / 1e6;

          // Create pending deposit
          const { error: insertError } = await supabase.from('tg_deposits').insert({
            user_id: null,
            network: 'polkadot',
            amount,
            tx_hash: tx.hash,
            status: 'confirming',
            created_at: new Date(tx.block_timestamp * 1000).toISOString(),
          });

          if (insertError) {
            results.polkadot.errors.push(`Insert error: ${insertError.message}`);
          } else {
            results.polkadot.processed++;
          }
        }
      }
    } catch (err) {
      results.polkadot.errors.push(`Polkadot error: ${err}`);
    }
  }

  return new Response(JSON.stringify({ success: true, results }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
