import { useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/i18n';
import { useTelegram } from '@/hooks/useTelegram';
import { openDispute } from '@/lib/p2p-api';

interface DisputeModalProps {
  isOpen: boolean;
  onClose: () => void;
  tradeId: string;
  onDisputeOpened: () => void;
}

const DISPUTE_CATEGORIES = [
  'payment_not_received',
  'wrong_amount',
  'fake_payment_proof',
  'other',
] as const;

export function DisputeModal({ isOpen, onClose, tradeId, onDisputeOpened }: DisputeModalProps) {
  const { sessionToken } = useAuth();
  const { t, isRTL } = useTranslation();
  const { hapticImpact, hapticNotification } = useTelegram();

  const [category, setCategory] = useState<string>('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const isValid = category && reason.trim().length >= 10;

  const handleSubmit = async () => {
    if (!sessionToken || !isValid) return;
    setError('');
    setLoading(true);
    hapticImpact('heavy');

    try {
      await openDispute(sessionToken, tradeId, reason.trim(), category);
      hapticNotification('warning');
      onDisputeOpened();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open dispute');
      hapticNotification('error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div
        className={cn(
          'w-full max-w-md bg-card rounded-2xl shadow-xl border border-border overflow-hidden',
          isRTL && 'direction-rtl'
        )}
        dir={isRTL ? 'rtl' : 'ltr'}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            <h2 className="text-lg font-semibold text-foreground">{t('p2p.openDispute')}</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-muted transition-colors">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Warning */}
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3">
            <p className="text-xs text-amber-400">{t('p2p.disputeWarning')}</p>
          </div>

          {/* Category */}
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">
              {t('p2p.disputeCategory')}
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full bg-muted rounded-xl px-3 py-2.5 text-sm text-foreground border border-border"
            >
              <option value="">{t('p2p.selectCategory')}</option>
              {DISPUTE_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {t(`p2p.dispute.${cat}`)}
                </option>
              ))}
            </select>
          </div>

          {/* Reason */}
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">
              {t('p2p.disputeReason')}
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('p2p.disputeReasonPlaceholder')}
              rows={3}
              className="w-full bg-muted rounded-xl px-4 py-2.5 text-foreground border border-border focus:border-amber-500 focus:outline-none resize-none text-sm"
              maxLength={2000}
            />
            <p className="text-xs text-muted-foreground mt-1">
              {reason.length}/2000 ({t('p2p.minChars', { count: '10' })})
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-sm text-red-400">
              {error}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 p-4 pt-0">
          <button
            onClick={onClose}
            className="flex-1 py-3 bg-muted hover:bg-muted/80 text-foreground font-medium rounded-xl transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!isValid || loading}
            className={cn(
              'flex-1 py-3 font-medium rounded-xl transition-colors text-white',
              isValid && !loading
                ? 'bg-amber-500 hover:bg-amber-600'
                : 'bg-muted text-muted-foreground cursor-not-allowed'
            )}
          >
            {loading ? t('common.loading') : t('p2p.submitDispute')}
          </button>
        </div>
      </div>
    </div>
  );
}
