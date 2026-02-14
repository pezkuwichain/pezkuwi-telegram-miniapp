/**
 * Crypto utilities for wallet encryption
 * Uses Web Crypto API (AES-GCM)
 *
 * Security features:
 * - AES-256-GCM encryption
 * - PBKDF2 key derivation (600K iterations, OWASP 2023 recommendation)
 * - 16-byte random salt per encryption
 * - 12-byte random IV per encryption
 * - Version header for future algorithm updates
 */

import { translate } from '@/i18n';

const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const VERSION_LENGTH = 1;
const CURRENT_VERSION = 2; // v1: 100K iterations, v2: 600K iterations

// OWASP 2023 recommendation for PBKDF2-SHA256
const KEY_ITERATIONS_V2 = 600000;
const KEY_ITERATIONS_V1 = 100000; // Legacy for backward compatibility

/**
 * Derive encryption key from password using PBKDF2
 * @param password - User password
 * @param salt - Random salt
 * @param version - Encryption version (determines iteration count)
 */
async function deriveKey(
  password: string,
  salt: Uint8Array,
  version: number = CURRENT_VERSION
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  // Use appropriate iteration count based on version
  const iterations = version >= 2 ? KEY_ITERATIONS_V2 : KEY_ITERATIONS_V1;

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: new Uint8Array(salt), // Create new Uint8Array for compatibility
      iterations,
      hash: 'SHA-256',
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt data with password (AES-256-GCM)
 * Format: version (1 byte) + salt (16 bytes) + iv (12 bytes) + ciphertext
 */
export async function encrypt(data: string, password: string): Promise<string> {
  const encoder = new TextEncoder();
  const version = new Uint8Array([CURRENT_VERSION]);
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await deriveKey(password, salt, CURRENT_VERSION);

  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(data));

  // Combine version + salt + iv + encrypted data
  const combined = new Uint8Array(VERSION_LENGTH + salt.length + iv.length + encrypted.byteLength);
  combined.set(version, 0);
  combined.set(salt, VERSION_LENGTH);
  combined.set(iv, VERSION_LENGTH + salt.length);
  combined.set(new Uint8Array(encrypted), VERSION_LENGTH + salt.length + iv.length);

  // Return as base64
  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt data with password
 * Supports both v1 (legacy, no version byte) and v2 (with version byte) formats
 */
export async function decrypt(encryptedData: string, password: string): Promise<string> {
  const decoder = new TextDecoder();
  const combined = new Uint8Array(
    atob(encryptedData)
      .split('')
      .map((c) => c.charCodeAt(0))
  );

  // Detect version: if first byte is 1 or 2, it's a version header
  // Legacy v1 data starts with salt which would be random (unlikely to be 1 or 2)
  let version: number;
  let offset: number;

  if (combined[0] === 1 || combined[0] === 2) {
    // New format with version header
    version = combined[0];
    offset = VERSION_LENGTH;
  } else {
    // Legacy format (v1) without version header
    version = 1;
    offset = 0;
  }

  const salt = combined.slice(offset, offset + SALT_LENGTH);
  const iv = combined.slice(offset + SALT_LENGTH, offset + SALT_LENGTH + IV_LENGTH);
  const data = combined.slice(offset + SALT_LENGTH + IV_LENGTH);

  const key = await deriveKey(password, salt, version);

  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);

  return decoder.decode(decrypted);
}

/**
 * Calculate password entropy (bits)
 * Higher entropy = stronger password
 */
export function calculateEntropy(password: string): number {
  let charsetSize = 0;
  if (/[a-z]/.test(password)) charsetSize += 26;
  if (/[A-Z]/.test(password)) charsetSize += 26;
  if (/[0-9]/.test(password)) charsetSize += 10;
  if (/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) charsetSize += 32;
  if (/\s/.test(password)) charsetSize += 1;

  if (charsetSize === 0) return 0;
  return Math.floor(password.length * Math.log2(charsetSize));
}

export type PasswordStrength = 'weak' | 'medium' | 'strong' | 'very-strong';

/**
 * Get password strength category based on entropy
 */
export function getPasswordStrength(password: string): PasswordStrength {
  const entropy = calculateEntropy(password);
  if (entropy < 50) return 'weak';
  if (entropy < 70) return 'medium';
  if (entropy < 90) return 'strong';
  return 'very-strong';
}

/**
 * Validate password strength
 * Requires: 12+ chars, lowercase, uppercase, number, special char
 * Minimum entropy: 60 bits
 */
export function validatePassword(password: string): {
  valid: boolean;
  message?: string;
  entropy?: number;
  strength?: PasswordStrength;
} {
  const entropy = calculateEntropy(password);
  const strength = getPasswordStrength(password);

  if (password.length < 12) {
    return { valid: false, message: translate('validation.minLength'), entropy, strength };
  }
  if (!/[a-z]/.test(password)) {
    return {
      valid: false,
      message: translate('validation.needLowercase'),
      entropy,
      strength,
    };
  }
  if (!/[A-Z]/.test(password)) {
    return {
      valid: false,
      message: translate('validation.needUppercase'),
      entropy,
      strength,
    };
  }
  if (!/[0-9]/.test(password)) {
    return {
      valid: false,
      message: translate('validation.needNumber'),
      entropy,
      strength,
    };
  }
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
    return {
      valid: false,
      message: translate('validation.needSpecialChar'),
      entropy,
      strength,
    };
  }
  if (entropy < 60) {
    return {
      valid: false,
      message: translate('validation.weakPassword'),
      entropy,
      strength,
    };
  }
  return { valid: true, entropy, strength };
}

/**
 * Detect common weak patterns in passwords
 */
export function hasWeakPatterns(password: string): boolean {
  const weakPatterns = [
    /^(.)\1+$/, // All same character
    /^(012|123|234|345|456|567|678|789)+$/, // Sequential numbers
    /^(abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz)+$/i, // Sequential letters
    /^(qwerty|asdfgh|zxcvbn)/i, // Keyboard patterns
    /^(password|şîfre|parola|123456|qwerty)/i, // Common passwords
  ];

  return weakPatterns.some((pattern) => pattern.test(password.toLowerCase()));
}
