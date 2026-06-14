/**
 * Referral System Integration with pallet_referral
 * Based on pwap/shared/lib/referral.ts
 *
 * NOTE: pallet_referral is on People Chain (connected to KYC via OnKycApproved hook)
 * Use peopleApi when calling these functions!
 *
 * Workflow:
 * 1. User A calls initiateReferral(userB_address) -> creates pending referral
 * 2. User B completes KYC and gets approved
 * 3. Pallet automatically confirms referral via OnKycApproved hook
 * 4. User A's referral count increases
 */

import type { ApiPromise } from '@pezkuwi/api';
import type { KeyringPair } from '@pezkuwi/keyring/types';

export interface ReferralInfo {
  referrer: string;
  createdAt: number;
}

export interface ReferralStats {
  referralCount: number;
  referralScore: number;
  whoInvitedMe: string | null;
  pendingReferral: string | null;
}

/**
 * Check if the referral pallet is available on the chain
 */
function isReferralPalletAvailable(api: ApiPromise): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return !!((api.query as any).referral && (api.query as any).referral.pendingReferrals);
}

/**
 * Initiate a referral for a new user
 */
export function initiateReferral(
  api: ApiPromise,
  keypair: KeyringPair,
  referredAddress: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const tx = api.tx.referral.initiateReferral(referredAddress);

    tx.signAndSend(keypair, ({ status, dispatchError }) => {
      if (dispatchError) {
        if (dispatchError.isModule) {
          const decoded = api.registry.findMetaError(dispatchError.asModule);
          const error = `${decoded.section}.${decoded.name}: ${decoded.docs.join(' ')}`;
          reject(new Error(error));
        } else {
          reject(new Error(dispatchError.toString()));
        }
        return;
      }

      if (status.isInBlock || status.isFinalized) {
        const hash = status.asInBlock?.toString() || status.asFinalized?.toString() || '';
        resolve(hash);
      }
    }).catch(reject);
  });
}

/**
 * Get the pending referral for a user
 */
export async function getPendingReferral(api: ApiPromise, address: string): Promise<string | null> {
  try {
    // Check if referral pallet exists
    if (!isReferralPalletAvailable(api)) {
      if (import.meta.env.DEV) {
        console.warn('Referral pallet not available on this chain');
      }
      return null;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (api.query.referral as any).pendingReferrals(address);

    if (result.isEmpty) {
      return null;
    }

    return result.toString();
  } catch (error) {
    console.error('Error fetching pending referral:', error);
    return null;
  }
}

/**
 * Get the number of successful referrals for a user
 */
export async function getReferralCount(api: ApiPromise, address: string): Promise<number> {
  try {
    // Check if referral pallet exists
    if (!isReferralPalletAvailable(api)) {
      return 0;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const count = await (api.query.referral as any).referralCount(address);
    return count.toNumber();
  } catch (error) {
    console.error('Error fetching referral count:', error);
    return 0;
  }
}

/**
 * Get referral info for a user (who referred them)
 */
export async function getReferralInfo(
  api: ApiPromise,
  address: string
): Promise<ReferralInfo | null> {
  try {
    // Check if referral pallet exists
    if (!isReferralPalletAvailable(api)) {
      return null;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (api.query.referral as any).referrals(address);

    if (result.isEmpty) {
      return null;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = result.toJSON() as any;
    return {
      referrer: data.referrer,
      createdAt: parseInt(data.createdAt),
    };
  } catch (error) {
    console.error('Error fetching referral info:', error);
    return null;
  }
}

/**
 * Calculate referral score based on referral count
 *
 * Score calculation:
 * - 0 referrals = 0 points
 * - 1-10 referrals = count * 10 points (10, 20, 30, ..., 100)
 * - 11-50 referrals = 100 + (count - 10) * 5 points
 * - 51-100 referrals = 300 + (count - 50) * 4 points
 * - 101+ referrals = 500 points (maximum)
 */
export function calculateReferralScore(referralCount: number): number {
  if (referralCount === 0) return 0;
  if (referralCount <= 10) return referralCount * 10;
  if (referralCount <= 50) return 100 + (referralCount - 10) * 5;
  if (referralCount <= 100) return 300 + (referralCount - 50) * 4;
  return 500; // Max score
}

/**
 * Get comprehensive referral statistics for a user
 */
export async function getReferralStats(api: ApiPromise, address: string): Promise<ReferralStats> {
  // Check if referral pallet exists first
  if (!isReferralPalletAvailable(api)) {
    return {
      referralCount: 0,
      referralScore: 0,
      whoInvitedMe: null,
      pendingReferral: null,
    };
  }

  try {
    const [referralCount, referralInfo, pendingReferral] = await Promise.all([
      getReferralCount(api, address),
      getReferralInfo(api, address),
      getPendingReferral(api, address),
    ]);

    const referralScore = calculateReferralScore(referralCount);

    return {
      referralCount,
      referralScore,
      whoInvitedMe: referralInfo?.referrer || null,
      pendingReferral,
    };
  } catch (error) {
    console.error('Error fetching referral stats:', error);
    return {
      referralCount: 0,
      referralScore: 0,
      whoInvitedMe: null,
      pendingReferral: null,
    };
  }
}

/**
 * Get list of all users who were referred by this user
 */
export async function getMyReferrals(api: ApiPromise, referrerAddress: string): Promise<string[]> {
  try {
    // Check if referral pallet exists
    if (!isReferralPalletAvailable(api)) {
      return [];
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entries = await (api.query.referral as any).referrals.entries();

    const myReferrals = entries
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter(([_key, value]: [any, any]) => {
        if (value.isEmpty) return false;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = value.toJSON() as any;
        return data.referrer === referrerAddress;
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map(([key]: [any, any]) => {
        const addressHex = key.args[0].toString();
        return addressHex;
      });

    return myReferrals;
  } catch (error) {
    console.error('Error fetching my referrals:', error);
    return [];
  }
}

/**
 * Subscribe to referral events for real-time updates
 */
export async function subscribeToReferralEvents(
  api: ApiPromise,
  callback: (event: {
    type: 'initiated' | 'confirmed';
    referrer: string;
    referred: string;
    count?: number;
  }) => void
): Promise<() => void> {
  // Check if referral pallet exists - if not, return no-op unsubscribe
  if (!isReferralPalletAvailable(api)) {
    return () => {};
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const unsub = await api.query.system.events((events: any[]) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    events.forEach((record: any) => {
      const { event } = record;

      if (event.section === 'referral') {
        if (event.method === 'ReferralInitiated') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const [referrer, referred] = event.data as any;
          callback({
            type: 'initiated',
            referrer: referrer.toString(),
            referred: referred.toString(),
          });
        } else if (event.method === 'ReferralConfirmed') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const [referrer, referred, newCount] = event.data as any;
          callback({
            type: 'confirmed',
            referrer: referrer.toString(),
            referred: referred.toString(),
            count: newCount.toNumber(),
          });
        }
      }
    });
  });

  return unsub as unknown as () => void;
}
