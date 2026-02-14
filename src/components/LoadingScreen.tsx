import { Loader2 } from 'lucide-react';
import { useTranslation } from '@/i18n';

interface LoadingScreenProps {
  message?: string;
}

export function LoadingScreen({ message }: LoadingScreenProps) {
  const { t } = useTranslation();
  const displayMessage = message ?? t('loadingScreen.loading');
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background">
      <div className="relative">
        <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      </div>
      <p className="mt-4 text-sm text-muted-foreground">{displayMessage}</p>
    </div>
  );
}
