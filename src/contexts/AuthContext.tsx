import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { signInWithTelegram } from '@/lib/supabase';
import type { User } from '@/hooks/useSupabase';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const signIn = async () => {
    const tg = window.Telegram?.WebApp;

    if (!tg?.initData) {
      setIsLoading(false);
      return;
    }

    try {
      const result = await signInWithTelegram(tg.initData);
      if (result?.user) {
        setUser(result.user);
      }
    } catch (error) {
      // Auth failed silently - user will see unauthenticated state
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
        isLoading,
        isAuthenticated: !!user,
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
