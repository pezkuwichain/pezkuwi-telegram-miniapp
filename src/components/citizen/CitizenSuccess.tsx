/**
 * Citizen Success Screen
 * Shows after successful citizenship application submission
 * Displays pending referral status instead of final approval
 */

import { CheckCircle, Clock } from 'lucide-react';
import { useTranslation } from '@/i18n';
import { useTelegram } from '@/hooks/useTelegram';
import { formatAddress } from '@/lib/wallet-service';

interface Props {
  address: string;
  identityHash: string;
  onOpenApp: () => void;
}

export function CitizenSuccess({ address, identityHash, onOpenApp }: Props) {
  const { t } = useTranslation();
  const { hapticImpact } = useTelegram();

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
        <h1 className="text-2xl font-bold">{t('citizen.applicationSubmitted')}</h1>
        <div className="flex items-center justify-center gap-2 text-yellow-500">
          <Clock className="w-4 h-4" />
          <p className="text-sm">{t('citizen.pendingReferral')}</p>
        </div>
      </div>

      {/* Application Info Card */}
      <div className="w-full max-w-sm bg-muted/50 rounded-2xl p-5 space-y-4 border border-border">
        <div>
          <p className="text-xs text-muted-foreground">{t('citizen.identityHash')}</p>
          <p className="text-sm font-mono break-all">{formatAddress(identityHash)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{t('citizen.walletAddress')}</p>
          <p className="text-sm font-mono">{formatAddress(address)}</p>
        </div>
      </div>

      {/* Info Note */}
      <p className="text-xs text-muted-foreground text-center max-w-sm">
        {t('citizen.applicationInfo')}
      </p>

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
