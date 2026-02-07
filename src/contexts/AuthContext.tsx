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
function waitForInitData(maxAttempts = 25, intervalMs = 200): Promise<string | null> {
  return new Promise((resolve) => {
    let attempts = 0;

    const check = () => {
      attempts++;
      const initData = window.Telegram?.WebApp?.initData;

      if (initData && initData.length > 0) {
        resolve(initData);
        return;
      }

      if (attempts >= maxAttempts) {
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
    setAuthError(null);
    setIsLoading(true);

    const initData = await waitForInitData();

    if (!initData) {
      setAuthError('No Telegram initData');
      setIsLoading(false);
      return;
    }

    try {
      const result = await signInWithTelegram(initData);
      if (result?.user) {
        setUser(result.user);
        setAuthError(null);
      } else {
        setAuthError('No user returned from auth');
      }
      if (result?.session_token) {
        setSessionToken(result.session_token);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      setAuthError(errorMsg);
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
