/**
 * Wallet Service
 * Handles mnemonic generation, keypair creation, and signing
 */

import { Keyring } from '@pezkuwi/keyring';
import { mnemonicGenerate, mnemonicValidate, cryptoWaitReady } from '@pezkuwi/util-crypto';

// PezkuwiChain SS58 format
const SS58_FORMAT = 42;

let isReady = false;

/**
 * Initialize crypto libraries (must be called before using wallet functions)
 */
export async function initWalletService(): Promise<void> {
  if (isReady) return;
  await cryptoWaitReady();
  isReady = true;
}

/**
 * Generate a new 12-word mnemonic
 */
export function generateMnemonic(): string {
  if (!isReady) throw new Error('Wallet service not initialized');
  // Use onlyJs=true to avoid WASM bip39Generate stub that throws error
  return mnemonicGenerate(12, undefined, true);
}

/**
 * Validate a mnemonic phrase
 */
export function validateMnemonic(mnemonic: string): boolean {
  return mnemonicValidate(mnemonic);
}

/**
 * Derive wallet address from mnemonic
 */
export function getAddressFromMnemonic(mnemonic: string): string {
  if (!isReady) throw new Error('Wallet service not initialized');

  const keyring = new Keyring({ type: 'sr25519', ss58Format: SS58_FORMAT });
  const pair = keyring.addFromMnemonic(mnemonic);
  return pair.address;
}

/**
 * Create keypair from mnemonic (for signing)
 */
export function createKeypair(mnemonic: string) {
  if (!isReady) throw new Error('Wallet service not initialized');

  const keyring = new Keyring({ type: 'sr25519', ss58Format: SS58_FORMAT });
  return keyring.addFromMnemonic(mnemonic);
}

/**
 * Format address for display (truncate middle)
 */
export function formatAddress(address: string, chars = 6): string {
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

/**
 * Validate address format
 */
export function isValidAddress(address: string): boolean {
  // Basic SS58 validation - starts with expected prefix and has correct length
  return /^[1-9A-HJ-NP-Za-km-z]{47,48}$/.test(address);
}

/**
 * Generate cryptographically secure random integer in range [0, max)
 */
function secureRandomInt(max: number): number {
  const randomBuffer = new Uint32Array(1);
  crypto.getRandomValues(randomBuffer);
  return randomBuffer[0] % max;
}

/**
 * Get random words from mnemonic for verification
 * Uses crypto.getRandomValues() for security
 */
export function getVerificationWords(
  mnemonic: string,
  count = 3
): { index: number; word: string }[] {
  const words = mnemonic.split(' ');
  const indices: number[] = [];

  while (indices.length < count) {
    const randomIndex = secureRandomInt(words.length);
    if (!indices.includes(randomIndex)) {
      indices.push(randomIndex);
    }
  }

  return indices
    .sort((a, b) => a - b)
    .map((index) => ({
      index: index + 1, // 1-based for display
      word: words[index],
    }));
}
