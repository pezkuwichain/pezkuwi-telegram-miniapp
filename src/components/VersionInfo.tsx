/**
 * Version Info Component
 * Displays current app version
 */

import { Info } from 'lucide-react';
import { useVersion } from '@/hooks/useVersion';

interface VersionInfoProps {
  className?: string;
  showBuildTime?: boolean;
}

export function VersionInfo({ className = '', showBuildTime = false }: VersionInfoProps) {
  const { currentVersion, buildTime } = useVersion();

  const formattedBuildTime = new Date(buildTime).toLocaleDateString('ku', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className={`flex items-center gap-2 text-xs text-muted-foreground ${className}`}>
      <Info className="w-3 h-3" />
      <span>v{currentVersion}</span>
      {showBuildTime && (
        <>
          <span className="opacity-50">•</span>
          <span className="opacity-70">{formattedBuildTime}</span>
        </>
      )}
    </div>
  );
}

export default VersionInfo;
