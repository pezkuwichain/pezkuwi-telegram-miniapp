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

const VALID_LANGS: LanguageCode[] = ['krd', 'en', 'tr', 'ckb', 'fa', 'ar'];
const DEFAULT_LANG: LanguageCode = 'krd';

/**
 * Detect language from URL path.
 * e.g. /krd/... -> krd, /en/... -> en, / -> krd (default)
 */
function detectLanguageFromURL(): LanguageCode {
  const path = window.location.pathname;
  const firstSegment = path.split('/').filter(Boolean)[0];
  if (firstSegment && VALID_LANGS.includes(firstSegment as LanguageCode)) {
    return firstSegment as LanguageCode;
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
  const [lang, setLangState] = useState<LanguageCode>(detectLanguageFromURL);

  const isRTL = RTL_LANGUAGES.includes(lang);

  // Update document direction and lang attribute when language changes
  useEffect(() => {
    document.documentElement.lang = lang === 'krd' ? 'ku' : lang;
    document.documentElement.dir = isRTL ? 'rtl' : 'ltr';
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
    window.history.replaceState(null, '', newPath);
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
