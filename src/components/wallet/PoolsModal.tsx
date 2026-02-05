/**
 * Pools Modal Component
 * Mobile-optimized liquidity pools interface for Telegram miniapp
 */

import { useState, useEffect } from 'react';
import { X, Droplets, Plus, Minus, AlertCircle, Check } from 'lucide-react';
import { useWallet } from '@/contexts/WalletContext';
import { useTelegram } from '@/hooks/useTelegram';
import { KurdistanSun } from '@/components/KurdistanSun';

interface PoolsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Pool {
  id: string;
  asset0: number;
  asset1: number;
  asset0Symbol: string;
  asset1Symbol: string;
  asset0Decimals: number;
  asset1Decimals: number;
  lpTokenId: number;
  reserve0: number;
  reserve1: number;
  price: number;
  userLpBalance?: number;
  userShare?: number;
}

// Native token ID
const NATIVE_TOKEN_ID = -1;

// Token info mapping
const TOKEN_INFO: Record<number, { symbol: string; decimals: number; icon: string }> = {
  [-1]: { symbol: 'HEZ', decimals: 12, icon: '/tokens/HEZ.png' },
  1: { symbol: 'PEZ', decimals: 12, icon: '/tokens/PEZ.png' },
  1000: { symbol: 'USDT', decimals: 6, icon: '/tokens/USDT.png' },
};

// Helper to convert asset ID to XCM Location format
const formatAssetLocation = (id: number) => {
  if (id === NATIVE_TOKEN_ID) {
    return { parents: 1, interior: 'Here' };
  }
  return { parents: 0, interior: { X2: [{ PalletInstance: 50 }, { GeneralIndex: id }] } };
};

export function PoolsModal({ isOpen, onClose }: PoolsModalProps) {
  const { assetHubApi, keypair } = useWallet();
  const { hapticImpact, hapticNotification } = useTelegram();

  const [pools, setPools] = useState<Pool[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPool, setSelectedPool] = useState<Pool | null>(null);
  const [isAddingLiquidity, setIsAddingLiquidity] = useState(false);
  const [isRemovingLiquidity, setIsRemovingLiquidity] = useState(false);
  const [amount0, setAmount0] = useState('');
  const [amount1, setAmount1] = useState('');
  const [lpAmountToRemove, setLpAmountToRemove] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  // Token balances
  const [balances, setBalances] = useState<Record<string, string>>({
    HEZ: '0',
    PEZ: '0',
    USDT: '0',
  });

  // Fetch balances and pools
  useEffect(() => {
    if (!isOpen || !assetHubApi || !keypair) return;

    // Reset state when modal opens
    setError('');
    setAmount0('');
    setAmount1('');
    setLpAmountToRemove('');

    let isCancelled = false;

    const fetchData = async () => {
      setIsLoading(true);

      try {
        // Add timeout wrapper for API calls
        const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> => {
          return Promise.race([
            promise,
            new Promise<T>((_, reject) =>
              setTimeout(() => reject(new Error('API call timeout')), ms)
            ),
          ]);
        };

        // Fetch HEZ balance from Asset Hub (native token)

        const hezAccount = (await withTimeout(
          (assetHubApi.query.system as any).account(keypair.address),
          10000
        )) as any;
        if (isCancelled) return;
        const hezFree = hezAccount.data.free.toString();
        setBalances((prev) => ({ ...prev, HEZ: (parseInt(hezFree) / 1e12).toFixed(4) }));

        const pezResult = (await withTimeout(
          (assetHubApi.query.assets as any).account(1, keypair.address),
          10000
        )) as any;
        if (isCancelled) return;
        if (pezResult.isSome) {
          setBalances((prev) => ({
            ...prev,
            PEZ: (parseInt(pezResult.unwrap().balance.toString()) / 1e12).toFixed(4),
          }));
        } else {
          setBalances((prev) => ({ ...prev, PEZ: '0.0000' }));
        }

        const usdtResult = (await withTimeout(
          (assetHubApi.query.assets as any).account(1000, keypair.address),
          10000
        )) as any;
        if (isCancelled) return;
        if (usdtResult.isSome) {
          setBalances((prev) => ({
            ...prev,
            USDT: (parseInt(usdtResult.unwrap().balance.toString()) / 1e6).toFixed(2),
          }));
        } else {
          setBalances((prev) => ({ ...prev, USDT: '0.00' }));
        }

        // Fetch pools
        const poolPairs: [number, number][] = [
          [NATIVE_TOKEN_ID, 1], // HEZ-PEZ
          [NATIVE_TOKEN_ID, 1000], // HEZ-USDT
        ];

        const fetchedPools: Pool[] = [];

        for (const [asset0, asset1] of poolPairs) {
          if (isCancelled) return;
          try {
            const poolKey = [formatAssetLocation(asset0), formatAssetLocation(asset1)];
            const poolInfo = await withTimeout(
              assetHubApi.query.assetConversion.pools(poolKey),
              10000
            );

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if (poolInfo && !(poolInfo as any).isEmpty) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const poolData = (poolInfo as any).unwrap().toJSON() as { lpToken: number };
              const lpTokenId = poolData.lpToken;

              const token0 = TOKEN_INFO[asset0];
              const token1 = TOKEN_INFO[asset1];

              // Get price quote
              let price = 0;
              let reserve0 = 0;
              let reserve1 = 0;

              try {
                const oneUnit = BigInt(Math.pow(10, token0.decimals));

                const quote = await withTimeout(
                  (assetHubApi.call as any).assetConversionApi.quotePriceExactTokensForTokens(
                    formatAssetLocation(asset0),
                    formatAssetLocation(asset1),
                    oneUnit.toString(),
                    true
                  ),
                  10000
                );

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                if (quote && !(quote as any).isNone) {
                  price =
                    Number(BigInt((quote as any).unwrap().toString())) /
                    Math.pow(10, token1.decimals);

                  // Estimate reserves from LP supply
                  const lpAsset = await withTimeout(
                    assetHubApi.query.poolAssets.asset(lpTokenId),
                    10000
                  );
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  if ((lpAsset as any).isSome) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const lpSupply = Number((lpAsset as any).unwrap().toJSON().supply) / 1e12;
                    // Decimal correction factor for mixed-decimal pools
                    const decimalFactor = Math.pow(
                      10,
                      12 - (token0.decimals + token1.decimals) / 2
                    );
                    const sqrtPrice = Math.sqrt(price);
                    reserve0 = (lpSupply * decimalFactor) / sqrtPrice;
                    reserve1 = lpSupply * decimalFactor * sqrtPrice;
                  }
                }
              } catch (err) {
                console.warn('Could not fetch price for pool:', err);
              }

              // Get user's LP balance
              let userLpBalance = 0;
              let userShare = 0;

              try {
                const userLp = await withTimeout(
                  assetHubApi.query.poolAssets.account(lpTokenId, keypair.address),
                  10000
                );
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                if ((userLp as any).isSome) {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  userLpBalance = Number((userLp as any).unwrap().toJSON().balance) / 1e12;

                  const lpAsset = await withTimeout(
                    assetHubApi.query.poolAssets.asset(lpTokenId),
                    10000
                  );
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  if ((lpAsset as any).isSome) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const totalSupply = Number((lpAsset as any).unwrap().toJSON().supply) / 1e12;
                    userShare = totalSupply > 0 ? (userLpBalance / totalSupply) * 100 : 0;
                  }
                }
              } catch (err) {
                console.warn('Could not fetch user LP balance:', err);
              }

              fetchedPools.push({
                id: `${asset0}-${asset1}`,
                asset0,
                asset1,
                asset0Symbol: token0.symbol,
                asset1Symbol: token1.symbol,
                asset0Decimals: token0.decimals,
                asset1Decimals: token1.decimals,
                lpTokenId,
                reserve0,
                reserve1,
                price,
                userLpBalance,
                userShare,
              });
            }
          } catch (err) {
            console.warn('Pool not found:', err);
          }
        }

        if (!isCancelled) {
          setPools(fetchedPools);
        }
      } catch (err) {
        console.error('Failed to fetch pools:', err);
        if (!isCancelled) {
          setError('Bağlantı hatası - tekrar deneyin');
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      isCancelled = true;
    };
  }, [isOpen, assetHubApi, keypair]);

  // Auto-calculate amount1 based on pool price
  useEffect(() => {
    if (selectedPool && amount0 && selectedPool.price > 0) {
      const calculated = parseFloat(amount0) * selectedPool.price;
      setAmount1(calculated.toFixed(selectedPool.asset1Decimals === 6 ? 2 : 4));
    } else {
      setAmount1('');
    }
  }, [amount0, selectedPool]);

  // Add liquidity
  const handleAddLiquidity = async () => {
    if (!assetHubApi || !keypair || !selectedPool || !amount0 || !amount1) return;

    setIsSubmitting(true);
    setError('');

    try {
      const amt0 = BigInt(
        Math.floor(parseFloat(amount0) * Math.pow(10, selectedPool.asset0Decimals))
      );
      const amt1 = BigInt(
        Math.floor(parseFloat(amount1) * Math.pow(10, selectedPool.asset1Decimals))
      );
      const minAmt0 = (amt0 * BigInt(90)) / BigInt(100); // 10% slippage
      const minAmt1 = (amt1 * BigInt(90)) / BigInt(100);

      const asset0Location = formatAssetLocation(selectedPool.asset0);
      const asset1Location = formatAssetLocation(selectedPool.asset1);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tx = (assetHubApi.tx.assetConversion as any).addLiquidity(
        asset0Location,
        asset1Location,
        amt0.toString(),
        amt1.toString(),
        minAmt0.toString(),
        minAmt1.toString(),
        keypair.address
      );

      // Wait for transaction to be finalized
      await new Promise<void>((resolve, reject) => {
        tx.signAndSend(
          keypair,
          ({ status, dispatchError }: { status: any; dispatchError: any }) => {
            if (status.isFinalized) {
              if (dispatchError) {
                let errorMsg = 'Zêdekirin neserketî';
                if (dispatchError.isModule) {
                  const decoded = assetHubApi.registry.findMetaError(dispatchError.asModule);
                  errorMsg = `${decoded.section}.${decoded.name}: ${decoded.docs.join(' ')}`;
                } else if (dispatchError.toString) {
                  errorMsg = dispatchError.toString();
                }
                console.error('Add liquidity error:', errorMsg);
                reject(new Error(errorMsg));
              } else {
                resolve();
              }
            }
          }
        ).catch(reject);
      });

      setSuccessMessage(
        `${amount0} ${selectedPool.asset0Symbol} + ${amount1} ${selectedPool.asset1Symbol} hate zêdekirin`
      );
      setSuccess(true);
      hapticNotification('success');

      setTimeout(() => {
        setSuccess(false);
        setIsAddingLiquidity(false);
        setSelectedPool(null);
        setAmount0('');
        setAmount1('');
      }, 2000);
    } catch (err) {
      console.error('Add liquidity failed:', err);
      setError(err instanceof Error ? err.message : 'Zêdekirin neserketî');
      hapticNotification('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Remove liquidity
  const handleRemoveLiquidity = async () => {
    if (!assetHubApi || !keypair || !selectedPool || !lpAmountToRemove) return;

    const lpAmount = parseFloat(lpAmountToRemove);
    if (lpAmount <= 0 || lpAmount > (selectedPool.userLpBalance || 0)) {
      setError('Mîqdara LP ne derbasdar e');
      hapticNotification('error');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const lpAmountRaw = BigInt(Math.floor(lpAmount * 1e12));

      // Calculate minimum amounts to receive (with 10% slippage)
      const userShare =
        ((lpAmount / (selectedPool.userLpBalance || 1)) * (selectedPool.userShare || 0)) / 100;
      const expectedAmt0 = selectedPool.reserve0 * userShare;
      const expectedAmt1 = selectedPool.reserve1 * userShare;

      const minAmt0 = BigInt(
        Math.floor(expectedAmt0 * 0.9 * Math.pow(10, selectedPool.asset0Decimals))
      );
      const minAmt1 = BigInt(
        Math.floor(expectedAmt1 * 0.9 * Math.pow(10, selectedPool.asset1Decimals))
      );

      const asset0Location = formatAssetLocation(selectedPool.asset0);
      const asset1Location = formatAssetLocation(selectedPool.asset1);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tx = (assetHubApi.tx.assetConversion as any).removeLiquidity(
        asset0Location,
        asset1Location,
        lpAmountRaw.toString(),
        minAmt0.toString(),
        minAmt1.toString(),
        keypair.address
      );

      // Wait for transaction to be finalized
      await new Promise<void>((resolve, reject) => {
        tx.signAndSend(
          keypair,
          ({ status, dispatchError }: { status: any; dispatchError: any }) => {
            if (status.isFinalized) {
              if (dispatchError) {
                let errorMsg = 'Derxistin neserketî';
                if (dispatchError.isModule) {
                  const decoded = assetHubApi.registry.findMetaError(dispatchError.asModule);
                  errorMsg = `${decoded.section}.${decoded.name}: ${decoded.docs.join(' ')}`;
                } else if (dispatchError.toString) {
                  errorMsg = dispatchError.toString();
                }
                console.error('Remove liquidity error:', errorMsg);
                reject(new Error(errorMsg));
              } else {
                resolve();
              }
            }
          }
        ).catch(reject);
      });

      setSuccessMessage(`${lpAmountToRemove} LP token hate vegerandin`);
      setSuccess(true);
      hapticNotification('success');

      setTimeout(() => {
        setSuccess(false);
        setIsRemovingLiquidity(false);
        setSelectedPool(null);
        setLpAmountToRemove('');
      }, 2000);
    } catch (err) {
      console.error('Remove liquidity failed:', err);
      setError(err instanceof Error ? err.message : 'Derxistin neserketî');
      hapticNotification('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  // Success screen
  if (success) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
        <div className="w-full max-w-md bg-card rounded-2xl p-6 text-center space-y-4">
          <div className="w-16 h-16 mx-auto bg-green-500/20 rounded-full flex items-center justify-center">
            <Check className="w-8 h-8 text-green-500" />
          </div>
          <h2 className="text-xl font-semibold">Serketî!</h2>
          <p className="text-muted-foreground">{successMessage}</p>
        </div>
      </div>
    );
  }

  // Add liquidity form
  if (isAddingLiquidity && selectedPool) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
        <div className="w-full max-w-md bg-card rounded-2xl shadow-xl border border-border overflow-hidden max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <button
              onClick={() => {
                setIsAddingLiquidity(false);
                setAmount0('');
                setAmount1('');
                setError('');
              }}
              className="text-muted-foreground"
            >
              ← Paş
            </button>
            <h2 className="text-lg font-semibold">Liquidity Zêde Bike</h2>
            <div className="w-10" />
          </div>

          {/* Pool Info */}
          <div className="p-4 bg-muted/30 border-b border-border">
            <div className="flex items-center justify-center gap-2">
              <span className="text-lg font-semibold">
                {selectedPool.asset0Symbol}/{selectedPool.asset1Symbol}
              </span>
            </div>
            <p className="text-center text-sm text-muted-foreground mt-1">
              1 {selectedPool.asset0Symbol} = {selectedPool.price.toFixed(4)}{' '}
              {selectedPool.asset1Symbol}
            </p>
          </div>

          {/* Form */}
          <div className="p-4 space-y-4">
            {/* Amount 0 */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{selectedPool.asset0Symbol} Mîqdar</span>
                <span className="text-muted-foreground">
                  Bakiye: {balances[selectedPool.asset0Symbol]}
                </span>
              </div>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={amount0}
                  onChange={(e) => setAmount0(e.target.value)}
                  placeholder="0.00"
                  className="flex-1 px-4 py-3 bg-muted rounded-xl text-lg font-mono"
                />
                <button
                  onClick={() => setAmount0(balances[selectedPool.asset0Symbol])}
                  className="px-3 py-2 bg-muted rounded-xl text-sm text-primary"
                >
                  Max
                </button>
              </div>
            </div>

            <div className="flex justify-center">
              <Plus className="w-5 h-5 text-muted-foreground" />
            </div>

            {/* Amount 1 */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  {selectedPool.asset1Symbol} Mîqdar (otomatîk)
                </span>
                <span className="text-muted-foreground">
                  Bakiye: {balances[selectedPool.asset1Symbol]}
                </span>
              </div>
              <input
                type="text"
                value={amount1}
                readOnly
                placeholder="0.00"
                className="w-full px-4 py-3 bg-muted rounded-xl text-lg font-mono text-muted-foreground"
              />
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                <AlertCircle className="w-4 h-4" />
                {error}
              </div>
            )}

            {/* Submit Button or Loading Animation */}
            {isSubmitting ? (
              <div className="flex flex-col items-center justify-center py-4 space-y-3">
                <KurdistanSun size={80} />
                <p className="text-sm text-muted-foreground animate-pulse">Tê zêdekirin...</p>
              </div>
            ) : (
              <button
                onClick={handleAddLiquidity}
                disabled={!amount0 || !amount1 || parseFloat(amount0) <= 0}
                className="w-full py-4 bg-gradient-to-r from-green-600 to-blue-600 text-white font-semibold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Droplets className="w-5 h-5" />
                Liquidity Zêde Bike
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Remove liquidity form
  if (isRemovingLiquidity && selectedPool) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
        <div className="w-full max-w-md bg-card rounded-2xl shadow-xl border border-border overflow-hidden max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <button
              onClick={() => {
                setIsRemovingLiquidity(false);
                setLpAmountToRemove('');
                setError('');
              }}
              className="text-muted-foreground"
            >
              ← Paş
            </button>
            <h2 className="text-lg font-semibold">Liquidity Derxe</h2>
            <div className="w-10" />
          </div>

          {/* Pool Info */}
          <div className="p-4 bg-muted/30 border-b border-border">
            <div className="flex items-center justify-center gap-2">
              <span className="text-lg font-semibold">
                {selectedPool.asset0Symbol}/{selectedPool.asset1Symbol}
              </span>
            </div>
            <p className="text-center text-sm text-muted-foreground mt-1">
              LP Bakiye: {selectedPool.userLpBalance?.toFixed(4) || '0'} LP
            </p>
          </div>

          {/* Form */}
          <div className="p-4 space-y-4">
            {/* LP Amount */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">LP Token Mîqdar</span>
                <span className="text-muted-foreground">
                  Max: {selectedPool.userLpBalance?.toFixed(4) || '0'}
                </span>
              </div>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={lpAmountToRemove}
                  onChange={(e) => setLpAmountToRemove(e.target.value)}
                  placeholder="0.00"
                  className="flex-1 px-4 py-3 bg-muted rounded-xl text-lg font-mono"
                />
                <button
                  onClick={() => setLpAmountToRemove(selectedPool.userLpBalance?.toString() || '0')}
                  className="px-3 py-2 bg-muted rounded-xl text-sm text-primary"
                >
                  Max
                </button>
              </div>
            </div>

            {/* Estimated Returns */}
            {lpAmountToRemove && parseFloat(lpAmountToRemove) > 0 && (
              <div className="bg-muted/50 rounded-xl p-3 space-y-2 text-sm">
                <p className="text-muted-foreground">Texmînî vegerandin:</p>
                <div className="flex justify-between">
                  <span>{selectedPool.asset0Symbol}</span>
                  <span className="font-mono">
                    ~
                    {(
                      (((parseFloat(lpAmountToRemove) / (selectedPool.userLpBalance || 1)) *
                        (selectedPool.userShare || 0)) /
                        100) *
                      selectedPool.reserve0
                    ).toFixed(4)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>{selectedPool.asset1Symbol}</span>
                  <span className="font-mono">
                    ~
                    {(
                      (((parseFloat(lpAmountToRemove) / (selectedPool.userLpBalance || 1)) *
                        (selectedPool.userShare || 0)) /
                        100) *
                      selectedPool.reserve1
                    ).toFixed(selectedPool.asset1Decimals === 6 ? 2 : 4)}
                  </span>
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                <AlertCircle className="w-4 h-4" />
                {error}
              </div>
            )}

            {/* Submit Button or Loading Animation */}
            {isSubmitting ? (
              <div className="flex flex-col items-center justify-center py-4 space-y-3">
                <KurdistanSun size={80} />
                <p className="text-sm text-muted-foreground animate-pulse">Tê derxistin...</p>
              </div>
            ) : (
              <button
                onClick={handleRemoveLiquidity}
                disabled={!lpAmountToRemove || parseFloat(lpAmountToRemove) <= 0}
                className="w-full py-4 bg-gradient-to-r from-red-600 to-orange-600 text-white font-semibold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Minus className="w-5 h-5" />
                Liquidity Derxe
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Pool list
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md bg-card rounded-2xl shadow-xl border border-border overflow-hidden max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold">Liquidity Pools</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-muted">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-8">
              <KurdistanSun size={80} />
              <p className="text-muted-foreground mt-3 animate-pulse">Tê barkirin...</p>
            </div>
          ) : pools.length === 0 ? (
            <div className="text-center py-8">
              <Droplets className="w-12 h-12 mx-auto text-muted-foreground mb-2" />
              <p className="text-muted-foreground">Pool tune</p>
            </div>
          ) : (
            pools.map((pool) => (
              <div key={pool.id} className="bg-muted/50 rounded-xl p-4 border border-border">
                {/* Pool Header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="flex -space-x-2">
                      <img
                        src={TOKEN_INFO[pool.asset0]?.icon}
                        alt={pool.asset0Symbol}
                        className="w-8 h-8 rounded-full border-2 border-card"
                      />
                      <img
                        src={TOKEN_INFO[pool.asset1]?.icon}
                        alt={pool.asset1Symbol}
                        className="w-8 h-8 rounded-full border-2 border-card"
                      />
                    </div>
                    <span className="font-semibold">
                      {pool.asset0Symbol}/{pool.asset1Symbol}
                    </span>
                  </div>
                </div>

                {/* Pool Stats */}
                <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                  <div>
                    <span className="text-muted-foreground">Rezerv {pool.asset0Symbol}</span>
                    <p className="font-mono">
                      {pool.reserve0.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Rezerv {pool.asset1Symbol}</span>
                    <p className="font-mono">
                      {pool.reserve1.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                    </p>
                  </div>
                </div>

                {/* User Position */}
                {pool.userLpBalance && pool.userLpBalance > 0 && (
                  <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-2 mb-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-green-400">Pozîsyona Te</span>
                      <span className="text-green-400 font-mono">
                        {pool.userShare?.toFixed(2)}%
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      LP Token: {pool.userLpBalance.toFixed(4)}
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      hapticImpact('light');
                      setSelectedPool(pool);
                      setIsAddingLiquidity(true);
                    }}
                    className="flex-1 py-2 bg-gradient-to-r from-green-600/20 to-blue-600/20 border border-green-500/30 text-green-400 font-medium rounded-lg flex items-center justify-center gap-1 text-sm"
                  >
                    <Plus className="w-4 h-4" />
                    Zêde Bike
                  </button>
                  {pool.userLpBalance && pool.userLpBalance > 0 && (
                    <button
                      onClick={() => {
                        hapticImpact('light');
                        setSelectedPool(pool);
                        setIsRemovingLiquidity(true);
                      }}
                      className="flex-1 py-2 bg-gradient-to-r from-red-600/20 to-orange-600/20 border border-red-500/30 text-red-400 font-medium rounded-lg flex items-center justify-center gap-1 text-sm"
                    >
                      <Minus className="w-4 h-4" />
                      Derxe
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
