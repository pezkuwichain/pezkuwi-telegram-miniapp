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

interface P2PDisputeRequest {
  sessionToken: string;
  action: 'open' | 'add_evidence';
  tradeId: string;
  reason?: string;
  category?: 'payment_not_received' | 'wrong_amount' | 'fake_payment_proof' | 'other';
  evidenceUrl?: string;
  evidenceType?:
    | 'screenshot'
    | 'receipt'
    | 'bank_statement'
    | 'chat_log'
    | 'transaction_proof'
    | 'other';
  description?: string;
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
    const body: P2PDisputeRequest = await req.json();
    const {
      sessionToken,
      action,
      tradeId,
      reason,
      category,
      evidenceUrl,
      evidenceType,
      description,
    } = body;

    // Get bot tokens for session verification (dual bot support)
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

    // Validate session token
    if (!sessionToken) {
      return new Response(JSON.stringify({ error: 'Missing session token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let telegramId: number | null = null;
    for (const bt of botTokens) {
      telegramId = verifySessionToken(sessionToken, bt);
      if (telegramId) break;
    }
    if (!telegramId) {
      return new Response(JSON.stringify({ error: 'Invalid or expired session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate required fields
    if (!action || !tradeId) {
      return new Response(JSON.stringify({ error: 'Missing required fields: action, tradeId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!['open', 'add_evidence'].includes(action)) {
      return new Response(
        JSON.stringify({ error: 'Invalid action. Must be "open" or "add_evidence"' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Create Supabase admin client (bypasses RLS)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Resolve P2P user ID: prefer p2p_user_id (citizen/visa UUID, same as pwap/web)
    // fallback to tg_users.id (legacy Supabase Auth UUID)
    const { data: tgUser, error: tgUserError } = await supabase
      .from('tg_users')
      .select('id, p2p_user_id')
      .eq('telegram_id', telegramId)
      .single();

    if (tgUserError || !tgUser) {
      return new Response(JSON.stringify({ error: 'User not found. Please authenticate first.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = tgUser.p2p_user_id ?? tgUser.id;

    // Verify user is a party to this trade
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

    if (trade.seller_id !== userId && trade.buyer_id !== userId) {
      return new Response(JSON.stringify({ error: 'You are not a party to this trade' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ==================== OPEN DISPUTE ====================
    if (action === 'open') {
      // Trade must be in active status to dispute
      if (!['pending', 'payment_sent'].includes(trade.status)) {
        return new Response(
          JSON.stringify({
            error: `Cannot open dispute: trade status is '${trade.status}', must be 'pending' or 'payment_sent'`,
          }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      // Validate category
      const validCategories = [
        'payment_not_received',
        'wrong_amount',
        'fake_payment_proof',
        'other',
      ];
      const disputeCategory = category || 'other';
      if (!validCategories.includes(disputeCategory)) {
        return new Response(
          JSON.stringify({
            error: `Invalid category. Must be one of: ${validCategories.join(', ')}`,
          }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      const disputeReason = reason || 'No reason provided';

      // Check if there's already an open dispute for this trade
      const { data: existingDispute } = await supabase
        .from('p2p_fiat_disputes')
        .select('id')
        .eq('trade_id', tradeId)
        .in('status', ['open', 'under_review'])
        .single();

      if (existingDispute) {
        return new Response(JSON.stringify({ error: 'A dispute is already open for this trade' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Insert dispute record
      const { data: dispute, error: disputeError } = await supabase
        .from('p2p_fiat_disputes')
        .insert({
          trade_id: tradeId,
          opened_by: userId,
          reason: disputeReason,
          category: disputeCategory,
          status: 'open',
        })
        .select()
        .single();

      if (disputeError) {
        console.error('Create dispute error:', disputeError);
        return new Response(
          JSON.stringify({ error: 'Failed to create dispute: ' + disputeError.message }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      // Update trade status to disputed
      const now = new Date().toISOString();
      const { error: updateError } = await supabase
        .from('p2p_fiat_trades')
        .update({
          status: 'disputed',
          dispute_reason: disputeReason,
          dispute_opened_at: now,
          dispute_opened_by: userId,
        })
        .eq('id', tradeId);

      if (updateError) {
        console.error('Update trade dispute status error:', updateError);
        // Dispute was created but trade status update failed - log warning but don't fail
      }

      // Log to audit
      await supabase.from('p2p_audit_log').insert({
        user_id: userId,
        action: 'open_dispute',
        entity_type: 'trade',
        entity_id: tradeId,
        details: {
          dispute_id: dispute.id,
          reason: disputeReason,
          category: disputeCategory,
          previous_status: trade.status,
        },
      });

      return new Response(
        JSON.stringify({
          success: true,
          dispute,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ==================== ADD EVIDENCE ====================
    if (action === 'add_evidence') {
      // Validate evidence fields
      if (!evidenceUrl) {
        return new Response(JSON.stringify({ error: 'Missing required field: evidenceUrl' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const validEvidenceTypes = [
        'screenshot',
        'receipt',
        'bank_statement',
        'chat_log',
        'transaction_proof',
        'other',
      ];
      const evType = evidenceType || 'other';
      if (!validEvidenceTypes.includes(evType)) {
        return new Response(
          JSON.stringify({
            error: `Invalid evidence type. Must be one of: ${validEvidenceTypes.join(', ')}`,
          }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      // Find the dispute for this trade
      const { data: dispute, error: disputeError } = await supabase
        .from('p2p_fiat_disputes')
        .select('id, status')
        .eq('trade_id', tradeId)
        .in('status', ['open', 'under_review'])
        .single();

      if (disputeError || !dispute) {
        return new Response(JSON.stringify({ error: 'No active dispute found for this trade' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Insert evidence
      const { data: evidence, error: evidenceError } = await supabase
        .from('p2p_dispute_evidence')
        .insert({
          dispute_id: dispute.id,
          uploaded_by: userId,
          evidence_type: evType,
          file_url: evidenceUrl,
          description: description || null,
        })
        .select()
        .single();

      if (evidenceError) {
        console.error('Add evidence error:', evidenceError);
        return new Response(
          JSON.stringify({ error: 'Failed to add evidence: ' + evidenceError.message }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      // Log to audit
      await supabase.from('p2p_audit_log').insert({
        user_id: userId,
        action: 'add_dispute_evidence',
        entity_type: 'dispute',
        entity_id: dispute.id,
        details: {
          trade_id: tradeId,
          evidence_id: evidence.id,
          evidence_type: evType,
        },
      });

      return new Response(
        JSON.stringify({
          success: true,
          dispute: {
            id: dispute.id,
            status: dispute.status,
            evidence,
          },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Should not reach here
    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
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
