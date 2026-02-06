/**
 * Wallet Dashboard Component
 * Production-ready wallet interface copied from pwap/web
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Copy,
  Check,
  LogOut,
  Send,
  QrCode,
  History,
  RefreshCw,
  ArrowUpRight,
  ArrowDownLeft,
  ScanLine,
  ArrowLeftRight,
  Droplets,
  Coins,
  Rocket,
} from 'lucide-react';
import QRCode from 'qrcode';
import { TokensCard } from './TokensCard';
import { SwapModal } from './SwapModal';
import { PoolsModal } from './PoolsModal';
import { LPStakingModal } from './LPStakingModal';
import { HEZStakingModal } from './HEZStakingModal';
import { useWallet } from '@/contexts/WalletContext';
import { useTelegram } from '@/hooks/useTelegram';
import { formatAddress } from '@/lib/wallet-service';

interface Props {
  onDisconnect: () => void;
}

interface Transaction {
  blockNumber: number;
  hash: string;
  method: string;
  section: string;
  from: string;
  to?: string;
  amount?: string;
  timestamp?: number;
  direction: 'sent' | 'received';
  assetId?: string;
}

export function WalletDashboard({ onDisconnect }: Props) {
  const { address, balance, api, assetHubApi, disconnect, isLoading } = useWallet();
  const { hapticImpact, hapticNotification, showAlert } = useTelegram();

  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'main' | 'send' | 'receive' | 'history'>('main');
  const [pezBalance, setPezBalance] = useState<string>('0.0000');
  const [isLoadingPez, setIsLoadingPez] = useState(false);
  const [recentTxs, setRecentTxs] = useState<Transaction[]>([]);
  const [isLoadingTxs, setIsLoadingTxs] = useState(false);
  const [isSwapModalOpen, setIsSwapModalOpen] = useState(false);
  const [isPoolsModalOpen, setIsPoolsModalOpen] = useState(false);
  const [isLPStakingModalOpen, setIsLPStakingModalOpen] = useState(false);
  const [isHEZStakingModalOpen, setIsHEZStakingModalOpen] = useState(false);
  const [isStakingSelectorOpen, setIsStakingSelectorOpen] = useState(false);

  // Subscribe to PEZ balance (Asset ID: 1) - Uses Asset Hub API
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    const subscribeToPezBalance = async () => {
      if (!assetHubApi || !address) {
        setPezBalance('0.0000');
        return;
      }

      setIsLoadingPez(true);
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const unsub = await (assetHubApi.query.assets as any).account(
          1,
          address,
          (result: { isSome: boolean; unwrap: () => { balance: { toString: () => string } } }) => {
            if (result.isSome) {
              const assetData = result.unwrap();
              const pezAmount = assetData.balance.toString();
              const pezTokens = (parseInt(pezAmount) / 1e12).toFixed(4);
              setPezBalance(pezTokens);
            } else {
              setPezBalance('0.0000');
            }
            setIsLoadingPez(false);
          }
        );
        unsubscribe = unsub;
      } catch (err) {
        console.error('Failed to subscribe to PEZ balance:', err);
        setPezBalance('0.0000');
        setIsLoadingPez(false);
      }
    };

    subscribeToPezBalance();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [assetHubApi, address]);

  // Fetch recent transactions from both main chain (HEZ) and Asset Hub (PEZ)
  const fetchRecentTransactions = useCallback(async () => {
    if (!address) return;

    setIsLoadingTxs(true);
    const txList: Transaction[] = [];

    // Fetch HEZ transactions from main chain
    if (api) {
      try {
        const currentBlock = await api.rpc.chain.getBlock();
        const currentBlockNumber = currentBlock.block.header.number.toNumber();
        const blocksToCheck = Math.min(100, currentBlockNumber);

        for (let i = 0; i < blocksToCheck && txList.length < 10; i++) {
          const blockNumber = currentBlockNumber - i;

          try {
            const blockHash = await api.rpc.chain.getBlockHash(blockNumber);
            const block = await api.rpc.chain.getBlock(blockHash);

            block.block.extrinsics.forEach((extrinsic) => {
              if (!extrinsic.isSigned) return;

              const { method, signer } = extrinsic;
              const fromAddress = signer.toString();

              // Parse balances.transfer and transferKeepAlive (HEZ)
              if (
                method.section === 'balances' &&
                (method.method === 'transfer' || method.method === 'transferKeepAlive')
              ) {
                const [dest, value] = method.args;
                const toAddress = dest.toString();

                const isFromUs = fromAddress === address;
                const isToUs = toAddress === address;

                if (isFromUs || isToUs) {
                  txList.push({
                    blockNumber,
                    hash: extrinsic.hash.toHex(),
                    method: method.method,
                    section: method.section,
                    from: fromAddress,
                    to: toAddress,
                    amount: value.toString(),
                    direction: isFromUs ? 'sent' : 'received',
                  });
                }
              }
            });
          } catch {
            // Continue to next block
          }
        }
      } catch (err) {
        console.error('Failed to fetch HEZ transactions:', err);
      }
    }

    // Fetch PEZ transactions from Asset Hub
    if (assetHubApi) {
      try {
        const currentBlock = await assetHubApi.rpc.chain.getBlock();
        const currentBlockNumber = currentBlock.block.header.number.toNumber();
        const blocksToCheck = Math.min(100, currentBlockNumber);

        for (let i = 0; i < blocksToCheck && txList.length < 20; i++) {
          const blockNumber = currentBlockNumber - i;

          try {
            const blockHash = await assetHubApi.rpc.chain.getBlockHash(blockNumber);
            const block = await assetHubApi.rpc.chain.getBlock(blockHash);

            block.block.extrinsics.forEach((extrinsic) => {
              if (!extrinsic.isSigned) return;

              const { method, signer } = extrinsic;
              const fromAddress = signer.toString();

              // Parse assets.transfer and transferKeepAlive (PEZ)
              if (
                method.section === 'assets' &&
                (method.method === 'transfer' || method.method === 'transferKeepAlive')
              ) {
                const [assetId, dest, value] = method.args;
                const toAddress = dest.toString();

                const isFromUs = fromAddress === address;
                const isToUs = toAddress === address;

                if (isFromUs || isToUs) {
                  txList.push({
                    blockNumber,
                    hash: extrinsic.hash.toHex(),
                    method: method.method,
                    section: method.section,
                    from: fromAddress,
                    to: toAddress,
                    amount: value.toString(),
                    direction: isFromUs ? 'sent' : 'received',
                    assetId: assetId?.toString(),
                  });
                }
              }
            });
          } catch {
            // Continue to next block
          }
        }
      } catch (err) {
        console.error('Failed to fetch PEZ transactions:', err);
      }
    }

    // Sort by block number (newest first) and limit
    txList.sort((a, b) => b.blockNumber - a.blockNumber);
    setRecentTxs(txList.slice(0, 20));
    setIsLoadingTxs(false);
  }, [api, assetHubApi, address]);

  // Initial fetch - trigger when APIs are available
  useEffect(() => {
    // Only run when at least one API connection is established
    const hasConnection = api || assetHubApi;
    if (!hasConnection || !address) return;

    // Use a flag to prevent state updates after unmount
    let isMounted = true;

    const loadTransactions = async () => {
      if (isMounted) {
        await fetchRecentTransactions();
      }
    };

    loadTransactions();

    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, assetHubApi, address]);

  // Real-time subscription to new blocks for instant transaction updates
  useEffect(() => {
    if (!api || !address) return;

    let unsubscribe: (() => void) | undefined;

    const subscribeToNewBlocks = async () => {
      try {
        // Subscribe to new block headers
        const unsub = await api.rpc.chain.subscribeNewHeads(async (header) => {
          const blockNumber = header.number.toNumber();
          const blockHash = header.hash;

          try {
            const block = await api.rpc.chain.getBlock(blockHash);

            block.block.extrinsics.forEach((extrinsic) => {
              if (!extrinsic.isSigned) return;

              const { method, signer } = extrinsic;
              const fromAddress = signer.toString();

              // Parse balances.transfer and transferKeepAlive
              if (
                method.section === 'balances' &&
                (method.method === 'transfer' || method.method === 'transferKeepAlive')
              ) {
                const [dest, value] = method.args;
                const toAddress = dest.toString();

                const isFromUs = fromAddress === address;
                const isToUs = toAddress === address;

                if (isFromUs || isToUs) {
                  const newTx: Transaction = {
                    blockNumber,
                    hash: extrinsic.hash.toHex(),
                    method: method.method,
                    section: method.section,
                    from: fromAddress,
                    to: toAddress,
                    amount: value.toString(),
                    direction: isFromUs ? 'sent' : 'received',
                  };

                  // Add to beginning of list (most recent first)
                  setRecentTxs((prev) => {
                    // Avoid duplicates
                    if (prev.some((tx) => tx.hash === newTx.hash)) return prev;
                    return [newTx, ...prev].slice(0, 20); // Keep max 20
                  });

                  // Haptic feedback for new transaction
                  hapticNotification('success');
                }
              }

              // Parse assets.transfer and assets.transferKeepAlive
              else if (
                method.section === 'assets' &&
                (method.method === 'transfer' || method.method === 'transferKeepAlive')
              ) {
                const [assetId, dest, value] = method.args;
                const toAddress = dest.toString();

                const isFromUs = fromAddress === address;
                const isToUs = toAddress === address;

                if (isFromUs || isToUs) {
                  const newTx: Transaction = {
                    blockNumber,
                    hash: extrinsic.hash.toHex(),
                    method: method.method,
                    section: method.section,
                    from: fromAddress,
                    to: toAddress,
                    amount: value.toString(),
                    direction: isFromUs ? 'sent' : 'received',
                    assetId: assetId?.toString(),
                  };

                  setRecentTxs((prev) => {
                    if (prev.some((tx) => tx.hash === newTx.hash)) return prev;
                    return [newTx, ...prev].slice(0, 20);
                  });

                  hapticNotification('success');
                }
              }
            });
          } catch (err) {
            console.error('Error processing new block:', err);
          }
        });

        unsubscribe = unsub;
      } catch (err) {
        console.error('Failed to subscribe to new blocks:', err);
      }
    };

    subscribeToNewBlocks();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [api, address, hapticNotification]);

  // Real-time subscription to Asset Hub for PEZ transactions
  useEffect(() => {
    if (!assetHubApi || !address) return;

    let unsubscribe: (() => void) | undefined;

    const subscribeToAssetHubBlocks = async () => {
      try {
        const unsub = await assetHubApi.rpc.chain.subscribeNewHeads(async (header) => {
          const blockNumber = header.number.toNumber();
          const blockHash = header.hash;

          try {
            const block = await assetHubApi.rpc.chain.getBlock(blockHash);

            block.block.extrinsics.forEach((extrinsic) => {
              if (!extrinsic.isSigned) return;

              const { method, signer } = extrinsic;
              const fromAddress = signer.toString();

              // Parse assets.transfer and assets.transferKeepAlive on Asset Hub
              if (
                method.section === 'assets' &&
                (method.method === 'transfer' || method.method === 'transferKeepAlive')
              ) {
                const [assetId, dest, value] = method.args;
                const toAddress = dest.toString();

                const isFromUs = fromAddress === address;
                const isToUs = toAddress === address;

                if (isFromUs || isToUs) {
                  const newTx: Transaction = {
                    blockNumber,
                    hash: extrinsic.hash.toHex(),
                    method: method.method,
                    section: method.section,
                    from: fromAddress,
                    to: toAddress,
                    amount: value.toString(),
                    direction: isFromUs ? 'sent' : 'received',
                    assetId: assetId?.toString(),
                  };

                  setRecentTxs((prev) => {
                    if (prev.some((tx) => tx.hash === newTx.hash)) return prev;
                    return [newTx, ...prev].slice(0, 20);
                  });

                  hapticNotification('success');
                }
              }
            });
          } catch (err) {
            console.error('Error processing Asset Hub block:', err);
          }
        });

        unsubscribe = unsub;
      } catch (err) {
        console.error('Failed to subscribe to Asset Hub blocks:', err);
      }
    };

    subscribeToAssetHubBlocks();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [assetHubApi, address, hapticNotification]);

  const handleCopyAddress = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      setCopied(true);
      hapticNotification('success');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDisconnect = () => {
    hapticImpact('medium');
    disconnect();
    onDisconnect();
  };

  const handleRefresh = () => {
    hapticImpact('light');
    fetchRecentTransactions();
  };

  const formatAmount = (amount: string, decimals: number = 12) => {
    const value = parseInt(amount) / Math.pow(10, decimals);
    return value.toFixed(4);
  };

  if (activeTab === 'send') {
    return <SendTab onBack={() => setActiveTab('main')} />;
  }

  if (activeTab === 'receive') {
    return <ReceiveTab address={address} onBack={() => setActiveTab('main')} />;
  }

  if (activeTab === 'history') {
    return (
      <HistoryTab
        transactions={recentTxs}
        isLoading={isLoadingTxs}
        onRefresh={fetchRecentTransactions}
        onBack={() => setActiveTab('main')}
      />
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full overflow-hidden">
              <img
                src="/tokens/pezkuwichain.png"
                alt="Pezkuwichain"
                className="w-full h-full object-cover"
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm">{address ? formatAddress(address) : ''}</span>
                <button onClick={handleCopyAddress} className="text-muted-foreground">
                  {copied ? (
                    <Check className="w-4 h-4 text-green-400" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
              <p className="text-xs text-green-400">Girêdayî</p>
            </div>
          </div>
          <button
            onClick={handleDisconnect}
            className="p-2 text-red-400 hover:bg-red-400/10 rounded-lg"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Balance Cards */}
      <div className="p-4 space-y-3">
        {/* HEZ Balance Card */}
        <div className="p-4 bg-gradient-to-br from-green-900/30 to-yellow-900/30 border border-green-500/30 rounded-xl">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <img src="/tokens/HEZ.png" alt="HEZ" className="w-8 h-8 rounded-full" />
              <span className="text-sm text-gray-400">HEZ Balance</span>
            </div>
            <button
              onClick={handleRefresh}
              disabled={isLoading}
              className="text-gray-400 hover:text-white"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <div className="text-3xl font-bold text-white">
            {isLoading ? '...' : (balance ?? '0')}
            <span className="text-lg text-gray-400 ml-2">HEZ</span>
          </div>
        </div>

        {/* PEZ Balance Card */}
        <div className="p-4 bg-gradient-to-br from-blue-900/30 to-purple-900/30 border border-blue-500/30 rounded-xl">
          <div className="flex items-center gap-2 mb-3">
            <img src="/tokens/PEZ.png" alt="PEZ" className="w-8 h-8 rounded-full" />
            <span className="text-sm text-gray-400">PEZ Token</span>
          </div>
          <div className="text-3xl font-bold text-white">
            {isLoadingPez ? '...' : pezBalance}
            <span className="text-lg text-gray-400 ml-2">PEZ</span>
          </div>
          <p className="text-xs text-gray-500 mt-1">Governance & Rewards Token</p>
        </div>
      </div>

      {/* Quick Actions - 2x3 Grid */}
      <div className="px-4 pb-4 grid grid-cols-3 gap-2">
        <button
          onClick={() => {
            hapticImpact('light');
            setActiveTab('send');
          }}
          className="flex flex-col items-center gap-1 p-3 bg-gradient-to-r from-green-600/20 to-yellow-500/20 border border-green-500/30 rounded-xl"
        >
          <div className="w-8 h-8 bg-green-500/20 rounded-full flex items-center justify-center">
            <Send className="w-4 h-4 text-green-400" />
          </div>
          <span className="text-xs font-medium">Bişîne</span>
        </button>

        <button
          onClick={() => {
            hapticImpact('light');
            setActiveTab('receive');
          }}
          className="flex flex-col items-center gap-1 p-3 bg-muted rounded-xl border border-border"
        >
          <div className="w-8 h-8 bg-cyan-500/20 rounded-full flex items-center justify-center">
            <QrCode className="w-4 h-4 text-cyan-400" />
          </div>
          <span className="text-xs font-medium">Werbigire</span>
        </button>

        <button
          onClick={() => {
            hapticImpact('light');
            setIsSwapModalOpen(true);
          }}
          className="flex flex-col items-center gap-1 p-3 bg-gradient-to-r from-blue-600/20 to-purple-500/20 border border-blue-500/30 rounded-xl"
        >
          <div className="w-8 h-8 bg-blue-500/20 rounded-full flex items-center justify-center">
            <ArrowLeftRight className="w-4 h-4 text-blue-400" />
          </div>
          <span className="text-xs font-medium">Swap</span>
        </button>

        <button
          onClick={() => {
            hapticImpact('light');
            setIsPoolsModalOpen(true);
          }}
          className="flex flex-col items-center gap-1 p-3 bg-gradient-to-r from-purple-600/20 to-pink-500/20 border border-purple-500/30 rounded-xl"
        >
          <div className="w-8 h-8 bg-purple-500/20 rounded-full flex items-center justify-center">
            <Droplets className="w-4 h-4 text-purple-400" />
          </div>
          <span className="text-xs font-medium">Pools</span>
        </button>

        <button
          onClick={() => {
            hapticImpact('light');
            setIsStakingSelectorOpen(true);
          }}
          className="flex flex-col items-center gap-1 p-3 bg-gradient-to-r from-yellow-600/20 to-orange-500/20 border border-yellow-500/30 rounded-xl"
        >
          <div className="w-8 h-8 bg-yellow-500/20 rounded-full flex items-center justify-center">
            <Coins className="w-4 h-4 text-yellow-400" />
          </div>
          <span className="text-xs font-medium">Staking</span>
        </button>

        <button
          onClick={() => {
            hapticImpact('light');
            showAlert('Presale tê de ye! Zûtirîn demekê de dê bête vekirin.');
          }}
          className="flex flex-col items-center gap-1 p-3 bg-gradient-to-r from-pink-600/20 to-red-500/20 border border-pink-500/30 rounded-xl"
        >
          <div className="w-8 h-8 bg-pink-500/20 rounded-full flex items-center justify-center">
            <Rocket className="w-4 h-4 text-pink-400" />
          </div>
          <span className="text-xs font-medium">Presale</span>
        </button>
      </div>

      {/* Recent Activity */}
      <div className="px-4 pb-4">
        <div className="bg-muted/50 border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Çalakiya Dawî</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  hapticImpact('light');
                  setActiveTab('history');
                }}
                className="text-gray-400 hover:text-white p-1"
                title="Dîrok"
              >
                <History className="w-4 h-4" />
              </button>
              <button
                onClick={handleRefresh}
                disabled={isLoadingTxs}
                className="text-gray-400 hover:text-white p-1"
                title="Nûkirin"
              >
                <RefreshCw className={`w-4 h-4 ${isLoadingTxs ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {isLoadingTxs ? (
            <div className="text-center py-8">
              <RefreshCw className="w-8 h-8 text-gray-600 mx-auto mb-2 animate-spin" />
              <p className="text-gray-400 text-sm">Tê barkirin...</p>
            </div>
          ) : recentTxs.length === 0 ? (
            <div className="text-center py-8">
              <History className="w-8 h-8 text-gray-600 mx-auto mb-2" />
              <p className="text-gray-500 text-sm">Transaksiyona dawî tune</p>
              <p className="text-gray-600 text-xs mt-1">Dîroka te dê li vir xuya bibe</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentTxs.slice(0, 5).map((tx, idx) => (
                <div
                  key={`${tx.blockNumber}-${idx}`}
                  className="flex items-center justify-between p-3 bg-background/50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`${tx.direction === 'sent' ? 'bg-yellow-500/20' : 'bg-green-500/20'} p-2 rounded-lg`}
                    >
                      {tx.direction === 'sent' ? (
                        <ArrowUpRight className="w-4 h-4 text-yellow-400" />
                      ) : (
                        <ArrowDownLeft className="w-4 h-4 text-green-400" />
                      )}
                    </div>
                    <div>
                      <div className="text-sm font-medium">
                        {tx.direction === 'sent' ? 'Şandin' : 'Wergirtin'}
                      </div>
                      <div className="text-xs text-gray-400">Block #{tx.blockNumber}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div
                      className={`text-sm font-mono ${tx.direction === 'sent' ? 'text-yellow-400' : 'text-green-400'}`}
                    >
                      {tx.direction === 'sent' ? '-' : '+'}
                      {formatAmount(tx.amount || '0')}
                    </div>
                    <div className="text-xs text-gray-400">
                      {tx.section === 'balances'
                        ? 'HEZ'
                        : tx.assetId === '1'
                          ? 'PEZ'
                          : `Asset #${tx.assetId}`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Tokens Card */}
      <div className="px-4 pb-4">
        <TokensCard />
      </div>

      {/* Modals */}
      <SwapModal isOpen={isSwapModalOpen} onClose={() => setIsSwapModalOpen(false)} />
      <PoolsModal isOpen={isPoolsModalOpen} onClose={() => setIsPoolsModalOpen(false)} />
      <LPStakingModal
        isOpen={isLPStakingModalOpen}
        onClose={() => setIsLPStakingModalOpen(false)}
      />
      <HEZStakingModal
        isOpen={isHEZStakingModalOpen}
        onClose={() => setIsHEZStakingModalOpen(false)}
      />

      {/* Staking Selector */}
      {isStakingSelectorOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-end justify-center">
          <div className="bg-background w-full max-w-lg rounded-t-3xl p-6 animate-in slide-in-from-bottom duration-300">
            <h2 className="text-lg font-semibold mb-4 text-center">Staking Hilbijêre</h2>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => {
                  setIsStakingSelectorOpen(false);
                  setIsHEZStakingModalOpen(true);
                }}
                className="p-4 bg-gradient-to-br from-green-600/20 to-emerald-500/20 border border-green-500/30 rounded-xl"
              >
                <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Coins className="w-6 h-6 text-green-400" />
                </div>
                <div className="font-medium">HEZ Staking</div>
                <div className="text-xs text-muted-foreground mt-1">Validator nominate bike</div>
                <div className="text-xs text-green-400 mt-2">Trust Score +</div>
              </button>

              <button
                onClick={() => {
                  setIsStakingSelectorOpen(false);
                  setIsLPStakingModalOpen(true);
                }}
                className="p-4 bg-gradient-to-br from-purple-600/20 to-pink-500/20 border border-purple-500/30 rounded-xl"
              >
                <div className="w-12 h-12 bg-purple-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Droplets className="w-6 h-6 text-purple-400" />
                </div>
                <div className="font-medium">LP Staking</div>
                <div className="text-xs text-muted-foreground mt-1">LP token stake bike</div>
                <div className="text-xs text-purple-400 mt-2">PEZ Xelat +</div>
              </button>
            </div>

            <button
              onClick={() => setIsStakingSelectorOpen(false)}
              className="w-full mt-4 py-3 bg-secondary text-muted-foreground rounded-xl"
            >
              Paşve
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Token types for send
type SendToken = 'HEZ' | 'PEZ' | 'USDT' | 'DOT';

interface TokenOption {
  symbol: SendToken;
  name: string;
  chain: string;
  icon: string;
  assetId?: number; // Asset ID for Asset Hub tokens
  decimals: number;
}

const SEND_TOKENS: TokenOption[] = [
  {
    symbol: 'HEZ',
    name: 'Hezkurd',
    chain: 'Pezkuwi Mainnet',
    icon: '/tokens/HEZ.png',
    decimals: 12,
  },
  {
    symbol: 'PEZ',
    name: 'Pezkuwi',
    chain: 'Asset Hub',
    icon: '/tokens/PEZ.png',
    assetId: 1,
    decimals: 12,
  },
  {
    symbol: 'USDT',
    name: 'Tether USD',
    chain: 'Asset Hub',
    icon: '/tokens/USDT.png',
    assetId: 1000,
    decimals: 6,
  },
  {
    symbol: 'DOT',
    name: 'Polkadot',
    chain: 'Asset Hub',
    icon: '/tokens/DOT.png',
    assetId: 1001,
    decimals: 10,
  },
];

// Send Tab
function SendTab({ onBack }: { onBack: () => void }) {
  const { balance, api, assetHubApi, keypair } = useWallet();
  const { hapticNotification, hapticImpact } = useTelegram();

  const [selectedToken, setSelectedToken] = useState<SendToken | null>(null);
  const [toAddress, setToAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [txHash, setTxHash] = useState('');
  const [pezBalance, setPezBalance] = useState<string>('0.0000');
  const [usdtBalance, setUsdtBalance] = useState<string>('0.00');
  const [dotBalance, setDotBalance] = useState<string>('0.0000');

  // Fetch PEZ and USDT balances when Asset Hub is available
  useEffect(() => {
    if (!assetHubApi || !keypair) return;

    const fetchAssetBalances = async () => {
      try {
        // Fetch PEZ balance (Asset ID: 1, 12 decimals)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pezResult = await (assetHubApi.query.assets as any).account(1, keypair.address);
        if (pezResult.isSome) {
          const assetData = pezResult.unwrap();
          const pezAmount = assetData.balance.toString();
          setPezBalance((parseInt(pezAmount) / 1e12).toFixed(4));
        }

        // Fetch USDT balance (Asset ID: 1000, 6 decimals)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const usdtResult = await (assetHubApi.query.assets as any).account(1000, keypair.address);
        if (usdtResult.isSome) {
          const assetData = usdtResult.unwrap();
          const usdtAmount = assetData.balance.toString();
          setUsdtBalance((parseInt(usdtAmount) / 1e6).toFixed(2));
        }

        // Fetch DOT balance (Asset ID: 1001, 10 decimals)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const dotResult = await (assetHubApi.query.assets as any).account(1001, keypair.address);
        if (dotResult.isSome) {
          const assetData = dotResult.unwrap();
          const dotAmount = assetData.balance.toString();
          setDotBalance((parseInt(dotAmount) / 1e10).toFixed(4));
        }
      } catch (err) {
        console.error('Failed to fetch asset balances:', err);
      }
    };

    fetchAssetBalances();
  }, [assetHubApi, keypair]);

  const getCurrentBalance = () => {
    if (selectedToken === 'HEZ') return balance ?? '0.0000';
    if (selectedToken === 'PEZ') return pezBalance;
    if (selectedToken === 'USDT') return usdtBalance;
    if (selectedToken === 'DOT') return dotBalance;
    return '0.0000';
  };

  const handleScanQR = () => {
    hapticImpact('light');
    const tg = window.Telegram?.WebApp;

    if (!tg?.showScanQrPopup) {
      setError('QR okuyucu vê platformê de amade nîne');
      return;
    }

    tg.showScanQrPopup({ text: 'Navnîşana cîzdanê bişoxîne' }, (scannedText: string) => {
      if (scannedText) {
        // Extract address - might be raw address or URI format
        let address = scannedText;

        // Handle substrate/polkadot URI format: substrate:5xxx...
        if (scannedText.includes(':')) {
          const parts = scannedText.split(':');
          address = parts[parts.length - 1].split('?')[0]; // Remove any query params
        }

        // Validate it looks like a Substrate address (starts with 5, length ~48)
        if (address.startsWith('5') && address.length >= 46) {
          setToAddress(address);
          hapticNotification('success');
          tg.closeScanQrPopup?.();
          return true; // Close popup
        } else {
          setError('Navnîşana derbasdar nîne');
          hapticNotification('error');
        }
      }
      return false; // Keep popup open
    });
  };

  const handleSend = async () => {
    if (!keypair) {
      setError('Cîzdan amade nîne');
      return;
    }

    if (!selectedToken) {
      setError('Token hilbijêre');
      return;
    }

    if (!toAddress || !amount) {
      setError('Navnîşan û mîqdar binivîse');
      return;
    }

    const currentBalance = parseFloat(getCurrentBalance());
    const sendAmount = parseFloat(amount);

    if (sendAmount > currentBalance) {
      setError('Bakiye têrê nake');
      return;
    }

    // Check if appropriate API is available
    if (selectedToken === 'HEZ' && !api) {
      setError('Mainnet API amade nîne');
      return;
    }
    if (
      (selectedToken === 'PEZ' || selectedToken === 'USDT' || selectedToken === 'DOT') &&
      !assetHubApi
    ) {
      setError('Asset Hub API amade nîne');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      // Get token info for decimals
      const tokenInfo = SEND_TOKENS.find((t) => t.symbol === selectedToken);
      const decimals = tokenInfo?.decimals ?? 12;
      const amountInSmallestUnit = BigInt(Math.floor(parseFloat(amount) * Math.pow(10, decimals)));
      let tx;

      if (selectedToken === 'HEZ') {
        // HEZ transfer on main chain
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tx = (api!.tx.balances as any).transferKeepAlive(toAddress, amountInSmallestUnit);
      } else {
        // Asset transfer on Asset Hub (PEZ: asset ID 1, USDT: asset ID 1000)
        const assetId = tokenInfo?.assetId ?? 1;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tx = (assetHubApi!.tx.assets as any).transfer(assetId, toAddress, amountInSmallestUnit);
      }

      const hash = await tx.signAndSend(keypair);
      setTxHash(hash.toHex());
      setSuccess(true);
      hapticNotification('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transfer neserketî');
      hapticNotification('error');
    } finally {
      setIsLoading(false);
    }
  };

  // Token selection screen
  if (!selectedToken) {
    return (
      <div className="p-4 space-y-6">
        <div className="flex items-center justify-between">
          <button onClick={onBack} className="text-muted-foreground">
            ← Paş
          </button>
          <h2 className="text-lg font-semibold">Token Hilbijêre</h2>
          <div className="w-10" />
        </div>

        <p className="text-sm text-muted-foreground text-center">Kîjan token bişîne?</p>

        <div className="space-y-3">
          {SEND_TOKENS.map((token) => {
            const tokenBalance =
              token.symbol === 'HEZ'
                ? (balance ?? '0.0000')
                : token.symbol === 'PEZ'
                  ? pezBalance
                  : token.symbol === 'USDT'
                    ? usdtBalance
                    : '0.00';
            const isDisabled = token.symbol === 'HEZ' ? !api : !assetHubApi;

            return (
              <button
                key={token.symbol}
                onClick={() => {
                  if (!isDisabled) {
                    hapticImpact('light');
                    setSelectedToken(token.symbol);
                  }
                }}
                disabled={isDisabled}
                className={`w-full p-4 rounded-xl border flex items-center gap-4 transition-all ${
                  isDisabled
                    ? 'opacity-50 cursor-not-allowed border-border bg-muted/30'
                    : 'border-border bg-muted/50 hover:bg-muted hover:border-primary/50'
                }`}
              >
                <img src={token.icon} alt={token.symbol} className="w-12 h-12 rounded-full" />
                <div className="flex-1 text-left">
                  <div className="font-semibold">{token.symbol}</div>
                  <div className="text-xs text-muted-foreground">{token.chain}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono">{tokenBalance}</div>
                  <div className="text-xs text-muted-foreground">{token.symbol}</div>
                </div>
              </button>
            );
          })}
        </div>

        {(!api || !assetHubApi) && (
          <p className="text-xs text-yellow-500 text-center">⚠️ Hinek chain girêdayî nîne</p>
        )}
      </div>
    );
  }

  if (success) {
    return (
      <div className="p-4 text-center space-y-6">
        <div className="w-20 h-20 mx-auto bg-green-500/20 rounded-full flex items-center justify-center">
          <Check className="w-10 h-10 text-green-500" />
        </div>
        <div>
          <h2 className="text-xl font-semibold mb-2">Transfer Serketî!</h2>
          <p className="text-muted-foreground text-sm">
            {amount} {selectedToken} hat şandin
          </p>
        </div>
        {txHash && (
          <div className="p-3 bg-muted rounded-lg">
            <p className="text-xs text-muted-foreground mb-1">Transaction Hash</p>
            <p className="font-mono text-xs break-all">{txHash}</p>
          </div>
        )}
        <button
          onClick={onBack}
          className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-semibold"
        >
          Temam
        </button>
      </div>
    );
  }

  const selectedTokenInfo = SEND_TOKENS.find((t) => t.symbol === selectedToken);

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center justify-between">
        <button onClick={() => setSelectedToken(null)} className="text-muted-foreground">
          ← Paş
        </button>
        <h2 className="text-lg font-semibold">Bişîne {selectedToken}</h2>
        <div className="w-10" />
      </div>

      {/* Selected Token Info */}
      <div className="p-3 bg-muted/50 rounded-xl flex items-center gap-3">
        <img
          src={selectedTokenInfo?.icon}
          alt={selectedToken || ''}
          className="w-10 h-10 rounded-full"
        />
        <div className="flex-1">
          <div className="font-semibold">{selectedToken}</div>
          <div className="text-xs text-muted-foreground">{selectedTokenInfo?.chain}</div>
        </div>
        <button
          onClick={() => setSelectedToken(null)}
          className="text-xs text-primary hover:underline"
        >
          Biguhere
        </button>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm text-muted-foreground">Navnîşana Wergir</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={toAddress}
              onChange={(e) => setToAddress(e.target.value)}
              className="flex-1 px-4 py-3 bg-muted rounded-xl font-mono text-sm"
              placeholder="5..."
            />
            <button
              onClick={handleScanQR}
              className="px-4 py-3 bg-cyan-600 hover:bg-cyan-700 rounded-xl flex items-center justify-center"
              title="QR Bişoxîne"
            >
              <ScanLine className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between">
            <label className="text-sm text-muted-foreground">Mîqdar (HEZ)</label>
            <span className="text-sm text-muted-foreground">
              Bakiye: {getCurrentBalance()} {selectedToken}
            </span>
          </div>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full px-4 py-3 bg-muted rounded-xl"
            placeholder="0.00"
            step="0.0001"
          />
        </div>

        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        <button
          onClick={handleSend}
          disabled={isLoading || !toAddress || !amount}
          className="w-full py-3 bg-gradient-to-r from-green-600 to-yellow-500 text-white rounded-xl font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              Tê şandin...
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              Bişîne
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// Receive Tab with actual QR Code
function ReceiveTab({ address, onBack }: { address: string | null; onBack: () => void }) {
  const [copied, setCopied] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [qrError, setQrError] = useState(false);
  const { hapticNotification } = useTelegram();

  // Generate QR code when address changes
  useEffect(() => {
    if (address) {
      QRCode.toDataURL(address, {
        width: 256,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
        errorCorrectionLevel: 'H',
      })
        .then((url) => {
          setQrCodeUrl(url);
          setQrError(false);
        })
        .catch((err) => {
          console.error('QR code generation failed:', err);
          setQrError(true);
        });
    }
  }, [address]);

  const handleCopy = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      setCopied(true);
      hapticNotification('success');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="text-muted-foreground">
          ← Paş
        </button>
        <h2 className="text-lg font-semibold">Werbigire</h2>
        <div className="w-10" />
      </div>

      <div className="text-center space-y-4">
        {/* QR Code */}
        <div className="w-56 h-56 mx-auto bg-white rounded-xl flex items-center justify-center p-2">
          {qrCodeUrl && !qrError ? (
            <img src={qrCodeUrl} alt="Wallet QR Code" className="w-full h-full" />
          ) : qrError ? (
            <div className="text-center">
              <QrCode className="w-16 h-16 text-gray-400 mx-auto mb-2" />
              <p className="text-xs text-gray-500">QR çênebû</p>
            </div>
          ) : (
            <div className="animate-pulse bg-gray-200 w-full h-full rounded-lg" />
          )}
        </div>

        <p className="text-sm text-muted-foreground">
          Ev navnîşana te ye. Ji bo wergirtina token vê navnîşanê parve bike.
        </p>

        <div className="p-4 bg-muted rounded-xl">
          <p className="font-mono text-sm break-all">{address}</p>
        </div>

        <button
          onClick={handleCopy}
          className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-semibold flex items-center justify-center gap-2"
        >
          {copied ? (
            <>
              <Check className="w-4 h-4" />
              Hat kopîkirin!
            </>
          ) : (
            <>
              <Copy className="w-4 h-4" />
              Navnîşanê Kopî Bike
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// History Tab - Full transaction history
function HistoryTab({
  transactions,
  isLoading,
  onRefresh,
  onBack,
}: {
  transactions: Transaction[];
  isLoading: boolean;
  onRefresh: () => void;
  onBack: () => void;
}) {
  const { hapticImpact } = useTelegram();

  const formatAmount = (amount: string, decimals: number = 12) => {
    const value = parseInt(amount) / Math.pow(10, decimals);
    return value.toFixed(4);
  };

  const formatAddress = (addr: string) => {
    if (!addr) return '';
    return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="text-muted-foreground">
          ← Paş
        </button>
        <h2 className="text-lg font-semibold">Dîroka Transaksiyonan</h2>
        <button
          onClick={() => {
            hapticImpact('light');
            onRefresh();
          }}
          disabled={isLoading}
          className="text-muted-foreground"
        >
          <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-12">
          <RefreshCw className="w-10 h-10 text-gray-600 mx-auto mb-3 animate-spin" />
          <p className="text-gray-400">Tê barkirin...</p>
        </div>
      ) : transactions.length === 0 ? (
        <div className="text-center py-12">
          <History className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400 mb-1">Transaksiyona tune</p>
          <p className="text-gray-600 text-sm">Dîroka te dê li vir xuya bibe</p>
        </div>
      ) : (
        <div className="space-y-3">
          {transactions.map((tx, idx) => (
            <div
              key={`${tx.blockNumber}-${idx}`}
              className="p-4 bg-muted/50 border border-border rounded-xl"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div
                    className={`${tx.direction === 'sent' ? 'bg-yellow-500/20' : 'bg-green-500/20'} p-2 rounded-lg`}
                  >
                    {tx.direction === 'sent' ? (
                      <ArrowUpRight className="w-5 h-5 text-yellow-400" />
                    ) : (
                      <ArrowDownLeft className="w-5 h-5 text-green-400" />
                    )}
                  </div>
                  <div>
                    <div className="font-medium">
                      {tx.direction === 'sent' ? 'Şandin' : 'Wergirtin'}
                    </div>
                    <div className="text-xs text-gray-400">Block #{tx.blockNumber}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div
                    className={`font-mono font-semibold ${tx.direction === 'sent' ? 'text-yellow-400' : 'text-green-400'}`}
                  >
                    {tx.direction === 'sent' ? '-' : '+'}
                    {formatAmount(tx.amount || '0')}
                  </div>
                  <div className="text-xs text-gray-400">
                    {tx.section === 'balances'
                      ? 'HEZ'
                      : tx.assetId === '1'
                        ? 'PEZ'
                        : `Asset #${tx.assetId}`}
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-border/50 space-y-1">
                {tx.direction === 'sent' ? (
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Ji bo:</span>
                    <span className="font-mono text-gray-400">{formatAddress(tx.to || '')}</span>
                  </div>
                ) : (
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Ji:</span>
                    <span className="font-mono text-gray-400">{formatAddress(tx.from)}</span>
                  </div>
                )}
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Hash:</span>
                  <span className="font-mono text-gray-400">{formatAddress(tx.hash)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
