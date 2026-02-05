/**
 * Crypto Utility Tests
 */

import { describe, it, expect } from 'vitest';
import {
  encrypt,
  decrypt,
  validatePassword,
  calculateEntropy,
  getPasswordStrength,
  hasWeakPatterns,
} from './crypto';

describe('crypto utilities', () => {
  describe('encrypt/decrypt', () => {
    it('should encrypt and decrypt data correctly', async () => {
      const password = 'TestP@ssword123!';
      const data = 'sensitive data to encrypt';

      const encrypted = await encrypt(data, password);
      expect(encrypted).not.toBe(data);
      expect(encrypted.length).toBeGreaterThan(0);

      const decrypted = await decrypt(encrypted, password);
      expect(decrypted).toBe(data);
    });

    it('should produce different ciphertext for same input (due to random salt/iv)', async () => {
      const password = 'TestP@ssword123!';
      const data = 'same data';

      const encrypted1 = await encrypt(data, password);
      const encrypted2 = await encrypt(data, password);

      expect(encrypted1).not.toBe(encrypted2);
    });

    it('should fail to decrypt with wrong password', async () => {
      const data = 'test data';
      const encrypted = await encrypt(data, 'CorrectP@ss123!');

      await expect(decrypt(encrypted, 'WrongP@ssword1!')).rejects.toThrow();
    });

    it('should handle unicode data', async () => {
      const password = 'TestP@ssword123!';
      const data = 'سڵاو کوردستان 🇰🇷';

      const encrypted = await encrypt(data, password);
      const decrypted = await decrypt(encrypted, password);

      expect(decrypted).toBe(data);
    });

    it('should handle empty string', async () => {
      const password = 'TestP@ssword123!';
      const data = '';

      const encrypted = await encrypt(data, password);
      const decrypted = await decrypt(encrypted, password);

      expect(decrypted).toBe(data);
    });

    it('should handle long data', async () => {
      const password = 'TestP@ssword123!';
      const data = 'a'.repeat(10000);

      const encrypted = await encrypt(data, password);
      const decrypted = await decrypt(encrypted, password);

      expect(decrypted).toBe(data);
    });
  });

  describe('validatePassword', () => {
    it('should reject passwords shorter than 12 characters', () => {
      const result = validatePassword('Short1!a');
      expect(result.valid).toBe(false);
      expect(result.message).toContain('12');
    });

    it('should reject passwords without lowercase', () => {
      const result = validatePassword('ALLUPPERCASE123!');
      expect(result.valid).toBe(false);
      expect(result.message).toContain('biçûk');
    });

    it('should reject passwords without uppercase', () => {
      const result = validatePassword('alllowercase123!');
      expect(result.valid).toBe(false);
      expect(result.message).toContain('mezin');
    });

    it('should reject passwords without numbers', () => {
      const result = validatePassword('NoNumbersHere!@');
      expect(result.valid).toBe(false);
      expect(result.message).toContain('hejmar');
    });

    it('should reject passwords without special characters', () => {
      const result = validatePassword('NoSpecial12345a');
      expect(result.valid).toBe(false);
      expect(result.message).toContain('taybet');
    });

    it('should accept strong passwords', () => {
      const result = validatePassword('StrongP@ssword123!');
      expect(result.valid).toBe(true);
      expect(result.entropy).toBeGreaterThan(60);
    });

    it('should return entropy and strength for all passwords', () => {
      const result = validatePassword('Test1!');
      expect(result.entropy).toBeGreaterThan(0);
      expect(result.strength).toBeDefined();
    });
  });

  describe('calculateEntropy', () => {
    it('should calculate higher entropy for longer passwords', () => {
      const short = calculateEntropy('abc');
      const long = calculateEntropy('abcdefghijk');

      expect(long).toBeGreaterThan(short);
    });

    it('should calculate higher entropy for more diverse character sets', () => {
      const onlyLower = calculateEntropy('abcdefghij');
      const mixed = calculateEntropy('AbC123!@#');

      expect(mixed).toBeGreaterThan(onlyLower);
    });

    it('should return 0 for empty string', () => {
      expect(calculateEntropy('')).toBe(0);
    });
  });

  describe('getPasswordStrength', () => {
    it('should categorize weak passwords correctly', () => {
      expect(getPasswordStrength('abc')).toBe('weak');
      expect(getPasswordStrength('abcdef')).toBe('weak');
    });

    it('should categorize medium passwords correctly', () => {
      expect(getPasswordStrength('Abcdef123!')).toBe('medium');
    });

    it('should categorize strong passwords correctly', () => {
      // VeryStr0ngP@ssword! is actually very strong (high entropy)
      expect(getPasswordStrength('Str0ngP@ss!')).toBe('strong');
    });

    it('should categorize very strong passwords correctly', () => {
      expect(getPasswordStrength('Super$ecure#P@ssw0rd!2024')).toBe('very-strong');
    });
  });

  describe('hasWeakPatterns', () => {
    it('should detect repeated characters', () => {
      expect(hasWeakPatterns('aaaaaaaaaaaa')).toBe(true);
    });

    it('should detect sequential numbers', () => {
      expect(hasWeakPatterns('123456789012')).toBe(true);
    });

    it('should detect common passwords', () => {
      expect(hasWeakPatterns('password')).toBe(true);
      expect(hasWeakPatterns('qwerty')).toBe(true);
    });

    it('should not flag strong passwords', () => {
      expect(hasWeakPatterns('Xk9#mP2@nQ4!')).toBe(false);
    });
  });
});
