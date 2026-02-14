/**
 * Citizen Success Screen
 * Shows after successful citizenship application submission
 */

import { CheckCircle } from 'lucide-react';
import { useTranslation } from '@/i18n';
import { useTelegram } from '@/hooks/useTelegram';
import { formatAddress } from '@/lib/wallet-service';
import { generateCitizenNumber } from '@/lib/citizenship';

interface Props {
  address: string;
  onOpenApp: () => void;
}

export function CitizenSuccess({ address, onOpenApp }: Props) {
  const { t } = useTranslation();
  const { hapticImpact } = useTelegram();

  // Generate a citizen number based on address
  const citizenNumber = generateCitizenNumber(address, 42, 0);
  const citizenId = `#42-0-${citizenNumber}`;

  const handleOpenApp = () => {
    hapticImpact('medium');
    onOpenApp();
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] p-6 space-y-6">
      {/* Success Icon */}
      <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center">
        <CheckCircle className="w-12 h-12 text-green-500" />
      </div>

      {/* Title */}
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold">{t('citizen.successTitle')}</h1>
        <p className="text-muted-foreground">{t('citizen.successSubtitle')}</p>
      </div>

      {/* Citizen ID Card */}
      <div className="w-full max-w-sm bg-muted/50 rounded-2xl p-5 space-y-4 border border-border">
        <div>
          <p className="text-xs text-muted-foreground">{t('citizen.citizenId')}</p>
          <p className="text-xl font-mono font-bold text-primary">{citizenId}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{t('citizen.walletAddress')}</p>
          <p className="text-sm font-mono">{formatAddress(address)}</p>
        </div>
      </div>

      {/* Open App Button */}
      <button
        onClick={handleOpenApp}
        className="w-full max-w-sm py-3 bg-primary text-primary-foreground rounded-xl font-semibold"
      >
        {t('citizen.openApp')}
      </button>
    </div>
  );
}
