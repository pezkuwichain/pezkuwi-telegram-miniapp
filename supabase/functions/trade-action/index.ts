import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createHmac } from 'https://deno.land/std@0.177.0/node/crypto.ts';

// CORS - Production domain only
const ALLOWED_ORIGINS = [
  'https://telegram.pezkuwichain.io',
  'https://telegram.pezkiwi.app',
  'https://t.me',
];

function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigin =
    origin && ALLOWED_ORIGINS.some((o) => origin.startsWith(o)) ? origin : ALLOWED_ORIGINS[0];

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-supabase-client-platform',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

interface TradeActionRequest {
  sessionToken: string;
  tradeId: string;
  action: 'mark_paid' | 'confirm' | 'cancel' | 'rate';
  payload?: {
    rating?: number;
    review?: string;
    reason?: string;
  };
}

// Session token secret (derived from bot token)
function getSessionSecret(botToken: string): Uint8Array {
  return createHmac('sha256', 'SessionTokenSecret').update(botToken).digest();
}

// Verify HMAC-signed session token
function verifySessionToken(token: string, botToken: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) {
      // Try legacy format for backwards compatibility
      return verifyLegacyToken(token);
    }

    const [payloadB64, signature] = parts;

    // Verify signature
    const secret = getSessionSecret(botToken);
    const expectedSig = createHmac('sha256', secret).update(payloadB64).digest('hex');

    if (signature !== expectedSig) {
      return null;
    }

    // Parse payload
    const payload = JSON.parse(atob(payloadB64));

    // Check expiration
    if (Date.now() > payload.exp) {
      return null;
    }

    return payload.tgId;
  } catch {
    return null;
  }
}

// Legacy token format (Base64 only) - for backwards compatibility
function verifyLegacyToken(token: string): number | null {
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
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body: TradeActionRequest = await req.json();
    const { sessionToken, tradeId, action, payload } = body;

    // Get bot token for session verification
    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
    if (!botToken) {
      return new Response(JSON.stringify({ error: 'Server configuration error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate session token
    if (!sessionToken) {
      return new Response(JSON.stringify({ error: 'Missing session token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const telegramId = verifySessionToken(sessionToken, botToken);
    if (!telegramId) {
      return new Response(JSON.stringify({ error: 'Invalid or expired session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate required fields
    if (!tradeId || !action) {
      return new Response(JSON.stringify({ error: 'Missing required fields: tradeId, action' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const validActions = ['mark_paid', 'confirm', 'cancel', 'rate'];
    if (!validActions.includes(action)) {
      return new Response(JSON.stringify({ error: `Invalid action. Must be one of: ${validActions.join(', ')}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create Supabase admin client (bypasses RLS)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get auth user ID for this telegram user
    const telegramEmail = `telegram_${telegramId}@pezkuwichain.io`;
    const {
      data: { users: authUsers },
    } = await supabase.auth.admin.listUsers();
    const authUser = authUsers?.find((u) => u.email === telegramEmail);

    if (!authUser) {
      return new Response(JSON.stringify({ error: 'User not found. Please authenticate first.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = authUser.id;

    // Fetch the trade
    const { data: trade, error: tradeError } = await supabase
      .from('p2p_fiat_trades')
      .select('*')
      .eq('id', tradeId)
      .single();

    if (tradeError || !trade) {
      return new Response(JSON.stringify({ error: 'Trade not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify user is a party to this trade
    if (trade.seller_id !== userId && trade.buyer_id !== userId) {
      return new Response(JSON.stringify({ error: 'You are not a party to this trade' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let updatedTrade;

    // ==================== MARK PAID ====================
    if (action === 'mark_paid') {
      // Only buyer can mark as paid
      if (trade.buyer_id !== userId) {
        return new Response(JSON.stringify({ error: 'Only the buyer can mark payment as sent' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Trade must be in pending status
      if (trade.status !== 'pending') {
        return new Response(JSON.stringify({ error: `Cannot mark paid: trade status is '${trade.status}', expected 'pending'` }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const now = new Date().toISOString();
      const confirmationDeadline = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(); // +2 hours

      const { data: updated, error: updateError } = await supabase
        .from('p2p_fiat_trades')
        .update({
          buyer_marked_paid_at: now,
          status: 'payment_sent',
          confirmation_deadline: confirmationDeadline,
        })
        .eq('id', tradeId)
        .eq('buyer_id', userId)
        .eq('status', 'pending')
        .select()
        .single();

      if (updateError) {
        console.error('Mark paid error:', updateError);
        return new Response(
          JSON.stringify({ error: 'Failed to mark payment: ' + updateError.message }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      updatedTrade = updated;

      // Log to audit
      await supabase.from('p2p_audit_log').insert({
        user_id: userId,
        action: 'mark_paid',
        entity_type: 'trade',
        entity_id: tradeId,
        details: {
          confirmation_deadline: confirmationDeadline,
        },
      });
    }

    // ==================== CONFIRM ====================
    else if (action === 'confirm') {
      // Only seller can confirm
      if (trade.seller_id !== userId) {
        return new Response(JSON.stringify({ error: 'Only the seller can confirm and release crypto' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Trade must be in payment_sent status
      if (trade.status !== 'payment_sent') {
        return new Response(JSON.stringify({ error: `Cannot confirm: trade status is '${trade.status}', expected 'payment_sent'` }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get offer details to know the token
      const { data: offer, error: offerError } = await supabase
        .from('p2p_fiat_offers')
        .select('token')
        .eq('id', trade.offer_id)
        .single();

      if (offerError || !offer) {
        return new Response(JSON.stringify({ error: 'Associated offer not found' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Release escrow: transfer from seller's locked balance to buyer's available balance
      const { data: releaseResult, error: releaseError } = await supabase.rpc(
        'release_escrow_internal',
        {
          p_from_user_id: trade.seller_id,
          p_to_user_id: trade.buyer_id,
          p_token: offer.token,
          p_amount: trade.crypto_amount,
          p_reference_type: 'trade',
          p_reference_id: tradeId,
        }
      );

      if (releaseError) {
        console.error('Release escrow error:', releaseError);
        return new Response(
          JSON.stringify({ error: 'Failed to release escrow: ' + releaseError.message }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      const releaseResponse = typeof releaseResult === 'string' ? JSON.parse(releaseResult) : releaseResult;

      if (releaseResponse && !releaseResponse.success) {
        return new Response(
          JSON.stringify({ error: releaseResponse.error || 'Failed to release escrow' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      // Update trade status to completed
      const now = new Date().toISOString();
      const { data: updated, error: updateError } = await supabase
        .from('p2p_fiat_trades')
        .update({
          seller_confirmed_at: now,
          escrow_released_at: now,
          status: 'completed',
          completed_at: now,
        })
        .eq('id', tradeId)
        .select()
        .single();

      if (updateError) {
        console.error('Confirm trade update error:', updateError);
        return new Response(
          JSON.stringify({ error: 'Escrow released but failed to update trade status: ' + updateError.message }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      updatedTrade = updated;

      // Log to audit
      await supabase.from('p2p_audit_log').insert({
        user_id: userId,
        action: 'confirm_trade',
        entity_type: 'trade',
        entity_id: tradeId,
        details: {
          token: offer.token,
          crypto_amount: trade.crypto_amount,
          buyer_id: trade.buyer_id,
        },
      });
    }

    // ==================== CANCEL ====================
    else if (action === 'cancel') {
      // Trade must be in pending or payment_sent status to cancel
      if (!['pending', 'payment_sent'].includes(trade.status)) {
        return new Response(JSON.stringify({ error: `Cannot cancel: trade status is '${trade.status}'` }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const cancelReason = payload?.reason || 'Cancelled by user';

      // Try using the cancel_p2p_trade RPC if it exists
      const { data: rpcResult, error: rpcError } = await supabase.rpc('cancel_p2p_trade', {
        p_trade_id: tradeId,
        p_user_id: userId,
        p_reason: cancelReason,
      });

      if (rpcError) {
        // If RPC doesn't exist (42883), do manual cancellation
        if (rpcError.code === '42883') {
          console.warn('cancel_p2p_trade RPC not found, performing manual cancellation');

          // Update trade status
          const { data: updated, error: updateError } = await supabase
            .from('p2p_fiat_trades')
            .update({
              status: 'cancelled',
              cancelled_by: userId,
              cancellation_reason: cancelReason,
            })
            .eq('id', tradeId)
            .select()
            .single();

          if (updateError) {
            console.error('Cancel trade error:', updateError);
            return new Response(
              JSON.stringify({ error: 'Failed to cancel trade: ' + updateError.message }),
              {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              }
            );
          }

          // Restore offer remaining amount
          const { data: offer } = await supabase
            .from('p2p_fiat_offers')
            .select('id, remaining_amount')
            .eq('id', trade.offer_id)
            .single();

          if (offer) {
            await supabase
              .from('p2p_fiat_offers')
              .update({
                remaining_amount: (offer.remaining_amount || 0) + (trade.crypto_amount || 0),
                status: 'open',
              })
              .eq('id', offer.id);
          }

          updatedTrade = updated;
        } else {
          console.error('Cancel trade RPC error:', rpcError);
          return new Response(
            JSON.stringify({ error: 'Failed to cancel trade: ' + rpcError.message }),
            {
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
        }
      } else {
        // RPC succeeded, parse result
        const result = typeof rpcResult === 'string' ? JSON.parse(rpcResult) : rpcResult;

        if (result && !result.success) {
          return new Response(
            JSON.stringify({ error: result.error || 'Failed to cancel trade' }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
        }

        // Fetch updated trade
        const { data: updated } = await supabase
          .from('p2p_fiat_trades')
          .select('*')
          .eq('id', tradeId)
          .single();

        updatedTrade = updated;
      }

      // Log to audit
      await supabase.from('p2p_audit_log').insert({
        user_id: userId,
        action: 'cancel_trade',
        entity_type: 'trade',
        entity_id: tradeId,
        details: {
          reason: cancelReason,
          previous_status: trade.status,
        },
      });
    }

    // ==================== RATE ====================
    else if (action === 'rate') {
      // Trade must be completed to rate
      if (trade.status !== 'completed') {
        return new Response(JSON.stringify({ error: 'Can only rate completed trades' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Validate rating payload
      if (!payload?.rating || payload.rating < 1 || payload.rating > 5) {
        return new Response(JSON.stringify({ error: 'Rating must be between 1 and 5' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Determine counterparty
      const ratedId = trade.seller_id === userId ? trade.buyer_id : trade.seller_id;

      // Check if user already rated this trade
      const { data: existingRating } = await supabase
        .from('p2p_ratings')
        .select('id')
        .eq('trade_id', tradeId)
        .eq('rater_id', userId)
        .single();

      if (existingRating) {
        return new Response(JSON.stringify({ error: 'You have already rated this trade' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Insert rating
      const { data: rating, error: ratingError } = await supabase
        .from('p2p_ratings')
        .insert({
          trade_id: tradeId,
          rater_id: userId,
          rated_id: ratedId,
          rating: payload.rating,
          review: payload.review || null,
        })
        .select()
        .single();

      if (ratingError) {
        console.error('Insert rating error:', ratingError);
        return new Response(
          JSON.stringify({ error: 'Failed to submit rating: ' + ratingError.message }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      // Fetch trade as-is for response
      updatedTrade = trade;

      // Log to audit
      await supabase.from('p2p_audit_log').insert({
        user_id: userId,
        action: 'rate_trade',
        entity_type: 'trade',
        entity_id: tradeId,
        details: {
          rated_id: ratedId,
          rating: payload.rating,
          review: payload.review || null,
        },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        trade: updatedTrade,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error:', error);
    const origin = req.headers.get('origin');
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      {
        status: 500,
        headers: { ...getCorsHeaders(origin), 'Content-Type': 'application/json' },
      }
    );
  }
});
