import { supabase } from './supabase';

// ─── Types ───────────────────────────────────────────────────

export interface InternalBalance {
  token: string;
  available_balance: number;
  locked_balance: number;
  total: number;
}

export interface PaymentMethod {
  id: string;
  currency: string;
  country: string;
  method_name: string;
  method_type: string;
  logo_url: string | null;
  fields: Record<string, unknown>;
  min_trade_amount: number;
  max_trade_amount: number | null;
  processing_time_minutes: number;
}

export interface P2POffer {
  id: string;
  seller_id: string;
  token: string;
  amount_crypto: number;
  fiat_currency: string;
  fiat_amount: number;
  price_per_unit: number;
  payment_method_id: string;
  payment_method_name?: string;
  min_order_amount: number | null;
  max_order_amount: number | null;
  time_limit_minutes: number;
  status: string;
  remaining_amount: number;
  ad_type: 'buy' | 'sell';
  created_at: string;
  expires_at: string;
  seller_reputation?: SellerReputation | null;
}

export interface SellerReputation {
  completed_trades: number;
  total_trades: number;
  reputation_score: number;
  trust_level: string;
  avg_confirmation_time_minutes: number | null;
}

export interface P2PTrade {
  id: string;
  offer_id: string;
  seller_id: string;
  buyer_id: string;
  buyer_wallet: string;
  crypto_amount: number;
  fiat_amount: number;
  price_per_unit: number;
  escrow_locked_amount: number;
  status: string;
  payment_deadline: string;
  confirmation_deadline: string | null;
  buyer_marked_paid_at: string | null;
  seller_confirmed_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined from offer
  token?: string;
  fiat_currency?: string;
  ad_type?: string;
  payment_method_name?: string;
}

export interface P2PMessage {
  id: string;
  trade_id: string;
  sender_id: string;
  message: string;
  message_type: string;
  is_read: boolean;
  created_at: string;
}

export interface P2PDispute {
  id: string;
  trade_id: string;
  opened_by: string;
  reason: string;
  category: string;
  status: string;
  created_at: string;
}

// ─── API Helper ──────────────────────────────────────────────

async function callEdgeFunction<T>(
  functionName: string,
  body: Record<string, unknown>
): Promise<T> {
  const { data, error } = await supabase.functions.invoke(functionName, { body });

  if (error) {
    let msg = error.message || 'Unknown error';
    if (error.context?.body) {
      try {
        const parsed = JSON.parse(error.context.body);
        if (parsed.error) msg = parsed.error;
      } catch {
        if (typeof error.context.body === 'string') msg = error.context.body;
      }
    }
    throw new Error(msg);
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data as T;
}

// ─── Balance ─────────────────────────────────────────────────

export async function getInternalBalance(sessionToken: string): Promise<InternalBalance[]> {
  const result = await callEdgeFunction<{ success: boolean; balances: InternalBalance[] }>(
    'get-internal-balance',
    { sessionToken }
  );
  return result.balances || [];
}

// ─── Payment Methods ─────────────────────────────────────────

export async function getPaymentMethods(
  sessionToken: string,
  currency?: string
): Promise<PaymentMethod[]> {
  const result = await callEdgeFunction<{ success: boolean; methods: PaymentMethod[] }>(
    'get-payment-methods',
    { sessionToken, currency }
  );
  return result.methods || [];
}

// ─── Offers ──────────────────────────────────────────────────

interface GetOffersParams {
  sessionToken: string;
  adType?: 'buy' | 'sell';
  token?: string;
  fiatCurrency?: string;
  page?: number;
  limit?: number;
}

interface GetOffersResult {
  offers: P2POffer[];
  total: number;
  page: number;
  limit: number;
}

export async function getP2POffers(params: GetOffersParams): Promise<GetOffersResult> {
  const result = await callEdgeFunction<{ success: boolean } & GetOffersResult>(
    'get-p2p-offers',
    params as unknown as Record<string, unknown>
  );
  return {
    offers: result.offers || [],
    total: result.total || 0,
    page: result.page || 1,
    limit: result.limit || 20,
  };
}

export async function getMyOffers(sessionToken: string): Promise<P2POffer[]> {
  const result = await callEdgeFunction<{ success: boolean; offers: P2POffer[] }>('get-my-offers', {
    sessionToken,
  });
  return result.offers || [];
}

// ─── Accept Offer ────────────────────────────────────────────

interface AcceptOfferParams {
  sessionToken: string;
  offerId: string;
  amount: number;
  buyerWallet: string;
}

export async function acceptP2POffer(
  params: AcceptOfferParams
): Promise<{ tradeId: string; trade: P2PTrade }> {
  return callEdgeFunction<{ success: boolean; tradeId: string; trade: P2PTrade }>(
    'accept-p2p-offer',
    params as unknown as Record<string, unknown>
  );
}

// ─── Create Offer ────────────────────────────────────────────

interface CreateOfferParams {
  sessionToken: string;
  token: 'HEZ' | 'PEZ';
  amountCrypto: number;
  fiatCurrency: string;
  fiatAmount: number;
  paymentMethodId: string;
  paymentDetailsEncrypted: string;
  minOrderAmount?: number;
  maxOrderAmount?: number;
  timeLimitMinutes?: number;
  adType?: 'buy' | 'sell';
}

export async function createP2POffer(
  params: CreateOfferParams
): Promise<{ offerId: string; offer: P2POffer }> {
  const result = await callEdgeFunction<{ success: boolean; offer_id: string; offer: P2POffer }>(
    'create-offer-telegram',
    params as unknown as Record<string, unknown>
  );
  return { offerId: result.offer_id, offer: result.offer };
}

// ─── Trades ──────────────────────────────────────────────────

export async function getP2PTrades(
  sessionToken: string,
  status?: 'active' | 'completed' | 'all'
): Promise<P2PTrade[]> {
  const result = await callEdgeFunction<{ success: boolean; trades: P2PTrade[] }>(
    'get-p2p-trades',
    { sessionToken, status }
  );
  return result.trades || [];
}

// ─── Trade Actions ───────────────────────────────────────────

export async function markTradePaid(sessionToken: string, tradeId: string): Promise<P2PTrade> {
  const result = await callEdgeFunction<{ success: boolean; trade: P2PTrade }>('trade-action', {
    sessionToken,
    tradeId,
    action: 'mark_paid',
  });
  return result.trade;
}

export async function confirmTradePayment(
  sessionToken: string,
  tradeId: string
): Promise<P2PTrade> {
  const result = await callEdgeFunction<{ success: boolean; trade: P2PTrade }>('trade-action', {
    sessionToken,
    tradeId,
    action: 'confirm',
  });
  return result.trade;
}

export async function cancelTrade(
  sessionToken: string,
  tradeId: string,
  reason?: string
): Promise<P2PTrade> {
  const result = await callEdgeFunction<{ success: boolean; trade: P2PTrade }>('trade-action', {
    sessionToken,
    tradeId,
    action: 'cancel',
    payload: { reason },
  });
  return result.trade;
}

export async function rateTrade(
  sessionToken: string,
  tradeId: string,
  rating: number,
  review?: string
): Promise<void> {
  await callEdgeFunction<{ success: boolean }>('trade-action', {
    sessionToken,
    tradeId,
    action: 'rate',
    payload: { rating, review },
  });
}

// ─── Messages ────────────────────────────────────────────────

export async function sendTradeMessage(
  sessionToken: string,
  tradeId: string,
  message: string
): Promise<string> {
  const result = await callEdgeFunction<{ success: boolean; messageId: string }>('p2p-messages', {
    sessionToken,
    action: 'send',
    tradeId,
    message,
  });
  return result.messageId;
}

export async function getTradeMessages(
  sessionToken: string,
  tradeId: string
): Promise<P2PMessage[]> {
  const result = await callEdgeFunction<{ success: boolean; messages: P2PMessage[] }>(
    'p2p-messages',
    { sessionToken, action: 'list', tradeId }
  );
  return result.messages || [];
}

// ─── Disputes ────────────────────────────────────────────────

export async function openDispute(
  sessionToken: string,
  tradeId: string,
  reason: string,
  category: string
): Promise<P2PDispute> {
  const result = await callEdgeFunction<{ success: boolean; dispute: P2PDispute }>('p2p-dispute', {
    sessionToken,
    action: 'open',
    tradeId,
    reason,
    category,
  });
  return result.dispute;
}

export async function addDisputeEvidence(
  sessionToken: string,
  tradeId: string,
  evidenceUrl: string,
  evidenceType: string,
  description?: string
): Promise<void> {
  await callEdgeFunction<{ success: boolean }>('p2p-dispute', {
    sessionToken,
    action: 'add_evidence',
    tradeId,
    evidenceUrl,
    evidenceType,
    description,
  });
}
