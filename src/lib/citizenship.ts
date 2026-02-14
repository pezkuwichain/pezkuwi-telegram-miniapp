/**
 * Citizenship utilities for Telegram MiniApp
 * Adapted from pwap/shared/lib/citizenship-workflow.ts
 * Uses native KeyringPair signing (no browser extension)
 */

import { keccak256 } from 'js-sha3';
import type { ApiPromise } from '@pezkuwi/api';
import type { KeyringPair } from '@pezkuwi/keyring/types';

// ── Type Definitions ────────────────────────────────────────────────

export type CitizenshipStatus = 'NotStarted' | 'PendingReferral' | 'ReferrerApproved' | 'Approved';

export type Region = 'bakur' | 'basur' | 'rojava' | 'rojhelat' | 'diaspora' | 'kurdistan_a_sor';

export type MaritalStatus = 'zewici' | 'nezewici';

export interface ChildInfo {
  name: string;
  birthYear: number;
}

export interface CitizenshipData {
  fullName: string;
  fatherName: string;
  grandfatherName: string;
  motherName: string;
  tribe: string;
  maritalStatus: MaritalStatus;
  childrenCount?: number;
  children?: ChildInfo[];
  region: Region;
  email: string;
  profession: string;
  referrerAddress?: string;
  walletAddress: string;
  timestamp: number;
}

export interface CitizenshipResult {
  success: boolean;
  error?: string;
  blockHash?: string;
  identityHash?: string;
}

// ── Identity Hash (Keccak-256) ──────────────────────────────────────

export function calculateIdentityHash(name: string, email: string, documentCids: string[]): string {
  const data = JSON.stringify({
    name: name.trim().toLowerCase(),
    email: email.trim().toLowerCase(),
    documents: documentCids.sort(),
  });
  return '0x' + keccak256(data);
}

// ── Encryption & Storage ────────────────────────────────────────────

export function encryptCitizenshipData(data: CitizenshipData): string {
  return btoa(JSON.stringify(data));
}

export function decryptCitizenshipData(encrypted: string): CitizenshipData | null {
  try {
    return JSON.parse(atob(encrypted));
  } catch {
    return null;
  }
}

export function saveCitizenshipLocally(data: CitizenshipData): void {
  const encrypted = encryptCitizenshipData(data);
  localStorage.setItem('pezkuwi_citizenship_data', encrypted);
}

export function getLocalCitizenshipData(): CitizenshipData | null {
  const encrypted = localStorage.getItem('pezkuwi_citizenship_data');
  if (!encrypted) return null;
  return decryptCitizenshipData(encrypted);
}

// ── IPFS (Mock) ─────────────────────────────────────────────────────

export async function uploadToIPFS(_data: CitizenshipData): Promise<string> {
  // Mock IPFS upload - same as pwap/web
  const mockCID = 'Qm' + Math.random().toString(36).substring(2, 15);
  // In production, use Pinata or other IPFS service
  return mockCID;
}

// ── Citizenship Status ──────────────────────────────────────────────

export async function getCitizenshipStatus(
  api: ApiPromise,
  address: string
): Promise<CitizenshipStatus> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!(api?.query as any)?.identityKyc) {
      return 'NotStarted';
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const status = await (api.query as any).identityKyc.kycStatuses(address);

    if (status.isEmpty) {
      return 'NotStarted';
    }

    const statusStr = status.toString();
    if (statusStr === 'Approved') return 'Approved';
    if (statusStr === 'PendingReferral') return 'PendingReferral';
    if (statusStr === 'ReferrerApproved') return 'ReferrerApproved';

    return 'NotStarted';
  } catch (error) {
    console.error('[Citizenship] Error fetching status:', error);
    return 'NotStarted';
  }
}

// ── Blockchain Submission ───────────────────────────────────────────

export async function applyCitizenship(
  api: ApiPromise,
  keypair: KeyringPair,
  identityHash: string,
  referrerAddress: string | null = null
): Promise<CitizenshipResult> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx = api.tx as any;
    if (!tx?.identityKyc?.applyForCitizenship) {
      return { success: false, error: 'Identity KYC pallet not available' };
    }

    const result = await new Promise<CitizenshipResult>((resolve) => {
      tx.identityKyc
        .applyForCitizenship(identityHash, referrerAddress)
        .signAndSend(
          keypair,
          { nonce: -1 },
          ({
            status,
            dispatchError,
          }: {
            status: {
              isInBlock: boolean;
              isFinalized: boolean;
              asInBlock?: { toString: () => string };
              asFinalized?: { toString: () => string };
            };
            dispatchError?: { isModule: boolean; asModule: unknown; toString: () => string };
          }) => {
            if (status.isInBlock || status.isFinalized) {
              if (dispatchError) {
                let errorMessage = 'Citizenship application failed';
                if (dispatchError.isModule) {
                  const decoded = api.registry.findMetaError(
                    dispatchError.asModule as Parameters<typeof api.registry.findMetaError>[0]
                  );
                  errorMessage = `${decoded.section}.${decoded.name}`;
                }
                resolve({ success: false, error: errorMessage, identityHash });
                return;
              }
              const blockHash = status.asFinalized?.toString() || status.asInBlock?.toString();
              resolve({ success: true, blockHash, identityHash });
            }
          }
        )
        .catch((error: Error) => resolve({ success: false, error: error.message, identityHash }));
    });

    return result;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
