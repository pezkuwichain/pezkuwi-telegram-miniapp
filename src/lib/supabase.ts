import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

// Supabase client singleton
// Using 'any' for database type - run `supabase gen types typescript` for proper types
export const supabase: SupabaseClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

// Telegram auth helper - validates initData with Edge Function
export async function signInWithTelegram(initData: string) {
  if (!initData) {
    throw new Error('No Telegram initData provided');
  }

  const { data, error } = await supabase.functions.invoke('telegram-auth', {
    body: { initData },
  });

  if (error) {
    let errorMessage = error.message || 'Unknown error';
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
    throw new Error(errorMessage);
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  if (data?.session) {
    await supabase.auth.setSession(data.session);
  }

  return data;
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
