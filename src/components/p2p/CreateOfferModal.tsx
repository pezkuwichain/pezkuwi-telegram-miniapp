import { useState, useEffect } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/i18n';
import { useTelegram } from '@/hooks/useTelegram';
import { createP2POffer, getPaymentMethods, getInternalBalance, type PaymentMethod } from '@/lib/p2p-api';

interface CreateOfferModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOfferCreated: () => void;
}

const FIAT_CURRENCIES = ['TRY', 'IQD', 'IRR', 'EUR', 'USD'];
const TOKENS: ('HEZ' | 'PEZ')[] = ['HEZ', 'PEZ'];
const TIME_LIMITS = [15, 30, 45, 60, 90, 120];

export function CreateOfferModal({ isOpen, onClose, onOfferCreated }: CreateOfferModalProps) {
  const { sessionToken } = useAuth();
  const { t, isRTL } = useTranslation();
  const { hapticImpact, hapticNotification } = useTelegram();

  const [adType, setAdType] = useState<'buy' | 'sell'>('sell');
  const [token, setToken] = useState<'HEZ' | 'PEZ'>('HEZ');
  const [amountCrypto, setAmountCrypto] = useState('');
  const [fiatCurrency, setFiatCurrency] = useState('TRY');
  const [fiatAmount, setFiatAmount] = useState('');
  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [paymentDetails, setPaymentDetails] = useState('');
  const [minOrder, setMinOrder] = useState('');
  const [maxOrder, setMaxOrder] = useState('');
  const [timeLimit, setTimeLimit] = useState(30);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [availableBalance, setAvailableBalance] = useState(0);

  useEffect(() => {
    if (!isOpen || !sessionToken) return;
    getPaymentMethods(sessionToken, fiatCurrency)
      .then(setPaymentMethods)
      .catch(console.error);
  }, [isOpen, sessionToken, fiatCurrency]);

  useEffect(() => {
    if (!isOpen || !sessionToken) return;
    getInternalBalance(sessionToken)
      .then((bals) => {
        const bal = bals.find((b) => b.token === token);
        setAvailableBalance(bal?.available_balance || 0);
      })
      .catch(console.error);
  }, [isOpen, sessionToken, token]);

  if (!isOpen) return null;

  const numAmount = parseFloat(amountCrypto) || 0;
  const numFiat = parseFloat(fiatAmount) || 0;
  const pricePerUnit = numAmount > 0 && numFiat > 0 ? numFiat / numAmount : 0;

  const isValid =
    numAmount > 0 &&
    numFiat > 0 &&
    paymentMethodId &&
    (adType === 'buy' || numAmount <= availableBalance);

  const handleCreate = async () => {
    if (!sessionToken || !isValid) return;
    setError('');
    setLoading(true);
    hapticImpact('medium');

    try {
      await createP2POffer({
        sessionToken,
        token,
        amountCrypto: numAmount,
        fiatCurrency,
        fiatAmount: numFiat,
        paymentMethodId,
        paymentDetailsEncrypted: btoa(paymentDetails),
        minOrderAmount: parseFloat(minOrder) || undefined,
        maxOrderAmount: parseFloat(maxOrder) || undefined,
        timeLimitMinutes: timeLimit,
        adType,
      });
      hapticNotification('success');
      onOfferCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create offer');
      hapticNotification('error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm">
      <div
        className={cn(
          'w-full max-w-md bg-card rounded-t-3xl border-t border-border overflow-hidden',
          isRTL && 'direction-rtl'
        )}
        dir={isRTL ? 'rtl' : 'ltr'}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">{t('p2p.createOffer')}</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-muted transition-colors">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
          {/* Ad Type Toggle */}
          <div className="flex rounded-xl bg-muted p-1">
            <button
              onClick={() => setAdType('sell')}
              className={cn(
                'flex-1 py-2 text-sm font-medium rounded-lg transition-colors',
                adType === 'sell' ? 'bg-red-500 text-white' : 'text-muted-foreground'
              )}
            >
              {t('p2p.sell')}
            </button>
            <button
              onClick={() => setAdType('buy')}
              className={cn(
                'flex-1 py-2 text-sm font-medium rounded-lg transition-colors',
                adType === 'buy' ? 'bg-green-500 text-white' : 'text-muted-foreground'
              )}
            >
              {t('p2p.buy')}
            </button>
          </div>

          {/* Token + Currency */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">{t('p2p.token')}</label>
              <select
                value={token}
                onChange={(e) => setToken(e.target.value as 'HEZ' | 'PEZ')}
                className="w-full bg-muted rounded-xl px-3 py-2.5 text-sm text-foreground border border-border"
              >
                {TOKENS.map((tk) => (
                  <option key={tk} value={tk}>{tk}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">{t('p2p.fiatCurrency')}</label>
              <select
                value={fiatCurrency}
                onChange={(e) => setFiatCurrency(e.target.value)}
                className="w-full bg-muted rounded-xl px-3 py-2.5 text-sm text-foreground border border-border"
              >
                {FIAT_CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Amount Crypto */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              {t('p2p.amount')} ({token})
              {adType === 'sell' && (
                <span className="text-cyan-400 ml-1">
                  ({t('p2p.available')}: {availableBalance.toLocaleString()})
                </span>
              )}
            </label>
            <input
              type="number"
              value={amountCrypto}
              onChange={(e) => setAmountCrypto(e.target.value)}
              placeholder="0.00"
              className="w-full bg-muted rounded-xl px-4 py-2.5 text-foreground border border-border focus:border-cyan-500 focus:outline-none"
              step="any"
            />
          </div>

          {/* Fiat Amount */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">{t('p2p.fiatTotal')} ({fiatCurrency})</label>
            <input
              type="number"
              value={fiatAmount}
              onChange={(e) => setFiatAmount(e.target.value)}
              placeholder="0.00"
              className="w-full bg-muted rounded-xl px-4 py-2.5 text-foreground border border-border focus:border-cyan-500 focus:outline-none"
              step="any"
            />
            {pricePerUnit > 0 && (
              <p className="text-xs text-cyan-400 mt-1">
                {t('p2p.pricePerUnit')}: {pricePerUnit.toLocaleString(undefined, { maximumFractionDigits: 2 })} {fiatCurrency}/{token}
              </p>
            )}
          </div>

          {/* Payment Method */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">{t('p2p.paymentMethod')}</label>
            <select
              value={paymentMethodId}
              onChange={(e) => setPaymentMethodId(e.target.value)}
              className="w-full bg-muted rounded-xl px-3 py-2.5 text-sm text-foreground border border-border"
            >
              <option value="">{t('p2p.selectPaymentMethod')}</option>
              {paymentMethods.map((pm) => (
                <option key={pm.id} value={pm.id}>{pm.method_name}</option>
              ))}
            </select>
          </div>

          {/* Payment Details */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">{t('p2p.paymentDetails')}</label>
            <textarea
              value={paymentDetails}
              onChange={(e) => setPaymentDetails(e.target.value)}
              placeholder={t('p2p.paymentDetailsPlaceholder')}
              rows={2}
              className="w-full bg-muted rounded-xl px-4 py-2.5 text-foreground border border-border focus:border-cyan-500 focus:outline-none resize-none text-sm"
            />
          </div>

          {/* Order Limits */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">{t('p2p.minOrder')}</label>
              <input
                type="number"
                value={minOrder}
                onChange={(e) => setMinOrder(e.target.value)}
                placeholder="0"
                className="w-full bg-muted rounded-xl px-3 py-2.5 text-sm text-foreground border border-border focus:border-cyan-500 focus:outline-none"
                step="any"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">{t('p2p.maxOrder')}</label>
              <input
                type="number"
                value={maxOrder}
                onChange={(e) => setMaxOrder(e.target.value)}
                placeholder={amountCrypto || '0'}
                className="w-full bg-muted rounded-xl px-3 py-2.5 text-sm text-foreground border border-border focus:border-cyan-500 focus:outline-none"
                step="any"
              />
            </div>
          </div>

          {/* Time Limit */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">{t('p2p.timeLimit')}</label>
            <select
              value={timeLimit}
              onChange={(e) => setTimeLimit(parseInt(e.target.value))}
              className="w-full bg-muted rounded-xl px-3 py-2.5 text-sm text-foreground border border-border"
            >
              {TIME_LIMITS.map((tl) => (
                <option key={tl} value={tl}>{tl} {t('p2p.minutes')}</option>
              ))}
            </select>
          </div>

          {/* Balance Warning */}
          {adType === 'sell' && numAmount > availableBalance && (
            <div className="flex items-start gap-2 text-xs text-red-400 bg-red-500/10 rounded-xl p-3">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{t('p2p.insufficientBalance')}</span>
            </div>
          )}

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
            onClick={handleCreate}
            disabled={!isValid || loading}
            className={cn(
              'w-full py-3 rounded-xl font-medium text-white transition-colors',
              isValid && !loading
                ? 'bg-cyan-500 hover:bg-cyan-600'
                : 'bg-muted text-muted-foreground cursor-not-allowed'
            )}
          >
            {loading ? t('common.loading') : t('p2p.createOffer')}
          </button>
        </div>
      </div>
    </div>
  );
}
