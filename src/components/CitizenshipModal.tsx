/**
 * In-App Citizenship Application Modal
 * Self-contained modal with 3 steps: form → processing → success
 * Uses the already-connected wallet keypair (no seed phrase needed)
 */

import { useState, useEffect, useRef } from 'react';
import { X, Plus, Trash2, Shield, CheckCircle, Clock, ArrowRight, AlertCircle } from 'lucide-react';
import { useWallet } from '@/contexts/WalletContext';
import { useTelegram } from '@/hooks/useTelegram';
import { useTranslation } from '@/i18n';
import { KurdistanSun } from '@/components/KurdistanSun';
import { formatAddress } from '@/lib/utils';
import type { Region, MaritalStatus, ChildInfo } from '@/lib/citizenship';
import {
  calculateIdentityHash,
  saveCitizenshipLocally,
  uploadToIPFS,
  applyCitizenship,
} from '@/lib/citizenship';

interface CitizenshipModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Step = 'form' | 'processing' | 'success';

const REGIONS: { value: Region; labelKey: string }[] = [
  { value: 'bakur', labelKey: 'citizen.regionBakur' },
  { value: 'basur', labelKey: 'citizen.regionBasur' },
  { value: 'rojava', labelKey: 'citizen.regionRojava' },
  { value: 'rojhelat', labelKey: 'citizen.regionRojhelat' },
  { value: 'kurdistan_a_sor', labelKey: 'citizen.regionKurdistanASor' },
  { value: 'diaspora', labelKey: 'citizen.regionDiaspora' },
];

export function CitizenshipModal({ isOpen, onClose }: CitizenshipModalProps) {
  const { peopleApi, keypair, address } = useWallet();
  const { hapticImpact, hapticNotification } = useTelegram();
  const { t } = useTranslation();

  const [step, setStep] = useState<Step>('form');
  const [error, setError] = useState('');

  // Form fields
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
  const [referrerAddress, setReferrerAddress] = useState('');
  const [consent, setConsent] = useState(false);

  // Success data
  const [identityHash, setIdentityHash] = useState('');

  // Processing cancel ref
  const cancelledRef = useRef(false);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep('form');
      setError('');
      setFullName('');
      setFatherName('');
      setGrandfatherName('');
      setMotherName('');
      setTribe('');
      setMaritalStatus('nezewici');
      setChildrenCount(0);
      setChildren([]);
      setRegion('');
      setEmail('');
      setProfession('');
      setReferrerAddress('');
      setConsent(false);
      setIdentityHash('');
      cancelledRef.current = false;
    }
  }, [isOpen]);

  // --- Form handlers ---

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

  const handleFormSubmit = () => {
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

    if (!consent) {
      setError(t('citizen.acceptConsent'));
      hapticNotification('error');
      return;
    }

    if (!peopleApi) {
      setError(t('citizen.peopleChainNotConnected'));
      hapticNotification('error');
      return;
    }

    if (!keypair || !address) {
      setError(t('citizen.walletNotConnected'));
      hapticNotification('error');
      return;
    }

    hapticImpact('medium');
    setStep('processing');
  };

  // --- Processing logic ---

  useEffect(() => {
    if (step !== 'processing') return;

    cancelledRef.current = false;

    const process = async () => {
      try {
        if (!peopleApi || !keypair || !address) {
          setError(t('citizen.walletNotConnected'));
          setStep('form');
          return;
        }

        // Build citizenship data for local save
        const citizenshipData = {
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
          walletAddress: address,
          seedPhrase: '',
          timestamp: Date.now(),
        };

        // Mock IPFS upload
        const ipfsCid = await uploadToIPFS(citizenshipData);
        if (cancelledRef.current) return;

        // Calculate identity hash
        const hash = calculateIdentityHash(fullName, email, [ipfsCid]);
        if (cancelledRef.current) return;
        setIdentityHash(hash);

        // Save encrypted data locally
        saveCitizenshipLocally(citizenshipData);

        // Sign and submit extrinsic
        const result = await applyCitizenship(peopleApi, keypair, hash, referrerAddress || null);

        if (cancelledRef.current) return;

        if (result.success) {
          hapticNotification('success');
          setStep('success');
        } else {
          hapticNotification('error');
          setError(result.error || t('citizen.submissionFailed'));
          setStep('form');
        }
      } catch (err) {
        if (cancelledRef.current) return;
        hapticNotification('error');
        setError(err instanceof Error ? err.message : t('citizen.submissionFailed'));
        setStep('form');
      }
    };

    process();

    return () => {
      cancelledRef.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  if (!isOpen) return null;

  const inputClass = 'w-full px-4 py-3 bg-muted rounded-xl text-sm';
  const labelClass = 'text-sm text-muted-foreground mb-1 block';

  // --- Processing Step ---
  if (step === 'processing') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
        <div className="w-full max-w-md bg-card rounded-2xl shadow-xl border border-border p-6">
          <div className="flex flex-col items-center justify-center py-8 space-y-6">
            <KurdistanSun size={100} />
            <div className="text-center space-y-2">
              <p className="text-lg font-medium">{t('citizen.applyingCitizenship')}</p>
              <p className="text-sm text-muted-foreground">{fullName}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- Success Step ---
  if (step === 'success') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
        <div className="w-full max-w-md bg-card rounded-2xl shadow-xl border border-border overflow-hidden max-h-[90vh] overflow-y-auto">
          <div className="flex flex-col items-center p-6 space-y-6">
            {/* Success Icon */}
            <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center">
              <CheckCircle className="w-12 h-12 text-green-500" />
            </div>

            {/* Title */}
            <h2 className="text-xl font-bold">{t('citizen.applicationSuccess')}</h2>

            {/* 3-Step Process */}
            <div className="w-full space-y-3">
              <div className="flex items-start gap-3 p-3 bg-green-500/10 border border-green-500/30 rounded-xl">
                <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-green-400">{t('citizen.stepApplicationSent')}</p>
              </div>
              <div className="flex items-start gap-3 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl">
                <Clock className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-yellow-400">{t('citizen.stepReferrerApproval')}</p>
              </div>
              <div className="flex items-start gap-3 p-3 bg-muted/50 border border-border rounded-xl">
                <ArrowRight className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                <p className="text-sm text-muted-foreground">{t('citizen.stepConfirm')}</p>
              </div>
            </div>

            {/* Application Info */}
            <div className="w-full bg-muted/50 rounded-2xl p-5 space-y-4 border border-border">
              <div>
                <p className="text-xs text-muted-foreground">{t('citizen.identityHash')}</p>
                <p className="text-sm font-mono break-all">{formatAddress(identityHash)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('citizen.walletAddress')}</p>
                <p className="text-sm font-mono">{formatAddress(address || '')}</p>
              </div>
            </div>

            {/* Next Steps Info */}
            <p className="text-xs text-muted-foreground text-center">
              {t('citizen.nextStepsInfo')}
            </p>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-semibold"
            >
              {t('common.close')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Form Step ---
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md bg-card rounded-2xl shadow-xl border border-border overflow-hidden max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-card z-10">
          <h2 className="text-lg font-semibold">{t('citizen.pageTitle')}</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-muted">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Form Content */}
        <div className="p-4 space-y-4">
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

          {/* Referrer Address */}
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
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Submit Button */}
          <button
            onClick={handleFormSubmit}
            disabled={!consent || !fullName || !region || !email}
            className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-semibold disabled:opacity-50"
          >
            {t('citizen.submit')}
          </button>
        </div>
      </div>
    </div>
  );
}
