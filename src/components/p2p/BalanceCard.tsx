import { useState, useEffect, useCallback } from 'react';
import { Wallet, Lock, RefreshCw, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/i18n';
import { useTelegram } from '@/hooks/useTelegram';
import { getInternalBalance, type InternalBalance } from '@/lib/p2p-api';

interface BalanceCardProps {
  onRefresh?: () => void;
  onDeposit?: () => void;
  onWithdraw?: () => void;
  onBalancesLoaded?: (balances: InternalBalance[]) => void;
}

export function BalanceCard({
  onRefresh,
  onDeposit,
  onWithdraw,
  onBalancesLoaded,
}: BalanceCardProps) {
  const { sessionToken } = useAuth();
  const { t, isRTL } = useTranslation();
  const { hapticImpact } = useTelegram();

  const [balances, setBalances] = useState<InternalBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchBalances = useCallback(async () => {
    if (!sessionToken) return;
    try {
      const data = await getInternalBalance(sessionToken);
      setBalances(data);
      onBalancesLoaded?.(data);
    } catch (err) {
      console.error('Failed to fetch balances:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [sessionToken, onBalancesLoaded]);

  useEffect(() => {
    fetchBalances();
  }, [fetchBalances]);

  const handleRefresh = () => {
    hapticImpact('light');
    setRefreshing(true);
    fetchBalances();
    onRefresh?.();
  };

  const formatBalance = (val: number) => {
    return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  };

  return (
    <div
      className={cn(
        'bg-gradient-to-br from-cyan-500/20 to-blue-600/20 rounded-2xl border border-cyan-500/30 p-4',
        isRTL && 'direction-rtl'
      )}
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Wallet className="w-5 h-5 text-cyan-400" />
          <h3 className="text-sm font-semibold text-foreground">{t('p2p.internalBalance')}</h3>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="p-1.5 rounded-full hover:bg-muted/50 transition-colors"
        >
          <RefreshCw
            className={cn('w-4 h-4 text-muted-foreground', refreshing && 'animate-spin')}
          />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-4">
          <div className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : balances.length === 0 ? (
        <div className="text-center py-3">
          <p className="text-xs text-muted-foreground">{t('p2p.noBalance')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {balances.map((bal) => (
            <div key={bal.token} className="bg-card/50 rounded-xl p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-bold text-foreground">{bal.token}</span>
                <span className="text-sm font-bold text-foreground">
                  {formatBalance(bal.available_balance + bal.locked_balance)}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Wallet className="w-3 h-3" />
                  {t('p2p.available')}: {formatBalance(bal.available_balance)}
                </span>
                <span className="flex items-center gap-1">
                  <Lock className="w-3 h-3" />
                  {t('p2p.locked')}: {formatBalance(bal.locked_balance)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Deposit / Withdraw buttons */}
      <div className="flex gap-2 mt-3">
        <button
          onClick={() => {
            hapticImpact('light');
            onDeposit?.();
          }}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-green-500/10 hover:bg-green-500/20 border border-green-500/30 text-green-400 text-xs font-medium rounded-lg transition-colors"
        >
          <ArrowDownToLine className="w-3.5 h-3.5" />
          {t('p2p.deposit')}
        </button>
        <button
          onClick={() => {
            hapticImpact('light');
            onWithdraw?.();
          }}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/30 text-orange-400 text-xs font-medium rounded-lg transition-colors"
        >
          <ArrowUpFromLine className="w-3.5 h-3.5" />
          {t('p2p.withdraw')}
        </button>
      </div>
    </div>
  );
}
