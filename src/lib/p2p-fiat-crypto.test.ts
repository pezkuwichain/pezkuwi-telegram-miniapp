/**
 * P2P Fiat Crypto Tests
 * Tests for AES-256-GCM encryption of payment details
 */

import { describe, it, expect } from 'vitest';
import { encryptPaymentDetails, decryptPaymentDetails, verifyEncryption } from './p2p-fiat-crypto';

describe('P2P Payment Details Encryption', () => {
  describe('encryptPaymentDetails', () => {
    it('should encrypt payment details to base64 string', async () => {
      const details = {
        iban: 'TR000000000000000000000001',
        account_holder: 'Test User',
      };

      const encrypted = await encryptPaymentDetails(details);

      expect(encrypted).toBeTruthy();
      expect(typeof encrypted).toBe('string');
      // Should be base64 encoded
      expect(() => atob(encrypted)).not.toThrow();
    });

    it('should not contain plaintext in encrypted output', async () => {
      const details = {
        iban: 'TR123456789012345678901234',
        secret_code: 'SUPERSECRET',
      };

      const encrypted = await encryptPaymentDetails(details);

      expect(encrypted).not.toContain('TR123456789012345678901234');
      expect(encrypted).not.toContain('SUPERSECRET');
    });

    it('should produce different ciphertext for same input (random IV)', async () => {
      const details = {
        iban: 'TR000000000000000000000001',
      };

      const encrypted1 = await encryptPaymentDetails(details);
      const encrypted2 = await encryptPaymentDetails(details);

      expect(encrypted1).not.toBe(encrypted2);
    });

    it('should handle empty object', async () => {
      const details = {};

      const encrypted = await encryptPaymentDetails(details);
      const decrypted = await decryptPaymentDetails(encrypted);

      expect(decrypted).toEqual({});
    });

    it('should handle special characters', async () => {
      const details = {
        name: 'Hêlîn Qadîr',
        bank: 'Türkiye İş Bankası',
        note: 'سڵاو 👋',
      };

      const encrypted = await encryptPaymentDetails(details);
      const decrypted = await decryptPaymentDetails(encrypted);

      expect(decrypted).toEqual(details);
    });
  });

  describe('decryptPaymentDetails', () => {
    it('should decrypt to original payment details', async () => {
      const original = {
        iban: 'TR000000000000000000000001',
        account_holder: 'Test User',
        bank_name: 'Test Bank',
      };

      const encrypted = await encryptPaymentDetails(original);
      const decrypted = await decryptPaymentDetails(encrypted);

      expect(decrypted).toEqual(original);
    });

    it('should handle legacy base64 encoded data', async () => {
      // Legacy format: just base64 encoded JSON (no encryption)
      const legacy = { iban: 'TR123' };
      const legacyEncoded = btoa(JSON.stringify(legacy));

      const decrypted = await decryptPaymentDetails(legacyEncoded);

      expect(decrypted).toEqual(legacy);
    });

    it('should return empty object for invalid data', async () => {
      const invalid = 'not-valid-base64!!!';

      const decrypted = await decryptPaymentDetails(invalid);

      expect(decrypted).toEqual({});
    });
  });

  describe('verifyEncryption', () => {
    it('should return true when encryption is working', async () => {
      const result = await verifyEncryption();

      expect(result).toBe(true);
    });
  });

  describe('Security Properties', () => {
    it('should use random IV (first 12 bytes should differ)', async () => {
      const details = { test: 'data' };

      const encrypted1 = await encryptPaymentDetails(details);
      const encrypted2 = await encryptPaymentDetails(details);

      // Decode and compare first 12 bytes (IV)
      const decoded1 = Uint8Array.from(atob(encrypted1), (c) => c.charCodeAt(0));
      const decoded2 = Uint8Array.from(atob(encrypted2), (c) => c.charCodeAt(0));

      const iv1 = decoded1.slice(0, 12);
      const iv2 = decoded2.slice(0, 12);

      // IVs should be different
      expect(iv1.toString()).not.toBe(iv2.toString());
    });

    it('should produce authenticated ciphertext (GCM tag)', async () => {
      const details = { test: 'data' };

      const encrypted = await encryptPaymentDetails(details);
      const decoded = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));

      // IV (12 bytes) + ciphertext + GCM tag (16 bytes)
      // For small data, minimum should be at least 12 + 16 = 28 bytes
      expect(decoded.length).toBeGreaterThan(28);
    });

    it('should fail decryption with tampered ciphertext', async () => {
      const details = { sensitive: 'data' };

      const encrypted = await encryptPaymentDetails(details);

      // Tamper with the ciphertext (flip a bit in the middle)
      const decoded = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));
      decoded[decoded.length - 10] ^= 0xff; // Flip bits
      const tampered = btoa(String.fromCharCode(...decoded));

      // Should fail to decrypt (GCM authentication)
      const result = await decryptPaymentDetails(tampered);

      // Will fall back to empty object or legacy decode failure
      expect(result).toEqual({});
    });
  });
});
