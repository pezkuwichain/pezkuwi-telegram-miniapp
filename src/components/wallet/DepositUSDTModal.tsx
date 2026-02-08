/**
 * Deposit USDT Modal
 * Supports TON, Polkadot (recommended) and TRC20 (with fee warning)
 */

import { useState, useEffect } from 'react';
import {
  X,
  Copy,
  CheckCircle,
  ExternalLink,
  AlertCircle,
  Loader2,
  History,
  Plus,
  AlertTriangle,
} from 'lucide-react';
import { useTelegram } from '@/hooks/useTelegram';
import { useWallet } from '@/contexts/WalletContext';
import { supabase } from '@/lib/supabase';

type Network = 'ton' | 'polkadot' | 'trc20';

interface NetworkInfo {
  id: Network;
  name: string;
  description: string;
  icon: string;
  recommended: boolean;
  fee: number;
  feeWarning?: string;
  explorer: string;
  minDeposit: number;
}

const NETWORKS: NetworkInfo[] = [
  {
    id: 'ton',
    name: 'TON',
    description: 'Telegram Wallet',
    icon: '💎',
    recommended: true,
    fee: 0.1,
    explorer: 'https://tonviewer.com/transaction/',
    minDeposit: 10,
  },
  {
    id: 'polkadot',
    name: 'Polkadot',
    description: 'Asset Hub',
    icon: '⚪',
    recommended: true,
    fee: 0.1,
    explorer: 'https://assethub-polkadot.subscan.io/extrinsic/',
    minDeposit: 10,
  },
  {
    id: 'trc20',
    name: 'TRC20',
    description: 'TRON Network',
    icon: '🔴',
    recommended: false,
    fee: 3,
    feeWarning: 'Mesrefa tora TRC20 bi qasî $3 ye. Em tora TON an Polkadot pêşniyar dikin.',
    explorer: 'https://tronscan.org/#/transaction/',
    minDeposit: 10,
  },
];

interface Deposit {
  id: string;
  network: Network;
  amount: number;
  status: string;
  tx_hash: string | null;
  created_at: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function DepositUSDTModal({ isOpen, onClose }: Props) {
  const { hapticImpact, showAlert } = useTelegram();
  const { address: localWalletAddress } = useWallet();

  const [selectedNetwork, setSelectedNetwork] = useState<Network>('ton');
  const [depositCode, setDepositCode] = useState<string>('');
  const [depositAddress, setDepositAddress] = useState<string>('');
  const [copied, setCopied] = useState<'address' | 'memo' | null>(null);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [trc20Accepted, setTrc20Accepted] = useState(false);

  const network = NETWORKS.find((n) => n.id === selectedNetwork) || NETWORKS[0];

  // Get deposit address based on network
  const getNetworkAddress = (networkId: Network): string => {
    switch (networkId) {
      case 'ton':
        return import.meta.env.VITE_DEPOSIT_TON_ADDRESS || '';
      case 'polkadot':
        return import.meta.env.VITE_DEPOSIT_POLKADOT_ADDRESS || '';
      case 'trc20':
        // TRC20 uses HD wallet - address comes from backend
        return depositAddress;
      default:
        return '';
    }
  };

  // Fetch user's deposit code and TRC20 address
  useEffect(() => {
    const fetchDepositInfo = async () => {
      if (!isOpen) return;

      const initData = window.Telegram?.WebApp?.initData;
      if (!initData) {
        setDepositCode('---');
        return;
      }

      setIsLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke('get-deposit-info', {
          body: { initData },
        });

        if (error) {
          console.error('Error fetching deposit info:', error);
          setDepositCode('---');
        } else {
          if (data?.code) setDepositCode(data.code);
          if (data?.trc20Address) setDepositAddress(data.trc20Address);

          // If database doesn't have wallet but we have local wallet, sync it
          if (!data?.walletAddress && localWalletAddress) {
            supabase.functions.invoke('save-wallet-address', {
              body: { initData, walletAddress: localWalletAddress },
            });
          }
        }
      } catch (err) {
        console.error('Error fetching deposit info:', err);
        setDepositCode('---');
      } finally {
        setIsLoading(false);
      }
    };

    fetchDepositInfo();
  }, [isOpen, localWalletAddress]);

  // Fetch deposits history
  useEffect(() => {
    const fetchDeposits = async () => {
      if (!isOpen) return;

      const initData = window.Telegram?.WebApp?.initData;
      if (!initData) return;

      try {
        const { data, error } = await supabase.functions.invoke('get-deposits', {
          body: { initData },
        });

        if (!error && data?.deposits) {
          setDeposits(data.deposits as Deposit[]);
        }
      } catch {
        // Ignore - deposits history is optional
      }
    };

    fetchDeposits();
  }, [isOpen]);

  const copyToClipboard = async (text: string, type: 'address' | 'memo') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(type);
      hapticImpact('light');
      setTimeout(() => setCopied(null), 2000);
    } catch {
      showAlert('Kopî nekir');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-green-400';
      case 'confirming':
        return 'text-yellow-400';
      case 'failed':
        return 'text-red-400';
      default:
        return 'text-muted-foreground';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending':
        return 'Li benda';
      case 'confirming':
        return 'Tê pejirandin';
      case 'completed':
        return 'Qediya';
      case 'failed':
        return 'Neserketî';
      case 'expired':
        return 'Dema wê derbas bû';
      default:
        return status;
    }
  };

  const currentAddress = getNetworkAddress(selectedNetwork);
  const showTrc20Warning = selectedNetwork === 'trc20' && !trc20Accepted;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-background rounded-t-3xl p-6 pb-8 animate-slide-up max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-500/20 rounded-full">
              <Plus className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">USDT Depo Bike</h2>
              <p className="text-xs text-muted-foreground">Bo wUSDT li Asset Hub</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className={`p-2 rounded-full ${showHistory ? 'text-cyan-400 bg-cyan-400/10' : 'text-muted-foreground hover:text-white'}`}
            >
              <History className="w-5 h-5" />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-muted-foreground hover:text-white rounded-full"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {showHistory ? (
          /* Deposit History */
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">Dîroka Depoyan</h3>
            {deposits.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Hîn depo tune</p>
            ) : (
              deposits.map((deposit) => (
                <div key={deposit.id} className="bg-muted/50 rounded-xl p-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2">
                        <span>
                          {deposit.network === 'ton'
                            ? '💎'
                            : deposit.network === 'polkadot'
                              ? '⚪'
                              : '🔴'}
                        </span>
                        <span className="font-mono">{deposit.amount} USDT</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(deposit.created_at).toLocaleDateString('ku')}
                      </p>
                    </div>
                    <span className={`text-sm ${getStatusColor(deposit.status)}`}>
                      {getStatusText(deposit.status)}
                    </span>
                  </div>
                  {deposit.tx_hash && (
                    <a
                      href={`${NETWORKS.find((n) => n.id === deposit.network)?.explorer}${deposit.tx_hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-400 flex items-center gap-1 mt-2"
                    >
                      <ExternalLink className="w-3 h-3" />
                      TX bibîne
                    </a>
                  )}
                </div>
              ))
            )}
            <button
              onClick={() => setShowHistory(false)}
              className="w-full py-3 bg-muted rounded-xl text-center"
            >
              Vegere
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Network Selection */}
            <div>
              <label className="text-sm text-muted-foreground mb-2 block">Torê Hilbijêre</label>
              <div className="grid grid-cols-3 gap-2">
                {NETWORKS.map((net) => (
                  <button
                    key={net.id}
                    onClick={() => {
                      setSelectedNetwork(net.id);
                      setTrc20Accepted(false);
                      hapticImpact('light');
                    }}
                    className={`p-3 rounded-xl border transition-all relative ${
                      selectedNetwork === net.id
                        ? net.recommended
                          ? 'border-green-500 bg-green-500/10'
                          : 'border-yellow-500 bg-yellow-500/10'
                        : 'border-border bg-muted/50'
                    }`}
                  >
                    {net.recommended && (
                      <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[10px] bg-green-500 text-white px-1.5 py-0.5 rounded">
                        Pêşniyar
                      </span>
                    )}
                    <div className="text-xl mb-1">{net.icon}</div>
                    <div className="text-sm font-medium">{net.name}</div>
                    <div className="text-[10px] text-muted-foreground">{net.description}</div>
                    <div
                      className={`text-[10px] mt-1 ${net.fee > 1 ? 'text-yellow-400' : 'text-green-400'}`}
                    >
                      ~${net.fee} fee
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* TRC20 Warning */}
            {showTrc20Warning && (
              <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl">
                <div className="flex gap-3">
                  <AlertTriangle className="w-6 h-6 text-yellow-400 flex-shrink-0" />
                  <div>
                    <p className="text-sm text-yellow-400 font-medium mb-2">Dikkkat!</p>
                    <p className="text-xs text-yellow-400/80 mb-3">{network.feeWarning}</p>
                    <p className="text-xs text-yellow-400/80 mb-3">
                      Mînak: 10 USDT bişîne → 7 wUSDT werbigire ($3 masraf)
                    </p>
                    <button
                      onClick={() => {
                        setTrc20Accepted(true);
                        hapticImpact('medium');
                      }}
                      className="w-full py-2 bg-yellow-500/20 border border-yellow-500/50 rounded-lg text-yellow-400 text-sm font-medium"
                    >
                      Qebûl dikim, bi TRC20 bişîne
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Deposit Info - Show only when TRC20 is accepted or other networks */}
            {(selectedNetwork !== 'trc20' || trc20Accepted) && (
              <>
                {/* Important Notice */}
                <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                  <div className="flex gap-2">
                    <AlertCircle className="w-5 h-5 text-blue-400 flex-shrink-0" />
                    <div className="text-sm text-blue-400">
                      <p className="font-medium">Girîng!</p>
                      <ul className="list-disc list-inside text-xs mt-1 space-y-1">
                        <li>
                          Kêmtirîn: <strong>{network.minDeposit} USDT</strong>
                        </li>
                        {selectedNetwork !== 'trc20' && (
                          <li>Memo/Comment qada de koda xwe binivîse</li>
                        )}
                        <li>Tenê USDT bişîne, tokenên din winda dibin</li>
                        {selectedNetwork === 'trc20' && (
                          <li className="text-yellow-400">
                            $3 masraf dê ji mîqdara we bê kêmkirin
                          </li>
                        )}
                      </ul>
                    </div>
                  </div>
                </div>

                {/* Deposit Address */}
                <div className="bg-muted/50 rounded-xl p-4 space-y-4">
                  {/* Address */}
                  <div>
                    <label className="text-xs text-muted-foreground">Navnîşana Depoyê</label>
                    <div className="flex items-center gap-2 mt-1">
                      {isLoading && selectedNetwork === 'trc20' ? (
                        <div className="flex-1 p-2 bg-background rounded-lg flex justify-center">
                          <Loader2 className="w-5 h-5 animate-spin" />
                        </div>
                      ) : (
                        <code className="flex-1 text-xs font-mono bg-background p-2 rounded-lg break-all">
                          {currentAddress || 'Amade nîne'}
                        </code>
                      )}
                      <button
                        onClick={() => copyToClipboard(currentAddress, 'address')}
                        disabled={!currentAddress}
                        className="p-2 bg-background rounded-lg hover:bg-muted transition-colors"
                      >
                        {copied === 'address' ? (
                          <CheckCircle className="w-5 h-5 text-green-400" />
                        ) : (
                          <Copy className="w-5 h-5" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Memo/Reference - Not needed for TRC20 (unique address) */}
                  {selectedNetwork !== 'trc20' && (
                    <div>
                      <label className="text-xs text-muted-foreground">
                        Memo / Comment (PÊWÎST)
                      </label>
                      <div className="flex items-center gap-2 mt-1">
                        {isLoading ? (
                          <div className="flex-1 p-2 bg-background rounded-lg flex justify-center">
                            <Loader2 className="w-5 h-5 animate-spin" />
                          </div>
                        ) : (
                          <code className="flex-1 text-lg font-mono font-bold bg-background p-2 rounded-lg text-center text-green-400">
                            {depositCode || '---'}
                          </code>
                        )}
                        <button
                          onClick={() => copyToClipboard(depositCode, 'memo')}
                          disabled={!depositCode || depositCode === '---'}
                          className="p-2 bg-background rounded-lg hover:bg-muted transition-colors"
                        >
                          {copied === 'memo' ? (
                            <CheckCircle className="w-5 h-5 text-green-400" />
                          ) : (
                            <Copy className="w-5 h-5" />
                          )}
                        </button>
                      </div>
                      <p className="text-xs text-red-400 mt-1">
                        ⚠️ Vê kodê di memo de binivîse, wekî din depoya te nayê nas kirin!
                      </p>
                    </div>
                  )}

                  {selectedNetwork === 'trc20' && (
                    <p className="text-xs text-green-400">
                      ✅ Ev navnîşan tenê ya te ye. Memo ne pêwîst e.
                    </p>
                  )}
                </div>

                {/* Steps */}
                <div className="bg-muted/30 rounded-xl p-4">
                  <h4 className="text-sm font-medium mb-3">Çawa Depo Bikim?</h4>
                  <ol className="text-xs text-muted-foreground space-y-2">
                    <li className="flex gap-2">
                      <span className="text-green-400 font-bold">1.</span>
                      <span>Navnîşan kopî bike</span>
                    </li>
                    {selectedNetwork !== 'trc20' && (
                      <li className="flex gap-2">
                        <span className="text-green-400 font-bold">2.</span>
                        <span>Memo kodê kopî bike</span>
                      </li>
                    )}
                    <li className="flex gap-2">
                      <span className="text-green-400 font-bold">
                        {selectedNetwork === 'trc20' ? '2' : '3'}.
                      </span>
                      <span>
                        {selectedNetwork === 'ton'
                          ? 'Telegram Wallet an cîzdana xwe veke'
                          : selectedNetwork === 'polkadot'
                            ? 'Polkadot cîzdana xwe veke'
                            : 'TronLink an cîzdana xwe veke'}
                      </span>
                    </li>
                    <li className="flex gap-2">
                      <span className="text-green-400 font-bold">
                        {selectedNetwork === 'trc20' ? '3' : '4'}.
                      </span>
                      <span>USDT bişîne navnîşana jorîn</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="text-green-400 font-bold">
                        {selectedNetwork === 'trc20' ? '4' : '5'}.
                      </span>
                      <span>wUSDT dê di nav çend hûrdeman de li hesabê te be</span>
                    </li>
                  </ol>
                </div>

                {/* Processing Time */}
                <p className="text-center text-xs text-muted-foreground">
                  Dema pêvajoyê: ~1-5 hûrdem
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
