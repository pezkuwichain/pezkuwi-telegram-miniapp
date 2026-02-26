import { useState, useEffect, useCallback } from 'react';
import { Plus, History, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/i18n';
import { useTelegram } from '@/hooks/useTelegram';
import { getP2PTrades, getMyOffers, type P2POffer, type P2PTrade } from '@/lib/p2p-api';
import { BalanceCard } from '@/components/p2p/BalanceCard';
import { OfferList } from '@/components/p2p/OfferList';
import { TradeModal } from '@/components/p2p/TradeModal';
import { CreateOfferModal } from '@/components/p2p/CreateOfferModal';
import { TradeView } from '@/components/p2p/TradeView';

type Tab = 'buy' | 'sell' | 'myAds' | 'myTrades';

export function P2PSection() {
  const { sessionToken } = useAuth();
  const { t, isRTL } = useTranslation();
  const { hapticImpact } = useTelegram();

  const [activeTab, setActiveTab] = useState<Tab>('buy');
  const [selectedOffer, setSelectedOffer] = useState<P2POffer | null>(null);
  const [showCreateOffer, setShowCreateOffer] = useState(false);
  const [activeTradeId, setActiveTradeId] = useState<string | null>(null);

  // My ads / trades state
  const [myOffers, setMyOffers] = useState<P2POffer[]>([]);
  const [myTrades, setMyTrades] = useState<P2PTrade[]>([]);
  const [myDataLoading, setMyDataLoading] = useState(false);

  const fetchMyOffers = useCallback(async () => {
    if (!sessionToken) return;
    try {
      const offers = await getMyOffers(sessionToken);
      setMyOffers(offers);
    } catch (err) {
      console.error('Failed to fetch my offers:', err);
    }
  }, [sessionToken]);

  const fetchMyTrades = useCallback(async () => {
    if (!sessionToken) return;
    try {
      const trades = await getP2PTrades(sessionToken, 'all');
      setMyTrades(trades);
    } catch (err) {
      console.error('Failed to fetch my trades:', err);
    }
  }, [sessionToken]);

  useEffect(() => {
    if (activeTab === 'myAds') {
      setMyDataLoading(true);
      fetchMyOffers().finally(() => setMyDataLoading(false));
    } else if (activeTab === 'myTrades') {
      setMyDataLoading(true);
      fetchMyTrades().finally(() => setMyDataLoading(false));
    }
  }, [activeTab, fetchMyOffers, fetchMyTrades]);

  const handleTabChange = (tab: Tab) => {
    hapticImpact('light');
    setActiveTab(tab);
  };

  const handleAcceptOffer = (offer: P2POffer) => {
    setSelectedOffer(offer);
  };

  const handleTradeCreated = (tradeId: string) => {
    setSelectedOffer(null);
    setActiveTradeId(tradeId);
  };

  const handleOfferCreated = () => {
    setShowCreateOffer(false);
    if (activeTab === 'myAds') fetchMyOffers();
  };

  // If viewing a specific trade, show TradeView
  if (activeTradeId) {
    return (
      <div className="h-full overflow-y-auto p-4 safe-area-top">
        <TradeView
          tradeId={activeTradeId}
          onBack={() => setActiveTradeId(null)}
        />
      </div>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'buy', label: t('p2p.buy') },
    { id: 'sell', label: t('p2p.sell') },
    { id: 'myAds', label: t('p2p.myAds') },
    { id: 'myTrades', label: t('p2p.myTrades') },
  ];

  const statusColor = (s: string) => {
    switch (s) {
      case 'open': return 'text-green-400';
      case 'pending': return 'text-amber-400';
      case 'payment_sent': return 'text-blue-400';
      case 'completed': return 'text-green-400';
      case 'cancelled': case 'refunded': return 'text-red-400';
      case 'disputed': return 'text-orange-400';
      default: return 'text-muted-foreground';
    }
  };

  return (
    <div
      className={cn('h-full flex flex-col', isRTL && 'direction-rtl')}
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      {/* Header */}
      <div className="p-4 safe-area-top space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-foreground">{t('p2p.title')}</h1>
          <button
            onClick={() => { hapticImpact('medium'); setShowCreateOffer(true); }}
            className="flex items-center gap-1 px-3 py-1.5 bg-cyan-500 hover:bg-cyan-600 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            {t('p2p.createOffer')}
          </button>
        </div>

        {/* Balance Card */}
        <BalanceCard />

        {/* Tabs */}
        <div className="flex rounded-xl bg-muted p-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={cn(
                'flex-1 py-2 text-xs font-medium rounded-lg transition-colors',
                activeTab === tab.id
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {/* Buy / Sell Tabs → OfferList */}
        {(activeTab === 'buy' || activeTab === 'sell') && (
          <OfferList
            adType={activeTab === 'buy' ? 'sell' : 'buy'}
            onAcceptOffer={handleAcceptOffer}
          />
        )}

        {/* My Ads */}
        {activeTab === 'myAds' && (
          myDataLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-primary animate-spin" />
            </div>
          ) : myOffers.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">{t('p2p.noOffers')}</p>
              <button
                onClick={() => setShowCreateOffer(true)}
                className="text-cyan-400 text-sm mt-2 hover:text-cyan-300"
              >
                {t('p2p.createOffer')}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {myOffers.map((offer) => (
                <div key={offer.id} className="bg-card rounded-xl border border-border p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        'text-xs font-medium px-2 py-0.5 rounded-full',
                        offer.ad_type === 'sell' ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'
                      )}>
                        {offer.ad_type === 'sell' ? t('p2p.sell') : t('p2p.buy')}
                      </span>
                      <span className="text-sm font-bold text-foreground">{offer.token}</span>
                    </div>
                    <span className={cn('text-xs font-medium', statusColor(offer.status))}>
                      {t(`p2p.status.${offer.status}`)}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{offer.remaining_amount}/{offer.amount_crypto} {offer.token}</span>
                    <span>{offer.price_per_unit?.toLocaleString()} {offer.fiat_currency}</span>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* My Trades */}
        {activeTab === 'myTrades' && (
          myDataLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-primary animate-spin" />
            </div>
          ) : myTrades.length === 0 ? (
            <div className="text-center py-8">
              <History className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">{t('p2p.noTrades')}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {myTrades.map((trade) => (
                <button
                  key={trade.id}
                  onClick={() => { hapticImpact('light'); setActiveTradeId(trade.id); }}
                  className="w-full text-left bg-card rounded-xl border border-border p-3 space-y-1 hover:border-cyan-500/50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-foreground">
                      {trade.crypto_amount} {trade.token || ''}
                    </span>
                    <span className={cn('text-xs font-medium', statusColor(trade.status))}>
                      {t(`p2p.status.${trade.status}`)}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{trade.fiat_amount?.toLocaleString()} {trade.fiat_currency || ''}</span>
                    <span>{new Date(trade.created_at).toLocaleDateString()}</span>
                  </div>
                </button>
              ))}
            </div>
          )
        )}
      </div>

      {/* Trade Accept Modal */}
      <TradeModal
        isOpen={!!selectedOffer}
        onClose={() => setSelectedOffer(null)}
        offer={selectedOffer}
        onTradeCreated={handleTradeCreated}
      />

      {/* Create Offer Modal */}
      <CreateOfferModal
        isOpen={showCreateOffer}
        onClose={() => setShowCreateOffer(false)}
        onOfferCreated={handleOfferCreated}
      />
    </div>
  );
}
