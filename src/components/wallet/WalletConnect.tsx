/**
 * Wallet Connect Component
 * Unlock wallet with password
 */

import { useState } from 'react';
import { Eye, EyeOff, Wallet, Unlock, Trash2 } from 'lucide-react';
import { useWallet } from '@/contexts/WalletContext';
import { useTelegram } from '@/hooks/useTelegram';
import { formatAddress } from '@/lib/wallet-service';

interface Props {
  onConnected: () => void;
  onDelete: () => void;
}

export function WalletConnect({ onConnected, onDelete }: Props) {
  const { address, connect, error: walletError } = useWallet();
  const { hapticImpact, hapticNotification } = useTelegram();

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleConnect = async () => {
    if (!password) {
      setError('Şîfre (password) binivîse');
      return;
    }

    setIsLoading(true);
    setError('');
    hapticImpact('medium');

    try {
      await connect(password);
      hapticNotification('success');
      onConnected();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Şîfre (password) çewt e');
      hapticNotification('error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = () => {
    hapticImpact('heavy');
    onDelete();
  };

  if (showDeleteConfirm) {
    return (
      <div className="p-4 space-y-6">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto bg-red-500/20 rounded-full flex items-center justify-center mb-4">
            <Trash2 className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Wallet Jê Bibe?</h2>
          <p className="text-muted-foreground text-sm">
            Ev çalakî nayê paşvekişandin. Eger seed phrase&apos;ê te tune be, tu nikarî gihîştina
            wallet&apos;ê xwe bistînî.
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => setShowDeleteConfirm(false)}
            className="flex-1 py-3 bg-muted rounded-xl font-semibold"
          >
            Betal
          </button>
          <button
            onClick={handleDelete}
            className="flex-1 py-3 bg-red-500 text-white rounded-xl font-semibold"
          >
            Jê Bibe
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      <div className="text-center">
        <div className="w-16 h-16 mx-auto bg-primary/20 rounded-full flex items-center justify-center mb-4">
          <Wallet className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-xl font-semibold mb-2">Wallet Veke</h2>
        {address && (
          <p className="text-muted-foreground text-sm font-mono">{formatAddress(address)}</p>
        )}
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm text-muted-foreground">Şîfre (Password)</label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
              className="w-full px-4 py-3 bg-muted rounded-xl pr-12"
              placeholder="Şîfre (password) binivîse"
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground"
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {(error || walletError) && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
            {error || walletError}
          </div>
        )}

        <button
          onClick={handleConnect}
          disabled={isLoading || !password}
          className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isLoading ? (
            'Tê vekirin...'
          ) : (
            <>
              <Unlock className="w-4 h-4" />
              Connect
            </>
          )}
        </button>

        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="w-full py-3 text-red-400 text-sm"
        >
          Wallet jê bibe
        </button>
      </div>
    </div>
  );
}
