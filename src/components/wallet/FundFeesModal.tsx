/**
 * Fund Fees Modal - XCM Teleport HEZ to Teyerchains
 * Allows users to transfer HEZ from relay chain to Asset Hub or People chain for fees
 */

import { useState, useEffect } from 'react';
import { X, ArrowDown, Loader2, CheckCircle, AlertCircle, Fuel, Info } from 'lucide-react';
import { useWallet } from '@/contexts/WalletContext';
import { useTelegram } from '@/hooks/useTelegram';

type TargetChain = 'asset-hub' | 'people';

interface ChainInfo {
  id: TargetChain;
  name: string;
  description: string;
  teyrchainId: number;
  color: string;
}

const TARGET_CHAINS: ChainInfo[] = [
  {
    id: 'asset-hub',
    name: 'Asset Hub',
    description: 'Ji bo PEZ veguheztin',
    teyrchainId: 1000,
    color: 'blue',
  },
  {
    id: 'people',
    name: 'People Chain',
    description: 'Ji bo nasname',
    teyrchainId: 1004,
    color: 'purple',
  },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function FundFeesModal({ isOpen, onClose }: Props) {
  const { api, assetHubApi, peopleApi, address, keypair } = useWallet();
  const { hapticImpact, showAlert } = useTelegram();

  const [targetChain, setTargetChain] = useState<TargetChain>('asset-hub');
  const [amount, setAmount] = useState('0.5');
  const [isTransferring, setIsTransferring] = useState(false);
  const [txStatus, setTxStatus] = useState<'idle' | 'signing' | 'pending' | 'success' | 'error'>(
    'idle'
  );
  const [relayBalance, setRelayBalance] = useState<string>('--');
  const [assetHubBalance, setAssetHubBalance] = useState<string>('--');
  const [peopleBalance, setPeopleBalance] = useState<string>('--');

  const selectedChain = TARGET_CHAINS.find((c) => c.id === targetChain) || TARGET_CHAINS[0];

  // Fetch balances
  useEffect(() => {
    const fetchBalances = async () => {
      if (!address) return;

      // Relay chain balance
      if (api) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const accountInfo = (await (api.query.system as any).account(address)) as {
            data: { free: { toString(): string } };
          };
          const free = accountInfo.data.free.toString();
          const balanceNum = Number(free) / 1e12;
          setRelayBalance(balanceNum.toFixed(4));
        } catch (err) {
          console.error('Error fetching relay balance:', err);
          setRelayBalance('0.0000');
        }
      } else {
        setRelayBalance('--');
      }

      // Asset Hub balance
      if (assetHubApi) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const accountInfo = (await (assetHubApi.query.system as any).account(address)) as {
            data: { free: { toString(): string } };
          };
          const free = accountInfo.data.free.toString();
          const balanceNum = Number(free) / 1e12;
          setAssetHubBalance(balanceNum.toFixed(4));
        } catch (err) {
          console.error('Error fetching Asset Hub balance:', err);
          setAssetHubBalance('0.0000');
        }
      } else {
        setAssetHubBalance('--');
      }

      // People chain balance
      if (peopleApi) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const accountInfo = (await (peopleApi.query.system as any).account(address)) as {
            data: { free: { toString(): string } };
          };
          const free = accountInfo.data.free.toString();
          const balanceNum = Number(free) / 1e12;
          setPeopleBalance(balanceNum.toFixed(4));
        } catch (err) {
          console.error('Error fetching People chain balance:', err);
          setPeopleBalance('0.0000');
        }
      } else {
        setPeopleBalance('--');
      }
    };

    if (isOpen) {
      fetchBalances();
    }
  }, [api, assetHubApi, peopleApi, address, isOpen]);

  const getTargetBalance = () => {
    return targetChain === 'asset-hub' ? assetHubBalance : peopleBalance;
  };

  const handleTeleport = async () => {
    if (!api || !address || !keypair) {
      showAlert('Cizdan girêdayî nîne');
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      showAlert('Mîqdarek rast binivîse');
      return;
    }

    if (relayBalance === '--') {
      showAlert('Relay Chain girêdayî nîne');
      return;
    }

    const sendAmount = parseFloat(amount);
    const currentBalance = parseFloat(relayBalance);

    if (sendAmount > currentBalance) {
      showAlert('Bakiye têrê nake');
      return;
    }

    setIsTransferring(true);
    setTxStatus('signing');
    hapticImpact('medium');

    try {
      // Convert to smallest unit (12 decimals)
      const amountInSmallestUnit = BigInt(Math.floor(parseFloat(amount) * 1e12));

      // Get target teyrchain ID
      const targetTeyrchainId = selectedChain.teyrchainId;

      // Destination: Target teyrchain
      const dest = {
        V3: {
          parents: 0,
          interior: {
            X1: { teyrchain: targetTeyrchainId },
          },
        },
      };

      // Beneficiary: Same account on target chain
      const beneficiary = {
        V3: {
          parents: 0,
          interior: {
            X1: {
              accountid32: {
                network: null,
                id: api.createType('AccountId32', address).toHex(),
              },
            },
          },
        },
      };

      // Assets: Native token (HEZ)
      const assets = {
        V3: [
          {
            id: {
              Concrete: {
                parents: 0,
                interior: 'Here',
              },
            },
            fun: {
              Fungible: amountInSmallestUnit.toString(),
            },
          },
        ],
      };

      // Fee asset ID: Native HEZ token
      const feeAssetId = {
        V3: {
          Concrete: {
            parents: 0,
            interior: 'Here',
          },
        },
      };

      const weightLimit = 'Unlimited';

      // Create teleport transaction
      const tx = api.tx.xcmPallet.limitedTeleportAssets(
        dest,
        beneficiary,
        assets,
        feeAssetId,
        weightLimit
      );

      setTxStatus('pending');

      const unsub = await tx.signAndSend(keypair, ({ status, dispatchError }) => {
        if (status.isFinalized) {
          if (dispatchError) {
            let errorMessage = 'Teleport neserketî';

            if (dispatchError.isModule) {
              const decoded = api.registry.findMetaError(dispatchError.asModule);
              errorMessage = `${decoded.section}.${decoded.name}`;
            }

            setTxStatus('error');
            hapticImpact('heavy');
            showAlert(errorMessage);
          } else {
            setTxStatus('success');
            hapticImpact('medium');

            // Reset after success
            setTimeout(() => {
              setAmount('0.5');
              setTxStatus('idle');
              onClose();
            }, 2000);
          }

          setIsTransferring(false);
          unsub();
        }
      });
    } catch (error) {
      console.error('Teleport error:', error);
      setTxStatus('error');
      setIsTransferring(false);
      hapticImpact('heavy');
      showAlert(error instanceof Error ? error.message : 'Çewtiyekî çêbû');
    }
  };

  const setQuickAmount = (percent: number) => {
    const balance = parseFloat(relayBalance);
    if (balance > 0) {
      const quickAmount = ((balance * percent) / 100).toFixed(4);
      setAmount(quickAmount);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-background rounded-t-3xl p-6 pb-8 animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-500/20 rounded-full">
              <Fuel className="w-5 h-5 text-yellow-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Fee Zêde Bike</h2>
              <p className="text-xs text-muted-foreground">HEZ teleport</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isTransferring}
            className="p-2 text-muted-foreground hover:text-white rounded-full"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {txStatus === 'success' ? (
          <div className="py-8 text-center">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">Serketî!</h3>
            <p className="text-muted-foreground">
              {amount} HEZ bo {selectedChain.name} hate şandin
            </p>
          </div>
        ) : txStatus === 'error' ? (
          <div className="py-8 text-center">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">Neserketî</h3>
            <button
              onClick={() => setTxStatus('idle')}
              className="mt-4 px-6 py-2 bg-muted rounded-lg"
            >
              Dîsa Biceribîne
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Target Chain Selection */}
            <div>
              <label className="text-sm text-muted-foreground mb-2 block">Zincîra Armanc</label>
              <div className="flex gap-2">
                {TARGET_CHAINS.map((chain) => (
                  <button
                    key={chain.id}
                    onClick={() => {
                      setTargetChain(chain.id);
                      hapticImpact('light');
                    }}
                    className={`flex-1 p-3 rounded-xl border transition-all ${
                      targetChain === chain.id
                        ? chain.id === 'asset-hub'
                          ? 'border-blue-500 bg-blue-500/10'
                          : 'border-purple-500 bg-purple-500/10'
                        : 'border-border bg-muted/50'
                    }`}
                  >
                    <div
                      className={`w-2 h-2 rounded-full mb-1 mx-auto ${
                        chain.id === 'asset-hub' ? 'bg-blue-500' : 'bg-purple-500'
                      }`}
                    />
                    <div className="text-sm font-medium">{chain.name}</div>
                    <div className="text-xs text-muted-foreground">{chain.description}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Balance Display */}
            <div className="bg-muted/50 rounded-xl p-4 space-y-3">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-sm text-muted-foreground">Relay Chain</span>
                </div>
                <span className="font-mono">{relayBalance} HEZ</span>
              </div>

              <div className="flex justify-center">
                <ArrowDown className="w-5 h-5 text-yellow-500" />
              </div>

              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      targetChain === 'asset-hub' ? 'bg-blue-500' : 'bg-purple-500'
                    }`}
                  />
                  <span className="text-sm text-muted-foreground">{selectedChain.name}</span>
                </div>
                <span className="font-mono">{getTargetBalance()} HEZ</span>
              </div>
            </div>

            {/* Info Box */}
            <div
              className={`p-3 rounded-lg flex gap-2 ${
                targetChain === 'asset-hub'
                  ? 'bg-blue-500/10 border border-blue-500/30'
                  : 'bg-purple-500/10 border border-purple-500/30'
              }`}
            >
              <Info
                className={`w-5 h-5 flex-shrink-0 ${
                  targetChain === 'asset-hub' ? 'text-blue-400' : 'text-purple-400'
                }`}
              />
              <p
                className={`text-sm ${
                  targetChain === 'asset-hub' ? 'text-blue-400' : 'text-purple-400'
                }`}
              >
                {selectedChain.description} kêmî 0.1 HEZ tê pêşniyarkirin.
              </p>
            </div>

            {/* Amount Input */}
            <div>
              <label className="text-sm text-muted-foreground mb-2 block">Mîqdar (HEZ)</label>
              <input
                type="number"
                step="0.0001"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.5"
                className="w-full px-4 py-3 bg-muted rounded-xl text-lg font-mono"
                disabled={isTransferring}
              />

              {/* Quick Amount Buttons */}
              <div className="flex gap-2 mt-2">
                {[10, 25, 50, 100].map((percent) => (
                  <button
                    key={percent}
                    onClick={() => {
                      setQuickAmount(percent);
                      hapticImpact('light');
                    }}
                    className="flex-1 py-2 text-xs bg-muted hover:bg-muted/80 rounded-lg"
                    disabled={isTransferring}
                  >
                    {percent}%
                  </button>
                ))}
              </div>
            </div>

            {/* Status Messages */}
            {txStatus === 'signing' && (
              <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                <p className="text-yellow-400 text-sm">Danûstandinê îmze bikin...</p>
              </div>
            )}

            {txStatus === 'pending' && (
              <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                <p className="text-blue-400 text-sm flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  XCM Teleport tê çêkirin...
                </p>
              </div>
            )}

            {/* Submit Button */}
            <button
              onClick={handleTeleport}
              disabled={isTransferring || !amount || parseFloat(amount) <= 0}
              className="w-full py-4 rounded-xl font-semibold bg-gradient-to-r from-green-600 to-yellow-500 text-white disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isTransferring ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {txStatus === 'signing' ? 'Tê îmzekirin...' : 'Tê çêkirin...'}
                </>
              ) : (
                <>
                  <Fuel className="w-5 h-5" />
                  Bo {selectedChain.name} Bişîne
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
