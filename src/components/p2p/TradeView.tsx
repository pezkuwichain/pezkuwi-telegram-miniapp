import { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  MessageCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/i18n';
import { useTelegram } from '@/hooks/useTelegram';
import {
  getP2PTrades,
  markTradePaid,
  confirmTradePayment,
  cancelTrade,
  type P2PTrade,
} from '@/lib/p2p-api';
import { TradeChat } from './TradeChat';
import { DisputeModal } from './DisputeModal';

interface TradeViewProps {
  tradeId?: string;
  onBack: () => void;
}

const STATUS_CONFIG: Record<string, { color: string; icon: typeof Clock }> = {
  pending: { color: 'text-amber-400', icon: Clock },
  payment_sent: { color: 'text-blue-400', icon: Clock },
  completed: { color: 'text-green-400', icon: CheckCircle2 },
  cancelled: { color: 'text-red-400', icon: XCircle },
  disputed: { color: 'text-orange-400', icon: AlertTriangle },
  refunded: { color: 'text-gray-400', icon: XCircle },
};

export function TradeView({ tradeId, onBack }: TradeViewProps) {
  const { sessionToken, authUserId } = useAuth();
  const { t, isRTL } = useTranslation();
  const { hapticImpact, hapticNotification } = useTelegram();

  const [trade, setTrade] = useState<P2PTrade | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showDispute, setShowDispute] = useState(false);
  const [error, setError] = useState('');

  // authUserId = auth.users UUID (matches trade.buyer_id / trade.seller_id)
  const isBuyer = trade?.buyer_id === authUserId;
  const isSeller = trade?.seller_id === authUserId;

  const fetchTrade = useCallback(async () => {
    if (!sessionToken || !tradeId) return;
    try {
      const trades = await getP2PTrades(sessionToken, 'all');
      const found = trades.find((tr) => tr.id === tradeId);
      if (found) setTrade(found);
    } catch (err) {
      console.error('Failed to fetch trade:', err);
    } finally {
      setLoading(false);
    }
  }, [sessionToken, tradeId]);

  useEffect(() => {
    fetchTrade();
    const interval = setInterval(fetchTrade, 15000);
    return () => clearInterval(interval);
  }, [fetchTrade]);

  // Countdown timer
  const [timeRemaining, setTimeRemaining] = useState('');
  useEffect(() => {
    if (!trade) return;
    const deadline =
      trade.status === 'pending'
        ? trade.payment_deadline
        : trade.status === 'payment_sent'
          ? trade.confirmation_deadline
          : null;
    if (!deadline) {
      setTimeRemaining('');
      return;
    }

    const update = () => {
      const diff = new Date(deadline).getTime() - Date.now();
      if (diff <= 0) {
        setTimeRemaining(t('p2p.expired'));
        return;
      }
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setTimeRemaining(`${mins}:${secs.toString().padStart(2, '0')}`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [trade, t]);

  const handleMarkPaid = async () => {
    if (!sessionToken || !trade) return;
    setActionLoading(true);
    setError('');
    hapticImpact('medium');
    try {
      await markTradePaid(sessionToken, trade.id);
      hapticNotification('success');
      fetchTrade();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
      hapticNotification('error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!sessionToken || !trade) return;
    setActionLoading(true);
    setError('');
    hapticImpact('heavy');
    try {
      await confirmTradePayment(sessionToken, trade.id);
      hapticNotification('success');
      fetchTrade();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
      hapticNotification('error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!sessionToken || !trade) return;
    setActionLoading(true);
    setError('');
    hapticImpact('medium');
    try {
      await cancelTrade(sessionToken, trade.id);
      hapticNotification('success');
      fetchTrade();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
      hapticNotification('error');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!trade) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-muted-foreground">{t('p2p.tradeNotFound')}</p>
        <button onClick={onBack} className="text-cyan-400 text-sm mt-2">
          {t('common.back')}
        </button>
      </div>
    );
  }

  const statusConfig = STATUS_CONFIG[trade.status] || STATUS_CONFIG.pending;
  const StatusIcon = statusConfig.icon;

  return (
    <div className={cn('space-y-4', isRTL && 'direction-rtl')} dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 rounded-full hover:bg-muted transition-colors">
          <ArrowLeft className="w-5 h-5 text-muted-foreground" />
        </button>
        <h2 className="text-lg font-semibold text-foreground">{t('p2p.tradeDetails')}</h2>
      </div>

      {/* Status Banner */}
      <div
        className={cn(
          'flex items-center gap-2 p-3 rounded-xl',
          `${statusConfig.color} bg-current/10`
        )}
      >
        <StatusIcon className={cn('w-5 h-5', statusConfig.color)} />
        <span className={cn('text-sm font-medium', statusConfig.color)}>
          {t(`p2p.status.${trade.status}`)}
        </span>
        {timeRemaining && (
          <span className={cn('text-xs ml-auto', statusConfig.color)}>
            {t('p2p.timeRemaining')}: {timeRemaining}
          </span>
        )}
      </div>

      {/* Trade Info */}
      <div className="bg-card rounded-xl border border-border p-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">{t('p2p.role')}</span>
          <span className="font-medium text-foreground">
            {isBuyer ? t('p2p.buyer') : t('p2p.seller')}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">{t('p2p.cryptoAmount')}</span>
          <span className="font-medium text-foreground">
            {trade.crypto_amount} {trade.token || ''}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">{t('p2p.fiatAmount')}</span>
          <span className="font-medium text-foreground">
            {trade.fiat_amount?.toLocaleString()} {trade.fiat_currency || ''}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">{t('p2p.pricePerUnit')}</span>
          <span className="font-medium text-foreground">
            {trade.price_per_unit?.toLocaleString()} {trade.fiat_currency || ''}
          </span>
        </div>
      </div>

      {/* Timeline */}
      <div className="bg-card rounded-xl border border-border p-4 space-y-3">
        <h3 className="text-sm font-medium text-foreground">{t('p2p.timeline')}</h3>
        <TimelineStep done label={t('p2p.tradeCreated')} time={trade.created_at} />
        <TimelineStep
          done={!!trade.buyer_marked_paid_at}
          active={trade.status === 'pending'}
          label={t('p2p.paymentSent')}
          time={trade.buyer_marked_paid_at}
        />
        <TimelineStep
          done={!!trade.seller_confirmed_at}
          active={trade.status === 'payment_sent'}
          label={t('p2p.paymentConfirmed')}
          time={trade.seller_confirmed_at}
        />
        <TimelineStep
          done={trade.status === 'completed'}
          label={t('p2p.tradeCompleted')}
          time={trade.completed_at}
        />
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Action Buttons */}
      <div className="space-y-2">
        {/* Buyer: Mark as paid */}
        {isBuyer && trade.status === 'pending' && (
          <button
            onClick={handleMarkPaid}
            disabled={actionLoading}
            className="w-full py-3 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-xl transition-colors disabled:opacity-50"
          >
            {actionLoading ? t('common.loading') : t('p2p.markPaid')}
          </button>
        )}

        {/* Seller: Confirm payment received */}
        {isSeller && trade.status === 'payment_sent' && (
          <button
            onClick={handleConfirm}
            disabled={actionLoading}
            className="w-full py-3 bg-green-500 hover:bg-green-600 text-white font-medium rounded-xl transition-colors disabled:opacity-50"
          >
            {actionLoading ? t('common.loading') : t('p2p.confirmReceived')}
          </button>
        )}

        {/* Cancel (buyer only, pending status) */}
        {isBuyer && trade.status === 'pending' && (
          <button
            onClick={handleCancel}
            disabled={actionLoading}
            className="w-full py-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 font-medium rounded-xl transition-colors disabled:opacity-50"
          >
            {t('p2p.cancelTrade')}
          </button>
        )}

        {/* Chat */}
        {['pending', 'payment_sent', 'disputed'].includes(trade.status) && (
          <button
            onClick={() => setShowChat(true)}
            className="w-full py-3 bg-muted hover:bg-muted/80 text-foreground font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            <MessageCircle className="w-4 h-4" />
            {t('p2p.chat')}
          </button>
        )}

        {/* Dispute */}
        {['pending', 'payment_sent'].includes(trade.status) && (
          <button
            onClick={() => setShowDispute(true)}
            className="w-full py-2 text-sm text-amber-400 hover:text-amber-300 transition-colors"
          >
            {t('p2p.openDispute')}
          </button>
        )}
      </div>

      {/* Chat Modal */}
      {showChat && <TradeChat tradeId={trade.id} onClose={() => setShowChat(false)} />}

      {/* Dispute Modal */}
      <DisputeModal
        isOpen={showDispute}
        onClose={() => setShowDispute(false)}
        tradeId={trade.id}
        onDisputeOpened={() => {
          setShowDispute(false);
          fetchTrade();
        }}
      />
    </div>
  );
}

// Timeline step sub-component
function TimelineStep({
  done,
  active,
  label,
  time,
}: {
  done?: boolean;
  active?: boolean;
  label: string;
  time?: string | null;
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={cn(
          'w-3 h-3 rounded-full border-2 flex-shrink-0',
          done
            ? 'bg-green-400 border-green-400'
            : active
              ? 'border-cyan-400 animate-pulse'
              : 'border-muted-foreground/30'
        )}
      />
      <div className="flex-1">
        <p className={cn('text-sm', done ? 'text-foreground' : 'text-muted-foreground')}>{label}</p>
        {time && <p className="text-xs text-muted-foreground">{new Date(time).toLocaleString()}</p>}
      </div>
    </div>
  );
}
