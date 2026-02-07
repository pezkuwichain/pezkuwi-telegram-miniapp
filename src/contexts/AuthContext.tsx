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
// 25 attempts * 200ms = 5 seconds max wait
function waitForInitData(maxAttempts = 25, intervalMs = 200): Promise<string | null> {
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
    console.warn('[Auth] ========== signIn START ==========');
    const tg = window.Telegram?.WebApp;
    console.warn('[Auth] TG object:', tg ? 'exists' : 'MISSING');
    console.warn(
      '[Auth] TG.initData direct check:',
      tg?.initData ? tg.initData.length + ' chars' : 'EMPTY'
    );

    setAuthError(null);
    setIsLoading(true);

    // Wait for initData to be available (retry mechanism)
    console.warn('[Auth] Calling waitForInitData...');
    const initData = await waitForInitData();
    console.warn(
      '[Auth] waitForInitData returned:',
      initData ? initData.length + ' chars' : 'NULL'
    );

    if (!initData) {
      console.warn('[Auth] No initData after waiting, setting error');
      setAuthError('No Telegram initData');
      setIsLoading(false);
      return;
    }

    console.warn('[Auth] initData available, calling signInWithTelegram...');

    try {
      const result = await signInWithTelegram(initData);
      console.warn('[Auth] signInWithTelegram SUCCESS:', JSON.stringify(result));
      if (result?.user) {
        setUser(result.user);
        setAuthError(null);
        console.warn('[Auth] User set:', result.user.first_name);
      } else {
        console.warn('[Auth] No user in result');
        setAuthError('No user returned from auth');
      }
      if (result?.session_token) {
        setSessionToken(result.session_token);
        console.warn('[Auth] Session token set');
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.warn('[Auth] signInWithTelegram FAILED:', errorMsg);
      setAuthError(errorMsg);
    } finally {
      setIsLoading(false);
      console.warn('[Auth] ========== signIn END ==========');
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
