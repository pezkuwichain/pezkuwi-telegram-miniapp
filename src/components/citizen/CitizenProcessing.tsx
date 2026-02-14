/**
 * Citizen Processing Component
 * Shows KurdistanSun animation while preparing data,
 * then enables sign button when ready
 */

import { useState, useEffect, useCallback } from 'react';
import { KurdistanSun } from '@/components/KurdistanSun';
import { useTranslation } from '@/i18n';
import { useTelegram } from '@/hooks/useTelegram';
import { useWallet } from '@/contexts/WalletContext';
import type { CitizenshipData } from '@/lib/citizenship';
import {
  calculateIdentityHash,
  saveCitizenshipLocally,
  uploadToIPFS,
  applyCitizenship,
} from '@/lib/citizenship';

interface Props {
  citizenshipData: CitizenshipData;
  onSuccess: (identityHash: string, blockHash?: string) => void;
  onError: (error: string) => void;
}

type ProcessingState = 'preparing' | 'ready' | 'signing';

export function CitizenProcessing({ citizenshipData, onSuccess, onError }: Props) {
  const { t } = useTranslation();
  const { hapticImpact, hapticNotification } = useTelegram();
  const { peopleApi, keypair } = useWallet();

  const [state, setState] = useState<ProcessingState>('preparing');
  const [identityHash, setIdentityHash] = useState<string>('');

  // Prepare data on mount
  useEffect(() => {
    const prepare = async () => {
      try {
        // Mock IPFS upload
        const ipfsCid = await uploadToIPFS(citizenshipData);

        // Calculate identity hash (keccak256)
        const hash = calculateIdentityHash(citizenshipData.fullName, citizenshipData.email, [
          ipfsCid,
        ]);
        setIdentityHash(hash);

        // Save encrypted data locally
        saveCitizenshipLocally(citizenshipData);

        // Small delay to show animation
        await new Promise((resolve) => setTimeout(resolve, 1500));

        setState('ready');
        hapticNotification('success');
      } catch (err) {
        onError(err instanceof Error ? err.message : 'Preparation failed');
      }
    };

    prepare();
  }, [citizenshipData, hapticNotification, onError]);

  const handleSign = useCallback(async () => {
    if (!peopleApi || !keypair) {
      onError(t('citizen.walletNotConnected'));
      return;
    }

    setState('signing');
    hapticImpact('medium');

    try {
      const result = await applyCitizenship(
        peopleApi,
        keypair,
        identityHash,
        citizenshipData.referrerAddress || null
      );

      if (result.success) {
        hapticNotification('success');
        onSuccess(identityHash, result.blockHash);
      } else {
        hapticNotification('error');
        onError(result.error || t('citizen.submissionFailed'));
      }
    } catch (err) {
      hapticNotification('error');
      onError(err instanceof Error ? err.message : t('citizen.submissionFailed'));
    }
  }, [
    peopleApi,
    keypair,
    citizenshipData,
    identityHash,
    hapticImpact,
    hapticNotification,
    onSuccess,
    onError,
    t,
  ]);

  const isReady = state === 'ready';
  const isSigning = state === 'signing';

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 space-y-8">
      {/* Kurdistan Sun Animation */}
      <div className={state === 'ready' ? 'opacity-80' : ''}>
        <KurdistanSun size={100} />
      </div>

      {/* Status Message */}
      <div className="text-center space-y-2">
        <p className="text-lg font-medium">
          {state === 'preparing' && t('citizen.preparingData')}
          {state === 'ready' && t('citizen.readyToSign')}
          {state === 'signing' && t('citizen.signingTx')}
        </p>
        {state === 'preparing' && (
          <p className="text-sm text-muted-foreground">{citizenshipData.fullName}</p>
        )}
        {state === 'ready' && (
          <p className="text-xs text-muted-foreground">{t('citizen.depositRequired')}</p>
        )}
      </div>

      {/* Sign Button */}
      <button
        onClick={handleSign}
        disabled={!isReady || isSigning}
        className={`w-full max-w-xs py-4 rounded-xl font-bold text-lg transition-all ${
          isReady
            ? 'bg-green-600 text-white hover:bg-green-500 active:scale-95'
            : 'bg-muted text-muted-foreground cursor-not-allowed'
        }`}
      >
        {isSigning ? t('citizen.signingTx') : t('citizen.sign')}
      </button>
    </div>
  );
}
