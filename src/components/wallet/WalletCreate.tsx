/**
 * Wallet Create Component
 * Multi-step wallet creation flow following pezWallet architecture
 * Flow: Password → Backup (show mnemonic + 3 conditions) → Verify (word ordering) → Complete
 */

import { useState } from 'react';
import {
  Eye,
  EyeOff,
  Copy,
  Check,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  RotateCcw,
} from 'lucide-react';
import { useWallet } from '@/contexts/WalletContext';
import { useTelegram } from '@/hooks/useTelegram';

type Step = 'password' | 'backup' | 'verify' | 'complete';

interface MnemonicWord {
  id: number;
  content: string;
  removed: boolean;
}

interface Props {
  onComplete: () => void;
  onBack: () => void;
}

export function WalletCreate({ onComplete, onBack }: Props) {
  const { generateNewWallet, confirmWallet, isInitialized } = useWallet();
  const { hapticImpact, hapticNotification } = useTelegram();

  const [step, setStep] = useState<Step>('password');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [mnemonic, setMnemonic] = useState('');
  const [address, setAddress] = useState('');
  const [copied, setCopied] = useState(false);

  // Backup conditions (3 checkboxes - all must be checked)
  const [conditions, setConditions] = useState({
    writtenDown: false,
    neverShare: false,
    lossRisk: false,
  });

  // Verify step - word ordering
  const [sourceWords, setSourceWords] = useState<MnemonicWord[]>([]);
  const [destinationWords, setDestinationWords] = useState<MnemonicWord[]>([]);

  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Password strength validation rules (must match crypto.ts validatePassword)
  const passwordRules = {
    minLength: password.length >= 12,
    hasLowercase: /[a-z]/.test(password),
    hasUppercase: /[A-Z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecialChar: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password),
    passwordsMatch: password === confirmPassword && password.length > 0,
  };

  const allPasswordRulesPass =
    passwordRules.minLength &&
    passwordRules.hasLowercase &&
    passwordRules.hasUppercase &&
    passwordRules.hasNumber &&
    passwordRules.hasSpecialChar &&
    passwordRules.passwordsMatch;

  // Check if all conditions are met
  const allConditionsChecked =
    conditions.writtenDown && conditions.neverShare && conditions.lossRisk;

  // Step 1: Password - validate and generate wallet (NOT saved yet)
  const handlePasswordSubmit = () => {
    setError('');

    if (!isInitialized) {
      setError('Wallet service amade nîne. Ji kerema xwe bisekinin.');
      return;
    }

    if (!allPasswordRulesPass) {
      setError('Ji kerema xwe hemû şertên şîfre (password) bicîh bînin');
      hapticNotification('error');
      return;
    }

    hapticImpact('medium');

    try {
      // Generate wallet but DON'T save yet - user must verify backup first
      const result = generateNewWallet();
      setMnemonic(result.mnemonic);
      setAddress(result.address);
      setStep('backup');
    } catch (err) {
      console.error('Wallet generation error:', err);
      setError(
        err instanceof Error ? err.message : 'Wallet çênebû. Ji kerema xwe dîsa biceribînin'
      );
      hapticNotification('error');
    }
  };

  // Step 2: Backup - Copy mnemonic
  const handleCopyMnemonic = () => {
    navigator.clipboard.writeText(mnemonic);
    setCopied(true);
    hapticNotification('success');
    setTimeout(() => setCopied(false), 2000);
  };

  // Step 2: Backup - Proceed to verify (only if all conditions checked)
  const handleBackupContinue = () => {
    if (!allConditionsChecked) {
      setError('Ji kerema xwe hemû şertan bipejirînin');
      return;
    }

    hapticImpact('light');

    // Initialize verification step with shuffled words
    const words = mnemonic.split(' ');
    const shuffled = [...words]
      .map((word, idx) => ({ id: idx, content: word, removed: false }))
      .sort(() => Math.random() - 0.5);

    setSourceWords(shuffled);
    setDestinationWords([]);
    setError('');
    setStep('verify');
  };

  // Step 3: Verify - Source word clicked (add to destination)
  const handleSourceWordClick = (word: MnemonicWord) => {
    if (word.removed) return;

    hapticImpact('light');

    // Mark as removed in source
    setSourceWords((prev) => prev.map((w) => (w.id === word.id ? { ...w, removed: true } : w)));

    // Add to destination
    setDestinationWords((prev) => [...prev, { ...word, removed: false }]);
  };

  // Step 3: Verify - Destination word clicked (return to source)
  const handleDestinationWordClick = (word: MnemonicWord) => {
    hapticImpact('light');

    // Remove from destination
    setDestinationWords((prev) => prev.filter((w) => w.id !== word.id));

    // Restore in source
    setSourceWords((prev) => prev.map((w) => (w.id === word.id ? { ...w, removed: false } : w)));
  };

  // Step 3: Verify - Reset
  const handleReset = () => {
    hapticImpact('medium');
    setSourceWords((prev) => prev.map((w) => ({ ...w, removed: false })));
    setDestinationWords([]);
    setError('');
  };

  // Step 3: Verify - Check and create wallet
  const handleVerify = async () => {
    const originalWords = mnemonic.split(' ');
    const enteredWords = destinationWords.map((w) => w.content);

    // Check if order matches
    const isCorrect =
      originalWords.length === enteredWords.length &&
      originalWords.every((word, idx) => word === enteredWords[idx]);

    if (!isCorrect) {
      setError('Rêza peyvan ne rast e. Ji kerema xwe dîsa biceribînin');
      hapticNotification('error');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      // NOW save the wallet after user has verified backup
      await confirmWallet(mnemonic, password);
      hapticNotification('success');
      setStep('complete');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Wallet çênebû');
      hapticNotification('error');
    } finally {
      setIsLoading(false);
    }
  };

  // Can continue in verify step only when all words are placed
  const canVerify = destinationWords.length === 12;

  // Render based on step
  if (step === 'password') {
    return (
      <div className="p-4 space-y-6">
        <button onClick={onBack} className="flex items-center gap-2 text-muted-foreground">
          <ArrowLeft className="w-4 h-4" />
          <span>Paş</span>
        </button>

        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">Şîfre (Password) Diyar Bike</h2>
          <p className="text-muted-foreground text-sm">
            Ev şîfre (password) dê ji bo vekirina wallet&apos;ê were bikaranîn
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">Şîfre (Password)</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-muted rounded-xl pr-12"
                placeholder="Herî kêm 12 tîp (min 12 characters)"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">Şîfre Dubare (Confirm Password)</label>
            <input
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-3 bg-muted rounded-xl"
              placeholder="Şîfre dubare binivîse (confirm password)"
            />
          </div>

          {/* Real-time password strength indicator */}
          {password.length > 0 && (
            <div className="p-3 bg-muted/50 rounded-xl space-y-2">
              <p className="text-xs text-muted-foreground font-medium">Şertên Şîfre (Password):</p>
              <div className="grid grid-cols-1 gap-1.5 text-xs">
                <div
                  className={`flex items-center gap-2 ${passwordRules.minLength ? 'text-green-400' : 'text-red-400'}`}
                >
                  {passwordRules.minLength ? (
                    <Check className="w-3 h-3" />
                  ) : (
                    <AlertTriangle className="w-3 h-3" />
                  )}
                  <span>Herî kêm 12 tîp (min 12 characters)</span>
                </div>
                <div
                  className={`flex items-center gap-2 ${passwordRules.hasLowercase ? 'text-green-400' : 'text-red-400'}`}
                >
                  {passwordRules.hasLowercase ? (
                    <Check className="w-3 h-3" />
                  ) : (
                    <AlertTriangle className="w-3 h-3" />
                  )}
                  <span>Herî kêm 1 tîpa biçûk (a-z)</span>
                </div>
                <div
                  className={`flex items-center gap-2 ${passwordRules.hasUppercase ? 'text-green-400' : 'text-red-400'}`}
                >
                  {passwordRules.hasUppercase ? (
                    <Check className="w-3 h-3" />
                  ) : (
                    <AlertTriangle className="w-3 h-3" />
                  )}
                  <span>Herî kêm 1 tîpa mezin (A-Z)</span>
                </div>
                <div
                  className={`flex items-center gap-2 ${passwordRules.hasNumber ? 'text-green-400' : 'text-red-400'}`}
                >
                  {passwordRules.hasNumber ? (
                    <Check className="w-3 h-3" />
                  ) : (
                    <AlertTriangle className="w-3 h-3" />
                  )}
                  <span>Herî kêm 1 hejmar (0-9)</span>
                </div>
                <div
                  className={`flex items-center gap-2 ${passwordRules.hasSpecialChar ? 'text-green-400' : 'text-red-400'}`}
                >
                  {passwordRules.hasSpecialChar ? (
                    <Check className="w-3 h-3" />
                  ) : (
                    <AlertTriangle className="w-3 h-3" />
                  )}
                  <span>Herî kêm 1 sembola taybetî (!@#$%...)</span>
                </div>
                {confirmPassword.length > 0 && (
                  <div
                    className={`flex items-center gap-2 ${passwordRules.passwordsMatch ? 'text-green-400' : 'text-red-400'}`}
                  >
                    {passwordRules.passwordsMatch ? (
                      <Check className="w-3 h-3" />
                    ) : (
                      <AlertTriangle className="w-3 h-3" />
                    )}
                    <span>Şîfre (password) hev digirin</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          <button
            onClick={handlePasswordSubmit}
            disabled={isLoading || !allPasswordRulesPass || !isInitialized}
            className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {!isInitialized
              ? 'Tê amadekirin...'
              : isLoading
                ? 'Tê çêkirin...'
                : allPasswordRulesPass
                  ? 'Berdewam'
                  : 'Şertên şîfre (password) bicîh bînin'}
            {!isLoading && allPasswordRulesPass && isInitialized && (
              <ArrowRight className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    );
  }

  if (step === 'backup') {
    const words = mnemonic.split(' ');

    return (
      <div className="p-4 space-y-6">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">Seed Phrase Paşguh Bike</h2>
          <p className="text-muted-foreground text-sm">
            Ev 12 peyv wallet&apos;ê te ne. Wan li cihekî ewle binivîse!
          </p>
        </div>

        <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" />
          <p className="text-sm text-yellow-200">
            <strong>Girîng:</strong> Ev peyvan tenê yek car têne xuyang kirin. Eger te ev peyv winda
            bikin, tu nikarî gihîştina wallet&apos;ê xwe bistînî.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {words.map((word, idx) => (
            <div key={idx} className="px-3 py-2 bg-muted rounded-lg text-center text-sm font-mono">
              <span className="text-muted-foreground mr-1">{idx + 1}.</span>
              {word}
            </div>
          ))}
        </div>

        <button
          onClick={handleCopyMnemonic}
          className="w-full py-3 bg-muted rounded-xl flex items-center justify-center gap-2"
        >
          {copied ? (
            <>
              <Check className="w-4 h-4 text-green-400" />
              <span className="text-green-400">Hat kopîkirin!</span>
            </>
          ) : (
            <>
              <Copy className="w-4 h-4" />
              <span>Kopî Bike</span>
            </>
          )}
        </button>

        {/* 3 Condition Checkboxes */}
        <div className="space-y-3">
          <label className="flex items-start gap-3 p-3 bg-muted rounded-xl cursor-pointer">
            <input
              type="checkbox"
              checked={conditions.writtenDown}
              onChange={(e) =>
                setConditions((prev) => ({ ...prev, writtenDown: e.target.checked }))
              }
              className="mt-1 w-5 h-5 accent-primary"
            />
            <span className="text-sm">Min ev 12 peyv li cihekî ewle nivîsandine</span>
          </label>

          <label className="flex items-start gap-3 p-3 bg-muted rounded-xl cursor-pointer">
            <input
              type="checkbox"
              checked={conditions.neverShare}
              onChange={(e) => setConditions((prev) => ({ ...prev, neverShare: e.target.checked }))}
              className="mt-1 w-5 h-5 accent-primary"
            />
            <span className="text-sm">
              Ez fêm dikim ku ez nikarim ev peyvan bi kesî re parve bikim
            </span>
          </label>

          <label className="flex items-start gap-3 p-3 bg-muted rounded-xl cursor-pointer">
            <input
              type="checkbox"
              checked={conditions.lossRisk}
              onChange={(e) => setConditions((prev) => ({ ...prev, lossRisk: e.target.checked }))}
              className="mt-1 w-5 h-5 accent-primary"
            />
            <span className="text-sm">
              Ez fêm dikim ku eger van peyvan winda bikim ez nikarim gihîştina wallet&apos;ê xwe
              bistînim
            </span>
          </label>
        </div>

        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        <button
          onClick={handleBackupContinue}
          disabled={!allConditionsChecked}
          className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {allConditionsChecked ? 'Berdewam' : 'Hemû şertan bipejirînin'}
          {allConditionsChecked && <ArrowRight className="w-4 h-4" />}
        </button>
      </div>
    );
  }

  if (step === 'verify') {
    return (
      <div className="p-4 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Peyvan Verast Bike</h2>
          <button
            onClick={handleReset}
            className="flex items-center gap-1 text-sm text-muted-foreground"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Reset</span>
          </button>
        </div>

        <p className="text-muted-foreground text-sm text-center">
          Ji kerema xwe peyvan bi rêza rast bixin nav qutîkê
        </p>

        {/* Destination area - where user builds the correct order */}
        <div className="min-h-[120px] p-4 bg-muted/50 border-2 border-dashed border-border rounded-xl">
          {destinationWords.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm">Peyvan li vir bixin...</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {destinationWords.map((word, idx) => (
                <button
                  key={word.id}
                  onClick={() => handleDestinationWordClick(word)}
                  className="px-3 py-2 bg-primary/20 border border-primary/40 rounded-lg text-sm font-mono flex items-center gap-1 hover:bg-primary/30 transition-colors"
                >
                  <span className="text-primary text-xs">{idx + 1}.</span>
                  {word.content}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Source area - shuffled words to pick from */}
        <div className="flex flex-wrap gap-2 justify-center">
          {sourceWords.map((word) => (
            <button
              key={word.id}
              onClick={() => handleSourceWordClick(word)}
              disabled={word.removed}
              className={`px-3 py-2 rounded-lg text-sm font-mono transition-all ${
                word.removed
                  ? 'bg-muted/30 text-muted-foreground/30 cursor-not-allowed'
                  : 'bg-muted hover:bg-muted/80 cursor-pointer'
              }`}
            >
              {word.content}
            </button>
          ))}
        </div>

        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        <button
          onClick={handleVerify}
          disabled={isLoading || !canVerify}
          className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-semibold disabled:opacity-50"
        >
          {isLoading
            ? 'Tê tomarkirin...'
            : canVerify
              ? 'Verast Bike'
              : `${destinationWords.length}/12 peyv`}
        </button>
      </div>
    );
  }

  // Complete
  return (
    <div className="p-4 space-y-6 text-center">
      <div className="w-20 h-20 mx-auto bg-green-500/20 rounded-full flex items-center justify-center">
        <Check className="w-10 h-10 text-green-500" />
      </div>

      <div>
        <h2 className="text-xl font-semibold mb-2">Wallet Hat Çêkirin!</h2>
        <p className="text-muted-foreground text-sm">Wallet&apos;ê te amade ye</p>
      </div>

      <div className="p-4 bg-muted rounded-xl">
        <p className="text-xs text-muted-foreground mb-1">Navnîşana te</p>
        <p className="font-mono text-sm break-all">{address}</p>
      </div>

      <button
        onClick={onComplete}
        className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-semibold"
      >
        Dest Pê Bike
      </button>
    </div>
  );
}
