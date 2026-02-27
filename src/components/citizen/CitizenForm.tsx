/**
 * Citizen Application Form
 * Collects citizenship data and seed phrase from the user
 */

import { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, Shield } from 'lucide-react';
import { useTranslation } from '@/i18n';
import { useTelegram } from '@/hooks/useTelegram';
import { initWalletService, validateMnemonic, getAddressFromMnemonic } from '@/lib/wallet-service';
import type { CitizenshipData, Region, MaritalStatus, ChildInfo } from '@/lib/citizenship';

interface Props {
  onSubmit: (data: CitizenshipData) => void;
  initialReferrer?: string;
}

const REGIONS: { value: Region; labelKey: string }[] = [
  { value: 'bakur', labelKey: 'citizen.regionBakur' },
  { value: 'basur', labelKey: 'citizen.regionBasur' },
  { value: 'rojava', labelKey: 'citizen.regionRojava' },
  { value: 'rojhelat', labelKey: 'citizen.regionRojhelat' },
  { value: 'kurdistan_a_sor', labelKey: 'citizen.regionKurdistanASor' },
  { value: 'diaspora', labelKey: 'citizen.regionDiaspora' },
];

export function CitizenForm({ onSubmit, initialReferrer }: Props) {
  const { t } = useTranslation();
  const { hapticImpact, hapticNotification } = useTelegram();

  const [fullName, setFullName] = useState('');
  const [fatherName, setFatherName] = useState('');
  const [grandfatherName, setGrandfatherName] = useState('');
  const [motherName, setMotherName] = useState('');
  const [tribe, setTribe] = useState('');
  const [maritalStatus, setMaritalStatus] = useState<MaritalStatus>('nezewici');
  const [childrenCount, setChildrenCount] = useState(0);
  const [children, setChildren] = useState<ChildInfo[]>([]);
  const [region, setRegion] = useState<Region | ''>('');
  const [email, setEmail] = useState('');
  const [profession, setProfession] = useState('');
  const [referrerAddress, setReferrerAddress] = useState(initialReferrer || '');
  const [seedPhrase, setSeedPhrase] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');
  const [cryptoReady, setCryptoReady] = useState(false);

  // Initialize crypto libraries for mnemonic validation
  useEffect(() => {
    initWalletService().then(() => setCryptoReady(true));
  }, []);

  // Derive seed phrase validation error (no setState in effect)
  const seedPhraseError = useMemo(() => {
    const trimmed = seedPhrase.trim();
    if (!trimmed) return '';
    if (!cryptoReady) return '';

    const words = trimmed.split(/\s+/);
    if (words.length !== 12 && words.length !== 24) {
      return t('citizen.invalidSeedPhrase');
    }

    if (!validateMnemonic(trimmed)) {
      return t('citizen.invalidSeedPhrase');
    }

    return '';
  }, [seedPhrase, cryptoReady, t]);

  const handleMaritalChange = (status: MaritalStatus) => {
    hapticImpact('light');
    setMaritalStatus(status);
    if (status === 'nezewici') {
      setChildrenCount(0);
      setChildren([]);
    }
  };

  const handleChildrenCountChange = (count: number) => {
    const c = Math.max(0, Math.min(20, count));
    setChildrenCount(c);
    setChildren((prev) => {
      if (c > prev.length) {
        return [
          ...prev,
          ...Array.from({ length: c - prev.length }, () => ({ name: '', birthYear: 2000 })),
        ];
      }
      return prev.slice(0, c);
    });
  };

  const updateChild = (index: number, field: keyof ChildInfo, value: string | number) => {
    setChildren((prev) =>
      prev.map((child, i) => (i === index ? { ...child, [field]: value } : child))
    );
  };

  const addChild = () => {
    hapticImpact('light');
    handleChildrenCountChange(childrenCount + 1);
  };

  const removeChild = (index: number) => {
    hapticImpact('light');
    setChildren((prev) => prev.filter((_, i) => i !== index));
    setChildrenCount((prev) => prev - 1);
  };

  const handleSubmit = () => {
    setError('');

    if (
      !fullName ||
      !fatherName ||
      !grandfatherName ||
      !motherName ||
      !tribe ||
      !region ||
      !email ||
      !profession
    ) {
      setError(t('citizen.fillAllFields'));
      hapticNotification('error');
      return;
    }

    // Validate seed phrase
    const trimmedSeed = seedPhrase.trim();
    if (!trimmedSeed || !cryptoReady || !validateMnemonic(trimmedSeed)) {
      setError(t('citizen.invalidSeedPhrase'));
      hapticNotification('error');
      return;
    }

    if (!consent) {
      setError(t('citizen.acceptConsent'));
      hapticNotification('error');
      return;
    }

    hapticImpact('medium');

    // Derive wallet address from seed phrase
    const walletAddress = getAddressFromMnemonic(trimmedSeed);

    const data: CitizenshipData = {
      fullName,
      fatherName,
      grandfatherName,
      motherName,
      tribe,
      maritalStatus,
      childrenCount: maritalStatus === 'zewici' ? childrenCount : undefined,
      children: maritalStatus === 'zewici' && children.length > 0 ? children : undefined,
      region: region as Region,
      email,
      profession,
      referrerAddress: referrerAddress || undefined,
      walletAddress,
      seedPhrase: trimmedSeed,
      timestamp: Date.now(),
    };

    onSubmit(data);
  };

  const isSeedValid = cryptoReady && seedPhrase.trim() && !seedPhraseError;
  const inputClass = 'w-full px-4 py-3 bg-muted rounded-xl text-sm';
  const labelClass = 'text-sm text-muted-foreground mb-1 block';

  return (
    <div className="p-4 space-y-4 pb-24">
      {/* Privacy Notice */}
      <div className="flex gap-3 p-3 bg-blue-500/10 border border-blue-500/30 rounded-xl">
        <Shield className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-blue-300">{t('citizen.privacyNotice')}</p>
      </div>

      {/* Full Name */}
      <div>
        <label className={labelClass}>{t('citizen.fullName')}</label>
        <input
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className={inputClass}
          placeholder={t('citizen.fullNamePlaceholder')}
        />
      </div>

      {/* Father's Name */}
      <div>
        <label className={labelClass}>{t('citizen.fatherName')}</label>
        <input
          type="text"
          value={fatherName}
          onChange={(e) => setFatherName(e.target.value)}
          className={inputClass}
          placeholder={t('citizen.fatherNamePlaceholder')}
        />
      </div>

      {/* Grandfather's Name */}
      <div>
        <label className={labelClass}>{t('citizen.grandfatherName')}</label>
        <input
          type="text"
          value={grandfatherName}
          onChange={(e) => setGrandfatherName(e.target.value)}
          className={inputClass}
          placeholder={t('citizen.grandfatherNamePlaceholder')}
        />
      </div>

      {/* Mother's Name */}
      <div>
        <label className={labelClass}>{t('citizen.motherName')}</label>
        <input
          type="text"
          value={motherName}
          onChange={(e) => setMotherName(e.target.value)}
          className={inputClass}
          placeholder={t('citizen.motherNamePlaceholder')}
        />
      </div>

      {/* Tribe */}
      <div>
        <label className={labelClass}>{t('citizen.tribe')}</label>
        <input
          type="text"
          value={tribe}
          onChange={(e) => setTribe(e.target.value)}
          className={inputClass}
          placeholder={t('citizen.tribePlaceholder')}
        />
      </div>

      {/* Marital Status */}
      <div>
        <label className={labelClass}>{t('citizen.maritalStatus')}</label>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => handleMaritalChange('nezewici')}
            className={`flex-1 py-3 rounded-xl text-sm font-medium transition-colors ${
              maritalStatus === 'nezewici'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {t('citizen.single')}
          </button>
          <button
            type="button"
            onClick={() => handleMaritalChange('zewici')}
            className={`flex-1 py-3 rounded-xl text-sm font-medium transition-colors ${
              maritalStatus === 'zewici'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {t('citizen.married')}
          </button>
        </div>
      </div>

      {/* Children (if married) */}
      {maritalStatus === 'zewici' && (
        <div className="space-y-3">
          <label className={labelClass}>{t('citizen.childrenCount')}</label>
          {children.map((child, index) => (
            <div key={index} className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="text-xs text-muted-foreground">
                  {t('citizen.childName', { index: String(index + 1) })}
                </label>
                <input
                  type="text"
                  value={child.name}
                  onChange={(e) => updateChild(index, 'name', e.target.value)}
                  className={inputClass}
                  placeholder={t('citizen.childNamePlaceholder')}
                />
              </div>
              <div className="w-24">
                <label className="text-xs text-muted-foreground">
                  {t('citizen.childBirthYear')}
                </label>
                <input
                  type="number"
                  value={child.birthYear}
                  onChange={(e) =>
                    updateChild(index, 'birthYear', parseInt(e.target.value) || 2000)
                  }
                  className={inputClass}
                  min={1950}
                  max={2026}
                />
              </div>
              <button
                type="button"
                onClick={() => removeChild(index)}
                className="p-3 text-red-400 hover:text-red-300"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addChild}
            className="flex items-center gap-2 text-sm text-primary"
          >
            <Plus className="w-4 h-4" />
            {t('citizen.addChild')}
          </button>
        </div>
      )}

      {/* Region */}
      <div>
        <label className={labelClass}>{t('citizen.region')}</label>
        <select
          value={region}
          onChange={(e) => {
            setRegion(e.target.value as Region);
            hapticImpact('light');
          }}
          className={`${inputClass} appearance-none`}
        >
          <option value="">{t('citizen.regionPlaceholder')}</option>
          {REGIONS.map((r) => (
            <option key={r.value} value={r.value}>
              {t(r.labelKey)}
            </option>
          ))}
        </select>
      </div>

      {/* Email */}
      <div>
        <label className={labelClass}>{t('citizen.email')}</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
          placeholder={t('citizen.emailPlaceholder')}
        />
      </div>

      {/* Profession */}
      <div>
        <label className={labelClass}>{t('citizen.profession')}</label>
        <input
          type="text"
          value={profession}
          onChange={(e) => setProfession(e.target.value)}
          className={inputClass}
          placeholder={t('citizen.professionPlaceholder')}
        />
      </div>

      {/* Seed Phrase */}
      <div>
        <label className={labelClass}>{t('citizen.seedPhrase')}</label>
        <textarea
          value={seedPhrase}
          onChange={(e) => setSeedPhrase(e.target.value)}
          className={`${inputClass} min-h-[80px] resize-none`}
          placeholder={t('citizen.seedPhrasePlaceholder')}
          rows={3}
        />
        {seedPhraseError && <p className="text-xs text-red-400 mt-1">{seedPhraseError}</p>}
      </div>

      {/* Referrer Address */}
      {initialReferrer ? (
        <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-xl">
          <label className="text-xs text-green-400 mb-1 block">
            {t('citizen.referrerAddress')}
          </label>
          <p className="text-sm font-mono text-green-300 break-all">{initialReferrer}</p>
        </div>
      ) : (
        <div>
          <label className={labelClass}>{t('citizen.referrerAddress')}</label>
          <input
            type="text"
            value={referrerAddress}
            onChange={(e) => setReferrerAddress(e.target.value)}
            className={inputClass}
            placeholder={t('citizen.referrerPlaceholder')}
          />
        </div>
      )}

      {/* Consent */}
      <label className="flex items-start gap-3 p-3 bg-muted/50 rounded-xl cursor-pointer">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-1 w-5 h-5 rounded accent-primary flex-shrink-0"
        />
        <span className="text-sm text-muted-foreground">{t('citizen.consentCheckbox')}</span>
      </label>

      {/* Error */}
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Submit Button */}
      <button
        onClick={handleSubmit}
        disabled={!consent || !fullName || !region || !email || !isSeedValid}
        className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-semibold disabled:opacity-50"
      >
        {t('citizen.submit')}
      </button>
    </div>
  );
}
