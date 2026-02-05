/**
 * Wallet Import Component
 * Import existing wallet with seed phrase
 */

import { useState } from 'react';
import { Eye, EyeOff, ArrowLeft, ArrowRight, Check, AlertTriangle } from 'lucide-react';
import { useWallet } from '@/contexts/WalletContext';
import { useTelegram } from '@/hooks/useTelegram';
import { validatePassword } from '@/lib/crypto';

interface Props {
  onComplete: () => void;
  onBack: () => void;
}

export function WalletImport({ onComplete, onBack }: Props) {
  const { importWallet } = useWallet();
  const { hapticImpact, hapticNotification } = useTelegram();

  const [mnemonic, setMnemonic] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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

  const handleImport = async () => {
    setError('');

    // Validate mnemonic
    const words = mnemonic.trim().split(/\s+/);
    if (words.length !== 12 && words.length !== 24) {
      setError('Seed phrase divê 12 an 24 peyv be');
      return;
    }

    // Validate password using crypto.ts rules
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      setError(passwordValidation.message || 'Şîfre (password) ne derbasdar e');
      return;
    }
    if (password !== confirmPassword) {
      setError('Şîfre (password) hev nagirin');
      return;
    }

    setIsLoading(true);
    hapticImpact('medium');

    try {
      await importWallet(mnemonic.trim().toLowerCase(), password);
      hapticNotification('success');
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import neserketî');
      hapticNotification('error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-4 space-y-6">
      <button onClick={onBack} className="flex items-center gap-2 text-muted-foreground">
        <ArrowLeft className="w-4 h-4" />
        <span>Paş</span>
      </button>

      <div className="text-center">
        <h2 className="text-xl font-semibold mb-2">Wallet Import Bike</h2>
        <p className="text-muted-foreground text-sm">
          Seed phrase&apos;ê wallet&apos;ê xwe yê heyî binivîse
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm text-muted-foreground">Seed Phrase (12 an 24 peyv)</label>
          <textarea
            value={mnemonic}
            onChange={(e) => setMnemonic(e.target.value)}
            className="w-full px-4 py-3 bg-muted rounded-xl resize-none h-28 font-mono text-sm"
            placeholder="Peyvên xwe bi valahî cuda binivîse..."
          />
          <p className="text-xs text-muted-foreground">
            {mnemonic.trim().split(/\s+/).filter(Boolean).length} / 12 peyv
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-sm text-muted-foreground">Şîfreya Nû (New Password)</label>
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
          onClick={handleImport}
          disabled={isLoading || !mnemonic || !allPasswordRulesPass}
          className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isLoading
            ? 'Tê import kirin...'
            : allPasswordRulesPass
              ? 'Import Bike'
              : 'Şertên şîfre (password) bicîh bînin'}
          {!isLoading && allPasswordRulesPass && <ArrowRight className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}
