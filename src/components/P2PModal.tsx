import { X, ExternalLink, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/i18n';

interface P2PModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenP2P: () => void;
}

export function P2PModal({ isOpen, onClose, onOpenP2P }: P2PModalProps) {
  const { t, isRTL } = useTranslation();

  if (!isOpen) return null;

  const handleOpenP2P = () => {
    onOpenP2P();
    onClose();
  };

  // Access steps array directly - t() only works for string values
  // We need to get the steps from the translation as individual indexed items
  const steps: string[] = [];
  for (let i = 0; i < 4; i++) {
    const step = t(`p2p.steps.${i}`);
    if (step !== `p2p.steps.${i}`) steps.push(step);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div
        className={cn(
          'relative w-full max-w-md bg-card rounded-2xl shadow-xl border border-border overflow-hidden',
          isRTL && 'direction-rtl'
        )}
        dir={isRTL ? 'rtl' : 'ltr'}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">{t('p2p.title')}</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-muted transition-colors">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          <p className="text-sm text-muted-foreground">{t('p2p.subtitle')}</p>

          {/* First Time Info */}
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="space-y-2">
                <p className="text-sm font-medium text-amber-400">{t('p2p.firstTime')}</p>
                <ol className="space-y-1.5">
                  {steps.map((step, i) => (
                    <li key={i} className="text-xs text-amber-200/80 flex gap-2">
                      <span className="font-semibold text-amber-400">{i + 1}.</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>

          {/* Note */}
          <p className="text-xs text-muted-foreground">{t('p2p.note')}</p>
        </div>

        {/* Action Button */}
        <div className="p-4 pt-0">
          <button
            onClick={handleOpenP2P}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-cyan-500 hover:bg-cyan-600 text-white font-medium rounded-xl transition-colors"
          >
            <ExternalLink className="w-5 h-5" />
            {t('p2p.button')}
          </button>
        </div>
      </div>
    </div>
  );
}
