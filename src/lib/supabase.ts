import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

// Supabase client singleton
// Using 'any' for database type - run `supabase gen types typescript` for proper types
export const supabase: SupabaseClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

// Telegram auth helper - validates initData with Edge Function
export async function signInWithTelegram(initData: string) {
  console.warn('[signInWithTelegram] Called with initData:', initData.length, 'chars');

  if (!initData) {
    console.warn('[signInWithTelegram] No initData provided!');
    throw new Error('No Telegram initData provided');
  }

  console.warn('[signInWithTelegram] Calling supabase.functions.invoke...');

  try {
    const { data, error } = await supabase.functions.invoke('telegram-auth', {
      body: { initData },
    });

    console.warn('[signInWithTelegram] Response - data:', !!data, 'error:', !!error);

    if (error) {
      let errorMessage = error.message || 'Unknown error';
      console.warn('[signInWithTelegram] Error object:', JSON.stringify(error));

      if (error.context?.body) {
        try {
          const bodyError = JSON.parse(error.context.body);
          if (bodyError.error) {
            errorMessage = bodyError.error;
          }
        } catch {
          if (typeof error.context.body === 'string') {
            errorMessage = error.context.body;
          }
        }
      }

      console.warn('[signInWithTelegram] Final error message:', errorMessage);
      throw new Error(errorMessage);
    }

    if (data?.error) {
      console.warn('[signInWithTelegram] Data contains error:', data.error);
      throw new Error(data.error);
    }

    console.warn('[signInWithTelegram] Success, user:', data?.user?.first_name);

    if (data?.session) {
      await supabase.auth.setSession(data.session);
    }

    return data;
  } catch (e) {
    console.warn(
      '[signInWithTelegram] Exception caught:',
      e instanceof Error ? e.message : String(e)
    );
    throw e;
  }
}

// Helper to get current session
export async function getCurrentSession() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session;
}

// Helper to sign out
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
