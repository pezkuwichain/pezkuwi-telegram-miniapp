/**
 * Get Deposit Info - Returns user's deposit code and TRC20 HD wallet address
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createHmac } from 'https://deno.land/std@0.177.0/node/crypto.ts';
import { HDKey } from 'https://esm.sh/@scure/bip32@1.3.2';
import * as bip39 from 'https://esm.sh/@scure/bip39@1.2.1';
import { wordlist } from 'https://esm.sh/@scure/bip39@1.2.1/wordlists/english';
import { keccak_256 } from 'https://esm.sh/@noble/hashes@1.3.2/sha3';
import { sha256 } from 'https://esm.sh/@noble/hashes@1.3.2/sha256';
import { bytesToHex, hexToBytes } from 'https://esm.sh/@noble/hashes@1.3.2/utils';
import { secp256k1 } from 'https://esm.sh/@noble/curves@1.2.0/secp256k1';

const ALLOWED_ORIGIN = 'https://telegram.pezkuwichain.io';
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function getCorsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-supabase-client-platform',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

interface TelegramUser {
  id: number;
  first_name: string;
}

function validateInitData(initData: string, botToken: string): TelegramUser | null {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;

    params.delete('hash');

    const sortedParams = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
    const calculatedHash = createHmac('sha256', secretKey).update(sortedParams).digest('hex');

    if (calculatedHash !== hash) return null;

    const authDate = parseInt(params.get('auth_date') || '0');
    const now = Math.floor(Date.now() / 1000);
    if (now - authDate > 86400) return null;

    const userStr = params.get('user');
    if (!userStr) return null;

    return JSON.parse(userStr) as TelegramUser;
  } catch {
    return null;
  }
}

function generateDepositCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = 'PEZ-';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Base58Check encode
function base58CheckEncode(payload: Uint8Array): string {
  // Double SHA256 for checksum
  const hash1 = sha256(payload);
  const hash2 = sha256(hash1);
  const checksum = hash2.slice(0, 4);

  // Combine payload and checksum
  const data = new Uint8Array(payload.length + 4);
  data.set(payload);
  data.set(checksum, payload.length);

  // Count leading zeros
  let zeros = 0;
  for (let i = 0; i < data.length && data[i] === 0; i++) {
    zeros++;
  }

  // Convert to base58
  let num = BigInt('0x' + bytesToHex(data));
  let result = '';

  while (num > 0n) {
    const remainder = Number(num % 58n);
    result = BASE58_ALPHABET[remainder] + result;
    num = num / 58n;
  }

  // Add leading '1's for zeros
  return '1'.repeat(zeros) + result;
}

// Derive TRC20 address from HD wallet
function deriveTronAddress(mnemonic: string, index: number): string {
  try {
    // Convert mnemonic to seed
    const seed = bip39.mnemonicToSeedSync(mnemonic, '');

    // Create HD key from seed
    const hdKey = HDKey.fromMasterSeed(seed);

    // Derive path: m/44'/195'/0'/0/{index}
    // 195 is TRON's coin type
    const derivedKey = hdKey.derive(`m/44'/195'/0'/0/${index}`);

    if (!derivedKey.privateKey) {
      throw new Error('Failed to derive private key');
    }

    // Get uncompressed public key
    const publicKey = secp256k1.getPublicKey(derivedKey.privateKey, false);

    // Skip the 0x04 prefix and hash with keccak256
    const publicKeyWithoutPrefix = publicKey.slice(1);
    const hash = keccak_256(publicKeyWithoutPrefix);

    // Take last 20 bytes for address
    const addressBytes = hash.slice(-20);

    // Add TRON mainnet prefix (0x41)
    const addressWithPrefix = new Uint8Array(21);
    addressWithPrefix[0] = 0x41;
    addressWithPrefix.set(addressBytes, 1);

    // Base58Check encode
    return base58CheckEncode(addressWithPrefix);
  } catch (err) {
    console.error('Error deriving TRON address:', err);
    throw err;
  }
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders();

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { initData } = body;

    if (!initData) {
      return new Response(JSON.stringify({ error: 'Missing initData' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const tronHdMnemonic = Deno.env.get('DEPOSIT_TRON_HD_MNEMONIC');

    if (!botToken) {
      return new Response(JSON.stringify({ error: 'Server configuration error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const telegramUser = validateInitData(initData, botToken);
    if (!telegramUser) {
      return new Response(JSON.stringify({ error: 'Invalid Telegram data' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Get or create user
    let userId: string;
    let depositIndex: number;

    const { data: existingUser } = await supabase
      .from('tg_users')
      .select('id, deposit_index')
      .eq('telegram_id', telegramUser.id)
      .single();

    if (existingUser) {
      userId = existingUser.id;
      depositIndex = existingUser.deposit_index ?? -1;

      // Ensure deposit_index exists
      if (depositIndex < 0) {
        // Get next available index
        const { data: maxIndexData } = await supabase
          .from('tg_users')
          .select('deposit_index')
          .not('deposit_index', 'is', null)
          .order('deposit_index', { ascending: false })
          .limit(1)
          .single();

        depositIndex = (maxIndexData?.deposit_index ?? -1) + 1;

        await supabase.from('tg_users').update({ deposit_index: depositIndex }).eq('id', userId);
      }
    } else {
      // Get next available index
      const { data: maxIndexData } = await supabase
        .from('tg_users')
        .select('deposit_index')
        .not('deposit_index', 'is', null)
        .order('deposit_index', { ascending: false })
        .limit(1)
        .single();

      depositIndex = (maxIndexData?.deposit_index ?? -1) + 1;

      const { data: newUser, error: createError } = await supabase
        .from('tg_users')
        .insert({
          telegram_id: telegramUser.id,
          first_name: telegramUser.first_name,
          deposit_index: depositIndex,
        })
        .select('id')
        .single();

      if (createError || !newUser) {
        return new Response(JSON.stringify({ error: 'Failed to create user' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      userId = newUser.id;
    }

    // Get or create deposit code
    let depositCode: string;
    const { data: existingCode } = await supabase
      .from('tg_user_deposit_codes')
      .select('code')
      .eq('user_id', userId)
      .single();

    if (existingCode) {
      depositCode = existingCode.code;
    } else {
      depositCode = generateDepositCode();
      await supabase.from('tg_user_deposit_codes').insert({
        user_id: userId,
        code: depositCode,
      });
    }

    // Generate TRC20 address from HD wallet
    let trc20Address = '';
    if (tronHdMnemonic && depositIndex >= 0) {
      try {
        trc20Address = deriveTronAddress(tronHdMnemonic, depositIndex);
      } catch (err) {
        console.error('Error deriving TRC20 address:', err);
      }
    }

    return new Response(
      JSON.stringify({
        code: depositCode,
        trc20Address,
        depositIndex,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Get deposit info error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
