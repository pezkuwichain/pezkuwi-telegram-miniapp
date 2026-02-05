/**
 * Update Notification Component
 * Shows when a new version is available
 */

import { RefreshCw, X } from 'lucide-react';
import { useVersion } from '@/hooks/useVersion';
import { useTelegram } from '@/hooks/useTelegram';

export function UpdateNotification() {
  const { hasUpdate, forceUpdate, dismissUpdate, currentVersion } = useVersion();
  const { hapticImpact } = useTelegram();

  if (!hasUpdate) return null;

  const handleUpdate = () => {
    hapticImpact('medium');
    forceUpdate();
  };

  const handleDismiss = () => {
    hapticImpact('light');
    dismissUpdate();
  };

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="bg-primary text-primary-foreground rounded-xl p-4 shadow-lg border border-primary/20">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
            <RefreshCw className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-sm">Guhertoya nû heye!</h4>
            <p className="text-xs opacity-90 mt-0.5">
              Ji bo taybetmendiyên nû û rastkirinên ewlehiyê nûve bike.
            </p>
            <p className="text-[10px] opacity-70 mt-1">v{currentVersion}</p>
          </div>
          <button
            onClick={handleDismiss}
            className="p-1 rounded-lg hover:bg-white/20 transition-colors flex-shrink-0"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex gap-2 mt-3">
          <button
            onClick={handleDismiss}
            className="flex-1 py-2 px-3 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-medium transition-colors"
          >
            Paşê
          </button>
          <button
            onClick={handleUpdate}
            className="flex-1 py-2 px-3 rounded-lg bg-white text-primary text-sm font-medium hover:bg-white/90 transition-colors flex items-center justify-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Nûve bike
          </button>
        </div>
      </div>
    </div>
  );
}

export default UpdateNotification;
