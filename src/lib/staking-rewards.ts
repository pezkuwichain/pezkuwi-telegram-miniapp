/**
 * Staking Rewards - Unclaimed reward detection and payout for Asset Hub
 * Queries on-chain data to find unclaimed era rewards and submits payoutStakers calls.
 *
 * Uses ClaimedRewards(era, validator) double-map storage to accurately detect
 * which (era, validator, page) combinations have been claimed.
 */

import type { ApiPromise } from '@pezkuwi/api';
import type { KeyringPair } from '@pezkuwi/keyring/types';

const UNITS = 1_000_000_000_000; // 10^12
const DEFAULT_HISTORY_DEPTH = 84;
const MAX_PAGES_PER_VALIDATOR = 3;
const MAX_BATCH_SIZE = 5; // max payout calls per batch TX

// ========================================
// TYPES
// ========================================

export interface UnclaimedEraReward {
  era: number;
  validator: string;
  page: number;
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
 * Find unclaimed staking rewards for an address on Asset Hub.
 * Checks the ClaimedRewards(era, validator) double-map for accurate detection.
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

  // 3. Get nominated validators (current + historical from exposure)
  const nominatorsOpt = await staking.nominators(address);
  if (!nominatorsOpt || nominatorsOpt.isNone) return { ...empty, currentEra };
  const nominatorsJson = nominatorsOpt.unwrap().toJSON();
  const nominatedValidators: string[] = nominatorsJson.targets || [];
  if (nominatedValidators.length === 0) return { ...empty, currentEra };

  // 4. Determine era range to check
  let historyDepth = DEFAULT_HISTORY_DEPTH;
  try {
    if (staking.historyDepth) {
      const hd = await staking.historyDepth();
      const hdVal = hd?.toJSON?.() ?? hd?.toNumber?.();
      if (typeof hdVal === 'number' && hdVal > 0) historyDepth = hdVal;
    }
  } catch {
    // historyDepth might be a const, not a storage item
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const consts = (assetHubApi.consts.staking as any)?.historyDepth;
      if (consts) {
        const val = consts.toNumber?.() ?? Number(consts.toString());
        if (val > 0) historyDepth = val;
      }
    } catch {
      // use default
    }
  }

  const startEra = Math.max(0, currentEra - 1); // current era is not yet finalized
  const endEra = Math.max(0, currentEra - historyDepth);

  const unclaimed: UnclaimedEraReward[] = [];

  // Process eras in parallel batches of 5 to avoid overwhelming RPC
  const PARALLEL_BATCH = 5;
  for (let batchStart = startEra; batchStart >= endEra; batchStart -= PARALLEL_BATCH) {
    const batchEnd = Math.max(endEra, batchStart - PARALLEL_BATCH + 1);
    const eraPromises: Promise<UnclaimedEraReward[]>[] = [];

    for (let era = batchStart; era >= batchEnd; era--) {
      eraPromises.push(checkEraRewards(staking, era, address, nominatedValidators));
    }

    const results = await Promise.all(eraPromises);
    for (const eraResults of results) {
      unclaimed.push(...eraResults);
    }
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
 * Check a single era for unclaimed rewards across all nominated validators.
 * Uses ClaimedRewards(era, validator) to determine which pages are already claimed.
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

      // Get claimed pages for this (era, validator) from ClaimedRewards double-map
      let claimedPages: number[] = [];
      try {
        if (staking.claimedRewards) {
          const claimedOpt = await staking.claimedRewards(era, validator);
          if (claimedOpt) {
            const claimedJson = claimedOpt.toJSON?.() ?? claimedOpt;
            if (Array.isArray(claimedJson)) {
              claimedPages = claimedJson;
            }
          }
        }
      } catch {
        // claimedRewards storage might not exist on older runtimes
      }
      const claimedPageSet = new Set(claimedPages);

      // Find user in the validator's exposure pages and check if their page is claimed
      let userStake = 0n;
      let userPage = -1;
      const pagesToCheck = Math.min(pageCount, MAX_PAGES_PER_VALIDATOR);

      for (let page = 0; page < pagesToCheck; page++) {
        const pagedOpt = await staking.erasStakersPaged(era, validator, page);
        if (!pagedOpt || pagedOpt.isNone) continue;

        const paged = pagedOpt.unwrap().toJSON();
        const others: { who: string; value: string | number }[] = paged.others || [];

        for (const nominator of others) {
          if (nominator.who === address) {
            userStake = BigInt(nominator.value);
            userPage = page;
            break;
          }
        }
        if (userStake > 0n) break;
      }

      if (userStake === 0n || userPage < 0) continue;

      // Skip if user's page is already claimed
      if (claimedPageSet.has(userPage)) continue;

      // Calculate estimated reward
      const reward = await calculateEraReward(staking, era, validator, userStake, totalStake);

      if (reward > 0n) {
        results.push({
          era,
          validator,
          page: userPage,
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
 * Formula: eraReward * (valPoints/totalPoints) * (1 - commission/1e9) * (userStake/totalValStake)
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
 * Submit payoutStakersByPage for a single era+validator+page.
 * Falls back to payoutStakers if payoutStakersByPage is not available.
 */
export async function payoutStakingReward(
  assetHubApi: ApiPromise,
  keypair: KeyringPair,
  validator: string,
  era: number,
  page?: number
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stakingTx = assetHubApi.tx.staking as any;

      // Use payoutStakersByPage if available and page is specified
      const tx =
        page !== undefined && stakingTx.payoutStakersByPage
          ? stakingTx.payoutStakersByPage(validator, era, page)
          : stakingTx.payoutStakers(validator, era);

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
 * Submit payoutStakers for all unclaimed rewards in batches.
 * Splits into batches of MAX_BATCH_SIZE to avoid block weight limits.
 * Uses utility.batch (not batchAll) so one failure doesn't abort the whole batch.
 */
export async function payoutAllRewards(
  assetHubApi: ApiPromise,
  keypair: KeyringPair,
  unclaimed: UnclaimedEraReward[]
): Promise<{ success: boolean; error?: string; completed?: number }> {
  if (unclaimed.length === 0) return { success: true, completed: 0 };

  // Single reward - no need for batch
  if (unclaimed.length === 1) {
    const r = unclaimed[0];
    const result = await payoutStakingReward(assetHubApi, keypair, r.validator, r.era, r.page);
    return { ...result, completed: result.success ? 1 : 0 };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const utilityTx = (assetHubApi.tx as any).utility;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stakingTx = assetHubApi.tx.staking as any;

  let totalCompleted = 0;

  // Split into batches
  for (let i = 0; i < unclaimed.length; i += MAX_BATCH_SIZE) {
    const batch = unclaimed.slice(i, i + MAX_BATCH_SIZE);

    if (batch.length === 1) {
      const r = batch[0];
      const result = await payoutStakingReward(assetHubApi, keypair, r.validator, r.era, r.page);
      if (result.success) {
        totalCompleted++;
      } else {
        return { success: false, error: result.error, completed: totalCompleted };
      }
      continue;
    }

    // Use utility.batch for this chunk
    if (utilityTx?.batch) {
      const calls = batch.map((r) =>
        r.page !== undefined && stakingTx.payoutStakersByPage
          ? stakingTx.payoutStakersByPage(r.validator, r.era, r.page)
          : stakingTx.payoutStakers(r.validator, r.era)
      );

      const result = await new Promise<{ success: boolean; error?: string }>((resolve) => {
        try {
          utilityTx
            .batch(calls)
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

      if (result.success) {
        totalCompleted += batch.length;
      } else {
        return { success: false, error: result.error, completed: totalCompleted };
      }
    } else {
      // Fallback: sequential calls
      for (const r of batch) {
        const result = await payoutStakingReward(assetHubApi, keypair, r.validator, r.era, r.page);
        if (result.success) {
          totalCompleted++;
        } else {
          return { success: false, error: result.error, completed: totalCompleted };
        }
      }
    }
  }

  return { success: true, completed: totalCompleted };
}
