/**
 * Swap Modal Component
 * Mobile-optimized token swap interface for Telegram miniapp
 */

import { useState, useEffect, useCallback } from 'react';
import { X, ArrowDownUp, RefreshCw, AlertCircle, Check } from 'lucide-react';
import { useWallet } from '@/contexts/WalletContext';
import { useTelegram } from '@/hooks/useTelegram';
import { KurdistanSun } from '@/components/KurdistanSun';
import { useTranslation } from '@/i18n';

interface SwapModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Token configuration
const TOKENS = [
  { symbol: 'HEZ', name: 'Hezkurd', assetId: -1, decimals: 12, icon: '/tokens/HEZ.png' },
  { symbol: 'PEZ', name: 'Pezkuwi', assetId: 1, decimals: 12, icon: '/tokens/PEZ.png' },
  { symbol: 'USDT', name: 'Tether', assetId: 1000, decimals: 6, icon: '/tokens/USDT.png' },
  { symbol: 'DOT', name: 'Polkadot', assetId: 1001, decimals: 10, icon: '/tokens/DOT.png' },
];

// Native token ID for relay chain HEZ
const NATIVE_TOKEN_ID = -1;

// Helper to convert asset ID to XCM Location format
const formatAssetLocation = (id: number) => {
  if (id === NATIVE_TOKEN_ID) {
    return { parents: 1, interior: 'Here' };
  }
  return { parents: 0, interior: { X2: [{ PalletInstance: 50 }, { GeneralIndex: id }] } };
};

export function SwapModal({ isOpen, onClose }: SwapModalProps) {
  const { assetHubApi, keypair } = useWallet();
  const { hapticImpact, hapticNotification } = useTelegram();
  const { t } = useTranslation();

  const [fromToken, setFromToken] = useState(TOKENS[0]); // HEZ
  const [toToken, setToToken] = useState(TOKENS[1]); // PEZ
  const [fromAmount, setFromAmount] = useState('');
  const [toAmount, setToAmount] = useState('');
  const [exchangeRate, setExchangeRate] = useState<number | null>(null);
  const [isLoadingRate, setIsLoadingRate] = useState(false);
  const [isSwapping, setIsSwapping] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Token balances
  const [balances, setBalances] = useState<Record<string, string>>({
    HEZ: '0',
    PEZ: '0',
    USDT: '0',
    DOT: '0',
  });

  // Fetch balances from Asset Hub (where swaps happen)
  useEffect(() => {
    if (!isOpen || !assetHubApi || !keypair) return;

    // Reset state when modal opens
    setError('');
    setFromAmount('');
    setToAmount('');

    const fetchBalances = async () => {
      try {
        // HEZ balance from Asset Hub (native token for fees and swaps)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const hezAccount = await (assetHubApi.query.system as any).account(keypair.address);
        const hezFree = hezAccount.data.free.toString();
        const hezBalance = (parseInt(hezFree) / 1e12).toFixed(4);

        // Helper to extract balance from an asset storage query result. The
        // shape is the subset of the @pezkuwi/api Option/Codec result we read.
        type AssetQueryResult = {
          isEmpty: boolean;
          isSome?: boolean;
          unwrap?: () => { toJSON(): unknown };
          toJSON(): unknown;
        };
        const getAssetBalance = (
          result: AssetQueryResult | null,
          decimals: number,
          fractionDigits: number
        ): string => {
          if (!result || result.isEmpty) return '0'.padEnd(fractionDigits + 2, '0');
          const data = (
            result.isSome && result.unwrap ? result.unwrap().toJSON() : result.toJSON()
          ) as {
            balance?: { toString(): string };
          } | null;
          if (data && data.balance) {
            return (parseInt(data.balance.toString()) / Math.pow(10, decimals)).toFixed(
              fractionDigits
            );
          }
          return '0'.padEnd(fractionDigits + 2, '0');
        };

        // PEZ balance (Asset 1)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pezResult = await (assetHubApi.query.assets as any).account(1, keypair.address);
        const pezBalance = getAssetBalance(pezResult, 12, 4);

        // USDT balance (Asset 1000)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const usdtResult = await (assetHubApi.query.assets as any).account(1000, keypair.address);
        const usdtBalance = getAssetBalance(usdtResult, 6, 2);

        // DOT balance (Asset 1001, 10 decimals)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const dotResult = await (assetHubApi.query.assets as any).account(1001, keypair.address);
        const dotBalance = getAssetBalance(dotResult, 10, 4);

        // Update all balances at once
        setBalances({
          HEZ: hezBalance,
          PEZ: pezBalance,
          USDT: usdtBalance,
          DOT: dotBalance,
        });
      } catch (err) {
        console.error('Failed to fetch balances:', err);
      }
    };

    fetchBalances();
  }, [assetHubApi, keypair, isOpen]);

  // Fetch exchange rate
  const fetchExchangeRate = useCallback(async () => {
    if (!assetHubApi || fromToken.symbol === toToken.symbol) {
      setExchangeRate(null);
      return;
    }

    setIsLoadingRate(true);
    try {
      // Sort assets for pool query (native token first)
      const fromId = fromToken.assetId;
      const toId = toToken.assetId;

      const [asset1, asset2] =
        fromId === NATIVE_TOKEN_ID
          ? [fromId, toId]
          : toId === NATIVE_TOKEN_ID
            ? [toId, fromId]
            : fromId < toId
              ? [fromId, toId]
              : [toId, fromId];

      const poolKey = [formatAssetLocation(asset1), formatAssetLocation(asset2)];

      // Check if pool exists
      const poolInfo = await assetHubApi.query.assetConversion.pools(poolKey);

      if (poolInfo && !poolInfo.isEmpty) {
        // Get quote from runtime API
        // USDT has 6 decimals, DOT has 10 decimals, others have 12
        const getDecimals = (id: number) => {
          if (id === 1000) return 6; // USDT
          if (id === 1001) return 10; // DOT
          return 12; // HEZ, PEZ
        };
        const decimals1 = getDecimals(asset1);
        const decimals2 = getDecimals(asset2);
        const oneUnit = BigInt(Math.pow(10, decimals1));

        // assetConversionApi is a runtime API not present in the base
        // @pezkuwi/api typings; describe just the call we use.
        type QuoteResult = { isNone: boolean; unwrap(): { toString(): string } };
        type AssetConversionCall = {
          assetConversionApi: {
            quotePriceExactTokensForTokens: (
              asset1: ReturnType<typeof formatAssetLocation>,
              asset2: ReturnType<typeof formatAssetLocation>,
              amount: string,
              includeFee: boolean
            ) => Promise<QuoteResult>;
          };
        };
        const quote = await (
          assetHubApi.call as unknown as AssetConversionCall
        ).assetConversionApi.quotePriceExactTokensForTokens(
          formatAssetLocation(asset1),
          formatAssetLocation(asset2),
          oneUnit.toString(),
          true
        );

        if (quote && !quote.isNone) {
          const priceRaw = quote.unwrap().toString();
          const price = Number(BigInt(priceRaw)) / Math.pow(10, decimals2);

          // Calculate rate based on direction
          const rate = fromId === asset1 ? price : 1 / price;
          setExchangeRate(rate);
        } else {
          setExchangeRate(null);
        }
      } else {
        setExchangeRate(null);
      }
    } catch (err) {
      console.error('Failed to fetch exchange rate:', err);
      setExchangeRate(null);
    } finally {
      setIsLoadingRate(false);
    }
  }, [assetHubApi, fromToken, toToken]);

  // Fetch rate when tokens change
  useEffect(() => {
    if (isOpen) {
      fetchExchangeRate();
    }
  }, [isOpen, fetchExchangeRate]);

  // Calculate toAmount when fromAmount or rate changes
  useEffect(() => {
    if (fromAmount && exchangeRate) {
      const calculated = parseFloat(fromAmount) * exchangeRate;
      setToAmount(calculated.toFixed(toToken.decimals === 6 ? 2 : 4));
    } else {
      setToAmount('');
    }
  }, [fromAmount, exchangeRate, toToken.decimals]);

  // Swap tokens
  const handleSwapTokens = () => {
    hapticImpact('light');
    const temp = fromToken;
    setFromToken(toToken);
    setToToken(temp);
    setFromAmount('');
    setToAmount('');
  };

  // Execute swap
  const handleSwap = async () => {
    if (!assetHubApi || !keypair || !fromAmount || !exchangeRate) return;

    const fromBalance = parseFloat(balances[fromToken.symbol] || '0');
    const swapAmount = parseFloat(fromAmount);

    if (swapAmount > fromBalance) {
      setError(t('swap.insufficientBalance'));
      hapticNotification('error');
      return;
    }

    setIsSwapping(true);
    setError('');

    try {
      const amountIn = BigInt(Math.floor(swapAmount * Math.pow(10, fromToken.decimals)));
      const minAmountOut = BigInt(
        Math.floor(parseFloat(toAmount) * 0.95 * Math.pow(10, toToken.decimals))
      ); // 5% slippage

      // Build swap path using XCM Locations
      const fromLocation = formatAssetLocation(fromToken.assetId);
      const toLocation = formatAssetLocation(toToken.assetId);

      // Check if we need multi-hop (e.g., PEZ -> USDT needs PEZ -> HEZ -> USDT)
      let path;
      if (fromToken.assetId !== NATIVE_TOKEN_ID && toToken.assetId !== NATIVE_TOKEN_ID) {
        // Multi-hop through native token
        const nativeLocation = formatAssetLocation(NATIVE_TOKEN_ID);
        path = [fromLocation, nativeLocation, toLocation];
      } else {
        path = [fromLocation, toLocation];
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tx = (assetHubApi.tx.assetConversion as any).swapExactTokensForTokens(
        path,
        amountIn.toString(),
        minAmountOut.toString(),
        keypair.address,
        true
      );

      // Minimal shape of the signAndSend result fields we read (the full
      // @pezkuwi/api ISubmittableResult is unavailable because `tx` above is
      // produced from an untyped runtime extrinsic).
      type SwapDispatchError = {
        isModule: boolean;
        asModule: Parameters<typeof assetHubApi.registry.findMetaError>[0];
        toString(): string;
      };
      type SwapTxResult = {
        status: { isFinalized: boolean };
        dispatchError?: SwapDispatchError;
      };

      // Wait for transaction to be finalized
      await new Promise<void>((resolve, reject) => {
        tx.signAndSend(keypair, ({ status, dispatchError }: SwapTxResult) => {
          if (status.isFinalized) {
            if (dispatchError) {
              let errorMsg = t('swap.swapFailed');
              if (dispatchError.isModule) {
                const decoded = assetHubApi.registry.findMetaError(dispatchError.asModule);
                errorMsg = `${decoded.section}.${decoded.name}: ${decoded.docs.join(' ')}`;
              } else if (dispatchError.toString) {
                errorMsg = dispatchError.toString();
              }
              console.error('Swap error:', errorMsg);
              reject(new Error(errorMsg));
            } else {
              resolve();
            }
          }
        }).catch(reject);
      });

      setSuccess(true);
      hapticNotification('success');

      // Reset after success
      setTimeout(() => {
        setSuccess(false);
        setFromAmount('');
        setToAmount('');
        onClose();
      }, 2000);
    } catch (err) {
      console.error('Swap failed:', err);
      setError(err instanceof Error ? err.message : t('swap.swapFailed'));
      hapticNotification('error');
    } finally {
      setIsSwapping(false);
    }
  };

  if (!isOpen) return null;

  if (success) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
        <div className="w-full max-w-md bg-card rounded-2xl p-6 text-center space-y-4">
          <div className="w-16 h-16 mx-auto bg-green-500/20 rounded-full flex items-center justify-center">
            <Check className="w-8 h-8 text-green-500" />
          </div>
          <h2 className="text-xl font-semibold">{t('swap.swapSuccess')}</h2>
          <p className="text-muted-foreground">
            {fromAmount} {fromToken.symbol} → {toAmount} {toToken.symbol}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md bg-card rounded-2xl shadow-xl border border-border overflow-hidden max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold">{t('swap.title')}</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-muted">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* From Token */}
          <div className="bg-muted/50 rounded-xl p-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">{t('swap.fromLabel')}</span>
              <select
                value={fromToken.symbol}
                onChange={(e) => {
                  const token = TOKENS.find((t) => t.symbol === e.target.value);
                  if (token) {
                    if (token.symbol === toToken.symbol) {
                      setToToken(fromToken);
                    }
                    setFromToken(token);
                  }
                }}
                className="bg-background border border-border rounded-lg px-3 py-1.5 text-sm font-medium"
              >
                {TOKENS.map((t) => (
                  <option key={t.symbol} value={t.symbol}>
                    {t.symbol}
                  </option>
                ))}
              </select>
            </div>
            <input
              type="number"
              value={fromAmount}
              onChange={(e) => setFromAmount(e.target.value)}
              placeholder="0.00"
              className="w-full bg-transparent text-2xl font-bold outline-none"
            />
            <div className="flex justify-between items-center text-sm">
              <button
                onClick={() => setFromAmount(balances[fromToken.symbol])}
                className="text-primary hover:underline"
              >
                Max
              </button>
              <span className="text-muted-foreground">
                {t('swap.balanceLabel')} {balances[fromToken.symbol]} {fromToken.symbol}
              </span>
            </div>
          </div>

          {/* Swap Button */}
          <div className="flex justify-center">
            <button
              onClick={handleSwapTokens}
              className="p-2 bg-muted rounded-full hover:bg-muted/80 transition-colors"
            >
              <ArrowDownUp className="w-5 h-5" />
            </button>
          </div>

          {/* To Token */}
          <div className="bg-muted/50 rounded-xl p-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">{t('swap.toLabel')}</span>
              <select
                value={toToken.symbol}
                onChange={(e) => {
                  const token = TOKENS.find((t) => t.symbol === e.target.value);
                  if (token) {
                    if (token.symbol === fromToken.symbol) {
                      setFromToken(toToken);
                    }
                    setToToken(token);
                  }
                }}
                className="bg-background border border-border rounded-lg px-3 py-1.5 text-sm font-medium"
              >
                {TOKENS.map((t) => (
                  <option key={t.symbol} value={t.symbol}>
                    {t.symbol}
                  </option>
                ))}
              </select>
            </div>
            <input
              type="text"
              value={toAmount}
              readOnly
              placeholder="0.00"
              className="w-full bg-transparent text-2xl font-bold outline-none text-muted-foreground"
            />
            <div className="flex justify-end text-sm">
              <span className="text-muted-foreground">
                {t('swap.balanceLabel')} {balances[toToken.symbol]} {toToken.symbol}
              </span>
            </div>
          </div>

          {/* Exchange Rate */}
          <div className="bg-muted/30 rounded-xl p-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('swap.exchangeRate')}</span>
              <span className="flex items-center gap-2">
                {isLoadingRate ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : exchangeRate ? (
                  `1 ${fromToken.symbol} = ${exchangeRate.toFixed(4)} ${toToken.symbol}`
                ) : (
                  <span className="text-yellow-500">{t('swap.noPool')}</span>
                )}
                <button onClick={fetchExchangeRate} className="p-1 hover:bg-muted rounded">
                  <RefreshCw className="w-3 h-3" />
                </button>
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Slippage</span>
              <span>5%</span>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          {/* Swap Button */}
          {/* Swap Button or Loading Animation */}
          {isSwapping ? (
            <div className="flex flex-col items-center justify-center py-4 space-y-3">
              <KurdistanSun size={80} />
              <p className="text-sm text-muted-foreground animate-pulse">{t('swap.swapping')}</p>
            </div>
          ) : (
            <button
              onClick={handleSwap}
              disabled={!fromAmount || !exchangeRate || parseFloat(fromAmount) <= 0}
              className="w-full py-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {!exchangeRate ? t('swap.noPoolButton') : t('swap.swapButton')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
