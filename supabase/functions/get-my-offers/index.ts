import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform',
};

interface GetMyOffersRequest {
  sessionToken: string;
  status?: string; // Optional: filter by status ('open', 'paused', etc.)
}

// Verify session token and get telegram_id
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
    const body: GetMyOffersRequest = await req.json();
    const { sessionToken, status } = body;

    // Validate session token
    if (!sessionToken) {
      return new Response(JSON.stringify({ error: 'Missing session token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const telegramId = verifySessionToken(sessionToken);
    if (!telegramId) {
      return new Response(JSON.stringify({ error: 'Invalid or expired session' }), {
        status: 401,
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
      return new Response(
        JSON.stringify({ error: 'User not found. Please authenticate first.', offers: [] }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const userId = authUser.id;

    // Build query
    let query = supabase
      .from('p2p_fiat_offers')
      .select('*')
      .eq('seller_id', userId)
      .order('created_at', { ascending: false });

    // Apply status filter if provided
    if (status) {
      query = query.eq('status', status);
    }

    const { data: offers, error: queryError } = await query;

    if (queryError) {
      console.error('Query error:', queryError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch offers: ' + queryError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        offers: offers || [],
        count: offers?.length || 0,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
