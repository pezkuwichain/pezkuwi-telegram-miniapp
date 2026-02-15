/**
 * Explorer Page
 * Standalone blockchain explorer for PezkuwiChain
 * Accessed via /explorer URL - no bottom navigation
 */

import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { Search, Loader2, Globe, Blocks, Users, Clock, Hash, ArrowRight } from 'lucide-react';
import { useTranslation, LANGUAGE_NAMES, VALID_LANGS } from '@/i18n';
import type { LanguageCode } from '@/i18n';
import { initRPCConnection } from '@/lib/rpc-manager';
import { formatAddress, cn } from '@/lib/utils';
import type { ApiPromise } from '@pezkuwi/api';

interface BlockInfo {
  number: number;
  hash: string;
  extrinsicCount: number;
  timestamp: number;
}

interface ExtrinsicInfo {
  blockNumber: number;
  section: string;
  method: string;
  signer: string;
  args: { dest?: string; value?: string };
}

interface SearchResult {
  type: 'block' | 'address';
  blockInfo?: BlockInfo;
  balance?: string;
  address?: string;
}

// Format balance from planck to HEZ (12 decimals)
function formatBalance(planck: string): string {
  const num = BigInt(planck);
  const whole = num / BigInt(10 ** 12);
  const frac = num % BigInt(10 ** 12);
  const fracStr = frac.toString().padStart(12, '0').slice(0, 4);
  return `${whole.toLocaleString()}.${fracStr}`;
}

// Format seconds ago
function formatSecondsAgo(
  ts: number,
  t: (key: string, params?: Record<string, string | number>) => string
): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 1) return t('time.now');
  return `${diff}${t('explorer.seconds')}`;
}

export function ExplorerPage() {
  const { t, lang, setLang } = useTranslation();
  const [showLangMenu, setShowLangMenu] = useState(false);

  // Connection state
  const [isConnecting, setIsConnecting] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // Chain stats
  const [chainName, setChainName] = useState('');
  const [finalizedBlock, setFinalizedBlock] = useState(0);
  const [validatorCount, setValidatorCount] = useState(0);
  const [currentEra, setCurrentEra] = useState(0);
  const [blockTime, setBlockTime] = useState(6);

  // Blocks & extrinsics
  const [blocks, setBlocks] = useState<BlockInfo[]>([]);
  const [extrinsics, setExtrinsics] = useState<ExtrinsicInfo[]>([]);

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const apiRef = useRef<ApiPromise | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  // Initialize connection and subscribe to new heads
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        setIsConnecting(true);
        setConnectionError(null);

        const api = await initRPCConnection();
        if (cancelled) return;
        apiRef.current = api;

        // Fetch chain info
        const [chain, validators, era, finalizedHash] = await Promise.all([
          api.rpc.system.chain(),
          api.query.session.validators(),
          api.query.staking.activeEra(),
          api.rpc.chain.getFinalizedHead(),
        ]);

        if (cancelled) return;

        setChainName(chain.toString());
        setValidatorCount((validators as unknown as unknown[]).length);

        const eraInfo = era.toJSON() as { index: number } | null;
        if (eraInfo) setCurrentEra(eraInfo.index);

        const finalizedHeader = await api.rpc.chain.getHeader(finalizedHash);
        setFinalizedBlock(finalizedHeader.number.toNumber());

        setIsConnecting(false);

        // Subscribe to new heads
        const unsub = await api.rpc.chain.subscribeNewHeads(async (header) => {
          if (cancelled) return;

          const blockHash = await api.rpc.chain.getBlockHash(header.number.toNumber());
          const signedBlock = await api.rpc.chain.getBlock(blockHash);
          const now = Date.now();

          const blockInfo: BlockInfo = {
            number: header.number.toNumber(),
            hash: blockHash.toString(),
            extrinsicCount: signedBlock.block.extrinsics.length,
            timestamp: now,
          };

          setBlocks((prev) => [blockInfo, ...prev].slice(0, 20));

          // Calculate block time from last two blocks
          setBlocks((prev) => {
            if (prev.length >= 2) {
              const diff = (prev[0].timestamp - prev[1].timestamp) / 1000;
              if (diff > 0 && diff < 30) setBlockTime(Math.round(diff));
            }
            return prev;
          });

          // Update finalized block periodically
          try {
            const fHash = await api.rpc.chain.getFinalizedHead();
            const fHeader = await api.rpc.chain.getHeader(fHash);
            setFinalizedBlock(fHeader.number.toNumber());
          } catch {
            // ignore finalized update errors
          }

          // Extract signed extrinsics (skip inherent ones)
          const blockExts = signedBlock.block.extrinsics;
          for (const ext of blockExts) {
            if (ext.isSigned) {
              const section = ext.method.section;
              const method = ext.method.method;
              const signer = ext.signer.toString();

              let dest = '';
              let value = '';

              // Try to extract transfer details
              if (
                section === 'balances' &&
                (method === 'transferKeepAlive' ||
                  method === 'transfer' ||
                  method === 'transferAllowDeath')
              ) {
                try {
                  const args = ext.method.args;
                  if (args.length >= 2) {
                    dest = args[0].toString();
                    value = args[1].toString();
                  }
                } catch {
                  // ignore parse errors
                }
              }

              const extInfo: ExtrinsicInfo = {
                blockNumber: header.number.toNumber(),
                section,
                method,
                signer,
                args: { dest, value },
              };

              setExtrinsics((prev) => [extInfo, ...prev].slice(0, 30));
            }
          }
        });

        unsubRef.current = unsub as unknown as () => void;
      } catch (err) {
        if (cancelled) return;
        setConnectionError(err instanceof Error ? err.message : String(err));
        setIsConnecting(false);
      }
    }

    init();

    return () => {
      cancelled = true;
      if (unsubRef.current) {
        unsubRef.current();
        unsubRef.current = null;
      }
    };
  }, []);

  // Search handler
  const handleSearch = useCallback(async () => {
    const query = searchQuery.trim();
    if (!query || !apiRef.current) return;

    setIsSearching(true);
    setSearchResult(null);

    try {
      const api = apiRef.current;

      // Check if it's a block number
      if (/^\d+$/.test(query)) {
        const blockNum = parseInt(query);
        const blockHash = await api.rpc.chain.getBlockHash(blockNum);
        const signedBlock = await api.rpc.chain.getBlock(blockHash);

        setSearchResult({
          type: 'block',
          blockInfo: {
            number: blockNum,
            hash: blockHash.toString(),
            extrinsicCount: signedBlock.block.extrinsics.length,
            timestamp: Date.now(),
          },
        });
      } else if (query.length >= 40) {
        // Assume it's an address
        const accountInfo = await api.query.system.account(query);
        const data = (accountInfo as unknown as { data: { free: { toString(): string } } }).data;

        setSearchResult({
          type: 'address',
          balance: data.free.toString(),
          address: query,
        });
      }
    } catch {
      setSearchResult(null);
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery]);

  // Loading state
  if (isConnecting) {
    return (
      <div className="min-h-screen bg-[#030712] flex flex-col items-center justify-center gap-4 p-4">
        <img src="/tokens/pezkuwichain.png" alt="Pezkuwi" className="w-16 h-16 rounded-full" />
        <Loader2 className="w-8 h-8 text-[#70c639] animate-spin" />
        <p className="text-gray-400 text-sm">{t('explorer.connecting')}</p>
      </div>
    );
  }

  // Error state
  if (connectionError) {
    return (
      <div className="min-h-screen bg-[#030712] flex flex-col items-center justify-center gap-4 p-4">
        <img src="/tokens/pezkuwichain.png" alt="Pezkuwi" className="w-16 h-16 rounded-full" />
        <p className="text-red-400 text-sm text-center">{connectionError}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-[#70c639] text-black rounded-lg text-sm font-medium"
        >
          {t('common.retry')}
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#030712] text-white">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-[#030712]/90 backdrop-blur-lg border-b border-gray-800">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/tokens/pezkuwichain.png" alt="Pezkuwi" className="w-8 h-8 rounded-full" />
            <div>
              <h1 className="text-lg font-bold text-white">{t('explorer.title')}</h1>
              <span className="text-xs px-2 py-0.5 bg-[#70c639]/20 text-[#70c639] rounded-full">
                {chainName || 'Pezkuwi'}
              </span>
            </div>
          </div>

          {/* Language selector */}
          <div className="relative">
            <button
              onClick={() => setShowLangMenu(!showLangMenu)}
              className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-white rounded border border-gray-700"
            >
              <Globe className="w-3.5 h-3.5" />
              {LANGUAGE_NAMES[lang]}
            </button>
            {showLangMenu && (
              <div className="absolute top-full right-0 mt-1 bg-gray-900 border border-gray-700 rounded-lg shadow-xl overflow-hidden z-50">
                {VALID_LANGS.map((l) => (
                  <button
                    key={l}
                    onClick={() => {
                      setLang(l as LanguageCode);
                      setShowLangMenu(false);
                    }}
                    className={cn(
                      'block w-full text-left px-4 py-2 text-sm hover:bg-gray-800',
                      lang === l ? 'text-[#70c639]' : 'text-gray-300'
                    )}
                  >
                    {LANGUAGE_NAMES[l as LanguageCode]}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder={t('explorer.search')}
            className="w-full bg-gray-900 border border-gray-700 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#70c639]/50"
          />
          {isSearching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#70c639] animate-spin" />
          )}
        </div>

        {/* Search Result */}
        {searchResult && (
          <div className="bg-gray-900/80 border border-gray-700 rounded-xl p-4 space-y-2">
            <h3 className="text-sm font-medium text-[#70c639]">{t('explorer.searchResult')}</h3>
            {searchResult.type === 'block' && searchResult.blockInfo && (
              <div className="space-y-1 text-sm">
                <p className="text-gray-300">
                  <span className="text-gray-500">{t('explorer.block')}:</span> #
                  {searchResult.blockInfo.number.toLocaleString()}
                </p>
                <p className="text-gray-300">
                  <span className="text-gray-500">{t('explorer.hash')}:</span>{' '}
                  <span className="font-mono text-xs break-all">{searchResult.blockInfo.hash}</span>
                </p>
                <p className="text-gray-300">
                  <span className="text-gray-500">{t('explorer.extrinsics')}:</span>{' '}
                  {searchResult.blockInfo.extrinsicCount}
                </p>
              </div>
            )}
            {searchResult.type === 'address' && (
              <div className="space-y-1 text-sm">
                <p className="text-gray-300 font-mono text-xs break-all">{searchResult.address}</p>
                <p className="text-gray-300">
                  <span className="text-gray-500">{t('explorer.balance')}:</span>{' '}
                  {formatBalance(searchResult.balance || '0')} HEZ
                </p>
              </div>
            )}
            <button
              onClick={() => {
                setSearchResult(null);
                setSearchQuery('');
              }}
              className="text-xs text-gray-500 hover:text-gray-300"
            >
              {t('common.close')}
            </button>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            icon={<Blocks className="w-4 h-4" />}
            label={t('explorer.finalized')}
            value={`#${finalizedBlock.toLocaleString()}`}
          />
          <StatCard
            icon={<Users className="w-4 h-4" />}
            label={t('explorer.validators')}
            value={validatorCount.toString()}
          />
          <StatCard
            icon={<Hash className="w-4 h-4" />}
            label={t('explorer.era')}
            value={currentEra.toString()}
          />
          <StatCard
            icon={<Clock className="w-4 h-4" />}
            label={t('explorer.blockTime')}
            value={`${blockTime}s`}
          />
        </div>

        {/* Latest Blocks */}
        <section>
          <h2 className="text-sm font-semibold text-gray-300 mb-2">{t('explorer.latestBlocks')}</h2>
          <div className="space-y-2">
            {blocks.length === 0 ? (
              <div className="bg-gray-900/50 rounded-xl p-4 text-center text-gray-500 text-sm">
                <Loader2 className="w-4 h-4 animate-spin mx-auto mb-2 text-[#70c639]" />
                {t('explorer.connecting')}
              </div>
            ) : (
              blocks.slice(0, 10).map((block) => (
                <div
                  key={block.number}
                  className="bg-gray-900/50 border border-gray-800 rounded-xl px-4 py-3 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#70c639]/10 flex items-center justify-center">
                      <Blocks className="w-4 h-4 text-[#70c639]" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">
                        #{block.number.toLocaleString()}
                      </p>
                      <p className="text-xs text-gray-500 font-mono">
                        {block.hash.slice(0, 10)}...{block.hash.slice(-6)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-400">
                      {block.extrinsicCount} {t('explorer.extrinsics')}
                    </p>
                    <p className="text-xs text-gray-500">{formatSecondsAgo(block.timestamp, t)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Recent Extrinsics (transfers) */}
        {extrinsics.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-gray-300 mb-2">
              {t('explorer.recentTransfers')}
            </h2>
            <div className="space-y-2">
              {extrinsics.slice(0, 10).map((ext, i) => (
                <div
                  key={`${ext.blockNumber}-${ext.signer}-${i}`}
                  className="bg-gray-900/50 border border-gray-800 rounded-xl px-4 py-3"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-[#70c639]">
                      {ext.section}.{ext.method}
                    </span>
                    <span className="text-xs text-gray-500">
                      #{ext.blockNumber.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-gray-400">
                    <span className="font-mono">{formatAddress(ext.signer, 6)}</span>
                    {ext.args.dest && (
                      <>
                        <ArrowRight className="w-3 h-3 text-gray-600" />
                        <span className="font-mono">{formatAddress(ext.args.dest, 6)}</span>
                      </>
                    )}
                    {ext.args.value && (
                      <span className="ml-auto text-white font-medium">
                        {formatBalance(ext.args.value)} HEZ
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Footer spacing */}
        <div className="h-8" />
      </main>
    </div>
  );
}

// Stat card component
function StatCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[#70c639]">{icon}</span>
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <p className="text-lg font-bold text-white">{value}</p>
    </div>
  );
}
