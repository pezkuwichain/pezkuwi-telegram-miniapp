import { useCallback, useMemo } from 'react';

export function useTelegram() {
  const tg = useMemo(() => window.Telegram?.WebApp, []);

  const user = useMemo(() => tg?.initDataUnsafe?.user, [tg]);

  const startParam = useMemo(() => tg?.initDataUnsafe?.start_param, [tg]);

  const hapticImpact = useCallback(
    (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft' = 'medium') => {
      tg?.HapticFeedback.impactOccurred(style);
    },
    [tg]
  );

  const hapticNotification = useCallback(
    (type: 'success' | 'warning' | 'error' = 'success') => {
      tg?.HapticFeedback.notificationOccurred(type);
    },
    [tg]
  );

  const hapticSelection = useCallback(() => {
    tg?.HapticFeedback.selectionChanged();
  }, [tg]);

  const showAlert = useCallback(
    (message: string) => {
      if (tg) {
        tg.showAlert(message);
      } else {
        window.alert(message);
      }
    },
    [tg]
  );

  const showConfirm = useCallback(
    (message: string): Promise<boolean> => {
      return new Promise((resolve) => {
        if (tg) {
          tg.showConfirm(message, resolve);
        } else {
          resolve(window.confirm(message));
        }
      });
    },
    [tg]
  );

  const openLink = useCallback(
    (url: string) => {
      // Validate URL to prevent javascript: and data: protocol attacks
      try {
        const parsed = new globalThis.URL(url);
        const allowedProtocols = ['http:', 'https:', 'tg:', 'mailto:'];
        if (!allowedProtocols.includes(parsed.protocol)) {
          return;
        }
      } catch {
        return;
      }

      if (tg) {
        tg.openLink(url);
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    },
    [tg]
  );

  const openTelegramLink = useCallback(
    (url: string) => {
      if (tg) {
        tg.openTelegramLink(url);
      } else {
        window.open(url, '_blank');
      }
    },
    [tg]
  );

  const shareUrl = useCallback(
    (url: string, text?: string) => {
      const shareText = text ? encodeURIComponent(text) : '';
      const shareUrl = encodeURIComponent(url);
      openTelegramLink(`https://t.me/share/url?url=${shareUrl}&text=${shareText}`);
    },
    [openTelegramLink]
  );

  const close = useCallback(() => {
    tg?.close();
  }, [tg]);

  return {
    tg,
    user,
    startParam,
    isAvailable: !!tg,
    platform: tg?.platform || 'unknown',
    version: tg?.version || '0.0',
    hapticImpact,
    hapticNotification,
    hapticSelection,
    showAlert,
    showConfirm,
    openLink,
    openTelegramLink,
    shareUrl,
    close,
  };
}
