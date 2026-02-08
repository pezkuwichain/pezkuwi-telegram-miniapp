/**
 * Wallet Storage Service
 * Handles encrypted wallet storage in localStorage
 */

import { encrypt, decrypt } from './crypto';

const STORAGE_KEY = 'pezkuwi_wallet';

export interface StoredWallet {
  address: string;
  encryptedMnemonic: string;
  createdAt: number;
}

/**
 * Check if wallet exists in storage
 */
export function hasStoredWallet(): boolean {
  return localStorage.getItem(STORAGE_KEY) !== null;
}

/**
 * Save wallet to storage (encrypted)
 */
export async function saveWallet(
  mnemonic: string,
  address: string,
  password: string
): Promise<void> {
  const encryptedMnemonic = await encrypt(mnemonic, password);

  const wallet: StoredWallet = {
    address,
    encryptedMnemonic,
    createdAt: Date.now(),
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(wallet));
}

/**
 * Load wallet from storage
 */
export function getStoredWallet(): StoredWallet | null {
  const data = localStorage.getItem(STORAGE_KEY);
  if (!data) return null;

  try {
    return JSON.parse(data) as StoredWallet;
  } catch {
    return null;
  }
}

/**
 * Get stored wallet address (without decryption)
 */
export function getStoredAddress(): string | null {
  const wallet = getStoredWallet();
  return wallet?.address ?? null;
}

/**
 * Unlock wallet (decrypt mnemonic)
 */
export async function unlockWallet(password: string): Promise<string> {
  const wallet = getStoredWallet();
  if (!wallet) throw new Error('Wallet not found');

  try {
    const mnemonic = await decrypt(wallet.encryptedMnemonic, password);
    return mnemonic;
  } catch {
    throw new Error('Şîfre (password) çewt e');
  }
}

/**
 * Delete wallet from storage
 */
export function deleteWallet(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Update wallet address in Supabase for existing user
 * User must already exist (created by telegram-auth Edge Function)
 */
export async function syncWalletToSupabase(
  supabase: { from: (table: string) => unknown },
  telegramId: number,
  address: string
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as any;

  // UPDATE existing user's wallet_address in both tables
  // Update 'users' table
  await client
    .from('users')
    .update({
      wallet_address: address,
      updated_at: new Date().toISOString(),
    })
    .eq('telegram_id', telegramId);

  // Also update 'tg_users' table (used by deposit system)
  const { error } = await client
    .from('tg_users')
    .update({
      wallet_address: address,
      updated_at: new Date().toISOString(),
    })
    .eq('telegram_id', telegramId);

  if (error) {
    console.error('Wallet sync error:', error);
    throw new Error('Wallet adresa DB-ê re senkronîze nebû');
  }
}
