import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { signInWithTelegram } from '@/lib/supabase';
import type { User } from '@/hooks/useSupabase';

interface AuthContextType {
  user: User | null;
  sessionToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  authError: string | null;
  signIn: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const signIn = async () => {
    const tg = window.Telegram?.WebApp;
    setAuthError(null);
    setIsLoading(true);

    if (!tg?.initData) {
      setAuthError('No Telegram initData');
      setIsLoading(false);
      return;
    }

    try {
      console.log('[Auth] Calling signInWithTelegram...');
      console.log('[Auth] initData length:', tg.initData?.length);
      const result = await signInWithTelegram(tg.initData);
      console.log('[Auth] signInWithTelegram result:', JSON.stringify(result));
      if (result?.user) {
        setUser(result.user);
        setAuthError(null);
        console.log('[Auth] User set:', result.user.first_name);
      } else {
        console.warn('[Auth] No user in result');
        setAuthError('No user returned from auth');
      }
      // Store session token for P2P and other cross-app auth
      if (result?.session_token) {
        setSessionToken(result.session_token);
        console.log('[Auth] Session token set');
      } else {
        console.warn('[Auth] No session_token in result');
      }
    } catch (error) {
      // Capture error message for debugging
      const errorMsg = error instanceof Error ? error.message : String(error);
      setAuthError(errorMsg);
      if (import.meta.env.DEV) {
        console.error('[Auth] Error:', error);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Auto sign-in when in Telegram
    signIn();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        sessionToken,
        isLoading,
        isAuthenticated: !!user,
        authError,
        signIn,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
