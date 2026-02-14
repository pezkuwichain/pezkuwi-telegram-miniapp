import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { translate, getCurrentLanguage } from '@/i18n';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatAddress(address: string, chars = 6): string {
  if (!address || address.length < chars * 2) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

export function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

export function formatDate(date: Date | string): string {
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return translate('time.now');
  if (minutes < 60) return translate('time.minutesAgo', { count: minutes });
  if (hours < 24) return translate('time.hoursAgo', { count: hours });
  if (days < 7) return translate('time.daysAgo', { count: days });

  const langMap: Record<string, string> = {
    krd: 'ku',
    en: 'en',
    tr: 'tr',
    ckb: 'ckb',
    fa: 'fa',
    ar: 'ar',
  };
  const locale = langMap[getCurrentLanguage()] || 'ku';
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}
