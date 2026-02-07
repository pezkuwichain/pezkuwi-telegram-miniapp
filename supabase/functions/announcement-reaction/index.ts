import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createHmac } from 'https://deno.land/std@0.177.0/node/crypto.ts';

// CORS - Only allow our Telegram MiniApp domain
const ALLOWED_ORIGIN = 'https://telegram.pezkuwichain.io';

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
  last_name?: string;
  username?: string;
}

// Validate Telegram WebApp initData and extract user
function validateInitData(initData: string, botToken: string): TelegramUser | null {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;

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
      console.error('[announcement-reaction] Hash mismatch');
      return null;
    }

    // Check auth_date (allow 24 hours)
    const authDate = parseInt(params.get('auth_date') || '0');
    const now = Math.floor(Date.now() / 1000);
    if (now - authDate > 86400) {
      console.error('[announcement-reaction] Auth data expired');
      return null;
    }

    // Parse user data
    const userStr = params.get('user');
    if (!userStr) return null;

    return JSON.parse(userStr) as TelegramUser;
  } catch (e) {
    console.error('[announcement-reaction] Validation error:', e);
    return null;
  }
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders();

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { initData, announcementId, reaction } = body;

    console.log('[announcement-reaction] Request received:', {
      hasInitData: !!initData,
      announcementId,
      reaction,
    });

    // Validate input
    if (!initData || !announcementId || !reaction) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (reaction !== 'like' && reaction !== 'dislike') {
      return new Response(JSON.stringify({ error: 'Invalid reaction type' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');

    if (!botToken) {
      console.error('[announcement-reaction] TELEGRAM_BOT_TOKEN not set!');
      return new Response(JSON.stringify({ error: 'Server configuration error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate initData and get Telegram user
    const telegramUser = validateInitData(initData, botToken);
    if (!telegramUser) {
      return new Response(JSON.stringify({ error: 'Invalid Telegram data' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const telegramId = telegramUser.id;
    console.log('[announcement-reaction] User validated:', telegramId);

    // Create Supabase admin client
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Get user by telegram_id from tg_users table
    const { data: userData, error: userError } = await supabase
      .from('tg_users')
      .select('id')
      .eq('telegram_id', telegramId)
      .single();

    if (userError || !userData) {
      console.error('[announcement-reaction] User not found for tgId:', telegramId);
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = userData.id;

    // Check existing reaction
    const { data: existing } = await supabase
      .from('tg_announcement_reactions')
      .select('*')
      .eq('announcement_id', announcementId)
      .eq('user_id', userId)
      .single();

    let resultAction = '';

    if (existing) {
      if (existing.reaction === reaction) {
        // Remove reaction (toggle off)
        await supabase.from('tg_announcement_reactions').delete().eq('id', existing.id);

        // Decrement counter
        const { data: ann } = await supabase
          .from('tg_announcements')
          .select(reaction === 'like' ? 'likes' : 'dislikes')
          .eq('id', announcementId)
          .single();

        const currentCount = ann?.[reaction === 'like' ? 'likes' : 'dislikes'] ?? 0;
        await supabase
          .from('tg_announcements')
          .update({ [reaction === 'like' ? 'likes' : 'dislikes']: Math.max(0, currentCount - 1) })
          .eq('id', announcementId);

        resultAction = 'removed';
      } else {
        // Change reaction
        const oldReaction = existing.reaction;
        await supabase.from('tg_announcement_reactions').update({ reaction }).eq('id', existing.id);

        // Update counters
        const { data: ann } = await supabase
          .from('tg_announcements')
          .select('likes, dislikes')
          .eq('id', announcementId)
          .single();

        const updates: Record<string, number> = {};
        if (oldReaction === 'like') {
          updates.likes = Math.max(0, (ann?.likes ?? 0) - 1);
        } else {
          updates.dislikes = Math.max(0, (ann?.dislikes ?? 0) - 1);
        }
        if (reaction === 'like') {
          updates.likes = (updates.likes ?? ann?.likes ?? 0) + 1;
        } else {
          updates.dislikes = (updates.dislikes ?? ann?.dislikes ?? 0) + 1;
        }

        await supabase.from('tg_announcements').update(updates).eq('id', announcementId);

        resultAction = 'changed';
      }
    } else {
      // Add new reaction
      await supabase.from('tg_announcement_reactions').insert({
        announcement_id: announcementId,
        user_id: userId,
        reaction,
      });

      // Increment counter
      const { data: ann } = await supabase
        .from('tg_announcements')
        .select(reaction === 'like' ? 'likes' : 'dislikes')
        .eq('id', announcementId)
        .single();

      const currentCount = ann?.[reaction === 'like' ? 'likes' : 'dislikes'] ?? 0;
      await supabase
        .from('tg_announcements')
        .update({ [reaction === 'like' ? 'likes' : 'dislikes']: currentCount + 1 })
        .eq('id', announcementId);

      resultAction = 'added';
    }

    // Get updated announcement data
    const { data: updatedAnn } = await supabase
      .from('tg_announcements')
      .select('likes, dislikes')
      .eq('id', announcementId)
      .single();

    // Get user's current reaction
    const { data: userReaction } = await supabase
      .from('tg_announcement_reactions')
      .select('reaction')
      .eq('announcement_id', announcementId)
      .eq('user_id', userId)
      .single();

    return new Response(
      JSON.stringify({
        success: true,
        action: resultAction,
        likes: updatedAnn?.likes ?? 0,
        dislikes: updatedAnn?.dislikes ?? 0,
        user_reaction: userReaction?.reaction ?? null,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[announcement-reaction] Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
