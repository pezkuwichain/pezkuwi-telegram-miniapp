import { useState } from 'react';
import {
  X,
  ArrowDownToLine,
  ArrowUpFromLine,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Wallet,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useWallet } from '@/contexts/WalletContext';
import { useTranslation } from '@/i18n';
import { useTelegram } from '@/hooks/useTelegram';
import { verifyDeposit, requestWithdraw } from '@/lib/p2p-api';

const PLATFORM_WALLET = '5H18ZZBU4LwPYbeEZ1JBGvibCU2edhhM8HNUtFi7GgC36CgS';

const WITHDRAW_FEE: Record<string, number> = {
  HEZ: 0.1,
  PEZ: 1,
};

const MIN_WITHDRAW: Record<string, number> = {
  HEZ: 1,
  PEZ: 10,
};

interface DepositWithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'deposit' | 'withdraw';
  availableBalances?: Record<string, number>;
  onSuccess?: () => void;
}

type DepositStep = 'form' | 'sending' | 'verifying' | 'success' | 'error';

export function DepositWithdrawModal({
  isOpen,
  onClose,
  initialTab = 'deposit',
  availableBalances = {},
  onSuccess,
}: DepositWithdrawModalProps) {
  const { sessionToken } = useAuth();
  const { address, isConnected, keypair, assetHubApi } = useWallet();
  const { t, isRTL } = useTranslation();
  const { hapticImpact, hapticNotification } = useTelegram();

  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw'>(initialTab);

  // Deposit state
  const [depositToken, setDepositToken] = useState<'HEZ' | 'PEZ'>('HEZ');
  const [depositAmount, setDepositAmount] = useState('');
  const [depositStep, setDepositStep] = useState<DepositStep>('form');
  const [depositError, setDepositError] = useState('');
  const [depositResult, setDepositResult] = useState<{ amount: number; token: string } | null>(
    null
  );

  // Withdraw state
  const [withdrawToken, setWithdrawToken] = useState<'HEZ' | 'PEZ'>('HEZ');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawAddress, setWithdrawAddress] = useState(address || '');
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [withdrawError, setWithdrawError] = useState('');
  const [withdrawSuccess, setWithdrawSuccess] = useState(false);

  const canDeposit = isConnected && !!keypair && !!assetHubApi;

  const handleDeposit = async () => {
    if (!sessionToken || !depositAmount || !assetHubApi || !keypair) return;

    const amount = parseFloat(depositAmount);
    if (isNaN(amount) || amount <= 0) {
      setDepositError(t('p2p.depositInvalidAmount'));
      return;
    }

    hapticImpact('medium');
    setDepositStep('sending');
    setDepositError('');

    try {
      const amountPlanck = BigInt(Math.floor(amount * 1e12));

      // Create transaction on Asset Hub
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let tx: any;
      if (depositToken === 'HEZ') {
        // Native token transfer on Asset Hub
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tx = (assetHubApi.tx.balances as any).transferKeepAlive(
          PLATFORM_WALLET,
          amountPlanck.toString()
        );
      } else {
        // PEZ = asset ID 1 on Asset Hub
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tx = (assetHubApi.tx.assets as any).transfer(1, PLATFORM_WALLET, amountPlanck.toString());
      }

      // Send TX and wait for finalization, capture block number for fast verification
      const { txHash, blockNumber } = await new Promise<{
        txHash: string;
        blockNumber: number;
      }>((resolve, reject) => {
        tx.signAndSend(
          keypair,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          async (result: any) => {
            if (result.dispatchError) {
              if (result.dispatchError.isModule) {
                const decoded = assetHubApi!.registry.findMetaError(result.dispatchError.asModule);
                reject(new Error(`${decoded.section}.${decoded.name}`));
              } else {
                reject(new Error(result.dispatchError.toString()));
              }
              return;
            }
            if (result.status.isFinalized) {
              try {
                // Get block number from finalized block hash for fast verification
                const header = await assetHubApi!.rpc.chain.getHeader(result.status.asFinalized);
                resolve({
                  txHash: result.txHash.toHex(),
                  blockNumber: header.number.toNumber(),
                });
              } catch {
                // Fallback: resolve without block number
                resolve({ txHash: result.txHash.toHex(), blockNumber: 0 });
              }
            }
          }
        ).catch(reject);
      });

      // TX finalized, now verify deposit on backend
      setDepositStep('verifying');

      const result = await verifyDeposit(
        sessionToken,
        txHash,
        depositToken,
        amount,
        blockNumber || undefined
      );

      setDepositResult({ amount: result.amount, token: result.token });
      setDepositStep('success');
      hapticNotification('success');
      onSuccess?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setDepositError(message);
      setDepositStep('error');
      hapticNotification('error');
    }
  };

  const handleWithdraw = async () => {
    if (!sessionToken || !withdrawAmount || !withdrawAddress) return;

    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount <= 0) {
      setWithdrawError(t('p2p.depositInvalidAmount'));
      return;
    }

    if (amount < MIN_WITHDRAW[withdrawToken]) {
      setWithdrawError(`${t('p2p.minWithdraw')}: ${MIN_WITHDRAW[withdrawToken]} ${withdrawToken}`);
      return;
    }

    const available = availableBalances[withdrawToken] || 0;
    if (amount > available) {
      setWithdrawError(t('p2p.insufficientBalance'));
      return;
    }

    hapticImpact('medium');
    setWithdrawLoading(true);
    setWithdrawError('');

    try {
      await requestWithdraw(sessionToken, withdrawToken, amount, withdrawAddress.trim());
      setWithdrawSuccess(true);
      hapticNotification('success');
      onSuccess?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setWithdrawError(message);
      hapticNotification('error');
    } finally {
      setWithdrawLoading(false);
    }
  };

  const resetDeposit = () => {
    setDepositStep('form');
    setDepositError('');
    setDepositResult(null);
    setDepositAmount('');
  };

  const resetWithdraw = () => {
    setWithdrawError('');
    setWithdrawSuccess(false);
    setWithdrawAmount('');
  };

  const handleClose = () => {
    resetDeposit();
    resetWithdraw();
    onClose();
  };

  if (!isOpen) return null;

  const fee = WITHDRAW_FEE[withdrawToken] || 0;
  const withdrawNum = parseFloat(withdrawAmount) || 0;
  const netAmount = Math.max(0, withdrawNum - fee);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={handleClose} />

      {/* Modal */}
      <div
        className={cn(
          'relative w-full max-w-md max-h-[90vh] bg-card rounded-t-2xl sm:rounded-2xl border border-border overflow-y-auto',
          isRTL && 'direction-rtl'
        )}
        dir={isRTL ? 'rtl' : 'ltr'}
      >
        {/* Header */}
        <div className="sticky top-0 bg-card z-10 flex items-center justify-between p-4 border-b border-border">
          <div className="flex rounded-lg bg-muted p-0.5">
            <button
              onClick={() => {
                setActiveTab('deposit');
                hapticImpact('light');
              }}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                activeTab === 'deposit'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground'
              )}
            >
              <ArrowDownToLine className="w-3.5 h-3.5" />
              {t('p2p.deposit')}
            </button>
            <button
              onClick={() => {
                setActiveTab('withdraw');
                hapticImpact('light');
              }}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                activeTab === 'withdraw'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground'
              )}
            >
              <ArrowUpFromLine className="w-3.5 h-3.5" />
              {t('p2p.withdraw')}
            </button>
          </div>
          <button onClick={handleClose} className="p-1.5 rounded-full hover:bg-muted/50">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* ── Deposit Tab ── */}
          {activeTab === 'deposit' && (
            <>
              {!canDeposit ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-3">
                  <Wallet className="w-12 h-12 text-muted-foreground/50" />
                  <p className="text-sm font-medium text-foreground">
                    {t('p2p.walletNotConnected')}
                  </p>
                  <p className="text-xs text-muted-foreground text-center">
                    {t('p2p.connectWalletFirst')}
                  </p>
                </div>
              ) : depositStep === 'form' ? (
                <>
                  {/* Instructions */}
                  <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-xl p-3">
                    <p className="text-xs text-cyan-300">{t('p2p.depositInstructions')}</p>
                  </div>

                  {/* Token select */}
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      {t('p2p.selectToken')}
                    </label>
                    <div className="flex gap-2">
                      {(['HEZ', 'PEZ'] as const).map((tok) => (
                        <button
                          key={tok}
                          onClick={() => setDepositToken(tok)}
                          className={cn(
                            'flex-1 py-2 text-sm font-medium rounded-lg border transition-colors',
                            depositToken === tok
                              ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400'
                              : 'border-border text-muted-foreground'
                          )}
                        >
                          {tok}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Amount */}
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      {t('p2p.amount')} ({depositToken})
                    </label>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-muted rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-cyan-500"
                    />
                  </div>

                  {/* Deposit button */}
                  <button
                    onClick={handleDeposit}
                    disabled={!depositAmount || !sessionToken}
                    className="w-full py-3 bg-cyan-500 hover:bg-cyan-600 disabled:bg-muted disabled:text-muted-foreground text-white font-medium rounded-xl transition-colors"
                  >
                    {t('p2p.deposit')}
                  </button>
                </>
              ) : depositStep === 'sending' ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-3">
                  <Loader2 className="w-10 h-10 text-cyan-400 animate-spin" />
                  <p className="text-sm text-foreground">{t('p2p.depositSending')}</p>
                  <p className="text-xs text-muted-foreground text-center">
                    {t('p2p.depositSendingDesc')}
                  </p>
                </div>
              ) : depositStep === 'verifying' ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-3">
                  <Loader2 className="w-10 h-10 text-cyan-400 animate-spin" />
                  <p className="text-sm text-foreground">{t('p2p.verifying')}</p>
                  <p className="text-xs text-muted-foreground text-center">
                    {t('p2p.verifyingDesc')}
                  </p>
                </div>
              ) : depositStep === 'success' && depositResult ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-3">
                  <CheckCircle2 className="w-12 h-12 text-green-400" />
                  <p className="text-lg font-bold text-foreground">{t('p2p.depositSuccess')}</p>
                  <p className="text-sm text-muted-foreground">
                    +{depositResult.amount} {depositResult.token}
                  </p>
                  <button
                    onClick={handleClose}
                    className="mt-4 px-6 py-2.5 bg-cyan-500 hover:bg-cyan-600 text-white font-medium rounded-xl transition-colors"
                  >
                    {t('common.close')}
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 space-y-3">
                  <AlertCircle className="w-12 h-12 text-red-400" />
                  <p className="text-lg font-bold text-foreground">{t('p2p.depositFailed')}</p>
                  <p className="text-xs text-red-400 text-center max-w-xs">{depositError}</p>
                  <button
                    onClick={resetDeposit}
                    className="mt-4 px-6 py-2.5 bg-muted hover:bg-muted/70 text-foreground font-medium rounded-xl transition-colors"
                  >
                    {t('common.retry')}
                  </button>
                </div>
              )}
            </>
          )}

          {/* ── Withdraw Tab ── */}
          {activeTab === 'withdraw' && (
            <>
              {withdrawSuccess ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-3">
                  <CheckCircle2 className="w-12 h-12 text-green-400" />
                  <p className="text-lg font-bold text-foreground">{t('p2p.withdrawSuccess')}</p>
                  <p className="text-xs text-muted-foreground text-center">
                    {t('p2p.withdrawProcessing')}
                  </p>
                  <button
                    onClick={handleClose}
                    className="mt-4 px-6 py-2.5 bg-cyan-500 hover:bg-cyan-600 text-white font-medium rounded-xl transition-colors"
                  >
                    {t('common.close')}
                  </button>
                </div>
              ) : (
                <>
                  {/* Token select */}
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      {t('p2p.selectToken')}
                    </label>
                    <div className="flex gap-2">
                      {(['HEZ', 'PEZ'] as const).map((tok) => (
                        <button
                          key={tok}
                          onClick={() => {
                            setWithdrawToken(tok);
                            setWithdrawAmount('');
                            setWithdrawError('');
                          }}
                          className={cn(
                            'flex-1 py-2 text-sm font-medium rounded-lg border transition-colors',
                            withdrawToken === tok
                              ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400'
                              : 'border-border text-muted-foreground'
                          )}
                        >
                          {tok}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Amount */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs text-muted-foreground">
                        {t('p2p.withdrawAmount')} ({withdrawToken})
                      </label>
                      <button
                        onClick={() =>
                          setWithdrawAmount(String(availableBalances[withdrawToken] || 0))
                        }
                        className="text-xs text-cyan-400 hover:text-cyan-300"
                      >
                        {t('p2p.maxAvailable')}:{' '}
                        {(availableBalances[withdrawToken] || 0).toFixed(2)}
                      </button>
                    </div>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={withdrawAmount}
                      onChange={(e) => {
                        setWithdrawAmount(e.target.value);
                        setWithdrawError('');
                      }}
                      placeholder="0.00"
                      className="w-full bg-muted rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-cyan-500"
                    />
                  </div>

                  {/* Wallet address */}
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      {t('p2p.walletAddress')}
                    </label>
                    <input
                      type="text"
                      value={withdrawAddress}
                      onChange={(e) => setWithdrawAddress(e.target.value)}
                      placeholder="5..."
                      className="w-full bg-muted rounded-lg px-3 py-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-cyan-500 font-mono"
                    />
                  </div>

                  {/* Fee info */}
                  <div className="bg-muted rounded-xl p-3 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{t('p2p.networkFee')}</span>
                      <span className="text-foreground">
                        {fee} {withdrawToken}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{t('p2p.netAmount')}</span>
                      <span className="text-foreground font-medium">
                        {netAmount.toFixed(4)} {withdrawToken}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{t('p2p.minWithdraw')}</span>
                      <span className="text-foreground">
                        {MIN_WITHDRAW[withdrawToken]} {withdrawToken}
                      </span>
                    </div>
                  </div>

                  {/* Error */}
                  {withdrawError && (
                    <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg p-2.5">
                      <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                      <p className="text-xs text-red-400">{withdrawError}</p>
                    </div>
                  )}

                  {/* Withdraw button */}
                  <button
                    onClick={handleWithdraw}
                    disabled={
                      withdrawLoading || !withdrawAmount || !withdrawAddress || !sessionToken
                    }
                    className="w-full py-3 bg-cyan-500 hover:bg-cyan-600 disabled:bg-muted disabled:text-muted-foreground text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
                  >
                    {withdrawLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {t('p2p.withdrawing')}
                      </>
                    ) : (
                      t('p2p.withdraw')
                    )}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
