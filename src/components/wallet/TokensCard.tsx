/**
 * Tokens Card Component
 * Token management with search, add/remove, show/hide functionality
 * Fetches live data from blockchain and CoinGecko prices
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Coins,
  Search,
  Plus,
  Settings,
  Eye,
  EyeOff,
  X,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Send,
  TrendingUp,
  TrendingDown,
  Fuel,
} from 'lucide-react';
import { useWallet } from '@/contexts/WalletContext';
import { useTelegram } from '@/hooks/useTelegram';
import { useTranslation } from '@/i18n';
import {
  subscribeToConnection,
  getLastError,
  getAssetHubAPI,
  getPeopleAPI,
  getConnectionState,
} from '@/lib/rpc-manager';
import { FundFeesModal } from './FundFeesModal';
import { DepositUSDTModal } from './DepositUSDTModal';

// Asset IDs matching pwap/web configuration
const ASSET_IDS = {
  WHEZ: 0, // Wrapped HEZ (12 decimals)
  PEZ: 1, // PEZ token (12 decimals)
  WUSDT: 1000, // Wrapped USDT (6 decimals) - displayed as USDT
  DOT: 1001, // wDOT (10 decimals)
  ETH: 1002, // wETH (18 decimals)
  BTC: 1003, // wBTC (8 decimals)
};

// LP Token IDs (from poolAssets pallet)
const LP_TOKEN_IDS = {
  HEZ_PEZ: 0, // HEZ-PEZ LP (12 decimals)
  HEZ_USDT: 1, // HEZ-USDT LP (12 decimals)
  HEZ_DOT: 2, // HEZ-DOT LP (12 decimals)
};

// CoinGecko ID mapping for tokens
const COINGECKO_IDS: Record<string, string> = {
  DOT: 'polkadot',
  BTC: 'bitcoin',
  ETH: 'ethereum',
  USDT: 'tether',
  HEZ: 'hez-token', // Will fallback to DOT/3 if not found
  PEZ: 'pez-token', // Will fallback to DOT/10 if not found
};

interface PriceData {
  usd: number;
  usd_24h_change: number;
}

// Token configurations
interface TokenConfig {
  assetId: number;
  symbol: string;
  displaySymbol: string;
  name: string;
  decimals: number;
  logo: string;
  isDefault: boolean;
  priority: number; // Lower = higher in list
}

const DEFAULT_TOKENS: TokenConfig[] = [
  {
    assetId: -1, // Special: native token
    symbol: 'HEZ',
    displaySymbol: 'HEZ',
    name: 'HEZ Native Token',
    decimals: 12,
    logo: '/tokens/HEZ.png',
    isDefault: true,
    priority: 0,
  },
  {
    assetId: ASSET_IDS.PEZ,
    symbol: 'PEZ',
    displaySymbol: 'PEZ',
    name: 'PEZ Governance Token',
    decimals: 12,
    logo: '/tokens/PEZ.png',
    isDefault: true,
    priority: 1,
  },
  {
    assetId: ASSET_IDS.WUSDT,
    symbol: 'wUSDT',
    displaySymbol: 'USDT', // User sees USDT, backend uses wUSDT
    name: 'Tether USD',
    decimals: 6,
    logo: '/tokens/USDT.png',
    isDefault: true,
    priority: 2,
  },
  {
    assetId: ASSET_IDS.DOT,
    symbol: 'wDOT',
    displaySymbol: 'DOT',
    name: 'Polkadot',
    decimals: 10,
    logo: '/tokens/DOT.png',
    isDefault: true,
    priority: 3,
  },
  {
    assetId: ASSET_IDS.BTC,
    symbol: 'wBTC',
    displaySymbol: 'BTC',
    name: 'Bitcoin',
    decimals: 8,
    logo: '/tokens/BTC.png',
    isDefault: true,
    priority: 4,
  },
  {
    assetId: ASSET_IDS.ETH,
    symbol: 'wETH',
    displaySymbol: 'ETH',
    name: 'Ethereum',
    decimals: 18,
    logo: '/tokens/ETH.png',
    isDefault: true,
    priority: 5,
  },
];

// LP Token configurations (separate from regular tokens)
const LP_TOKENS: TokenConfig[] = [
  {
    assetId: -100 - LP_TOKEN_IDS.HEZ_PEZ, // Use negative IDs starting from -100 to distinguish from regular tokens
    symbol: 'HEZ-PEZ-LP',
    displaySymbol: 'HEZ-PEZ LP',
    name: 'HEZ-PEZ Liquidity Pool',
    decimals: 12,
    logo: '', // Uses initials fallback
    isDefault: true,
    priority: 10,
  },
  {
    assetId: -100 - LP_TOKEN_IDS.HEZ_USDT, // -101
    symbol: 'HEZ-USDT-LP',
    displaySymbol: 'HEZ-USDT LP',
    name: 'HEZ-USDT Liquidity Pool',
    decimals: 12,
    logo: '', // Uses initials fallback
    isDefault: true,
    priority: 11,
  },
  {
    assetId: -100 - LP_TOKEN_IDS.HEZ_DOT, // -102
    symbol: 'HEZ-DOT-LP',
    displaySymbol: 'HEZ-DOT LP',
    name: 'HEZ-DOT Liquidity Pool',
    decimals: 12,
    logo: '', // Uses initials fallback
    isDefault: true,
    priority: 12,
  },
];

interface TokenBalance extends TokenConfig {
  balance: string;
  isHidden: boolean;
  priceUsd?: number;
  priceChange24h?: number;
  valueUsd?: number;
}

interface Props {
  onSendToken?: (token: TokenBalance) => void;
}

export function TokensCard({ onSendToken }: Props) {
  const { address, rcBalance: hezBalance } = useWallet();
  const { hapticImpact } = useTelegram();
  const { t } = useTranslation();
  const [rpcConnected, setRpcConnected] = useState(false);
  const [endpointName, setEndpointName] = useState<string | null>(null);

  // Track RPC connection state
  useEffect(() => {
    // Get initial state
    const initialState = getConnectionState();
    setRpcConnected(initialState.isConnected);
    setEndpointName(initialState.endpoint?.name || null);

    // Subscribe to changes
    const unsubscribe = subscribeToConnection((connected, endpoint) => {
      setRpcConnected(connected);
      setEndpointName(endpoint?.name || null);
    });
    return () => unsubscribe();
  }, []);

  // Fetch multi-chain HEZ balances (Asset Hub & People Chain)
  useEffect(() => {
    if (!address) return;

    const fetchMultiChainBalances = async () => {
      // Asset Hub HEZ balance
      const assetHubApi = getAssetHubAPI();
      if (assetHubApi) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const accountInfo = (await (assetHubApi.query.system as any).account(address)) as {
            data: { free: { toString(): string } };
          };
          const free = accountInfo.data.free.toString();
          const balanceNum = Number(free) / 1e12;
          setAssetHubHezBalance(balanceNum.toFixed(4));
        } catch (err) {
          console.error('Error fetching Asset Hub HEZ balance:', err);
          setAssetHubHezBalance('0.0000');
        }
      }

      // People Chain HEZ balance
      const peopleApi = getPeopleAPI();
      if (peopleApi) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const accountInfo = (await (peopleApi.query.system as any).account(address)) as {
            data: { free: { toString(): string } };
          };
          const free = accountInfo.data.free.toString();
          const balanceNum = Number(free) / 1e12;
          setPeopleHezBalance(balanceNum.toFixed(4));
        } catch (err) {
          console.error('Error fetching People Chain HEZ balance:', err);
          setPeopleHezBalance('0.0000');
        }
      }
    };

    fetchMultiChainBalances();
    // Refresh every 30 seconds
    const interval = setInterval(fetchMultiChainBalances, 30000);
    return () => clearInterval(interval);
  }, [address, rpcConnected]);

  // Initialize with default tokens immediately (no API required)
  const [tokens, setTokens] = useState<TokenBalance[]>(() =>
    DEFAULT_TOKENS.map((config) => ({
      ...config,
      balance: '--', // Placeholder until connected
      isHidden: false,
    }))
  );
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showAddToken, setShowAddToken] = useState(false);
  const [newAssetId, setNewAssetId] = useState('');
  const [isExpanded, setIsExpanded] = useState(true);
  const [hiddenTokens, setHiddenTokens] = useState<number[]>(() => {
    const stored = localStorage.getItem('hiddenTokens');
    return stored ? JSON.parse(stored) : [];
  });
  const [customTokenIds, setCustomTokenIds] = useState<number[]>(() => {
    const stored = localStorage.getItem('customTokenIds');
    return stored ? JSON.parse(stored) : [];
  });
  const [prices, setPrices] = useState<Record<string, PriceData>>({});
  const [isPriceLoading, setIsPriceLoading] = useState(false);
  // Multi-chain HEZ balances
  const [assetHubHezBalance, setAssetHubHezBalance] = useState<string>('--');
  const [peopleHezBalance, setPeopleHezBalance] = useState<string>('--');
  const [showFundFeesModal, setShowFundFeesModal] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);

  // Fetch prices from CoinGecko
  const fetchPrices = useCallback(async () => {
    setIsPriceLoading(true);
    try {
      // Fetch prices for known tokens
      const ids = Object.values(COINGECKO_IDS).join(',');
      const response = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`
      );

      if (!response.ok) {
        throw new Error('CoinGecko API error');
      }

      const data = await response.json();

      // Map CoinGecko response to our token symbols
      const priceMap: Record<string, PriceData> = {};

      for (const [symbol, geckoId] of Object.entries(COINGECKO_IDS)) {
        if (data[geckoId]) {
          priceMap[symbol] = {
            usd: data[geckoId].usd,
            usd_24h_change: data[geckoId].usd_24h_change || 0,
          };
        }
      }

      // Calculate HEZ and PEZ prices from DOT if not available on CoinGecko
      const dotPrice = priceMap['DOT'];
      if (dotPrice) {
        // HEZ = DOT / 3 (if not found on CoinGecko)
        if (!priceMap['HEZ']) {
          priceMap['HEZ'] = {
            usd: dotPrice.usd / 3,
            usd_24h_change: dotPrice.usd_24h_change, // Use DOT's change
          };
        }
        // PEZ = DOT / 10 (if not found on CoinGecko)
        if (!priceMap['PEZ']) {
          priceMap['PEZ'] = {
            usd: dotPrice.usd / 10,
            usd_24h_change: dotPrice.usd_24h_change, // Use DOT's change
          };
        }
      }

      setPrices(priceMap);
    } catch (err) {
      console.error('Failed to fetch prices:', err);
    } finally {
      setIsPriceLoading(false);
    }
  }, []);

  // Fetch prices on mount and every 60 seconds
  useEffect(() => {
    fetchPrices();
    const interval = setInterval(fetchPrices, 60000);
    return () => clearInterval(interval);
  }, [fetchPrices]);

  // Update tokens with price data (works without API)
  const updateTokensWithPrices = useCallback(() => {
    setTokens((prev) =>
      prev.map((token) => {
        const priceData = prices[token.displaySymbol];
        const numBalance = parseFloat(token.balance) || 0;
        return {
          ...token,
          isHidden: hiddenTokens.includes(token.assetId),
          priceUsd: priceData?.usd,
          priceChange24h: priceData?.usd_24h_change,
          valueUsd:
            priceData?.usd && token.balance !== '--' ? numBalance * priceData.usd : undefined,
        };
      })
    );
  }, [prices, hiddenTokens]);

  // Fetch token balances from blockchain (only when API is available)
  const fetchTokenBalances = useCallback(async () => {
    // Update prices even without API
    updateTokensWithPrices();

    // Get Asset Hub API from rpc-manager (PEZ, USDT etc are on Asset Hub)
    // Note: Native HEZ balance comes from WalletContext (hezBalance), not directly from API
    const assetHubApi = getAssetHubAPI();

    // If no address, keep showing "--" for balances
    if (!address) {
      return;
    }

    setIsLoading(true);
    try {
      // Fetch all tokens (default + custom + LP tokens)
      const allTokenConfigs = [
        ...DEFAULT_TOKENS,
        ...LP_TOKENS, // Include LP tokens
        ...customTokenIds
          .filter((id) => !DEFAULT_TOKENS.find((t) => t.assetId === id))
          .map((id) => ({
            assetId: id,
            symbol: `Token #${id}`,
            displaySymbol: `Token #${id}`,
            name: `Custom Token`,
            decimals: 12,
            logo: '',
            isDefault: false,
            priority: 100 + id,
          })),
      ];

      const tokenBalances: TokenBalance[] = [];

      for (const config of allTokenConfigs) {
        let balance = '0';

        if (config.assetId === -1) {
          // Native HEZ balance (from relay chain)
          balance = hezBalance ?? '0.0000';
        } else if (config.assetId <= -100) {
          // LP Token balance (from poolAssets pallet)
          // Convert back to pool asset ID: -100 - assetId
          const poolAssetId = -100 - config.assetId;
          if (!assetHubApi) {
            balance = '--';
          } else {
            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const lpBalance = await (assetHubApi.query.poolAssets as any).account(
                poolAssetId,
                address
              );

              if (lpBalance && lpBalance.isSome) {
                const data = lpBalance.unwrap();
                const rawBalance = data.balance.toString();
                const numBalance = parseInt(rawBalance) / Math.pow(10, config.decimals);
                // Show more decimals for LP tokens to catch small amounts
                balance =
                  numBalance < 0.0001 && numBalance > 0
                    ? numBalance.toExponential(2)
                    : numBalance.toFixed(4);
              } else {
                balance = '0.0000';
              }
            } catch {
              balance = '0.0000';
            }
          }
        } else {
          // Asset balance - PEZ, USDT etc are on Asset Hub!
          // Use Asset Hub API instead of relay chain API
          if (!assetHubApi) {
            balance = '--'; // Asset Hub not connected
          } else {
            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const assetBalance = await (assetHubApi.query.assets as any).account(
                config.assetId,
                address
              );

              if (assetBalance && assetBalance.isSome) {
                const data = assetBalance.unwrap();
                const rawBalance = data.balance.toString();
                const formatted = (parseInt(rawBalance) / Math.pow(10, config.decimals)).toFixed(
                  config.decimals === 6 ? 2 : 4
                );
                balance = formatted;
              } else {
                // User has no balance for this asset
                balance = config.decimals === 6 ? '0.00' : '0.0000';
              }
            } catch {
              // Token might not exist or user has no balance
              balance = config.decimals === 6 ? '0.00' : '0.0000';
            }
          }
        }

        // Add price data
        const priceData = prices[config.displaySymbol];
        const numBalance = parseFloat(balance) || 0;

        tokenBalances.push({
          ...config,
          balance,
          isHidden: hiddenTokens.includes(config.assetId),
          priceUsd: priceData?.usd,
          priceChange24h: priceData?.usd_24h_change,
          valueUsd: priceData?.usd ? numBalance * priceData.usd : undefined,
        });
      }

      // Sort by priority
      tokenBalances.sort((a, b) => a.priority - b.priority);
      setTokens(tokenBalances);
    } catch (err) {
      console.error('Failed to fetch token balances:', err);
    } finally {
      setIsLoading(false);
    }
  }, [address, hezBalance, hiddenTokens, customTokenIds, prices, updateTokensWithPrices]);

  useEffect(() => {
    fetchTokenBalances();
  }, [fetchTokenBalances]);

  // Toggle token visibility
  const toggleTokenVisibility = (assetId: number) => {
    hapticImpact('light');
    setHiddenTokens((prev) => {
      const newHidden = prev.includes(assetId)
        ? prev.filter((id) => id !== assetId)
        : [...prev, assetId];
      localStorage.setItem('hiddenTokens', JSON.stringify(newHidden));
      return newHidden;
    });
  };

  // Add custom token
  const handleAddToken = () => {
    const id = parseInt(newAssetId);
    if (isNaN(id) || id < 0) return;

    if (customTokenIds.includes(id) || DEFAULT_TOKENS.find((t) => t.assetId === id)) {
      return; // Already exists
    }

    hapticImpact('medium');
    const newIds = [...customTokenIds, id];
    setCustomTokenIds(newIds);
    localStorage.setItem('customTokenIds', JSON.stringify(newIds));
    setNewAssetId('');
    setShowAddToken(false);
    fetchTokenBalances();
  };

  // Remove custom token
  const removeCustomToken = (assetId: number) => {
    hapticImpact('medium');
    const newIds = customTokenIds.filter((id) => id !== assetId);
    setCustomTokenIds(newIds);
    localStorage.setItem('customTokenIds', JSON.stringify(newIds));
    setTokens((prev) => prev.filter((t) => t.assetId !== assetId));
  };

  // Filter tokens based on search
  const filteredTokens = tokens.filter((token) => {
    if (!searchQuery) return !token.isHidden || showSettings;
    const query = searchQuery.toLowerCase();
    return (
      token.displaySymbol.toLowerCase().includes(query) ||
      token.name.toLowerCase().includes(query) ||
      token.symbol.toLowerCase().includes(query)
    );
  });

  // Get token gradient based on symbol
  const getTokenGradient = (symbol: string) => {
    const gradients: Record<string, string> = {
      HEZ: 'from-green-500/20 to-yellow-500/20 border-green-500/30',
      PEZ: 'from-blue-500/20 to-purple-500/20 border-blue-500/30',
      USDT: 'from-emerald-500/20 to-teal-500/20 border-emerald-500/30',
      DOT: 'from-pink-500/20 to-purple-500/20 border-pink-500/30',
      BTC: 'from-orange-500/20 to-yellow-500/20 border-orange-500/30',
      ETH: 'from-blue-500/20 to-indigo-500/20 border-blue-500/30',
      'HEZ-PEZ LP': 'from-green-500/20 to-blue-500/20 border-cyan-500/30',
      'HEZ-USDT LP': 'from-green-500/20 to-emerald-500/20 border-teal-500/30',
      'HEZ-DOT LP': 'from-green-500/20 to-pink-500/20 border-pink-500/30',
    };
    return gradients[symbol] || 'from-gray-500/20 to-gray-600/20 border-gray-500/30';
  };

  return (
    <div className="bg-muted/50 border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div
        className="p-4 flex items-center justify-between cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <Coins className="w-5 h-5 text-cyan-400" />
          <h3 className="font-semibold">Tokens</h3>
          <span className="text-xs text-muted-foreground">
            ({tokens.filter((t) => !t.isHidden).length})
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              hapticImpact('light');
              fetchTokenBalances();
              fetchPrices();
            }}
            disabled={isLoading || isPriceLoading}
            className="p-1.5 text-muted-foreground hover:text-white rounded"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading || isPriceLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              hapticImpact('light');
              setShowSettings(!showSettings);
            }}
            className={`p-1.5 rounded ${showSettings ? 'text-cyan-400 bg-cyan-400/10' : 'text-muted-foreground hover:text-white'}`}
          >
            <Settings className="w-4 h-4" />
          </button>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </div>

      {isExpanded && (
        <>
          {/* Search & Add */}
          <div className="px-4 pb-3 space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('tokens.searchPlaceholder')}
                className="w-full pl-9 pr-4 py-2 bg-background rounded-lg text-sm"
              />
            </div>

            {showSettings && (
              <button
                onClick={() => {
                  hapticImpact('light');
                  setShowAddToken(!showAddToken);
                }}
                className="w-full py-2 border border-dashed border-border rounded-lg text-sm text-muted-foreground hover:text-white hover:border-cyan-500/50 flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                {t('tokens.addToken')}
              </button>
            )}

            {showAddToken && (
              <div className="p-3 bg-background rounded-lg space-y-2">
                <input
                  type="number"
                  value={newAssetId}
                  onChange={(e) => setNewAssetId(e.target.value)}
                  placeholder={t('tokens.assetIdPlaceholder')}
                  className="w-full px-3 py-2 bg-muted rounded-lg text-sm"
                  min="0"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowAddToken(false)}
                    className="flex-1 py-2 bg-muted rounded-lg text-sm"
                  >
                    {t('tokens.cancel')}
                  </button>
                  <button
                    onClick={handleAddToken}
                    disabled={!newAssetId}
                    className="flex-1 py-2 bg-cyan-600 rounded-lg text-sm disabled:opacity-50"
                  >
                    {t('tokens.add')}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Connection Status Banner */}
          {rpcConnected ? (
            <div className="mx-4 mb-2 px-3 py-2 bg-green-500/10 border border-green-500/30 rounded-lg flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <div>
                <p className="text-xs text-green-400 font-medium">
                  {t('tokens.blockchainConnected')}
                </p>
                {endpointName && <p className="text-[10px] text-green-400/70">{endpointName}</p>}
              </div>
            </div>
          ) : (
            <div className="mx-4 mb-2 px-3 py-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-yellow-400 animate-spin flex-shrink-0" />
              <div>
                <p className="text-xs text-yellow-400 font-medium">
                  {t('tokens.connectingBlockchain')}
                </p>
                <p className="text-[10px] text-yellow-400/70">
                  {getLastError() || t('tokens.connectingRpc')}
                </p>
              </div>
            </div>
          )}

          {/* Token List */}
          <div className="px-4 pb-4 space-y-2 max-h-[400px] overflow-y-auto">
            {filteredTokens.length === 0 ? (
              <div className="text-center py-8">
                <Coins className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">{t('tokens.tokenNotFound')}</p>
              </div>
            ) : (
              filteredTokens.map((token) =>
                // Special rendering for HEZ (multi-chain)
                token.assetId === -1 ? (
                  <div
                    key={token.assetId}
                    className={`p-3 rounded-xl border bg-gradient-to-br ${getTokenGradient(token.displaySymbol)} ${
                      token.isHidden ? 'opacity-50' : ''
                    }`}
                  >
                    {/* HEZ Header */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <img
                          src={token.logo}
                          alt={token.displaySymbol}
                          className="w-10 h-10 rounded-full"
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{token.displaySymbol}</span>
                            <span className="text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded">
                              Multi-Chain
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {token.priceUsd !== undefined ? (
                              <>
                                <span className="text-xs text-muted-foreground">
                                  ${token.priceUsd.toFixed(token.priceUsd < 1 ? 4 : 2)}
                                </span>
                                {token.priceChange24h !== undefined && (
                                  <span
                                    className={`text-[10px] flex items-center gap-0.5 ${
                                      token.priceChange24h >= 0 ? 'text-green-400' : 'text-red-400'
                                    }`}
                                  >
                                    {token.priceChange24h >= 0 ? (
                                      <TrendingUp className="w-3 h-3" />
                                    ) : (
                                      <TrendingDown className="w-3 h-3" />
                                    )}
                                    {Math.abs(token.priceChange24h).toFixed(2)}%
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className="text-xs text-muted-foreground">{token.name}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          hapticImpact('light');
                          setShowFundFeesModal(true);
                        }}
                        className="px-3 py-1.5 bg-yellow-500/20 border border-yellow-500/30 rounded-lg flex items-center gap-1.5 text-yellow-400 text-xs font-medium hover:bg-yellow-500/30 transition-colors"
                      >
                        <Fuel className="w-3.5 h-3.5" />
                        Add Fee
                      </button>
                    </div>

                    {/* Multi-chain balances */}
                    <div className="space-y-2 mt-2">
                      {/* Relay Chain */}
                      <div className="flex items-center justify-between py-1.5 px-2 bg-black/20 rounded-lg">
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                          <span className="text-xs text-muted-foreground">Relay Chain</span>
                        </div>
                        <span className="text-sm font-mono">{token.balance} HEZ</span>
                      </div>

                      {/* Asset Hub */}
                      <div className="flex items-center justify-between py-1.5 px-2 bg-black/20 rounded-lg">
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                          <span className="text-xs text-muted-foreground">Asset Hub</span>
                          {parseFloat(assetHubHezBalance) < 0.1 && assetHubHezBalance !== '--' && (
                            <span className="text-[10px] text-yellow-400">⚠️</span>
                          )}
                        </div>
                        <span className="text-sm font-mono">{assetHubHezBalance} HEZ</span>
                      </div>

                      {/* People Chain */}
                      <div className="flex items-center justify-between py-1.5 px-2 bg-black/20 rounded-lg">
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                          <span className="text-xs text-muted-foreground">People Chain</span>
                          {parseFloat(peopleHezBalance) < 0.1 && peopleHezBalance !== '--' && (
                            <span className="text-[10px] text-yellow-400">⚠️</span>
                          )}
                        </div>
                        <span className="text-sm font-mono">{peopleHezBalance} HEZ</span>
                      </div>
                    </div>

                    {/* Total Value */}
                    {token.valueUsd !== undefined && token.balance !== '--' && (
                      <div className="mt-2 pt-2 border-t border-white/10 flex justify-between items-center">
                        <span className="text-xs text-muted-foreground">{t('tokens.total')}</span>
                        <span className="text-sm font-semibold">
                          ≈ $
                          {(
                            (parseFloat(token.balance) +
                              parseFloat(assetHubHezBalance === '--' ? '0' : assetHubHezBalance) +
                              parseFloat(peopleHezBalance === '--' ? '0' : peopleHezBalance)) *
                            (token.priceUsd || 0)
                          ).toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  // Regular token card
                  <div
                    key={token.assetId}
                    className={`p-3 rounded-xl border bg-gradient-to-br ${getTokenGradient(token.displaySymbol)} ${
                      token.isHidden ? 'opacity-50' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {token.logo ? (
                          <img
                            src={token.logo}
                            alt={token.displaySymbol}
                            className="w-10 h-10 rounded-full"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                            <span className="text-xs font-bold">
                              {token.displaySymbol.slice(0, 2)}
                            </span>
                          </div>
                        )}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{token.displaySymbol}</span>
                            {token.assetId <= -100 && (
                              <span className="text-[10px] bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded">
                                LP
                              </span>
                            )}
                            {!token.isDefault && (
                              <span className="text-[10px] bg-cyan-500/20 text-cyan-400 px-1.5 py-0.5 rounded">
                                Custom
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {token.priceUsd !== undefined ? (
                              <>
                                <span className="text-xs text-muted-foreground">
                                  ${token.priceUsd.toFixed(token.priceUsd < 1 ? 4 : 2)}
                                </span>
                                {token.priceChange24h !== undefined && (
                                  <span
                                    className={`text-[10px] flex items-center gap-0.5 ${
                                      token.priceChange24h >= 0 ? 'text-green-400' : 'text-red-400'
                                    }`}
                                  >
                                    {token.priceChange24h >= 0 ? (
                                      <TrendingUp className="w-3 h-3" />
                                    ) : (
                                      <TrendingDown className="w-3 h-3" />
                                    )}
                                    {Math.abs(token.priceChange24h).toFixed(2)}%
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className="text-xs text-muted-foreground">{token.name}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p
                            className={`font-semibold font-mono ${token.balance === '--' ? 'text-muted-foreground' : ''}`}
                          >
                            {token.balance}
                          </p>
                          {token.balance === '--' ? (
                            <p className="text-xs text-muted-foreground">
                              {t('tokens.loadingBalance')}
                            </p>
                          ) : token.valueUsd !== undefined ? (
                            <p className="text-xs text-muted-foreground">
                              ≈ ${token.valueUsd.toFixed(2)}
                            </p>
                          ) : (
                            <p className="text-xs text-muted-foreground">{token.displaySymbol}</p>
                          )}
                        </div>

                        {showSettings ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => toggleTokenVisibility(token.assetId)}
                              className="p-1.5 text-muted-foreground hover:text-white rounded"
                            >
                              {token.isHidden ? (
                                <EyeOff className="w-4 h-4" />
                              ) : (
                                <Eye className="w-4 h-4" />
                              )}
                            </button>
                            {!token.isDefault && (
                              <button
                                onClick={() => removeCustomToken(token.assetId)}
                                className="p-1.5 text-red-400 hover:text-red-300 rounded"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            {/* Deposit button for USDT */}
                            {token.displaySymbol === 'USDT' && (
                              <button
                                onClick={() => {
                                  hapticImpact('light');
                                  setShowDepositModal(true);
                                }}
                                className="p-2 text-green-400 hover:text-green-300 hover:bg-green-500/10 rounded-lg"
                                title="USDT Depo Bike"
                              >
                                <Plus className="w-4 h-4" />
                              </button>
                            )}
                            {onSendToken &&
                              token.balance !== '--' &&
                              parseFloat(token.balance) > 0 && (
                                <button
                                  onClick={() => {
                                    hapticImpact('light');
                                    onSendToken(token);
                                  }}
                                  className="p-2 text-muted-foreground hover:text-white hover:bg-white/10 rounded-lg"
                                >
                                  <Send className="w-4 h-4" />
                                </button>
                              )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              )
            )}
          </div>
        </>
      )}

      {/* Fund Fees Modal for XCM Teleport */}
      <FundFeesModal isOpen={showFundFeesModal} onClose={() => setShowFundFeesModal(false)} />

      {/* Deposit USDT Modal */}
      <DepositUSDTModal isOpen={showDepositModal} onClose={() => setShowDepositModal(false)} />
    </div>
  );
}
