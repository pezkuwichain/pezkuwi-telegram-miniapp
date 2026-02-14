/**
 * Citizen Success Screen
 * Shows after successful citizenship application submission
 * Displays 3-step process info for next steps
 */

import { CheckCircle, Clock, ArrowRight } from 'lucide-react';
import { useTranslation } from '@/i18n';
import { useTelegram } from '@/hooks/useTelegram';
import { formatAddress } from '@/lib/wallet-service';

interface Props {
  address: string;
  identityHash: string;
  hasReferrer: boolean;
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
      </div>

      {/* 3-Step Process */}
      <div className="w-full max-w-sm space-y-3">
        {/* Step 1 - Completed */}
        <div className="flex items-start gap-3 p-3 bg-green-500/10 border border-green-500/30 rounded-xl">
          <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-green-400">{t('citizen.stepApplicationSent')}</p>
        </div>

        {/* Step 2 - Pending */}
        <div className="flex items-start gap-3 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl">
          <Clock className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-yellow-400">{t('citizen.stepReferrerApproval')}</p>
        </div>

        {/* Step 3 - Future */}
        <div className="flex items-start gap-3 p-3 bg-muted/50 border border-border rounded-xl">
          <ArrowRight className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground">{t('citizen.stepConfirm')}</p>
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

      {/* Next Steps Info */}
      <p className="text-xs text-muted-foreground text-center max-w-sm">
        {t('citizen.nextStepsInfo')}
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
