import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createHmac } from 'https://deno.land/std@0.177.0/node/crypto.ts';

const ALLOWED_ORIGINS = ['https://telegram.pezkuwichain.io', 'https://telegram.pezkiwi.app'];

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

function getSessionSecret(botToken: string): Uint8Array {
  return createHmac('sha256', 'SessionTokenSecret').update(botToken).digest();
}

function generateSessionToken(telegramId: number, botToken: string): string {
  const payload = {
    tgId: telegramId,
    iat: Date.now(),
    exp: Date.now() + 24 * 60 * 60 * 1000,
    jti: crypto.randomUUID(),
  };

  const payloadB64 = btoa(JSON.stringify(payload));
  const secret = getSessionSecret(botToken);
  const signature = createHmac('sha256', secret).update(payloadB64).digest('hex');

  return `${payloadB64}.${signature}`;
}

function verifySessionToken(token: string, botToken: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;

    const [payloadB64, signature] = parts;
    const secret = getSessionSecret(botToken);
    const expectedSig = createHmac('sha256', secret).update(payloadB64).digest('hex');

    if (signature !== expectedSig) return null;

    const payload = JSON.parse(atob(payloadB64));
    if (Date.now() > payload.exp) return null;

    return payload.tgId;
  } catch {
    return null;
  }
}

serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { initData, sessionToken } = body;

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Collect all available bot tokens
    const botTokens: string[] = [];
    const mainToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const krdToken = Deno.env.get('TELEGRAM_BOT_TOKEN_KRD');
    const dksToken = Deno.env.get('TELEGRAM_BOT_TOKEN_DKS');
    if (mainToken) botTokens.push(mainToken);
    if (krdToken) botTokens.push(krdToken);
    if (dksToken) botTokens.push(dksToken);

    if (botTokens.length === 0) {
      return new Response(JSON.stringify({ error: 'Server configuration error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Method 1: Session token verification
    if (sessionToken) {
      let tgId: number | null = null;
      let matchedToken: string = botTokens[0];
      for (const token of botTokens) {
        tgId = verifySessionToken(sessionToken, token);
        if (tgId) {
          matchedToken = token;
          break;
        }
      }
      if (!tgId) {
        return new Response(JSON.stringify({ error: 'Invalid or expired session' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('telegram_id', tgId)
        .single();

      if (userError || !userData) {
        return new Response(JSON.stringify({ error: 'User not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Look up auth.users UUID for P2P trade matching
      const sessionTelegramEmail = `telegram_${tgId}@pezkuwichain.io`;
      const {
        data: { users: sessionAuthUsers },
      } = await supabase.auth.admin.listUsers({ perPage: 1000 });
      const sessionAuthUser = sessionAuthUsers?.find(
        (u: { email?: string }) => u.email === sessionTelegramEmail
      );

      return new Response(
        JSON.stringify({
          user: userData,
          auth_user_id: sessionAuthUser?.id || null,
          session_token: generateSessionToken(tgId, matchedToken),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Method 2: initData verification
    if (!initData) {
      return new Response(JSON.stringify({ error: 'Missing authentication data' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let telegramUser: TelegramUser | null = null;
    let matchedBotToken: string = botTokens[0];
    for (const token of botTokens) {
      telegramUser = validateInitData(initData, token);
      if (telegramUser) {
        matchedBotToken = token;
        break;
      }
    }
    if (!telegramUser) {
      return new Response(JSON.stringify({ error: 'Invalid Telegram data' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get or create user
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('telegram_id', telegramUser.id)
      .single();

    let userId: string;

    if (existingUser) {
      userId = existingUser.id;
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
        return new Response(JSON.stringify({ error: 'Failed to create user' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      userId = newUser.id;
    }

    // Ensure auth.users entry exists (needed for P2P foreign keys)
    const telegramEmail = `telegram_${telegramUser.id}@pezkuwichain.io`;
    const {
      data: { users: existingAuthUsers },
    } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const authUser = existingAuthUsers?.find((u: { email?: string }) => u.email === telegramEmail);

    if (!authUser) {
      await supabase.auth.admin.createUser({
        email: telegramEmail,
        email_confirm: true,
        user_metadata: {
          telegram_id: telegramUser.id,
          username: telegramUser.username,
          first_name: telegramUser.first_name,
        },
      });
    }

    const { data: userData } = await supabase.from('users').select('*').eq('id', userId).single();

    // Get the auth.users UUID (just created or already exists)
    const initAuthEmail = `telegram_${telegramUser.id}@pezkuwichain.io`;
    const {
      data: { users: initAuthUsers },
    } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const initAuthUser = initAuthUsers?.find((u: { email?: string }) => u.email === initAuthEmail);

    return new Response(
      JSON.stringify({
        user: userData,
        auth_user_id: initAuthUser?.id || null,
        telegram_user: telegramUser,
        session_token: generateSessionToken(telegramUser.id, matchedBotToken),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
