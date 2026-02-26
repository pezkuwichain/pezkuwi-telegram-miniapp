import { useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useWallet } from '@/contexts/WalletContext';
import { useTranslation } from '@/i18n';
import { useTelegram } from '@/hooks/useTelegram';
import { acceptP2POffer, type P2POffer } from '@/lib/p2p-api';

interface TradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  offer: P2POffer | null;
  onTradeCreated: (tradeId: string) => void;
}

export function TradeModal({ isOpen, onClose, offer, onTradeCreated }: TradeModalProps) {
  const { sessionToken } = useAuth();
  const { address } = useWallet();
  const { t, isRTL } = useTranslation();
  const { hapticImpact, hapticNotification } = useTelegram();

  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen || !offer) return null;

  const numAmount = parseFloat(amount) || 0;
  const fiatTotal = numAmount > 0 && offer.price_per_unit
    ? numAmount * offer.price_per_unit
    : 0;

  const isValid =
    numAmount > 0 &&
    numAmount <= offer.remaining_amount &&
    (!offer.min_order_amount || numAmount >= offer.min_order_amount) &&
    (!offer.max_order_amount || numAmount <= offer.max_order_amount);

  const handleAccept = async () => {
    if (!sessionToken || !address || !isValid) return;
    setError('');
    setLoading(true);
    hapticImpact('medium');

    try {
      const result = await acceptP2POffer({
        sessionToken,
        offerId: offer.id,
        amount: numAmount,
        buyerWallet: address,
      });
      hapticNotification('success');
      onTradeCreated(result.tradeId);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept offer');
      hapticNotification('error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm">
      <div
        className={cn(
          'w-full max-w-md bg-card rounded-t-3xl border-t border-border overflow-hidden animate-in slide-in-from-bottom',
          isRTL && 'direction-rtl'
        )}
        dir={isRTL ? 'rtl' : 'ltr'}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">{t('p2p.acceptOffer')}</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-muted transition-colors">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Offer Summary */}
          <div className="bg-muted/50 rounded-xl p-3 space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t('p2p.token')}</span>
              <span className="font-medium text-foreground">{offer.token}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t('p2p.pricePerUnit')}</span>
              <span className="font-medium text-foreground">
                {offer.price_per_unit?.toLocaleString()} {offer.fiat_currency}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t('p2p.available')}</span>
              <span className="font-medium text-foreground">
                {offer.remaining_amount} {offer.token}
              </span>
            </div>
            {offer.payment_method_name && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t('p2p.paymentMethod')}</span>
                <span className="font-medium text-foreground">{offer.payment_method_name}</span>
              </div>
            )}
          </div>

          {/* Amount Input */}
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">{t('p2p.amount')} ({offer.token})</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={`${offer.min_order_amount || 0} - ${offer.max_order_amount || offer.remaining_amount}`}
              className="w-full bg-muted rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground/50 border border-border focus:border-cyan-500 focus:outline-none"
              step="any"
              min={offer.min_order_amount || 0}
              max={offer.max_order_amount || offer.remaining_amount}
            />
            <button
              onClick={() => setAmount(String(offer.max_order_amount || offer.remaining_amount))}
              className="text-xs text-cyan-400 mt-1 hover:text-cyan-300"
            >
              {t('p2p.max')}: {offer.max_order_amount || offer.remaining_amount} {offer.token}
            </button>
          </div>

          {/* Fiat Total */}
          {fiatTotal > 0 && (
            <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-xl p-3">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">{t('p2p.fiatTotal')}</span>
                <span className="text-lg font-bold text-cyan-400">
                  {fiatTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })} {offer.fiat_currency}
                </span>
              </div>
            </div>
          )}

          {/* Time Limit Warning */}
          <div className="flex items-start gap-2 text-xs text-amber-400/80">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{t('p2p.timeLimitWarning', { minutes: String(offer.time_limit_minutes) })}</span>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-sm text-red-400">
              {error}
            </div>
          )}
        </div>

        {/* Action */}
        <div className="p-4 pt-0">
          <button
            onClick={handleAccept}
            disabled={!isValid || loading}
            className={cn(
              'w-full py-3 rounded-xl font-medium text-white transition-colors',
              isValid && !loading
                ? 'bg-green-500 hover:bg-green-600'
                : 'bg-muted text-muted-foreground cursor-not-allowed'
            )}
          >
            {loading ? t('common.loading') : t('p2p.confirmAccept')}
          </button>
        </div>
      </div>
    </div>
  );
}
