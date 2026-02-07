import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createHmac } from 'https://deno.land/std@0.177.0/node/crypto.ts';

// CORS - Only allow our Telegram MiniApp domain
const ALLOWED_ORIGIN = 'https://telegram.pezkuwichain.io';

function getCorsHeaders(origin: string | null): Record<string, string> {
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
  last_name?: string;
  username?: string;
  photo_url?: string;
  language_code?: string;
}

// Validate Telegram WebApp initData
function validateInitData(initData: string, botToken: string): TelegramUser | null {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) {
      console.error('[validateInitData] No hash in initData');
      return null;
    }

    params.delete('hash');

    // Sort parameters alphabetically
    const sortedParams = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    // Calculate secret key: HMAC-SHA256("WebAppData", bot_token)
    const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();

    // Calculate hash: HMAC-SHA256(secret_key, data_check_string)
    const calculatedHash = createHmac('sha256', secretKey).update(sortedParams).digest('hex');

    if (calculatedHash !== hash) {
      console.error('[validateInitData] Hash mismatch');
      console.error('[validateInitData] Expected:', hash);
      console.error('[validateInitData] Calculated:', calculatedHash);
      return null;
    }

    // Check auth_date (allow 24 hours)
    const authDate = parseInt(params.get('auth_date') || '0');
    const now = Math.floor(Date.now() / 1000);
    if (now - authDate > 86400) {
      console.error('[validateInitData] Auth data expired. Age:', now - authDate, 'seconds');
      return null;
    }

    // Parse user data
    const userStr = params.get('user');
    if (!userStr) {
      console.error('[validateInitData] No user in initData');
      return null;
    }

    const user = JSON.parse(userStr) as TelegramUser;
    console.log('[validateInitData] Success for user:', user.id, user.first_name);
    return user;
  } catch (e) {
    console.error('[validateInitData] Error:', e);
    return null;
  }
}

// Session token secret (derived from bot token)
function getSessionSecret(botToken: string): Uint8Array {
  return createHmac('sha256', 'SessionTokenSecret').update(botToken).digest();
}

// Generate HMAC-signed session token
function generateSessionToken(telegramId: number, botToken: string): string {
  const payload = {
    tgId: telegramId,
    iat: Date.now(),
    exp: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
    jti: crypto.randomUUID(),
  };

  const payloadStr = JSON.stringify(payload);
  const payloadB64 = btoa(payloadStr);

  // Sign with HMAC-SHA256
  const secret = getSessionSecret(botToken);
  const signature = createHmac('sha256', secret).update(payloadB64).digest('hex');

  return `${payloadB64}.${signature}`;
}

// Verify HMAC-signed session token
function verifySessionToken(token: string, botToken: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) {
      console.error('[verifySessionToken] Invalid token format');
      return null;
    }

    const [payloadB64, signature] = parts;

    // Verify signature
    const secret = getSessionSecret(botToken);
    const expectedSig = createHmac('sha256', secret).update(payloadB64).digest('hex');

    if (signature !== expectedSig) {
      console.error('[verifySessionToken] Invalid signature');
      return null;
    }

    // Parse payload
    const payload = JSON.parse(atob(payloadB64));

    // Check expiration
    if (Date.now() > payload.exp) {
      console.error('[verifySessionToken] Token expired');
      return null;
    }

    return payload.tgId;
  } catch (e) {
    console.error('[verifySessionToken] Error:', e);
    return null;
  }
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req.headers.get('origin'));

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { initData, sessionToken } = body;

    // Get environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');

    if (!botToken) {
      console.error('[telegram-auth] TELEGRAM_BOT_TOKEN not set');
      return new Response(JSON.stringify({ error: 'Server configuration error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create Supabase admin client with auth admin capabilities
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // ========================================
    // Method 1: Session token verification
    // ========================================
    if (sessionToken) {
      console.log('[telegram-auth] Method 1: Session token verification');

      const tgId = verifySessionToken(sessionToken, botToken);
      if (!tgId) {
        return new Response(JSON.stringify({ error: 'Invalid or expired session' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get user by telegram_id
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('telegram_id', tgId)
        .single();

      if (userError || !userData) {
        console.error('[telegram-auth] User not found for tgId:', tgId);
        return new Response(JSON.stringify({ error: 'User not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Return user with refreshed token
      return new Response(
        JSON.stringify({
          user: userData,
          session_token: generateSessionToken(tgId, botToken),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========================================
    // Method 2: Telegram WebApp initData verification
    // ========================================
    if (!initData) {
      console.error('[telegram-auth] No initData or sessionToken provided');
      return new Response(JSON.stringify({ error: 'Missing authentication data' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('[telegram-auth] Method 2: initData verification');
    console.log('[telegram-auth] initData length:', initData.length);

    // Validate Telegram data
    const telegramUser = validateInitData(initData, botToken);
    if (!telegramUser) {
      return new Response(JSON.stringify({ error: 'Invalid Telegram data' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if user exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('telegram_id', telegramUser.id)
      .single();

    let userId: string;

    if (existingUser) {
      // Update existing user
      userId = existingUser.id;
      console.log('[telegram-auth] Updating existing user:', userId);

      await supabase
        .from('users')
        .update({
          username: telegramUser.username,
          first_name: telegramUser.first_name,
          last_name: telegramUser.last_name,
          photo_url: telegramUser.photo_url,
          language_code: telegramUser.language_code,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);
    } else {
      // Create new user
      console.log('[telegram-auth] Creating new user for telegram_id:', telegramUser.id);

      const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert({
          telegram_id: telegramUser.id,
          username: telegramUser.username,
          first_name: telegramUser.first_name,
          last_name: telegramUser.last_name,
          photo_url: telegramUser.photo_url,
          language_code: telegramUser.language_code || 'ku',
        })
        .select('id')
        .single();

      if (createError) {
        console.error('[telegram-auth] Error creating user:', createError);
        return new Response(JSON.stringify({ error: 'Failed to create user' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      userId = newUser.id;
      console.log('[telegram-auth] New user created:', userId);
    }

    // Get the full user data
    const { data: userData } = await supabase.from('users').select('*').eq('id', userId).single();

    // Also sync to tg_users table for forum/announcements
    const { data: existingTgUser } = await supabase
      .from('tg_users')
      .select('id')
      .eq('telegram_id', telegramUser.id)
      .single();

    if (!existingTgUser) {
      // Create tg_user record with same ID as users table for consistency
      await supabase.from('tg_users').insert({
        id: userId,
        telegram_id: telegramUser.id,
        username: telegramUser.username || null,
        first_name: telegramUser.first_name,
        last_name: telegramUser.last_name || null,
        photo_url: telegramUser.photo_url || null,
        is_admin: false,
      });
      console.log('[telegram-auth] Created tg_user record for:', userId);
    } else {
      // Update tg_user record
      await supabase
        .from('tg_users')
        .update({
          username: telegramUser.username || null,
          first_name: telegramUser.first_name,
          last_name: telegramUser.last_name || null,
          photo_url: telegramUser.photo_url || null,
        })
        .eq('id', existingTgUser.id);
    }

    return new Response(
      JSON.stringify({
        user: userData,
        telegram_user: telegramUser,
        session_token: generateSessionToken(telegramUser.id, botToken),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[telegram-auth] Unexpected error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
