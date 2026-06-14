/**
 * HEZ Staking Modal for Telegram Mini App
 * Allows users to stake HEZ on Asset Hub for Trust Score
 * (Staking moved from Relay Chain to Asset Hub)
 */

import { useState, useEffect, useCallback } from 'react';
import { X, Lock, Unlock, Users, AlertCircle, Loader2, Shield, TrendingUp } from 'lucide-react';
import { useWallet } from '@/contexts/WalletContext';
import { useTelegram } from '@/hooks/useTelegram';
import { useTranslation } from '@/i18n';
import { cn } from '@/lib/utils';

interface StakingInfo {
  stash: string;
  totalBonded: bigint;
  active: bigint;
  unlocking: { value: bigint; era: number }[];
  nominations: string[];
  rewardDestination: string;
}

interface ValidatorInfo {
  address: string;
  commission: number;
  blocked: boolean;
  identity?: string;
}

interface HEZStakingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const UNITS = 1_000_000_000_000; // 10^12

export function HEZStakingModal({ isOpen, onClose }: HEZStakingModalProps) {
  const { assetHubApi, keypair, address } = useWallet();
  const { hapticImpact, hapticNotification, showAlert } = useTelegram();
  const { t } = useTranslation();

  const [stakingInfo, setStakingInfo] = useState<StakingInfo | null>(null);
  const [validators, setValidators] = useState<ValidatorInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'status' | 'bond' | 'nominate' | 'unbond'>('status');
  const [bondAmount, setBondAmount] = useState('');
  const [unbondAmount, setUnbondAmount] = useState('');
  const [selectedValidators, setSelectedValidators] = useState<string[]>([]);
  const [ahBalance, setAhBalance] = useState<string | null>(null);

  // Fetch staking info from Asset Hub
  const fetchStakingInfo = useCallback(async () => {
    if (!assetHubApi || !address) return;

    setIsLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stakingPallet = assetHubApi.query.staking as any;
      if (!stakingPallet) {
        setError(t('staking.palletNotFound'));
        setIsLoading(false);
        return;
      }

      // Fetch AH native HEZ balance
      try {
        const accountInfo = await assetHubApi.query.system.account(address);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const free = (accountInfo as any).data.free.toString();
        const balanceNum = Number(free) / UNITS;
        setAhBalance(balanceNum.toFixed(4));
      } catch {
        setAhBalance(null);
      }

      // Check if user has bonded
      const ledger = await stakingPallet.ledger(address);

      if (ledger && !ledger.isEmpty && !ledger.isNone) {
        const ledgerData = ledger.isSome ? ledger.unwrap().toJSON() : ledger.toJSON();

        // Get nominations
        const nominations = await stakingPallet.nominators(address);
        const nominationsData = nominations?.toJSON() as { targets?: string[] } | null;

        // Get payee
        const payee = await stakingPallet.payee(address);
        const payeeStr = payee?.toString() || 'Staked';

        setStakingInfo({
          stash: ledgerData.stash || address,
          totalBonded: BigInt(ledgerData.total || 0),
          active: BigInt(ledgerData.active || 0),
          unlocking: (ledgerData.unlocking || []).map(
            (u: { value: string | number; era: number }) => ({
              value: BigInt(u.value),
              era: u.era,
            })
          ),
          nominations: nominationsData?.targets || [],
          rewardDestination: payeeStr,
        });
      } else {
        setStakingInfo(null);
      }

      // Fetch validators from AH staking pallet
      const validatorEntries = await stakingPallet.validators.entries();
      const validatorList: ValidatorInfo[] = validatorEntries
        .slice(0, 20) // Limit to 20 validators
        .map(
          ([key, value]: [
            { args: [{ toString: () => string }] },
            { toJSON: () => { commission?: number; blocked?: boolean } },
          ]) => {
            const addr = key.args[0].toString();
            const prefs = value.toJSON();
            return {
              address: addr,
              commission: (prefs.commission || 0) / 10000000, // Convert from Perbill
              blocked: prefs.blocked || false,
            };
          }
        )
        .filter((v: ValidatorInfo) => !v.blocked);

      setValidators(validatorList);
    } catch (err) {
      console.error('Error fetching staking info:', err);
      setError(t('staking.fetchError'));
    } finally {
      setIsLoading(false);
    }
    // `t` is intentionally omitted: it is only used for error messages and its
    // identity changes only on language switch — including it would re-run the
    // blockchain fetch (extra RPC calls) on every language change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetHubApi, address]);

  useEffect(() => {
    if (isOpen && assetHubApi && address) {
      fetchStakingInfo();
    }
  }, [isOpen, assetHubApi, address, fetchStakingInfo]);

  const formatHEZ = (amount: bigint): string => {
    const hez = Number(amount) / UNITS;
    return hez.toLocaleString(undefined, { maximumFractionDigits: 4 });
  };

  const handleBond = async () => {
    if (!assetHubApi || !keypair || !bondAmount) return;

    setIsProcessing(true);
    setError(null);

    try {
      const amountBN = BigInt(Math.floor(parseFloat(bondAmount) * UNITS));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stakingPallet = assetHubApi.tx.staking as any;

      let tx;
      if (stakingInfo) {
        // Already bonded, add to existing stake
        tx = stakingPallet.bondExtra(amountBN.toString());
      } else {
        // First time bonding - set payee to Staked (compound rewards)
        tx = stakingPallet.bond(amountBN.toString(), 'Staked');
      }

      await new Promise<void>((resolve, reject) => {
        tx.signAndSend(
          keypair,
          ({
            status,
            dispatchError,
          }: {
            status: { isFinalized: boolean };
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            dispatchError?: { isModule: boolean; asModule: any; toString: () => string };
          }) => {
            if (status.isFinalized) {
              if (dispatchError) {
                let errorMsg = t('staking.bondFailed');
                if (dispatchError.isModule) {
                  const decoded = assetHubApi.registry.findMetaError(dispatchError.asModule);
                  errorMsg = `${decoded.section}.${decoded.name}`;
                }
                reject(new Error(errorMsg));
              } else {
                resolve();
              }
            }
          }
        ).catch(reject);
      });

      hapticNotification('success');
      showAlert(t('staking.bondSuccess', { amount: bondAmount }));
      setBondAmount('');
      fetchStakingInfo();
      setActiveTab('status');
    } catch (err) {
      console.error('Bond error:', err);
      setError(err instanceof Error ? err.message : t('staking.bondFailed'));
      hapticNotification('error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleNominate = async () => {
    if (!assetHubApi || !keypair || selectedValidators.length === 0) return;

    setIsProcessing(true);
    setError(null);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tx = (assetHubApi.tx.staking as any).nominate(selectedValidators);

      await new Promise<void>((resolve, reject) => {
        tx.signAndSend(
          keypair,
          ({
            status,
            dispatchError,
          }: {
            status: { isFinalized: boolean };
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            dispatchError?: { isModule: boolean; asModule: any; toString: () => string };
          }) => {
            if (status.isFinalized) {
              if (dispatchError) {
                let errorMsg = t('staking.nominateFailed');
                if (dispatchError.isModule) {
                  const decoded = assetHubApi.registry.findMetaError(dispatchError.asModule);
                  errorMsg = `${decoded.section}.${decoded.name}`;
                }
                reject(new Error(errorMsg));
              } else {
                resolve();
              }
            }
          }
        ).catch(reject);
      });

      hapticNotification('success');
      showAlert(t('staking.nominateSuccess', { count: selectedValidators.length }));
      fetchStakingInfo();
      setActiveTab('status');
    } catch (err) {
      console.error('Nominate error:', err);
      setError(err instanceof Error ? err.message : t('staking.nominateFailed'));
      hapticNotification('error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUnbond = async () => {
    if (!assetHubApi || !keypair || !unbondAmount) return;

    setIsProcessing(true);
    setError(null);

    try {
      const amountBN = BigInt(Math.floor(parseFloat(unbondAmount) * UNITS));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tx = (assetHubApi.tx.staking as any).unbond(amountBN.toString());

      await new Promise<void>((resolve, reject) => {
        tx.signAndSend(
          keypair,
          ({
            status,
            dispatchError,
          }: {
            status: { isFinalized: boolean };
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            dispatchError?: { isModule: boolean; asModule: any; toString: () => string };
          }) => {
            if (status.isFinalized) {
              if (dispatchError) {
                let errorMsg = t('staking.unbondFailed');
                if (dispatchError.isModule) {
                  const decoded = assetHubApi.registry.findMetaError(dispatchError.asModule);
                  errorMsg = `${decoded.section}.${decoded.name}`;
                }
                reject(new Error(errorMsg));
              } else {
                resolve();
              }
            }
          }
        ).catch(reject);
      });

      hapticNotification('success');
      showAlert(t('staking.unbondSuccess', { amount: unbondAmount }));
      setUnbondAmount('');
      fetchStakingInfo();
      setActiveTab('status');
    } catch (err) {
      console.error('Unbond error:', err);
      setError(err instanceof Error ? err.message : t('staking.unbondFailed'));
      hapticNotification('error');
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleValidator = (addr: string) => {
    hapticImpact('light');
    setSelectedValidators((prev) =>
      prev.includes(addr) ? prev.filter((v) => v !== addr) : [...prev, addr].slice(0, 16)
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-end justify-center">
      <div className="bg-background w-full max-w-lg rounded-t-3xl max-h-[90vh] overflow-hidden flex flex-col animate-in slide-in-from-bottom duration-300">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-green-400" />
            <h2 className="text-lg font-semibold">HEZ Staking</h2>
          </div>
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
          ) : (
            <>
              {/* Tabs */}
              <div className="flex gap-1 bg-secondary/50 rounded-lg p-1 mb-4">
                {[
                  { id: 'status' as const, label: t('staking.statusTab'), icon: TrendingUp },
                  { id: 'bond' as const, label: t('staking.bondTab'), icon: Lock },
                  { id: 'nominate' as const, label: t('staking.nominateTab'), icon: Users },
                  { id: 'unbond' as const, label: t('staking.unbondTab'), icon: Unlock },
                ].map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => {
                      hapticImpact('light');
                      setActiveTab(id);
                    }}
                    className={cn(
                      'flex-1 py-2 rounded-md text-xs flex items-center justify-center gap-1 transition-colors',
                      activeTab === id
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground'
                    )}
                  >
                    <Icon className="w-3 h-3" />
                    {label}
                  </button>
                ))}
              </div>

              {/* Error */}
              {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-4 text-sm text-red-400 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  {error}
                </div>
              )}

              {/* Status Tab */}
              {activeTab === 'status' && (
                <div className="space-y-4">
                  {stakingInfo ? (
                    <>
                      <div className="bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-500/30 rounded-xl p-4">
                        <div className="text-sm text-muted-foreground mb-1">
                          {t('staking.activeStake')}
                        </div>
                        <div className="text-2xl font-bold text-green-400">
                          {formatHEZ(stakingInfo.active)} HEZ
                        </div>
                      </div>

                      <div className="bg-secondary/50 rounded-xl p-4 space-y-3">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">{t('staking.totalBonded')}</span>
                          <span>{formatHEZ(stakingInfo.totalBonded)} HEZ</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">{t('staking.nominations')}</span>
                          <span>{stakingInfo.nominations.length} validator</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">
                            {t('staking.rewardDestination')}
                          </span>
                          <span>{stakingInfo.rewardDestination}</span>
                        </div>
                        {stakingInfo.unlocking.length > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">
                              {t('staking.unbondingChunks')}
                            </span>
                            <span className="text-yellow-400">
                              {stakingInfo.unlocking.length} chunk
                            </span>
                          </div>
                        )}
                      </div>

                      {stakingInfo.nominations.length > 0 && (
                        <div className="bg-secondary/50 rounded-xl p-4">
                          <div className="text-sm text-muted-foreground mb-2">
                            {t('staking.nominatedValidators')}
                          </div>
                          <div className="space-y-1 max-h-32 overflow-y-auto">
                            {stakingInfo.nominations.map((addr, i) => (
                              <div key={i} className="text-xs font-mono text-muted-foreground">
                                {addr.slice(0, 8)}...{addr.slice(-8)}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                        <p className="text-blue-400 text-xs">{t('staking.stakingTip')}</p>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-8">
                      <Shield className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                      <h3 className="text-lg font-medium mb-2">{t('staking.notStakedYet')}</h3>
                      <p className="text-muted-foreground text-sm mb-4">
                        {t('staking.stakeForTrustScore')}
                      </p>
                      <button
                        onClick={() => setActiveTab('bond')}
                        className="px-6 py-2 bg-green-600 text-white rounded-lg text-sm"
                      >
                        {t('staking.startStaking')}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Bond Tab */}
              {activeTab === 'bond' && (
                <div className="space-y-4">
                  <div className="bg-secondary/50 rounded-xl p-4">
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-muted-foreground">{t('staking.yourBalance')}</span>
                      <span>{ahBalance || '0'} HEZ</span>
                    </div>
                    {stakingInfo && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">
                          {t('staking.currentlyStaked')}
                        </span>
                        <span className="text-green-400">{formatHEZ(stakingInfo.active)} HEZ</span>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="text-sm text-muted-foreground mb-2 block">
                      {t('staking.amountHez')}
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        value={bondAmount}
                        onChange={(e) => setBondAmount(e.target.value)}
                        placeholder="0.0000"
                        className="w-full bg-secondary border border-border rounded-xl p-4 pr-20 text-lg"
                      />
                      <button
                        onClick={() => setBondAmount(ahBalance || '0')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-primary"
                      >
                        MAX
                      </button>
                    </div>
                  </div>

                  <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                    <p className="text-yellow-400 text-xs">{t('staking.bondWarning')}</p>
                  </div>

                  <button
                    onClick={handleBond}
                    disabled={isProcessing || !bondAmount || parseFloat(bondAmount) <= 0}
                    className="w-full py-4 bg-green-600 text-white rounded-xl font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isProcessing ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Lock className="w-5 h-5" />
                    )}
                    {isProcessing
                      ? t('staking.bonding')
                      : stakingInfo
                        ? t('staking.bondExtra')
                        : t('staking.bondButton')}
                  </button>
                </div>
              )}

              {/* Nominate Tab */}
              {activeTab === 'nominate' && (
                <div className="space-y-4">
                  {!stakingInfo ? (
                    <div className="text-center py-8">
                      <AlertCircle className="w-12 h-12 text-yellow-400 mx-auto mb-4" />
                      <p className="text-muted-foreground">{t('staking.bondFirst')}</p>
                    </div>
                  ) : (
                    <>
                      <div className="text-sm text-muted-foreground mb-2">
                        {t('staking.selectValidators', { count: selectedValidators.length })}
                      </div>

                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {validators.map((v) => (
                          <button
                            key={v.address}
                            onClick={() => toggleValidator(v.address)}
                            className={cn(
                              'w-full p-3 rounded-xl border text-left transition-all',
                              selectedValidators.includes(v.address)
                                ? 'border-green-500 bg-green-500/10'
                                : 'border-border bg-secondary/50'
                            )}
                          >
                            <div className="font-mono text-xs truncate">
                              {v.address.slice(0, 16)}...{v.address.slice(-8)}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {t('staking.commission')} {v.commission.toFixed(2)}%
                            </div>
                          </button>
                        ))}
                      </div>

                      <button
                        onClick={handleNominate}
                        disabled={isProcessing || selectedValidators.length === 0}
                        className="w-full py-4 bg-blue-600 text-white rounded-xl font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {isProcessing ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <Users className="w-5 h-5" />
                        )}
                        {isProcessing ? t('staking.nominating') : t('staking.nominateButton')}
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* Unbond Tab */}
              {activeTab === 'unbond' && (
                <div className="space-y-4">
                  {!stakingInfo ? (
                    <div className="text-center py-8">
                      <AlertCircle className="w-12 h-12 text-yellow-400 mx-auto mb-4" />
                      <p className="text-muted-foreground">{t('staking.notStakedUnbond')}</p>
                    </div>
                  ) : (
                    <>
                      <div className="bg-secondary/50 rounded-xl p-4">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">{t('staking.activeStake')}</span>
                          <span className="text-green-400">
                            {formatHEZ(stakingInfo.active)} HEZ
                          </span>
                        </div>
                      </div>

                      <div>
                        <label className="text-sm text-muted-foreground mb-2 block">
                          {t('staking.amountHez')}
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            value={unbondAmount}
                            onChange={(e) => setUnbondAmount(e.target.value)}
                            placeholder="0.0000"
                            className="w-full bg-secondary border border-border rounded-xl p-4 pr-20 text-lg"
                          />
                          <button
                            onClick={() => setUnbondAmount(formatHEZ(stakingInfo.active))}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-primary"
                          >
                            MAX
                          </button>
                        </div>
                      </div>

                      <div className="p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg">
                        <p className="text-orange-400 text-xs">{t('staking.unbondWarning')}</p>
                      </div>

                      <button
                        onClick={handleUnbond}
                        disabled={isProcessing || !unbondAmount || parseFloat(unbondAmount) <= 0}
                        className="w-full py-4 bg-orange-500 text-white rounded-xl font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {isProcessing ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <Unlock className="w-5 h-5" />
                        )}
                        {isProcessing ? t('staking.unbondProcessing') : t('staking.unbondButton')}
                      </button>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
