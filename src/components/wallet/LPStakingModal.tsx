/**
 * LP Staking Modal for Telegram Mini App
 * Allows users to stake LP tokens and earn PEZ rewards
 */

import { useState, useEffect } from 'react';
import { X, Lock, Unlock, Gift, AlertCircle, Loader2 } from 'lucide-react';
import { useWallet } from '@/contexts/WalletContext';
import { useTelegram } from '@/hooks/useTelegram';
import { cn } from '@/lib/utils';

interface StakingPool {
  poolId: number;
  stakedAsset: string;
  rewardAsset: string;
  rewardRatePerBlock: string;
  totalStaked: string;
  userStaked: string;
  pendingRewards: string;
  lpTokenId: number;
  lpBalance: string;
}

interface LPStakingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const LP_TOKEN_NAMES: Record<number, string> = {
  0: 'HEZ-PEZ LP',
  1: 'HEZ-USDT LP',
  2: 'HEZ-DOT LP',
};

export function LPStakingModal({ isOpen, onClose }: LPStakingModalProps) {
  const { assetHubApi, keypair, address } = useWallet();
  const { hapticImpact, hapticNotification, showAlert } = useTelegram();

  const [pools, setPools] = useState<StakingPool[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPool, setSelectedPool] = useState<number | null>(null);
  const [stakeAmount, setStakeAmount] = useState('');
  const [unstakeAmount, setUnstakeAmount] = useState('');
  const [activeTab, setActiveTab] = useState<'stake' | 'unstake' | 'rewards'>('stake');

  useEffect(() => {
    if (!assetHubApi || !isOpen) return;

    const fetchPools = async () => {
      setIsLoading(true);
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const poolEntries = await (assetHubApi.query.assetRewards as any)?.pools?.entries();

        if (!poolEntries) {
          setError('Staking palleti amade nîne');
          setIsLoading(false);
          return;
        }

        const stakingPools: StakingPool[] = [];

        for (const [key, value] of poolEntries) {
          const poolId = parseInt(key.args[0].toString());
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const poolData = value.toJSON() as any;

          // LP token ID in poolAssets pallet matches the pool ID (0, 1, 2)
          const lpTokenId = poolId;

          let userStaked = '0';
          let pendingRewards = '0';
          let lpBalance = '0';

          if (address) {
            try {
              // poolStakers takes two separate arguments: (poolId, address)
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const stakeInfo = await (assetHubApi.query.assetRewards as any).poolStakers(
                poolId,
                address
              );
              console.warn('[LP Staking] Pool', poolId, 'stakeInfo:', stakeInfo.toString());
              if (stakeInfo && !stakeInfo.isEmpty && !stakeInfo.isNone) {
                const stakeData = stakeInfo.isSome
                  ? stakeInfo.unwrap().toJSON()
                  : stakeInfo.toJSON();
                userStaked = stakeData.amount?.toString() || '0';
                pendingRewards = stakeData.rewards?.toString() || '0';
                console.warn('[LP Staking] User staked in pool', poolId, ':', userStaked);
              }
            } catch (err) {
              console.error('Error fetching stake info:', err);
            }

            // Fetch LP balance from poolAssets pallet
            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const lpBal = await (assetHubApi.query.poolAssets as any).account(lpTokenId, address);
              if (lpBal) {
                // Handle both Option<AccountData> and direct AccountData
                const lpData = lpBal.isSome ? lpBal.unwrap().toJSON() : lpBal.toJSON();
                if (lpData && lpData.balance) {
                  lpBalance = lpData.balance.toString();
                }
              }
            } catch (err) {
              console.error('Error fetching LP balance for pool', poolId, ':', err);
            }
          }

          stakingPools.push({
            poolId,
            stakedAsset: LP_TOKEN_NAMES[lpTokenId] || `LP Token #${lpTokenId}`,
            rewardAsset: 'PEZ',
            rewardRatePerBlock: poolData.rewardRatePerBlock || '0',
            totalStaked: poolData.totalTokensStaked || '0',
            userStaked,
            pendingRewards,
            lpTokenId,
            lpBalance,
          });
        }

        setPools(stakingPools);
        if (stakingPools.length > 0 && selectedPool === null) {
          setSelectedPool(stakingPools[0].poolId);
        }
      } catch (err) {
        console.error('Error fetching staking pools:', err);
        setError('Staking pools bar nekirin');
      } finally {
        setIsLoading(false);
      }
    };

    fetchPools();
  }, [assetHubApi, isOpen, address, selectedPool]);

  const formatAmount = (amount: string, decimals: number = 12): string => {
    const value = Number(amount) / Math.pow(10, decimals);
    return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
  };

  const handleStake = async () => {
    if (!assetHubApi || !keypair || selectedPool === null || !stakeAmount) return;

    setIsProcessing(true);
    setError(null);

    try {
      const pool = pools.find((p) => p.poolId === selectedPool);
      if (!pool) throw new Error('Pool not found');

      const amountBN = BigInt(Math.floor(parseFloat(stakeAmount) * 1e12));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tx = (assetHubApi.tx.assetRewards as any).stake(selectedPool, amountBN.toString());

      const hash = await tx.signAndSend(keypair);
      hapticNotification('success');
      showAlert(`Stake serket! Hash: ${hash.toString().slice(0, 16)}...`);
      setStakeAmount('');

      // Close modal after success
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      console.error('Stake error:', err);
      setError(err instanceof Error ? err.message : 'Stake neserketî');
      hapticNotification('error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUnstake = async () => {
    if (!assetHubApi || !keypair || selectedPool === null || !unstakeAmount) return;

    setIsProcessing(true);
    setError(null);

    try {
      const amountBN = BigInt(Math.floor(parseFloat(unstakeAmount) * 1e12));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tx = (assetHubApi.tx.assetRewards as any).unstake(selectedPool, amountBN.toString());

      const hash = await tx.signAndSend(keypair);
      hapticNotification('success');
      showAlert(`Unstake serket! Hash: ${hash.toString().slice(0, 16)}...`);
      setUnstakeAmount('');

      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      console.error('Unstake error:', err);
      setError(err instanceof Error ? err.message : 'Unstake neserketî');
      hapticNotification('error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClaimRewards = async () => {
    if (!assetHubApi || !keypair || selectedPool === null) return;

    setIsProcessing(true);
    setError(null);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tx = (assetHubApi.tx.assetRewards as any).harvestRewards(selectedPool);

      const hash = await tx.signAndSend(keypair);
      hapticNotification('success');
      showAlert(`Xelat hat stendin! Hash: ${hash.toString().slice(0, 16)}...`);

      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      console.error('Claim error:', err);
      setError(err instanceof Error ? err.message : 'Xelat stendin neserketî');
      hapticNotification('error');
    } finally {
      setIsProcessing(false);
    }
  };

  const currentPool = pools.find((p) => p.poolId === selectedPool);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-end justify-center">
      <div className="bg-background w-full max-w-lg rounded-t-3xl max-h-[90vh] overflow-hidden flex flex-col animate-in slide-in-from-bottom duration-300">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold">LP Staking</h2>
          <button onClick={onClose} className="p-2 hover:bg-secondary rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : pools.length === 0 ? (
            <div className="text-center py-12">
              <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">Hêj staking pool tune ne</p>
            </div>
          ) : (
            <>
              {/* Pool Selector */}
              <div className="mb-4">
                <label className="text-sm text-muted-foreground mb-2 block">Pool Hilbijêre</label>
                <div className="grid grid-cols-3 gap-2">
                  {pools.map((pool) => (
                    <button
                      key={pool.poolId}
                      onClick={() => {
                        hapticImpact('light');
                        setSelectedPool(pool.poolId);
                      }}
                      className={cn(
                        'p-3 rounded-xl border text-center transition-all',
                        selectedPool === pool.poolId
                          ? 'border-primary bg-primary/10'
                          : 'border-border bg-secondary/50'
                      )}
                    >
                      <div className="text-xs font-medium">{pool.stakedAsset}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Pool Stats */}
              {currentPool && (
                <div className="bg-secondary/50 rounded-xl p-4 mb-4 border border-border">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-muted-foreground">Giştî Staked</div>
                      <div className="font-medium">{formatAmount(currentPool.totalStaked)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Te Stake Kiriye</div>
                      <div className="font-medium text-green-400">
                        {formatAmount(currentPool.userStaked)}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">LP Bakiye</div>
                      <div className="font-medium">{formatAmount(currentPool.lpBalance)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Xelat</div>
                      <div className="font-medium text-yellow-400">
                        {formatAmount(currentPool.pendingRewards)} PEZ
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Tabs */}
              <div className="flex gap-1 bg-secondary/50 rounded-lg p-1 mb-4">
                {[
                  { id: 'stake' as const, label: 'Stake', icon: Lock },
                  { id: 'unstake' as const, label: 'Unstake', icon: Unlock },
                  { id: 'rewards' as const, label: 'Xelat', icon: Gift },
                ].map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => {
                      hapticImpact('light');
                      setActiveTab(id);
                    }}
                    className={cn(
                      'flex-1 py-2 rounded-md text-sm flex items-center justify-center gap-1 transition-colors',
                      activeTab === id
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground'
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </button>
                ))}
              </div>

              {/* Error */}
              {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-4 text-sm text-red-400">
                  {error}
                </div>
              )}

              {/* Stake Tab */}
              {activeTab === 'stake' && currentPool && (
                <div className="space-y-4">
                  <div>
                    <label className="text-sm text-muted-foreground mb-2 block">
                      Mîqdar ({currentPool.stakedAsset})
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        value={stakeAmount}
                        onChange={(e) => setStakeAmount(e.target.value)}
                        placeholder="0.0000"
                        className="w-full bg-secondary border border-border rounded-xl p-4 pr-20 text-lg"
                      />
                      <button
                        onClick={() => setStakeAmount(formatAmount(currentPool.lpBalance))}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-primary"
                      >
                        MAX
                      </button>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Bakiye: {formatAmount(currentPool.lpBalance)}
                    </div>
                  </div>
                  <button
                    onClick={handleStake}
                    disabled={isProcessing || !stakeAmount}
                    className="w-full py-4 bg-primary text-primary-foreground rounded-xl font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isProcessing ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Lock className="w-5 h-5" />
                    )}
                    {isProcessing ? 'Tê stake kirin...' : 'Stake Bike'}
                  </button>
                </div>
              )}

              {/* Unstake Tab */}
              {activeTab === 'unstake' && currentPool && (
                <div className="space-y-4">
                  <div>
                    <label className="text-sm text-muted-foreground mb-2 block">
                      Mîqdar ({currentPool.stakedAsset})
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        value={unstakeAmount}
                        onChange={(e) => setUnstakeAmount(e.target.value)}
                        placeholder="0.0000"
                        className="w-full bg-secondary border border-border rounded-xl p-4 pr-20 text-lg"
                      />
                      <button
                        onClick={() => setUnstakeAmount(formatAmount(currentPool.userStaked))}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-primary"
                      >
                        MAX
                      </button>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Staked: {formatAmount(currentPool.userStaked)}
                    </div>
                  </div>
                  <button
                    onClick={handleUnstake}
                    disabled={isProcessing || !unstakeAmount}
                    className="w-full py-4 bg-orange-500 text-white rounded-xl font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isProcessing ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Unlock className="w-5 h-5" />
                    )}
                    {isProcessing ? 'Tê unstake kirin...' : 'Unstake Bike'}
                  </button>
                </div>
              )}

              {/* Rewards Tab */}
              {activeTab === 'rewards' && currentPool && (
                <div className="space-y-4">
                  <div className="bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border border-yellow-500/30 rounded-xl p-6 text-center">
                    <Gift className="w-12 h-12 text-yellow-400 mx-auto mb-3" />
                    <div className="text-2xl font-bold text-yellow-400 mb-1">
                      {formatAmount(currentPool.pendingRewards)} PEZ
                    </div>
                    <div className="text-sm text-muted-foreground">Xelatên li bendê</div>
                  </div>
                  <button
                    onClick={handleClaimRewards}
                    disabled={isProcessing || currentPool.pendingRewards === '0'}
                    className="w-full py-4 bg-gradient-to-r from-yellow-500 to-orange-500 text-white rounded-xl font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isProcessing ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Gift className="w-5 h-5" />
                    )}
                    {isProcessing ? 'Tê stendin...' : 'Xelatan Bistîne'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
