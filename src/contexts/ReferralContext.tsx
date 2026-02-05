/**
 * Referral Context for Telegram Mini App
 * Provides referral stats using blockchain data from People Chain
 * (pallet_referral is on People Chain, connected to KYC via OnKycApproved hook)
 */

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useWallet } from '@/contexts/WalletContext';
import { useTelegram } from '@/hooks/useTelegram';
import {
  getReferralStats,
  getMyReferrals,
  subscribeToReferralEvents,
  type ReferralStats,
} from '@/lib/referral';

interface ReferralContextValue {
  stats: ReferralStats | null;
  myReferrals: string[];
  loading: boolean;
  refreshStats: () => Promise<void>;
}

const ReferralContext = createContext<ReferralContextValue | undefined>(undefined);

export function ReferralProvider({ children }: { children: ReactNode }) {
  // Use peopleApi for referral queries - pallet_referral is on People Chain
  const { peopleApi, address } = useWallet();
  const { hapticNotification, showAlert } = useTelegram();

  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [myReferrals, setMyReferrals] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch referral statistics from People Chain
  const fetchStats = useCallback(async () => {
    if (!peopleApi || !address) {
      setStats(null);
      setMyReferrals([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const [fetchedStats, fetchedReferrals] = await Promise.all([
        getReferralStats(peopleApi, address),
        getMyReferrals(peopleApi, address),
      ]);

      setStats(fetchedStats);
      setMyReferrals(fetchedReferrals);
    } catch (error) {
      console.error('Error fetching referral stats:', error);
      showAlert('Referral stats bar nekirin');
    } finally {
      setLoading(false);
    }
  }, [peopleApi, address, showAlert]);

  // Initial fetch
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Subscribe to referral events for real-time updates on People Chain
  useEffect(() => {
    if (!peopleApi || !address) return;

    let unsub: (() => void) | undefined;

    subscribeToReferralEvents(peopleApi, (event) => {
      // If this user is involved in the event, refresh stats
      if (event.referrer === address || event.referred === address) {
        if (event.type === 'confirmed') {
          hapticNotification('success');
          showAlert(`Referral hat pejirandin! Hejmara te: ${event.count}`);
        }
        fetchStats();
      }
    }).then((unsubFn) => {
      unsub = unsubFn;
    });

    return () => {
      if (unsub) unsub();
    };
  }, [peopleApi, address, hapticNotification, showAlert, fetchStats]);

  const value: ReferralContextValue = {
    stats,
    myReferrals,
    loading,
    refreshStats: fetchStats,
  };

  return <ReferralContext.Provider value={value}>{children}</ReferralContext.Provider>;
}

export function useReferral() {
  const context = useContext(ReferralContext);
  if (context === undefined) {
    throw new Error('useReferral must be used within a ReferralProvider');
  }
  return context;
}
