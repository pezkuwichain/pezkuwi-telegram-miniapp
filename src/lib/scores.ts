/**
 * Score Systems Integration for Telegram Mini App
 * Based on pwap/shared/lib/scores.ts
 *
 * All scores come from People Chain (people-rpc.pezkuwichain.io)
 * - Trust Score: pezpallet-trust
 * - Referral Score: pezpallet-referral
 * - Staking Score: pezpallet-staking-score (with frontend fallback)
 * - Tiki Score: pezpallet-tiki
 */

import type { ApiPromise } from '@pezkuwi/api';
import { calculateReferralScore, getReferralCount } from './referral';

// ========================================
// TYPE DEFINITIONS
// ========================================

export interface UserScores {
  trustScore: number;
  referralScore: number;
  stakingScore: number;
  tikiScore: number;
  totalScore: number;
}

// ========================================
// STAKING SCORE FRONTEND FALLBACK
// ========================================
// Until runtime upgrade deploys, calculate staking score
// directly from Relay Chain data without People Chain pallet

const STAKING_SCORE_STORAGE_KEY = 'pez_staking_score_tracking';
const UNITS = 1_000_000_000_000; // 10^12
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const MONTH_IN_MS = 30 * DAY_IN_MS;

interface StakingTrackingData {
  [address: string]: {
    startTime: number;
    lastChecked: number;
    lastStakeAmount: string;
  };
}

function getStakingTrackingData(): StakingTrackingData {
  if (typeof window === 'undefined') return {};
  try {
    const stored = localStorage.getItem(STAKING_SCORE_STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function saveStakingTrackingData(data: StakingTrackingData): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STAKING_SCORE_STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    console.error('Failed to save staking tracking data:', err);
  }
}

/**
 * Fetch staking details directly from Relay Chain
 */
export async function fetchRelayStakingDetails(
  relayApi: ApiPromise,
  address: string
): Promise<{ stakedAmount: bigint; nominationsCount: number } | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!(relayApi?.query as any)?.staking) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let ledger = await (relayApi.query.staking as any).ledger?.(address);
    let stashAddress = address;

    // If no ledger, check if this is a stash account
    if (!ledger || ledger.isEmpty || ledger.isNone) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bonded = await (relayApi.query.staking as any).bonded?.(address);
      if (bonded && !bonded.isEmpty && !bonded.isNone) {
        const controller = bonded.toString();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ledger = await (relayApi.query.staking as any).ledger?.(controller);
        stashAddress = address;
      }
    }

    if (!ledger || ledger.isEmpty || ledger.isNone) {
      return null;
    }

    const ledgerJson = ledger.toJSON() as { active?: string | number };
    const active = BigInt(ledgerJson?.active || 0);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nominations = await (relayApi.query.staking as any).nominators?.(stashAddress);
    const nominationsJson = nominations?.toJSON() as { targets?: unknown[] } | null;
    const nominationsCount = nominationsJson?.targets?.length || 0;

    return {
      stakedAmount: active,
      nominationsCount,
    };
  } catch (err) {
    console.error('Failed to fetch relay staking details:', err);
    return null;
  }
}

/**
 * Calculate base score from staked HEZ amount
 */
function calculateBaseStakingScore(stakedHez: number): number {
  if (stakedHez <= 0) return 0;
  if (stakedHez <= 100) return 20;
  if (stakedHez <= 250) return 30;
  if (stakedHez <= 750) return 40;
  return 50; // 751+ HEZ
}

/**
 * Get time multiplier based on months staked
 */
function getStakingTimeMultiplier(monthsStaked: number): number {
  if (monthsStaked >= 12) return 2.0;
  if (monthsStaked >= 6) return 1.7;
  if (monthsStaked >= 3) return 1.4;
  if (monthsStaked >= 1) return 1.2;
  return 1.0;
}

export interface FrontendStakingScoreResult {
  score: number;
  stakedAmount: bigint;
  stakedHez: number;
  trackingStarted: Date | null;
  monthsStaked: number;
  timeMultiplier: number;
  nominationsCount: number;
}

/**
 * Get staking score using frontend fallback
 */
export async function getFrontendStakingScore(
  relayApi: ApiPromise,
  address: string
): Promise<FrontendStakingScoreResult> {
  const emptyResult: FrontendStakingScoreResult = {
    score: 0,
    stakedAmount: 0n,
    stakedHez: 0,
    trackingStarted: null,
    monthsStaked: 0,
    timeMultiplier: 1.0,
    nominationsCount: 0,
  };

  if (!relayApi || !address) return emptyResult;

  const details = await fetchRelayStakingDetails(relayApi, address);

  if (!details || details.stakedAmount === 0n) {
    return emptyResult;
  }

  const trackingData = getStakingTrackingData();
  const now = Date.now();

  if (!trackingData[address]) {
    trackingData[address] = {
      startTime: now,
      lastChecked: now,
      lastStakeAmount: details.stakedAmount.toString(),
    };
    saveStakingTrackingData(trackingData);
  } else {
    trackingData[address].lastChecked = now;
    trackingData[address].lastStakeAmount = details.stakedAmount.toString();
    saveStakingTrackingData(trackingData);
  }

  const userTracking = trackingData[address];
  const trackingStarted = new Date(userTracking.startTime);
  const msStaked = now - userTracking.startTime;
  const monthsStaked = Math.floor(msStaked / MONTH_IN_MS);

  const stakedHez = Number(details.stakedAmount) / UNITS;
  const baseScore = calculateBaseStakingScore(stakedHez);
  const timeMultiplier = getStakingTimeMultiplier(monthsStaked);
  const finalScore = Math.min(Math.floor(baseScore * timeMultiplier), 100);

  return {
    score: finalScore,
    stakedAmount: details.stakedAmount,
    stakedHez,
    trackingStarted,
    monthsStaked,
    timeMultiplier,
    nominationsCount: details.nominationsCount,
  };
}

// ========================================
// TIKI SCORE
// ========================================

export interface TikiInfo {
  roleId: number;
  level: number;
  name: string;
}

const TIKI_ROLE_SCORES: Record<number, number> = {
  1: 10, // Basic
  2: 20, // Bronze
  3: 30, // Silver
  4: 40, // Gold
  5: 50, // Platinum
};

/**
 * Fetch user's tiki roles from People Chain
 */
export async function fetchUserTikis(peopleApi: ApiPromise, address: string): Promise<TikiInfo[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!(peopleApi?.query as any)?.tiki) return [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (peopleApi.query.tiki as any).userRoles?.(address);

    if (!result || result.isEmpty) return [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const roles = result.toJSON() as any[];
    return roles.map((role) => ({
      roleId: role.roleId || role.role_id || 0,
      level: role.level || 0,
      name: role.name || 'Unknown',
    }));
  } catch (err) {
    console.error('Failed to fetch tiki roles:', err);
    return [];
  }
}

/**
 * Calculate tiki score from user's roles
 */
export function calculateTikiScore(tikis: TikiInfo[]): number {
  if (!tikis.length) return 0;

  // Get highest role score
  let maxScore = 0;
  for (const tiki of tikis) {
    const roleScore = TIKI_ROLE_SCORES[tiki.roleId] || 0;
    maxScore = Math.max(maxScore, roleScore);
  }

  return Math.min(maxScore, 50); // Capped at 50
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
// TRUST SCORE CALCULATION
// ========================================
// Formula from pezpallet-trust:
// weighted_sum = staking*100 + referral*300 + perwerde*300 + tiki*300
// trust_score = (staking * weighted_sum) / 100

const SCORE_MULTIPLIER_BASE = 100;

export interface FrontendTrustScoreResult {
  trustScore: number;
  stakingScore: number;
  referralScore: number;
  perwerdeScore: number;
  tikiScore: number;
  weightedSum: number;
  isCitizen: boolean;
}

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

/**
 * Calculate all scores with frontend fallback
 */
export async function getAllScoresWithFallback(
  peopleApi: ApiPromise | null,
  relayApi: ApiPromise | null,
  address: string
): Promise<FrontendTrustScoreResult & { isFromFrontend: boolean }> {
  const emptyResult: FrontendTrustScoreResult & { isFromFrontend: boolean } = {
    trustScore: 0,
    stakingScore: 0,
    referralScore: 0,
    perwerdeScore: 0,
    tikiScore: 0,
    weightedSum: 0,
    isCitizen: false,
    isFromFrontend: true,
  };

  if (!address) return emptyResult;

  // Check citizenship status
  const isCitizen = await checkCitizenshipStatus(peopleApi, address);

  // Get component scores in parallel
  const [stakingResult, referralCount, perwerdeScore, tikiScore] = await Promise.all([
    relayApi ? getFrontendStakingScore(relayApi, address) : Promise.resolve({ score: 0 }),
    peopleApi ? getReferralCount(peopleApi, address) : Promise.resolve(0),
    getPerwerdeScore(peopleApi, address),
    peopleApi ? getTikiScore(peopleApi, address) : Promise.resolve(0),
  ]);

  const stakingScore = stakingResult.score;
  const referralScore = calculateReferralScore(referralCount);

  // If staking score is 0, trust score is 0 (matches pallet logic)
  if (stakingScore === 0) {
    return {
      ...emptyResult,
      referralScore,
      perwerdeScore,
      tikiScore,
      isCitizen,
    };
  }

  // Calculate weighted sum (matching pallet formula)
  const weightedSum =
    stakingScore * 100 + referralScore * 300 + perwerdeScore * 300 + tikiScore * 300;

  // Calculate final trust score
  // trust_score = (staking * weighted_sum) / 100
  const trustScore = Math.floor((stakingScore * weightedSum) / SCORE_MULTIPLIER_BASE);

  return {
    trustScore,
    stakingScore,
    referralScore,
    perwerdeScore,
    tikiScore,
    weightedSum,
    isCitizen,
    isFromFrontend: true,
  };
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

export function formatStakedAmount(amount: bigint): string {
  const hez = Number(amount) / UNITS;
  if (hez >= 1000000) return `${(hez / 1000000).toFixed(2)}M`;
  if (hez >= 1000) return `${(hez / 1000).toFixed(2)}K`;
  return hez.toFixed(2);
}
