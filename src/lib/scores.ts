/**
 * Score Systems Integration for Telegram Mini App
 * Aligned with pwap/shared/lib/scores.ts
 *
 * All scores come from People Chain (people-rpc.pezkuwichain.io)
 * - Trust Score: pezpallet-trust (composite, on-chain calculated)
 * - Referral Score: pezpallet-referral
 * - Staking Score: pezpallet-staking-score
 * - Tiki Score: pezpallet-tiki
 * - Perwerde Score: pezpallet-perwerde
 */

import type { ApiPromise } from '@pezkuwi/api';

// ========================================
// TYPE DEFINITIONS
// ========================================

export interface UserScores {
  trustScore: number;
  referralScore: number;
  stakingScore: number;
  tikiScore: number;
  perwerdeScore: number;
  totalScore: number;
  isCitizen: boolean;
}

export interface StakingScoreStatus {
  isTracking: boolean;
  hasCachedData: boolean;
  score: number; // 0-100 computed from CachedStakingDetails + duration
  startBlock: number | null;
  currentBlock: number;
  durationBlocks: number;
}

// ========================================
// TRUST SCORE (pezpallet-trust on People Chain)
// ========================================

/**
 * Fetch user's trust score from blockchain
 * Storage: trust.trustScores(address)
 * This is the composite score calculated on-chain
 */
export async function getTrustScore(peopleApi: ApiPromise, address: string): Promise<number> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!(peopleApi?.query as any)?.trust?.trustScores) {
      return 0;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const score = await (peopleApi.query as any).trust.trustScores(address);

    if (score.isEmpty) {
      return 0;
    }

    return Number(score.toString());
  } catch (error) {
    console.error('Error fetching trust score:', error);
    return 0;
  }
}

// ========================================
// REFERRAL SCORE (pezpallet-referral on People Chain)
// ========================================

/**
 * Fetch user's referral score based on referral count
 * Storage: referral.referralCount(address)
 */
export async function getReferralScore(peopleApi: ApiPromise, address: string): Promise<number> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!(peopleApi?.query as any)?.referral?.referralCount) {
      return 0;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const count = await (peopleApi.query as any).referral.referralCount(address);
    const referralCount = Number(count.toString());

    if (referralCount === 0) return 0;
    if (referralCount <= 5) return referralCount * 4;
    if (referralCount <= 20) return 20 + (referralCount - 5) * 2;
    return 50; // Capped at 50 points
  } catch (error) {
    console.error('Error fetching referral score:', error);
    return 0;
  }
}

// ========================================
// STAKING SCORE (pezpallet-staking-score on People Chain)
// ========================================

/**
 * Check staking score tracking status and compute actual staking score.
 * Queries CachedStakingDetails from People Chain and calculates score
 * using the same formula as pallet_staking_score::get_staking_score().
 *
 * Score Formula:
 * 1. Amount Score (20-50 points based on staked HEZ)
 *    - 0-100 HEZ: 20,  101-250: 30,  251-750: 40,  751+: 50
 * 2. Duration Multiplier (time since startScoreTracking)
 *    - <1mo: x1.0, 1-2mo: x1.2, 3-5mo: x1.4, 6-11mo: x1.7, 12+mo: x2.0
 * 3. Final = min(100, floor(amountScore * durationMultiplier))
 */
export async function getStakingScoreStatus(
  peopleApi: ApiPromise,
  address: string
): Promise<StakingScoreStatus> {
  const empty: StakingScoreStatus = {
    isTracking: false,
    hasCachedData: false,
    score: 0,
    startBlock: null,
    currentBlock: 0,
    durationBlocks: 0,
  };

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!(peopleApi?.query as any)?.stakingScore?.stakingStartBlock) {
      return empty;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const startBlockResult = await (peopleApi.query as any).stakingScore.stakingStartBlock(address);
    const currentBlock = Number((await peopleApi.query.system.number()).toString());

    if (startBlockResult.isEmpty || startBlockResult.isNone) {
      return { ...empty, currentBlock };
    }

    const startBlock = Number(startBlockResult.toString());
    const durationBlocks = currentBlock - startBlock;

    // Query CachedStakingDetails for both sources
    let hasCachedData = false;
    let totalStakeWei = BigInt(0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((peopleApi.query as any).stakingScore?.cachedStakingDetails) {
      try {
        const [relayResult, assetHubResult] = await Promise.all([
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (peopleApi.query as any).stakingScore
            .cachedStakingDetails(address, 'RelayChain')
            .catch(() => null),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (peopleApi.query as any).stakingScore
            .cachedStakingDetails(address, 'AssetHub')
            .catch(() => null),
        ]);
        if (relayResult && !relayResult.isEmpty && relayResult.isSome) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const json = (relayResult.unwrap() as any).toJSON();
          totalStakeWei += BigInt(json.stakedAmount ?? json.staked_amount ?? '0');
          hasCachedData = true;
        }
        if (assetHubResult && !assetHubResult.isEmpty && assetHubResult.isSome) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const json = (assetHubResult.unwrap() as any).toJSON();
          totalStakeWei += BigInt(json.stakedAmount ?? json.staked_amount ?? '0');
          hasCachedData = true;
        }
      } catch {
        // keep defaults
      }
    }

    // Calculate staking score from cached data
    let score = 0;
    if (hasCachedData && totalStakeWei > BigInt(0)) {
      const stakedHEZ = Number(totalStakeWei / BigInt(10 ** 12));

      // Amount tier
      let amountScore = 20;
      if (stakedHEZ > 750) amountScore = 50;
      else if (stakedHEZ > 250) amountScore = 40;
      else if (stakedHEZ > 100) amountScore = 30;

      // Duration multiplier
      const MONTH = 30 * 24 * 60 * 10; // ~432,000 blocks
      let mult = 1.0;
      if (durationBlocks >= 12 * MONTH) mult = 2.0;
      else if (durationBlocks >= 6 * MONTH) mult = 1.7;
      else if (durationBlocks >= 3 * MONTH) mult = 1.4;
      else if (durationBlocks >= MONTH) mult = 1.2;

      score = Math.min(100, Math.floor(amountScore * mult));
    }

    return {
      isTracking: true,
      hasCachedData,
      score,
      startBlock,
      currentBlock,
      durationBlocks,
    };
  } catch (error) {
    console.error('Error fetching staking score status:', error);
    return empty;
  }
}

// ========================================
// TIKI SCORE (pezpallet-tiki on People Chain)
// ========================================

export interface TikiInfo {
  roleId: number;
  level: number;
  name: string;
}

const TIKI_NAME_SCORES: Record<string, number> = {
  welati: 10,
  parlementer: 30,
  serokimeclise: 40,
  serok: 50,
  wezir: 40,
  endamediwane: 30,
  dadger: 35,
  dozger: 35,
  mamoste: 25,
  perwerdekar: 25,
  bazargan: 20,
};

/**
 * Fetch user's tikis from People Chain
 * Storage: tiki.userTikis(address) -> Vec<TikiRole>
 */
export async function fetchUserTikis(peopleApi: ApiPromise, address: string): Promise<TikiInfo[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!(peopleApi?.query as any)?.tiki) {
      return [];
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let result = await (peopleApi.query.tiki as any).userTikis?.(address);

    // Fallback to userRoles if userTikis doesn't exist
    if (!result && (peopleApi.query.tiki as any).userRoles) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result = await (peopleApi.query.tiki as any).userRoles?.(address);
    }

    if (!result || result.isEmpty) {
      return [];
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tikis = result.toJSON() as any[];

    return tikis.map((tiki, index) => {
      const name = typeof tiki === 'string' ? tiki : tiki.name || tiki.role || 'Unknown';
      const nameLower = name.toLowerCase();

      return {
        roleId: index + 1,
        level: 1,
        name: name,
        score: TIKI_NAME_SCORES[nameLower] || 10,
      };
    });
  } catch (err) {
    console.error('Failed to fetch tiki roles:', err);
    return [];
  }
}

/**
 * Calculate tiki score from user's tikis
 */
export function calculateTikiScore(tikis: TikiInfo[]): number {
  if (!tikis.length) return 0;

  let maxScore = 0;
  for (const tiki of tikis) {
    const tikiScore =
      (tiki as TikiInfo & { score?: number }).score ||
      TIKI_NAME_SCORES[tiki.name.toLowerCase()] ||
      10;
    maxScore = Math.max(maxScore, tikiScore);
  }

  return Math.min(maxScore, 50);
}

/**
 * Get tiki score for a user
 */
export async function getTikiScore(peopleApi: ApiPromise, address: string): Promise<number> {
  try {
    const tikis = await fetchUserTikis(peopleApi, address);
    return calculateTikiScore(tikis);
  } catch (err) {
    console.error('Error fetching tiki score:', err);
    return 0;
  }
}

// ========================================
// CITIZENSHIP & PERWERDE
// ========================================

/**
 * Check if user is a citizen (KYC approved)
 */
export async function checkCitizenshipStatus(
  peopleApi: ApiPromise | null,
  address: string
): Promise<boolean> {
  if (!peopleApi || !address) return false;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!(peopleApi.query as any)?.identityKyc?.kycStatuses) {
      return false;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const status = await (peopleApi.query.identityKyc as any).kycStatuses(address);
    const statusStr = status.toString();

    return statusStr === 'Approved' || statusStr === '3';
  } catch (err) {
    console.error('Error checking citizenship status:', err);
    return false;
  }
}

/**
 * Get Perwerde (education) score
 */
export async function getPerwerdeScore(
  peopleApi: ApiPromise | null,
  address: string
): Promise<number> {
  if (!peopleApi || !address) return 0;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!(peopleApi.query as any)?.perwerde) {
      return 0;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((peopleApi.query.perwerde as any).userScores) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const score = await (peopleApi.query.perwerde as any).userScores(address);
      if (!score.isEmpty) {
        return Number(score.toString());
      }
    }

    return 0;
  } catch (err) {
    console.error('Error fetching perwerde score:', err);
    return 0;
  }
}

// ========================================
// COMPREHENSIVE SCORE FETCHING
// ========================================

/**
 * Fetch all scores for a user from People Chain
 * Trust pallet computes composite score on-chain (includes staking, referral, tiki, perwerde)
 */
export async function getAllScores(
  peopleApi: ApiPromise | null,
  address: string
): Promise<UserScores> {
  const empty: UserScores = {
    trustScore: 0,
    referralScore: 0,
    stakingScore: 0,
    tikiScore: 0,
    perwerdeScore: 0,
    totalScore: 0,
    isCitizen: false,
  };

  if (!peopleApi || !address) return empty;

  try {
    const [trustScore, referralScore, tikiScore, perwerdeScore, isCitizen, stakingStatus] =
      await Promise.all([
        getTrustScore(peopleApi, address),
        getReferralScore(peopleApi, address),
        getTikiScore(peopleApi, address),
        getPerwerdeScore(peopleApi, address),
        checkCitizenshipStatus(peopleApi, address),
        getStakingScoreStatus(peopleApi, address),
      ]);

    return {
      trustScore,
      referralScore,
      stakingScore: stakingStatus.score,
      tikiScore,
      perwerdeScore,
      totalScore: trustScore,
      isCitizen,
    };
  } catch (error) {
    console.error('Error fetching scores:', error);
    return empty;
  }
}

// ========================================
// SCORE DISPLAY HELPERS
// ========================================

export function getScoreColor(score: number): string {
  if (score >= 200) return 'text-purple-400';
  if (score >= 150) return 'text-pink-400';
  if (score >= 100) return 'text-blue-400';
  if (score >= 70) return 'text-cyan-400';
  if (score >= 40) return 'text-teal-400';
  if (score >= 20) return 'text-green-400';
  return 'text-gray-400';
}

export function getScoreRating(score: number): string {
  if (score >= 250) return 'Efsane';
  if (score >= 200) return 'Pir Baş';
  if (score >= 150) return 'Baş';
  if (score >= 100) return 'Navîn';
  if (score >= 70) return 'Têr';
  if (score >= 40) return 'Destpêk';
  if (score >= 20) return 'Nû';
  return 'Sifir';
}

export function formatDuration(blocks: number): string {
  const BLOCKS_PER_MINUTE = 10;
  const minutes = blocks / BLOCKS_PER_MINUTE;
  const hours = minutes / 60;
  const days = hours / 24;
  const months = days / 30;

  if (months >= 1) return `${Math.floor(months)} meh`;
  if (days >= 1) return `${Math.floor(days)} roj`;
  if (hours >= 1) return `${Math.floor(hours)} saet`;
  return `${Math.floor(minutes)} deqîqe`;
}
