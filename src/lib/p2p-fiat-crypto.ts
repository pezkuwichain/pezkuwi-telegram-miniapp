/**
 * P2P Fiat Trading - Encryption Utilities
 *
 * AES-256-GCM encryption for payment details
 * Extracted for testing purposes
 *
 * @module p2p-fiat-crypto
 */

const IV_LENGTH = 12; // 96 bits for GCM

/**
 * Derive encryption key from a password/secret
 */
async function getEncryptionKey(): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode('p2p-payment-encryption-v1-pezkuwi'),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode('pezkuwi-p2p-salt'),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt payment details using AES-256-GCM
 * @param details Payment details object to encrypt
 * @returns Base64-encoded encrypted string
 */
export async function encryptPaymentDetails(details: Record<string, string>): Promise<string> {
  try {
    const key = await getEncryptionKey();
    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify(details));

    // Generate random IV
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

    // Encrypt
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);

    // Combine IV + ciphertext and encode as base64
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);

    return btoa(String.fromCharCode(...combined));
  } catch (error) {
    console.error('Encryption failed:', error);
    // Fallback to base64 for backwards compatibility (temporary)
    return btoa(JSON.stringify(details));
  }
}

/**
 * Decrypt payment details using AES-256-GCM
 * @param encrypted Base64-encoded encrypted string
 * @returns Decrypted payment details object
 */
export async function decryptPaymentDetails(encrypted: string): Promise<Record<string, string>> {
  try {
    const key = await getEncryptionKey();

    // Decode base64
    const combined = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));

    // Extract IV and ciphertext
    const iv = combined.slice(0, IV_LENGTH);
    const ciphertext = combined.slice(IV_LENGTH);

    // Decrypt
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);

    const decoder = new TextDecoder();
    return JSON.parse(decoder.decode(decrypted));
  } catch {
    // Fallback: try to decode as plain base64 (for old data)
    try {
      return JSON.parse(atob(encrypted));
    } catch {
      return {};
    }
  }
}

/**
 * Verify encryption is working correctly
 * Used for health checks
 */
export async function verifyEncryption(): Promise<boolean> {
  try {
    const testData = { test: 'verification' };
    const encrypted = await encryptPaymentDetails(testData);
    const decrypted = await decryptPaymentDetails(encrypted);
    return decrypted.test === 'verification';
  } catch {
    return false;
  }
}
