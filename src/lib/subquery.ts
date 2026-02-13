/**
 * SubQuery GraphQL Client
 * Queries the pezkuwi-subquery indexer for historical blockchain data
 */

const SUBQUERY_ENDPOINT = 'https://subquery.pezkuwichain.io';

const UNITS = 1_000_000_000_000; // 10^12

// ========================================
// TYPES
// ========================================

export interface StakingRewardEntry {
  id: string;
  blockNumber: number;
  timestamp: string;
  amount: string;
  accumulatedAmount: string;
  type: 'REWARD' | 'SLASH';
}

export interface StakingRewardsResult {
  rewards: StakingRewardEntry[];
  totalAccumulated: string;
  totalAccumulatedHez: number;
}

// ========================================
// GRAPHQL CLIENT
// ========================================

async function querySubGraph<T>(query: string): Promise<T | null> {
  try {
    const res = await fetch(SUBQUERY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });

    if (!res.ok) {
      console.error('[SubQuery] HTTP error:', res.status);
      return null;
    }

    const json = await res.json();

    if (json.errors) {
      console.error('[SubQuery] GraphQL errors:', json.errors);
      return null;
    }

    return json.data as T;
  } catch (err) {
    console.error('[SubQuery] Fetch error:', err);
    return null;
  }
}

// ========================================
// REWARD QUERIES
// ========================================

/**
 * Fetch staking rewards for a specific address
 */
export async function getStakingRewards(
  address: string,
  limit = 20
): Promise<StakingRewardsResult> {
  const empty: StakingRewardsResult = {
    rewards: [],
    totalAccumulated: '0',
    totalAccumulatedHez: 0,
  };

  if (!address) return empty;

  const data = await querySubGraph<{
    accountRewards: { nodes: StakingRewardEntry[] };
    accumulatedReward: { amount: string } | null;
  }>(`{
    accountRewards(
      filter: { address: { equalTo: "${address}" } }
      orderBy: BLOCK_NUMBER_DESC
      first: ${limit}
    ) {
      nodes {
        id
        blockNumber
        timestamp
        amount
        accumulatedAmount
        type
      }
    }
    accumulatedReward(id: "${address}") {
      amount
    }
  }`);

  if (!data) return empty;

  const totalAccumulated = data.accumulatedReward?.amount || '0';

  return {
    rewards: data.accountRewards.nodes,
    totalAccumulated,
    totalAccumulatedHez: Number(BigInt(totalAccumulated)) / UNITS,
  };
}

/**
 * Format a raw amount (planck) to HEZ display
 */
export function formatRewardAmount(amount: string): string {
  const hez = Number(BigInt(amount)) / UNITS;
  if (hez >= 1000) return `${(hez / 1000).toFixed(2)}K`;
  if (hez >= 1) return hez.toFixed(4);
  if (hez >= 0.001) return hez.toFixed(6);
  return hez.toFixed(10);
}

/**
 * Format timestamp to locale string
 */
export function formatRewardDate(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString('ku', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
