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
  generateCommitmentHash,
  generateNullifierHash,
  saveCitizenshipLocally,
  uploadToIPFS,
  submitCitizenshipApplication,
} from '@/lib/citizenship';

interface Props {
  citizenshipData: CitizenshipData;
  onSuccess: (blockHash?: string) => void;
  onError: (error: string) => void;
}

type ProcessingState = 'preparing' | 'ready' | 'signing';

export function CitizenProcessing({ citizenshipData, onSuccess, onError }: Props) {
  const { t } = useTranslation();
  const { hapticImpact, hapticNotification } = useTelegram();
  const { peopleApi, keypair } = useWallet();

  const [state, setState] = useState<ProcessingState>('preparing');
  const [ipfsCid, setIpfsCid] = useState<string>('');

  // Prepare data on mount
  useEffect(() => {
    const prepare = async () => {
      try {
        // Generate commitment hash
        generateCommitmentHash(citizenshipData);
        generateNullifierHash(citizenshipData.walletAddress, citizenshipData.timestamp);

        // Save encrypted data locally
        saveCitizenshipLocally(citizenshipData);

        // Mock IPFS upload
        const cid = await uploadToIPFS(citizenshipData);
        setIpfsCid(cid);

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
      const result = await submitCitizenshipApplication(
        peopleApi,
        keypair,
        citizenshipData.fullName,
        citizenshipData.email,
        ipfsCid,
        `Citizenship application - ${citizenshipData.region}`
      );

      if (result.success) {
        hapticNotification('success');
        onSuccess(result.blockHash);
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
    ipfsCid,
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
