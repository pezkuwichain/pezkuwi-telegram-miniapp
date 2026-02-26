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

serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { initData, announcementId, reaction } = body;

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

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const botTokens: string[] = [];
    const _mainToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const _krdToken = Deno.env.get('TELEGRAM_BOT_TOKEN_KRD');
    if (_mainToken) botTokens.push(_mainToken);
    if (_krdToken) botTokens.push(_krdToken);

    if (botTokens.length === 0) {
      return new Response(JSON.stringify({ error: 'Server configuration error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let telegramUser: TelegramUser | null = null;
    for (const bt of botTokens) {
      telegramUser = validateInitData(initData, bt);
      if (telegramUser) break;
    }
    if (!telegramUser) {
      return new Response(JSON.stringify({ error: 'Invalid Telegram data' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const telegramId = telegramUser.id;

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Get or create user
    let userId: string;
    const { data: existingUser } = await supabase
      .from('tg_users')
      .select('id')
      .eq('telegram_id', telegramId)
      .single();

    if (existingUser) {
      userId = existingUser.id;
    } else {
      const { data: newUser, error: createError } = await supabase
        .from('tg_users')
        .insert({
          telegram_id: telegramId,
          username: telegramUser.username || null,
          first_name: telegramUser.first_name,
          last_name: telegramUser.last_name || null,
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

    // Get updated data
    const { data: updatedAnn } = await supabase
      .from('tg_announcements')
      .select('likes, dislikes')
      .eq('id', announcementId)
      .single();

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
  } catch {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
