/**
 * Wallet Context
 * Manages wallet state and operations
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { ApiPromise } from '@pezkuwi/api';
import type { KeyringPair } from '@pezkuwi/keyring/types';
import {
  initWalletService,
  generateMnemonic,
  getAddressFromMnemonic,
  createKeypair,
  validateMnemonic,
} from '@/lib/wallet-service';
import {
  hasStoredWallet,
  getStoredAddress,
  saveWallet,
  unlockWallet,
  deleteWallet,
  syncWalletToSupabase,
} from '@/lib/wallet-storage';
import { validatePassword } from '@/lib/crypto';
import { supabase } from '@/lib/supabase';
import { useAuth } from './AuthContext';
import { translate } from '@/i18n';
import {
  initRPCConnection,
  subscribeToConnection,
  initAssetHubConnection,
  initPeopleConnection,
} from '@/lib/rpc-manager';

interface WalletContextType {
  // State
  isInitialized: boolean;
  isConnected: boolean;
  isLoading: boolean;
  address: string | null;
  balance: string | null;
  error: string | null;

  // Wallet management
  hasWallet: boolean;
  generateNewWallet: () => { mnemonic: string; address: string };
  confirmWallet: (mnemonic: string, password: string) => Promise<void>;
  importWallet: (mnemonic: string, password: string) => Promise<string>;
  connect: (password: string) => Promise<void>;
  disconnect: () => void;
  deleteWalletData: () => void;

  // API
  api: ApiPromise | null;
  assetHubApi: ApiPromise | null;
  peopleApi: ApiPromise | null;
  keypair: KeyringPair | null;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuth();

  // State
  const [isInitialized, setIsInitialized] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [address, setAddress] = useState<string | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [api, setApi] = useState<ApiPromise | null>(null);
  const [assetHubApi, setAssetHubApi] = useState<ApiPromise | null>(null);
  const [peopleApi, setPeopleApi] = useState<ApiPromise | null>(null);
  const [keypair, setKeypair] = useState<KeyringPair | null>(null);

  const hasWallet = hasStoredWallet();

  // Initialize wallet service and API
  useEffect(() => {
    const init = async () => {
      try {
        // Init crypto
        await initWalletService();

        // Load stored address
        const storedAddress = getStoredAddress();
        if (storedAddress) {
          setAddress(storedAddress);
        }

        // Mark as initialized immediately - wallet can work without RPC
        setIsInitialized(true);
        setIsLoading(false);

        // Connect to RPC in background (non-blocking)
        initRPCConnection()
          .then((apiInstance) => {
            setApi(apiInstance);
          })
          .catch((err) => {
            console.error('RPC connection error:', err);
            // Don't set error - wallet still works offline for create/import
          });

        // Connect to Asset Hub for PEZ token (non-blocking)
        initAssetHubConnection()
          .then((assetHubInstance) => {
            setAssetHubApi(assetHubInstance);
          })
          .catch((err) => {
            console.error('Asset Hub connection error:', err);
            // Don't set error - PEZ features just won't work
          });

        // Connect to People Chain for identity (non-blocking)
        initPeopleConnection()
          .then((peopleInstance) => {
            setPeopleApi(peopleInstance);
          })
          .catch((err) => {
            console.error('People Chain connection error:', err);
            // Don't set error - Identity features just won't work
          });
      } catch (err) {
        console.error('Wallet init error:', err);
        setError(translate('context.walletInitFailed'));
        setIsLoading(false);
      }
    };

    init();

    // Subscribe to connection state changes (only show error if already was connected)
    let wasConnected = false;
    const unsubscribe = subscribeToConnection((connected, endpoint) => {
      if (connected && endpoint) {
        wasConnected = true;
        setError(null);
      } else if (wasConnected && !connected) {
        // Only show disconnect error if we were previously connected
        setError(translate('context.rpcDisconnected'));
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Subscribe to balance changes when connected
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    if (!api || !address || !isConnected) {
      setBalance(null);
      return;
    }

    const subscribeToBalance = async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const unsub = await (api.query.system.account as any)(
          address,
          (accountInfo: { data: { free: { toString: () => string } } }) => {
            const free = accountInfo.data.free.toString();
            // Convert from smallest unit (12 decimals)
            const balanceNum = Number(free) / 1e12;
            setBalance(balanceNum.toFixed(4));
          }
        );
        unsubscribe = unsub;
      } catch (err) {
        console.error('Balance subscription error:', err);
      }
    };

    subscribeToBalance();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [api, address, isConnected]);

  // Generate new wallet (does NOT save - just creates mnemonic)
  const generateNewWallet = useCallback((): { mnemonic: string; address: string } => {
    const mnemonic = generateMnemonic();
    const walletAddress = getAddressFromMnemonic(mnemonic);
    return { mnemonic, address: walletAddress };
  }, []);

  // Confirm wallet after user has backed up seed phrase
  const confirmWallet = useCallback(
    async (mnemonic: string, password: string): Promise<void> => {
      // User must be authenticated first
      if (!isAuthenticated || !user?.telegram_id) {
        throw new Error(translate('context.pleaseLoginFirst'));
      }

      const validation = validatePassword(password);
      if (!validation.valid) {
        throw new Error(validation.message);
      }

      const walletAddress = getAddressFromMnemonic(mnemonic);

      // Save encrypted locally - ONLY after user confirmed backup
      await saveWallet(mnemonic, walletAddress, password);

      // Sync wallet address to Supabase
      await syncWalletToSupabase(supabase, user.telegram_id, walletAddress);

      setAddress(walletAddress);
    },
    [user, isAuthenticated]
  );

  // Import existing wallet
  const importWallet = useCallback(
    async (mnemonic: string, password: string): Promise<string> => {
      // User must be authenticated first
      if (!isAuthenticated || !user?.telegram_id) {
        throw new Error(translate('context.pleaseLoginFirst'));
      }

      if (!validateMnemonic(mnemonic)) {
        throw new Error(translate('context.invalidSeedPhrase'));
      }

      const validation = validatePassword(password);
      if (!validation.valid) {
        throw new Error(validation.message);
      }

      const walletAddress = getAddressFromMnemonic(mnemonic);

      // Save encrypted locally
      await saveWallet(mnemonic, walletAddress, password);

      // Sync wallet address to Supabase
      await syncWalletToSupabase(supabase, user.telegram_id, walletAddress);

      setAddress(walletAddress);
      return walletAddress;
    },
    [user, isAuthenticated]
  );

  // Connect (unlock) wallet
  const connect = useCallback(async (password: string): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      const mnemonic = await unlockWallet(password);
      const pair = createKeypair(mnemonic);
      setKeypair(pair);
      setIsConnected(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : translate('context.connectionFailed');
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Disconnect
  const disconnect = useCallback(() => {
    setKeypair(null);
    setIsConnected(false);
    setBalance(null);
  }, []);

  // Delete wallet
  const deleteWalletData = useCallback(() => {
    deleteWallet();
    setAddress(null);
    setKeypair(null);
    setIsConnected(false);
    setBalance(null);
  }, []);

  return (
    <WalletContext.Provider
      value={{
        isInitialized,
        isConnected,
        isLoading,
        address,
        balance,
        error,
        hasWallet,
        generateNewWallet,
        confirmWallet,
        importWallet,
        connect,
        disconnect,
        deleteWalletData,
        api,
        assetHubApi,
        peopleApi,
        keypair,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within WalletProvider');
  }
  return context;
}
