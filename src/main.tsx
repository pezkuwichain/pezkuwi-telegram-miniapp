import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './contexts/AuthContext';
import { WalletProvider } from './contexts/WalletContext';
import { ReferralProvider } from './contexts/ReferralContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LanguageProvider } from './i18n';
import App from './App';
import './index.css';

// Suppress non-critical console output in production. This is the one place
// that legitimately overrides console.log/debug/info — warn/error are kept for
// critical issues. The no-console rule is disabled only for these assignments.
if (import.meta.env.PROD) {
  const noop = () => {};
  const suppressed: Array<'log' | 'debug' | 'info'> = ['log', 'debug', 'info'];
  for (const method of suppressed) {
    // eslint-disable-next-line no-console
    console[method] = noop;
  }
}

// Initialize Telegram WebApp
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  tg.setHeaderColor('#030712');
  tg.setBackgroundColor('#030712');
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      retry: 2,
    },
  },
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}
createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary>
      <LanguageProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <WalletProvider>
              <ReferralProvider>
                <App />
              </ReferralProvider>
            </WalletProvider>
          </AuthProvider>
        </QueryClientProvider>
      </LanguageProvider>
    </ErrorBoundary>
  </StrictMode>
);

// Type declarations for Telegram WebApp
declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        ready: () => void;
        expand: () => void;
        close: () => void;
        setHeaderColor: (color: string) => void;
        setBackgroundColor: (color: string) => void;
        showAlert: (message: string) => void;
        showConfirm: (message: string, callback: (confirmed: boolean) => void) => void;
        HapticFeedback: {
          impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
          notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
          selectionChanged: () => void;
        };
        initDataUnsafe: {
          user?: {
            id: number;
            first_name: string;
            last_name?: string;
            username?: string;
            language_code?: string;
          };
          start_param?: string;
        };
        openLink: (url: string) => void;
        openTelegramLink: (url: string) => void;
        showScanQrPopup: (
          params: { text?: string },
          callback: (text: string) => boolean | void
        ) => void;
        closeScanQrPopup: () => void;
        initData: string;
        version: string;
        platform: string;
        themeParams: {
          bg_color?: string;
          text_color?: string;
          hint_color?: string;
          link_color?: string;
          button_color?: string;
          button_text_color?: string;
        };
      };
    };
  }
}
