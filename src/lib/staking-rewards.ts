/**
 * Staking Rewards - Unclaimed reward detection and payout for Asset Hub
 * Queries on-chain data to find unclaimed era rewards and submits payoutStakers calls
 */

import type { ApiPromise } from '@pezkuwi/api';
import type { KeyringPair } from '@pezkuwi/keyring/types';

const UNITS = 1_000_000_000_000; // 10^12
const MAX_ERAS_TO_CHECK = 10;
const MAX_PAGES_PER_VALIDATOR = 3;

// ========================================
// TYPES
// ========================================

export interface UnclaimedEraReward {
  era: number;
  validator: string;
  estimatedReward: string; // formatted HEZ
  estimatedRewardRaw: bigint;
}

export interface UnclaimedRewardsResult {
  unclaimed: UnclaimedEraReward[];
  totalUnclaimedHez: string;
  totalUnclaimedRaw: bigint;
  currentEra: number;
}

// ========================================
// HELPERS
// ========================================

function formatHez(raw: bigint): string {
  const num = Number(raw) / UNITS;
  if (num >= 1) return num.toFixed(4);
  if (num >= 0.001) return num.toFixed(6);
  if (num > 0) return num.toFixed(10);
  return '0';
}

// ========================================
// UNCLAIMED REWARD DETECTION
// ========================================

/**
 * Find unclaimed staking rewards for an address on Asset Hub
 */
export async function getUnclaimedRewards(
  assetHubApi: ApiPromise,
  address: string
): Promise<UnclaimedRewardsResult> {
  const empty: UnclaimedRewardsResult = {
    unclaimed: [],
    totalUnclaimedHez: '0',
    totalUnclaimedRaw: 0n,
    currentEra: 0,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const staking = assetHubApi.query.staking as any;
  if (!staking) return empty;

  // 1. Get current era
  const activeEraOpt = await staking.activeEra();
  if (!activeEraOpt || activeEraOpt.isNone) return empty;
  const activeEraJson = activeEraOpt.unwrap().toJSON();
  const currentEra: number = activeEraJson.index ?? activeEraJson;

  // 2. Get ledger - if no ledger, user is not staking
  const ledgerOpt = await staking.ledger(address);
  if (!ledgerOpt || ledgerOpt.isNone) return { ...empty, currentEra };
  const ledgerJson = ledgerOpt.unwrap().toJSON();

  // Get claimed eras from ledger
  const claimedEras: number[] = ledgerJson.claimedRewards || ledgerJson.legacyClaimedRewards || [];
  const claimedSet = new Set(claimedEras);

  // 3. Get nominated validators
  const nominatorsOpt = await staking.nominators(address);
  if (!nominatorsOpt || nominatorsOpt.isNone) return { ...empty, currentEra };
  const nominatorsJson = nominatorsOpt.unwrap().toJSON();
  const nominatedValidators: string[] = nominatorsJson.targets || [];
  if (nominatedValidators.length === 0) return { ...empty, currentEra };

  // 4. Check last N eras for unclaimed rewards
  const startEra = Math.max(0, currentEra - 1);
  const endEra = Math.max(0, currentEra - MAX_ERAS_TO_CHECK);

  const unclaimed: UnclaimedEraReward[] = [];

  // Process eras in parallel batches
  const eraPromises: Promise<UnclaimedEraReward[]>[] = [];

  for (let era = startEra; era >= endEra; era--) {
    if (claimedSet.has(era)) continue;

    eraPromises.push(checkEraRewards(staking, era, address, nominatedValidators));
  }

  const results = await Promise.all(eraPromises);
  for (const eraResults of results) {
    unclaimed.push(...eraResults);
  }

  // Sort by era descending
  unclaimed.sort((a, b) => b.era - a.era);

  const totalRaw = unclaimed.reduce((sum, r) => sum + r.estimatedRewardRaw, 0n);

  return {
    unclaimed,
    totalUnclaimedHez: formatHez(totalRaw),
    totalUnclaimedRaw: totalRaw,
    currentEra,
  };
}

/**
 * Check a single era for unclaimed rewards across all nominated validators
 */

async function checkEraRewards(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  staking: any,
  era: number,
  address: string,
  validators: string[]
): Promise<UnclaimedEraReward[]> {
  const results: UnclaimedEraReward[] = [];

  for (const validator of validators) {
    try {
      // Check if validator was active in this era
      const overviewOpt = await staking.erasStakersOverview(era, validator);
      if (!overviewOpt || overviewOpt.isNone) continue;

      const overview = overviewOpt.unwrap().toJSON();
      const pageCount: number = overview.pageCount || 1;
      const totalStake = BigInt(overview.total || '0');
      if (totalStake === 0n) continue;

      // Check if user is in the validator's exposure pages
      let userStake = 0n;
      const pagesToCheck = Math.min(pageCount, MAX_PAGES_PER_VALIDATOR);

      for (let page = 0; page < pagesToCheck; page++) {
        const pagedOpt = await staking.erasStakersPaged(era, validator, page);
        if (!pagedOpt || pagedOpt.isNone) continue;

        const paged = pagedOpt.unwrap().toJSON();
        const others: { who: string; value: string | number }[] = paged.others || [];

        for (const nominator of others) {
          if (nominator.who === address) {
            userStake = BigInt(nominator.value);
            break;
          }
        }
        if (userStake > 0n) break;
      }

      if (userStake === 0n) continue;

      // Calculate estimated reward
      const reward = await calculateEraReward(staking, era, validator, userStake, totalStake);

      if (reward > 0n) {
        results.push({
          era,
          validator,
          estimatedReward: formatHez(reward),
          estimatedRewardRaw: reward,
        });
      }
    } catch (err) {
      console.error(`[StakingRewards] Error checking era ${era} validator ${validator}:`, err);
    }
  }

  return results;
}

/**
 * Calculate estimated reward for a nominator in a specific era
 * Formula: eraReward × (valPoints/totalPoints) × (1 - commission/1e9) × (userStake/totalValStake)
 */

async function calculateEraReward(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  staking: any,
  era: number,
  validator: string,
  userStake: bigint,
  totalValStake: bigint
): Promise<bigint> {
  try {
    // Get era total reward
    const eraRewardOpt = await staking.erasValidatorReward(era);
    if (!eraRewardOpt || eraRewardOpt.isNone) return 0n;
    const eraReward = BigInt(eraRewardOpt.unwrap().toString());

    // Get era reward points
    const rewardPoints = await staking.erasRewardPoints(era);
    const pointsJson = rewardPoints.toJSON();
    const totalPoints = BigInt(pointsJson.total || '0');
    if (totalPoints === 0n) return 0n;

    // Find this validator's points
    const individualPoints = pointsJson.individual || {};
    const valPoints = BigInt(individualPoints[validator] || '0');
    if (valPoints === 0n) return 0n;

    // Get validator commission (Perbill - parts per billion)
    const prefsOpt = await staking.erasValidatorPrefs(era, validator);
    const prefsJson = prefsOpt.toJSON();
    const commission = BigInt(prefsJson.commission || '0');
    const PERBILL = 1_000_000_000n;

    // Calculate:
    // validatorReward = eraReward * valPoints / totalPoints
    // nominatorShare = validatorReward * (PERBILL - commission) / PERBILL
    // userReward = nominatorShare * userStake / totalValStake
    const validatorReward = (eraReward * valPoints) / totalPoints;
    const nominatorShare = (validatorReward * (PERBILL - commission)) / PERBILL;
    const userReward = (nominatorShare * userStake) / totalValStake;

    return userReward;
  } catch (err) {
    console.error(`[StakingRewards] Error calculating reward for era ${era}:`, err);
    return 0n;
  }
}

// ========================================
// PAYOUT FUNCTIONS
// ========================================

/**
 * Submit payoutStakers for a single era+validator
 */
export async function payoutStakingReward(
  assetHubApi: ApiPromise,
  keypair: KeyringPair,
  validator: string,
  era: number
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tx = (assetHubApi.tx.staking as any).payoutStakers(validator, era);

      tx.signAndSend(
        keypair,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ({ status, dispatchError }: any) => {
          if (status.isFinalized) {
            if (dispatchError) {
              if (dispatchError.isModule) {
                const decoded = assetHubApi.registry.findMetaError(dispatchError.asModule);
                resolve({ success: false, error: `${decoded.section}.${decoded.name}` });
              } else {
                resolve({ success: false, error: dispatchError.toString() });
              }
            } else {
              resolve({ success: true });
            }
          }
        }
      ).catch((err: Error) => {
        resolve({ success: false, error: err.message });
      });
    } catch (err) {
      resolve({ success: false, error: err instanceof Error ? err.message : String(err) });
    }
  });
}

/**
 * Submit payoutStakers for all unclaimed rewards using utility.batchAll
 * Falls back to sequential calls if utility pallet is not available
 */
export async function payoutAllRewards(
  assetHubApi: ApiPromise,
  keypair: KeyringPair,
  unclaimed: UnclaimedEraReward[]
): Promise<{ success: boolean; error?: string }> {
  if (unclaimed.length === 0) return { success: true };

  // Single reward - no need for batch
  if (unclaimed.length === 1) {
    return payoutStakingReward(assetHubApi, keypair, unclaimed[0].validator, unclaimed[0].era);
  }

  // Try utility.batchAll
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const utilityTx = (assetHubApi.tx as any).utility;
  if (utilityTx?.batchAll) {
    const calls = unclaimed.map((r) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (assetHubApi.tx.staking as any).payoutStakers(r.validator, r.era)
    );

    return new Promise((resolve) => {
      try {
        utilityTx
          .batchAll(calls)
          .signAndSend(
            keypair,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ({ status, dispatchError }: any) => {
              if (status.isFinalized) {
                if (dispatchError) {
                  if (dispatchError.isModule) {
                    const decoded = assetHubApi.registry.findMetaError(dispatchError.asModule);
                    resolve({ success: false, error: `${decoded.section}.${decoded.name}` });
                  } else {
                    resolve({ success: false, error: dispatchError.toString() });
                  }
                } else {
                  resolve({ success: true });
                }
              }
            }
          )
          .catch((err: Error) => {
            resolve({ success: false, error: err.message });
          });
      } catch (err) {
        resolve({ success: false, error: err instanceof Error ? err.message : String(err) });
      }
    });
  }

  // Fallback: sequential calls
  for (const reward of unclaimed) {
    const result = await payoutStakingReward(assetHubApi, keypair, reward.validator, reward.era);
    if (!result.success) return result;
  }

  return { success: true };
}
