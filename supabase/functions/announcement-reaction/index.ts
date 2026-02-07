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

// Session token secret (must match telegram-auth function)
function getSessionSecret(botToken: string): Uint8Array {
  return createHmac('sha256', 'SessionTokenSecret').update(botToken).digest();
}

// Verify HMAC-signed session token
function verifySessionToken(token: string, botToken: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) {
      return null;
    }

    const [payloadB64, signature] = parts;

    // Verify signature
    const secret = getSessionSecret(botToken);
    const expectedSig = createHmac('sha256', secret).update(payloadB64).digest('hex');

    if (signature !== expectedSig) {
      console.error('[announcement-reaction] Invalid signature');
      return null;
    }

    // Parse payload
    const payload = JSON.parse(atob(payloadB64));

    // Check expiration
    if (Date.now() > payload.exp) {
      console.error('[announcement-reaction] Token expired');
      return null;
    }

    return payload.tgId;
  } catch (e) {
    console.error('[announcement-reaction] Token verification error:', e);
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
    const { sessionToken, announcementId, reaction } = body;

    // Validate input
    if (!sessionToken || !announcementId || !reaction) {
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
      return new Response(JSON.stringify({ error: 'Server configuration error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify session token
    const telegramId = verifySessionToken(sessionToken, botToken);
    if (!telegramId) {
      return new Response(JSON.stringify({ error: 'Invalid or expired session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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
