import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createHmac } from 'https://deno.land/std@0.177.0/node/crypto.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform',
};

interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  language_code?: string;
}

function validateInitData(initData: string, botToken: string): TelegramUser | null {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;

    params.delete('hash');

    // Sort parameters
    const sortedParams = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    // Validate hash
    const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();

    const calculatedHash = createHmac('sha256', secretKey).update(sortedParams).digest('hex');

    if (calculatedHash !== hash) {
      console.error('Hash mismatch');
      return null;
    }

    // Check auth_date (allow 24 hours)
    const authDate = parseInt(params.get('auth_date') || '0');
    const now = Math.floor(Date.now() / 1000);
    if (now - authDate > 86400) {
      console.error('Auth data expired');
      return null;
    }

    // Parse user data
    const userStr = params.get('user');
    if (!userStr) return null;

    return JSON.parse(userStr) as TelegramUser;
  } catch (e) {
    console.error('Validation error:', e);
    return null;
  }
}

// Generate session token
function generateSessionToken(telegramId: number): string {
  const payload = `${telegramId}:${Date.now()}:${crypto.randomUUID()}`;
  return btoa(payload);
}

// Verify session token
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
    const body = await req.json();
    const { initData, telegram_id, from_miniapp, wallet_address, sessionToken } = body;

    // Create Supabase admin client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let telegramUser: TelegramUser | null = null;

    // Method 1: Session token verification
    if (sessionToken) {
      const tgId = verifySessionToken(sessionToken);
      if (!tgId) {
        return new Response(JSON.stringify({ error: 'Invalid or expired session' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get user by telegram_id
      const { data: userData } = await supabase
        .from('users')
        .select('*')
        .eq('telegram_id', tgId)
        .single();

      if (!userData) {
        return new Response(JSON.stringify({ error: 'User not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(
        JSON.stringify({
          user: userData,
          session_token: generateSessionToken(tgId),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Method 2: Mini-app redirect (telegram_id from URL params)
    if (from_miniapp && telegram_id) {
      // Check if user exists
      const { data: existingUser } = await supabase
        .from('users')
        .select('*')
        .eq('telegram_id', telegram_id)
        .single();

      if (!existingUser) {
        return new Response(
          JSON.stringify({ error: 'User not found. Please use the main app first.' }),
          {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      // Update wallet if provided
      if (wallet_address && wallet_address !== existingUser.wallet_address) {
        await supabase.from('users').update({ wallet_address }).eq('telegram_id', telegram_id);
        existingUser.wallet_address = wallet_address;
      }

      return new Response(
        JSON.stringify({
          user: existingUser,
          session_token: generateSessionToken(telegram_id),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Method 3: Full Telegram WebApp initData verification
    if (!initData) {
      return new Response(JSON.stringify({ error: 'Missing authentication data' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
    if (!botToken) {
      console.error('TELEGRAM_BOT_TOKEN not set');
      return new Response(JSON.stringify({ error: 'Server configuration error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate Telegram data
    telegramUser = validateInitData(initData, botToken);
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
      await supabase
        .from('users')
        .update({
          username: telegramUser.username,
          first_name: telegramUser.first_name,
          last_name: telegramUser.last_name,
          photo_url: telegramUser.photo_url,
          language_code: telegramUser.language_code,
        })
        .eq('id', userId);
    } else {
      // Create new user
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
        console.error('Error creating user:', createError);
        return new Response(JSON.stringify({ error: 'Failed to create user' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      userId = newUser.id;
    }

    // Get the user data
    const { data: userData } = await supabase.from('users').select('*').eq('id', userId).single();

    return new Response(
      JSON.stringify({
        user: userData,
        telegram_user: telegramUser,
        session_token: generateSessionToken(telegramUser.id),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
