/**
 * Deposit USDT Modal
 * Allows users to deposit USDT (TRC20 or Polkadot) to get wUSDT on Asset Hub
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
} from 'lucide-react';
import { useTelegram } from '@/hooks/useTelegram';
import { supabase } from '@/lib/supabase';

type Network = 'trc20' | 'polkadot';

interface NetworkInfo {
  id: Network;
  name: string;
  description: string;
  address: string;
  explorer: string;
  icon: string;
  minAmount: number;
  confirmations: number;
}

const NETWORKS: NetworkInfo[] = [
  {
    id: 'trc20',
    name: 'TRC20 (TRON)',
    description: 'USDT li ser tora TRON',
    address: import.meta.env.VITE_DEPOSIT_TRON_ADDRESS || '',
    explorer: 'https://tronscan.org/#/transaction/',
    icon: '🔴',
    minAmount: 10,
    confirmations: 20,
  },
  {
    id: 'polkadot',
    name: 'Polkadot Asset Hub',
    description: 'USDT li ser Polkadot',
    address: import.meta.env.VITE_DEPOSIT_POLKADOT_ADDRESS || '',
    explorer: 'https://assethub-polkadot.subscan.io/extrinsic/',
    icon: '⚪',
    minAmount: 10,
    confirmations: 1,
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
  userId: string | null;
}

export function DepositUSDTModal({ isOpen, onClose }: Props) {
  const { hapticImpact, showAlert } = useTelegram();

  const [selectedNetwork, setSelectedNetwork] = useState<Network>('trc20');
  const [depositCode, setDepositCode] = useState<string>('');
  const [copied, setCopied] = useState<'address' | 'memo' | null>(null);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const network = NETWORKS.find((n) => n.id === selectedNetwork) || NETWORKS[0];

  // Fetch user's deposit code via edge function
  useEffect(() => {
    const fetchDepositCode = async () => {
      if (!isOpen) return;

      const initData = window.Telegram?.WebApp?.initData;
      if (!initData) {
        setDepositCode('---');
        return;
      }

      setIsLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke('get-deposit-code', {
          body: { initData },
        });

        if (error) {
          console.error('Error fetching deposit code:', error);
          setDepositCode('---');
        } else if (data?.code) {
          setDepositCode(data.code);
        }
      } catch (err) {
        console.error('Error fetching deposit code:', err);
        setDepositCode('---');
      } finally {
        setIsLoading(false);
      }
    };

    fetchDepositCode();
  }, [isOpen]);

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
                        <span>{deposit.network === 'trc20' ? '🔴' : '⚪'}</span>
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
              <div className="flex gap-2">
                {NETWORKS.map((net) => (
                  <button
                    key={net.id}
                    onClick={() => {
                      setSelectedNetwork(net.id);
                      hapticImpact('light');
                    }}
                    className={`flex-1 p-3 rounded-xl border transition-all ${
                      selectedNetwork === net.id
                        ? 'border-green-500 bg-green-500/10'
                        : 'border-border bg-muted/50'
                    }`}
                  >
                    <div className="text-xl mb-1">{net.icon}</div>
                    <div className="text-sm font-medium">{net.name}</div>
                    <div className="text-xs text-muted-foreground">{net.description}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Important Notice */}
            <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <div className="flex gap-2">
                <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0" />
                <div className="text-sm text-yellow-400">
                  <p className="font-medium">Girîng!</p>
                  <ul className="list-disc list-inside text-xs mt-1 space-y-1">
                    <li>
                      Kêmtirîn: <strong>{network.minAmount} USDT</strong>
                    </li>
                    <li>Memo/Not qada de koda xwe binivîse</li>
                    <li>Tenê USDT bişîne, tokenên din winda dibin</li>
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
                  <code className="flex-1 text-sm font-mono bg-background p-2 rounded-lg break-all">
                    {network.address || 'Amade nîne'}
                  </code>
                  <button
                    onClick={() => copyToClipboard(network.address, 'address')}
                    disabled={!network.address}
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

              {/* Memo/Reference */}
              <div>
                <label className="text-xs text-muted-foreground">Memo / Referans (PÊWÎST)</label>
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
                  ⚠️ Vê kodê di memo/not de binivîse, wekî din depoya te nayê nas kirin!
                </p>
              </div>
            </div>

            {/* Steps */}
            <div className="bg-muted/30 rounded-xl p-4">
              <h4 className="text-sm font-medium mb-3">Çawa Depo Bikim?</h4>
              <ol className="text-xs text-muted-foreground space-y-2">
                <li className="flex gap-2">
                  <span className="text-green-400 font-bold">1.</span>
                  <span>Navnîşan û memo kopî bike</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-green-400 font-bold">2.</span>
                  <span>Di cîzdana xwe de ({network.name}) USDT bişîne navnîşana jorîn</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-green-400 font-bold">3.</span>
                  <span>
                    <strong>MEMO qada de koda xwe binivîse!</strong>
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="text-green-400 font-bold">4.</span>
                  <span>Piştî {network.confirmations} pejirandinê, wUSDT dê li Asset Hub be</span>
                </li>
              </ol>
            </div>

            {/* Processing Time */}
            <p className="text-center text-xs text-muted-foreground">
              Dema pêvajoyê: ~5-30 hûrdem li gorî torê
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
