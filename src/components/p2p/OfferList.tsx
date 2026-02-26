import { useState, useEffect } from 'react';
import { Star, Clock, ChevronDown, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/i18n';
import { useTelegram } from '@/hooks/useTelegram';
import { getP2POffers, type P2POffer } from '@/lib/p2p-api';

interface OfferListProps {
  adType: 'buy' | 'sell';
  onAcceptOffer: (offer: P2POffer) => void;
}

const FIAT_CURRENCIES = ['TRY', 'IQD', 'IRR', 'EUR', 'USD'];
const TOKENS = ['HEZ', 'PEZ'];

export function OfferList({ adType, onAcceptOffer }: OfferListProps) {
  const { sessionToken } = useAuth();
  const { t, isRTL } = useTranslation();
  const { hapticImpact } = useTelegram();

  const [offers, setOffers] = useState<P2POffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedCurrency, setSelectedCurrency] = useState<string>('');
  const [selectedToken, setSelectedToken] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);

  const limit = 20;

  const fetchOffers = async (p = 1) => {
    if (!sessionToken) return;
    setLoading(true);
    try {
      const result = await getP2POffers({
        sessionToken,
        adType,
        token: selectedToken || undefined,
        fiatCurrency: selectedCurrency || undefined,
        page: p,
        limit,
      });
      setOffers(result.offers);
      setTotal(result.total);
      setPage(p);
    } catch (err) {
      console.error('Failed to fetch offers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOffers(1);
  }, [sessionToken, adType, selectedCurrency, selectedToken]);

  const handleAccept = (offer: P2POffer) => {
    hapticImpact('medium');
    onAcceptOffer(offer);
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className={cn(isRTL && 'direction-rtl')} dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Filters Toggle */}
      <button
        onClick={() => setShowFilters(!showFilters)}
        className="flex items-center gap-1 text-xs text-muted-foreground mb-2 hover:text-foreground transition-colors"
      >
        <ChevronDown className={cn('w-3 h-3 transition-transform', showFilters && 'rotate-180')} />
        {t('p2p.filters')}
      </button>

      {showFilters && (
        <div className="flex flex-wrap gap-2 mb-3">
          <select
            value={selectedToken}
            onChange={(e) => setSelectedToken(e.target.value)}
            className="text-xs bg-muted rounded-lg px-2 py-1.5 border border-border text-foreground"
          >
            <option value="">{t('p2p.allTokens')}</option>
            {TOKENS.map((tk) => (
              <option key={tk} value={tk}>{tk}</option>
            ))}
          </select>
          <select
            value={selectedCurrency}
            onChange={(e) => setSelectedCurrency(e.target.value)}
            className="text-xs bg-muted rounded-lg px-2 py-1.5 border border-border text-foreground"
          >
            <option value="">{t('p2p.allCurrencies')}</option>
            {FIAT_CURRENCIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      )}

      {/* Offer List */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        </div>
      ) : offers.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground">{t('p2p.noOffers')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {offers.map((offer) => (
            <div
              key={offer.id}
              className="bg-card rounded-xl border border-border p-3 space-y-2"
            >
              {/* Top: Token + Price */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-foreground">{offer.token}</span>
                  <span className="text-xs text-muted-foreground">/ {offer.fiat_currency}</span>
                </div>
                <span className="text-sm font-bold text-cyan-400">
                  {offer.price_per_unit?.toLocaleString(undefined, { maximumFractionDigits: 2 })} {offer.fiat_currency}
                </span>
              </div>

              {/* Middle: Amount + Limits */}
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {t('p2p.available')}: {offer.remaining_amount} {offer.token}
                </span>
                <span>
                  {offer.min_order_amount && `${t('p2p.min')}: ${offer.min_order_amount}`}
                  {offer.min_order_amount && offer.max_order_amount && ' - '}
                  {offer.max_order_amount && `${t('p2p.max')}: ${offer.max_order_amount}`}
                </span>
              </div>

              {/* Bottom: Reputation + Payment + Action */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-xs">
                  {offer.seller_reputation && (
                    <span className="flex items-center gap-1 text-amber-400">
                      <Star className="w-3 h-3 fill-current" />
                      {offer.seller_reputation.completed_trades} {t('p2p.trades')}
                    </span>
                  )}
                  {offer.payment_method_name && (
                    <span className="text-muted-foreground">{offer.payment_method_name}</span>
                  )}
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    {offer.time_limit_minutes}m
                  </span>
                </div>
                <button
                  onClick={() => handleAccept(offer)}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
                    adType === 'buy'
                      ? 'bg-green-500 hover:bg-green-600 text-white'
                      : 'bg-red-500 hover:bg-red-600 text-white'
                  )}
                >
                  {adType === 'buy' ? t('p2p.buy') : t('p2p.sell')}
                </button>
              </div>
            </div>
          ))}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                onClick={() => fetchOffers(page - 1)}
                disabled={page <= 1}
                className="px-3 py-1 text-xs bg-muted rounded-lg disabled:opacity-50"
              >
                {t('p2p.prev')}
              </button>
              <span className="text-xs text-muted-foreground">{page} / {totalPages}</span>
              <button
                onClick={() => fetchOffers(page + 1)}
                disabled={page >= totalPages}
                className="px-3 py-1 text-xs bg-muted rounded-lg disabled:opacity-50"
              >
                {t('p2p.next')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
