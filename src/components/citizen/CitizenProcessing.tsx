/**
 * Citizen Processing Component
 * Shows KurdistanSun animation while preparing data,
 * connects to People Chain and signs with seed phrase keypair
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { KurdistanSun } from '@/components/KurdistanSun';
import { useTranslation } from '@/i18n';
import { useTelegram } from '@/hooks/useTelegram';
import { initWalletService, createKeypair } from '@/lib/wallet-service';
import { initPeopleConnection } from '@/lib/rpc-manager';
import type { CitizenshipData } from '@/lib/citizenship';
import {
  calculateIdentityHash,
  saveCitizenshipLocally,
  uploadToIPFS,
  applyCitizenship,
} from '@/lib/citizenship';

interface Props {
  citizenshipData: CitizenshipData;
  onSuccess: (identityHash: string, walletAddress: string) => void;
  onError: (error: string) => void;
}

type ProcessingState = 'preparing' | 'connecting' | 'ready' | 'signing';

export function CitizenProcessing({ citizenshipData, onSuccess, onError }: Props) {
  const { t } = useTranslation();
  const { hapticImpact, hapticNotification } = useTelegram();

  const [state, setState] = useState<ProcessingState>('preparing');
  const [identityHash, setIdentityHash] = useState<string>('');
  const seedPhraseRef = useRef<string>(citizenshipData.seedPhrase);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const peopleApiRef = useRef<any>(null);

  // Prepare data and connect to chain on mount
  useEffect(() => {
    let cancelled = false;

    const prepare = async () => {
      try {
        // Init crypto
        await initWalletService();

        // Mock IPFS upload
        const ipfsCid = await uploadToIPFS(citizenshipData);

        // Calculate identity hash (keccak256)
        const hash = calculateIdentityHash(citizenshipData.fullName, citizenshipData.email, [
          ipfsCid,
        ]);
        if (cancelled) return;
        setIdentityHash(hash);

        // Save encrypted data locally
        saveCitizenshipLocally(citizenshipData);

        // Connect to People Chain
        setState('connecting');
        const peopleApi = await initPeopleConnection();
        if (cancelled) return;
        peopleApiRef.current = peopleApi;

        setState('ready');
        hapticNotification('success');
      } catch (err) {
        if (!cancelled) {
          onError(err instanceof Error ? err.message : 'Preparation failed');
        }
      }
    };

    prepare();
    return () => {
      cancelled = true;
    };
  }, [citizenshipData, hapticNotification, onError]);

  const handleSign = useCallback(async () => {
    if (!peopleApiRef.current || !seedPhraseRef.current) {
      onError(t('citizen.walletNotConnected'));
      return;
    }

    setState('signing');
    hapticImpact('medium');

    try {
      const keypair = createKeypair(seedPhraseRef.current);

      const result = await applyCitizenship(
        peopleApiRef.current,
        keypair,
        identityHash,
        citizenshipData.referrerAddress || null
      );

      // Clear seed phrase from memory
      seedPhraseRef.current = '';

      if (result.success) {
        hapticNotification('success');
        onSuccess(identityHash, citizenshipData.walletAddress);
      } else {
        hapticNotification('error');
        onError(result.error || t('citizen.submissionFailed'));
      }
    } catch (err) {
      // Clear seed phrase from memory
      seedPhraseRef.current = '';
      hapticNotification('error');
      onError(err instanceof Error ? err.message : t('citizen.submissionFailed'));
    }
  }, [citizenshipData, identityHash, hapticImpact, hapticNotification, onSuccess, onError, t]);

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
          {state === 'connecting' && t('citizen.connectingChain')}
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
