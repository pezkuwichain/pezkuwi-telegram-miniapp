import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
  ReactNode,
} from 'react';
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

// Wait for Telegram SDK to be ready with initData
function waitForInitData(maxAttempts = 10, intervalMs = 200): Promise<string | null> {
  return new Promise((resolve) => {
    let attempts = 0;

    const check = () => {
      attempts++;
      const tg = window.Telegram?.WebApp;
      const initData = tg?.initData;

      if (initData && initData.length > 0) {
        console.warn(`[Auth] initData found after ${attempts} attempts`);
        resolve(initData);
        return;
      }

      if (attempts >= maxAttempts) {
        console.warn(`[Auth] initData not found after ${attempts} attempts`);
        resolve(null);
        return;
      }

      setTimeout(check, intervalMs);
    };

    check();
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const authAttempted = useRef(false);

  const signIn = useCallback(async () => {
    console.warn('[Auth] signIn called');
    const tg = window.Telegram?.WebApp;
    console.warn('[Auth] Telegram WebApp:', tg ? 'exists' : 'missing');
    console.warn('[Auth] platform:', tg?.platform, '| version:', tg?.version);

    setAuthError(null);
    setIsLoading(true);

    // Wait for initData to be available (retry mechanism)
    const initData = await waitForInitData();

    if (!initData) {
      console.warn('[Auth] No initData after waiting, setting error');
      setAuthError('No Telegram initData');
      setIsLoading(false);
      return;
    }

    console.warn('[Auth] initData available:', initData.length, 'chars');

    try {
      console.warn('[Auth] Calling signInWithTelegram...');
      const result = await signInWithTelegram(initData);
      console.warn('[Auth] signInWithTelegram result:', JSON.stringify(result));
      if (result?.user) {
        setUser(result.user);
        setAuthError(null);
        console.warn('[Auth] User set:', result.user.first_name);
      } else {
        console.warn('[Auth] No user in result');
        setAuthError('No user returned from auth');
      }
      // Store session token for P2P and other cross-app auth
      if (result?.session_token) {
        setSessionToken(result.session_token);
        console.warn('[Auth] Session token set');
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
  }, []);

  useEffect(() => {
    // Prevent double auth in StrictMode
    if (authAttempted.current) return;
    authAttempted.current = true;

    // Auto sign-in when in Telegram
    signIn();
  }, [signIn]);

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
