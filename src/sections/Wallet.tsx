/**
 * Wallet Section
 * Main wallet interface with create, import, connect, and dashboard flows
 */

import { useState, useMemo } from 'react';
import { Wallet, AlertTriangle, RefreshCw } from 'lucide-react';
import { useWallet } from '@/contexts/WalletContext';
import { useAuth } from '@/contexts/AuthContext';
import {
  WalletSetup,
  WalletCreate,
  WalletImport,
  WalletConnect,
  WalletDashboard,
} from '@/components/wallet';
import { LoadingScreen } from '@/components/LoadingScreen';
import { VersionInfo } from '@/components/VersionInfo';

type Screen = 'loading' | 'auth-error' | 'setup' | 'create' | 'import' | 'connect' | 'dashboard';
type UserScreen = 'create' | 'import' | null;

export function WalletSection() {
  const { isInitialized, isConnected, hasWallet, deleteWalletData } = useWallet();
  const { isAuthenticated, isLoading: authLoading, signIn } = useAuth();
  const [userScreen, setUserScreen] = useState<UserScreen>(null);

  // Derive screen from wallet state and user navigation
  const screen = useMemo<Screen>(() => {
    // Auth loading - wait
    if (authLoading) return 'loading';
    // Wallet not initialized yet - wait
    if (!isInitialized) return 'loading';
    // Auth failed - show error
    if (!isAuthenticated) return 'auth-error';
    // Connected - show dashboard
    if (isConnected) return 'dashboard';
    // User navigating to create/import
    if (userScreen) return userScreen;
    // Has wallet but not connected
    if (hasWallet) return 'connect';
    // No wallet - show setup
    return 'setup';
  }, [authLoading, isInitialized, isAuthenticated, isConnected, hasWallet, userScreen]);

  // Handle wallet deletion
  const handleDeleteWallet = () => {
    deleteWalletData();
    setUserScreen(null);
  };

  // Reset user screen when wallet state changes
  const handleComplete = () => setUserScreen(null);

  // Handle retry auth
  const handleRetryAuth = () => {
    signIn();
  };

  // Loading state
  if (screen === 'loading') {
    return (
      <div className="flex flex-col h-full">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <LoadingScreen />
        </div>
      </div>
    );
  }

  // Auth error state
  if (screen === 'auth-error') {
    return (
      <div className="flex flex-col h-full">
        <Header />
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center space-y-6">
            <div className="w-16 h-16 mx-auto bg-red-500/20 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-red-400" />
            </div>
            <div>
              <h2 className="text-xl font-semibold mb-2">Têketin Têk Çû</h2>
              <p className="text-muted-foreground text-sm">
                Ji kerema xwe piştrast bikin ku hûn vê app-ê di nav Telegram de vedikin
              </p>
            </div>
            <button
              onClick={handleRetryAuth}
              className="px-6 py-3 bg-primary text-primary-foreground rounded-xl font-semibold flex items-center gap-2 mx-auto"
            >
              <RefreshCw className="w-4 h-4" />
              Dîsa Biceribîne
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <Header />
      <div className="flex-1 overflow-y-auto">
        {screen === 'setup' && (
          <WalletSetup
            onCreate={() => setUserScreen('create')}
            onImport={() => setUserScreen('import')}
          />
        )}

        {screen === 'create' && (
          <WalletCreate onComplete={handleComplete} onBack={() => setUserScreen(null)} />
        )}

        {screen === 'import' && (
          <WalletImport onComplete={handleComplete} onBack={() => setUserScreen(null)} />
        )}

        {screen === 'connect' && (
          <WalletConnect onConnected={handleComplete} onDelete={handleDeleteWallet} />
        )}

        {screen === 'dashboard' && <WalletDashboard onDisconnect={handleComplete} />}
      </div>
    </div>
  );
}

// Header component
function Header() {
  return (
    <header className="flex-shrink-0 px-4 py-3 border-b border-border bg-background/80 backdrop-blur-sm safe-area-top">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/20 flex items-center justify-center">
            <Wallet className="w-4 h-4 text-cyan-400" />
          </div>
          <h1 className="text-lg font-semibold">Berîk</h1>
        </div>
        <VersionInfo />
      </div>
    </header>
  );
}
