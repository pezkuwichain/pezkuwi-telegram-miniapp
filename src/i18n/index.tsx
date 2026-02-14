import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { Translations, LanguageCode } from './types';
import { RTL_LANGUAGES } from './types';
import krd from './translations/krd';
import en from './translations/en';
import tr from './translations/tr';
import ckb from './translations/ckb';
import fa from './translations/fa';
import ar from './translations/ar';

const translations: Record<LanguageCode, Translations> = {
  krd,
  en,
  tr,
  ckb,
  fa,
  ar,
};

// Module-level language tracking for non-React contexts
let currentLanguage: LanguageCode = 'krd';

/**
 * Standalone translate function for non-React files (utils, crypto, error-tracking, etc.)
 * Language is synced from LanguageProvider automatically.
 */
export function translate(key: string, params?: Record<string, string | number>): string {
  let value = getNestedValue(
    translations[currentLanguage] as unknown as Record<string, unknown>,
    key
  );
  if (value === undefined && currentLanguage !== DEFAULT_LANG) {
    value = getNestedValue(translations[DEFAULT_LANG] as unknown as Record<string, unknown>, key);
  }
  if (value === undefined) return key;

  if (params) {
    let result = value;
    for (const [paramKey, paramValue] of Object.entries(params)) {
      result = result.replace(`{${paramKey}}`, String(paramValue));
    }
    return result;
  }

  return value;
}

/** Get current language code (for locale-dependent formatting) */
export function getCurrentLanguage(): LanguageCode {
  return currentLanguage;
}

const VALID_LANGS: LanguageCode[] = ['krd', 'en', 'tr', 'ckb', 'fa', 'ar'];
const DEFAULT_LANG: LanguageCode = 'krd';

/**
 * Map Telegram language codes to our supported languages.
 * Telegram uses IETF codes like "en", "tr", "fa", "ar", "ku".
 */
const TG_LANG_MAP: Record<string, LanguageCode> = {
  ku: 'krd',
  kmr: 'krd',
  ckb: 'ckb',
  tr: 'tr',
  en: 'en',
  fa: 'fa',
  ar: 'ar',
};

/**
 * Detect language: URL path first, then Telegram user language, then default.
 */
function detectLanguage(): LanguageCode {
  // 1. Check URL path
  const path = window.location.pathname;
  const firstSegment = path.split('/').filter(Boolean)[0];
  if (firstSegment && VALID_LANGS.includes(firstSegment as LanguageCode)) {
    return firstSegment as LanguageCode;
  }

  // 2. Check Telegram WebApp user language
  try {
    const tg = (
      window as unknown as {
        Telegram?: { WebApp?: { initDataUnsafe?: { user?: { language_code?: string } } } };
      }
    ).Telegram;
    const tgLang = tg?.WebApp?.initDataUnsafe?.user?.language_code;
    if (tgLang) {
      const mapped = TG_LANG_MAP[tgLang];
      if (mapped) return mapped;
    }
  } catch {
    // Telegram WebApp not available
  }

  return DEFAULT_LANG;
}

/**
 * Get a nested value from an object using dot notation.
 * e.g. getNestedValue(obj, 'nav.forum') -> obj.nav.forum
 */
function getNestedValue(obj: Record<string, unknown>, path: string): string | undefined {
  const keys = path.split('.');
  let current: unknown = obj;
  for (const key of keys) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === 'string' ? current : undefined;
}

interface LanguageContextType {
  lang: LanguageCode;
  setLang: (lang: LanguageCode) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  isRTL: boolean;
}

const LanguageContext = createContext<LanguageContextType | null>(null);

interface LanguageProviderProps {
  children: ReactNode;
}

export function LanguageProvider({ children }: LanguageProviderProps) {
  const [lang, setLangState] = useState<LanguageCode>(detectLanguage);

  const isRTL = RTL_LANGUAGES.includes(lang);

  // Sync module-level language for standalone translate()
  useEffect(() => {
    currentLanguage = lang;
  }, [lang]);

  // Update document direction, lang attribute, and URL when language changes
  useEffect(() => {
    document.documentElement.lang = lang === 'krd' ? 'ku' : lang;
    document.documentElement.dir = isRTL ? 'rtl' : 'ltr';

    // Ensure URL has language prefix (preserve query params and special paths)
    const pathSegments = window.location.pathname.split('/').filter(Boolean);
    const firstSegment = pathSegments[0];
    // Don't rewrite URL for standalone pages like /citizens
    const STANDALONE_PATHS = ['citizens'];
    if (firstSegment && STANDALONE_PATHS.includes(firstSegment)) {
      // Keep standalone path as-is
    } else if (!firstSegment || !VALID_LANGS.includes(firstSegment as LanguageCode)) {
      window.history.replaceState(null, '', `/${lang}${window.location.search}`);
    }
  }, [lang, isRTL]);

  const setLang = useCallback((newLang: LanguageCode) => {
    setLangState(newLang);
    // Update URL without reload
    const currentPath = window.location.pathname;
    const segments = currentPath.split('/').filter(Boolean);
    // Remove old lang prefix if present
    if (segments.length > 0 && VALID_LANGS.includes(segments[0] as LanguageCode)) {
      segments.shift();
    }
    const newPath = `/${newLang}${segments.length > 0 ? '/' + segments.join('/') : ''}`;
    window.history.replaceState(null, '', `${newPath}${window.location.search}`);
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      // Try current language first
      let value = getNestedValue(translations[lang] as unknown as Record<string, unknown>, key);
      // Fallback to Kurdish
      if (value === undefined && lang !== DEFAULT_LANG) {
        value = getNestedValue(
          translations[DEFAULT_LANG] as unknown as Record<string, unknown>,
          key
        );
      }
      // If still not found, return the key itself
      if (value === undefined) return key;

      // Replace params like {time}, {count}, {amount}, {rating}
      if (params) {
        let result = value;
        for (const [paramKey, paramValue] of Object.entries(params)) {
          result = result.replace(`{${paramKey}}`, String(paramValue));
        }
        return result;
      }

      return value;
    },
    [lang]
  );

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, isRTL }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useTranslation() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useTranslation must be used within a LanguageProvider');
  }
  return context;
}

export type { LanguageCode, Translations };
export { VALID_LANGS, DEFAULT_LANG, RTL_LANGUAGES, LANGUAGE_NAMES } from './types';
