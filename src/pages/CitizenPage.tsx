/**
 * Citizen Page
 * Standalone page for citizenship application flow
 * Accessed via ?page=citizen or /citizens URL
 * No bottom navigation bar, no wallet steps - direct form
 */

import { useState, useCallback, lazy, Suspense } from 'react';
import { Globe, Loader2 } from 'lucide-react';
import { useTranslation, LANGUAGE_NAMES, VALID_LANGS } from '@/i18n';
import type { LanguageCode } from '@/i18n';
import type { CitizenshipData } from '@/lib/citizenship';

// Lazy load sub-components
const CitizenForm = lazy(() =>
  import('@/components/citizen/CitizenForm').then((m) => ({ default: m.CitizenForm }))
);
const CitizenProcessing = lazy(() =>
  import('@/components/citizen/CitizenProcessing').then((m) => ({ default: m.CitizenProcessing }))
);
const CitizenSuccess = lazy(() =>
  import('@/components/citizen/CitizenSuccess').then((m) => ({ default: m.CitizenSuccess }))
);

type Step = 'form' | 'processing' | 'success';

function SectionLoader() {
  return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="w-8 h-8 text-primary animate-spin" />
    </div>
  );
}

export function CitizenPage() {
  const { t, lang, setLang } = useTranslation();
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [citizenshipData, setCitizenshipData] = useState<CitizenshipData | null>(null);
  const [identityHash, setIdentityHash] = useState<string>('');
  const [walletAddress, setWalletAddress] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('form');

  // Form submission
  const handleFormSubmit = useCallback((data: CitizenshipData) => {
    setCitizenshipData(data);
    setError(null);
    setStep('processing');
  }, []);

  // Processing result
  const handleSuccess = useCallback((hash: string, address: string) => {
    setIdentityHash(hash);
    setWalletAddress(address);
    setStep('success');
  }, []);

  const handleError = useCallback((err: string) => {
    setError(err);
    setStep('form');
  }, []);

  // Open main app
  const handleOpenApp = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete('page');
    url.pathname = '/';
    window.location.href = url.toString();
  }, []);

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-border">
        <h1 className="text-lg font-bold">{t('citizen.pageTitle')}</h1>

        {/* Language Selector */}
        <div className="relative">
          <button
            onClick={() => setShowLangMenu(!showLangMenu)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-muted rounded-lg text-sm"
          >
            <Globe className="w-4 h-4" />
            <span>{LANGUAGE_NAMES[lang]}</span>
          </button>

          {showLangMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowLangMenu(false)} />
              <div className="absolute end-0 top-full mt-1 z-20 bg-secondary border border-border rounded-xl shadow-lg py-1 min-w-[140px]">
                {VALID_LANGS.map((code) => (
                  <button
                    key={code}
                    onClick={() => {
                      setLang(code as LanguageCode);
                      setShowLangMenu(false);
                    }}
                    className={`w-full px-4 py-2 text-start text-sm hover:bg-muted transition-colors ${
                      lang === code ? 'text-primary font-medium' : ''
                    }`}
                  >
                    {LANGUAGE_NAMES[code as LanguageCode]}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </header>

      {/* Error Banner */}
      {error && (
        <div className="mx-4 mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Content */}
      <main className="flex-1 overflow-y-auto">
        <Suspense fallback={<SectionLoader />}>
          {step === 'form' && <CitizenForm onSubmit={handleFormSubmit} />}

          {step === 'processing' && citizenshipData && (
            <CitizenProcessing
              citizenshipData={citizenshipData}
              onSuccess={handleSuccess}
              onError={handleError}
            />
          )}

          {step === 'success' && (
            <CitizenSuccess
              address={walletAddress}
              identityHash={identityHash}
              hasReferrer={!!citizenshipData?.referrerAddress}
              onOpenApp={handleOpenApp}
            />
          )}
        </Suspense>
      </main>
    </div>
  );
}
