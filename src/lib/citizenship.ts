/**
 * Citizenship utilities for Telegram MiniApp
 * Adapted from pwap/shared/lib/citizenship-workflow.ts
 * Uses native KeyringPair signing (no browser extension)
 */

import type { ApiPromise } from '@pezkuwi/api';
import type { KeyringPair } from '@pezkuwi/keyring/types';

// ── Type Definitions ────────────────────────────────────────────────

export type KycStatus = 'NotStarted' | 'Pending' | 'Approved' | 'Rejected';

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
  referralCode?: string;
  walletAddress: string;
  timestamp: number;
}

export interface CitizenshipResult {
  success: boolean;
  error?: string;
  blockHash?: string;
}

// ── Hash Generation ─────────────────────────────────────────────────

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return hash;
}

export function generateCommitmentHash(data: CitizenshipData): string {
  const str = JSON.stringify(data);
  return simpleHash(str).toString(16);
}

export function generateNullifierHash(address: string, timestamp: number): string {
  const str = address + timestamp.toString();
  return 'nullifier_' + simpleHash(str).toString(16);
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

// ── KYC Status ──────────────────────────────────────────────────────

export async function getKycStatus(api: ApiPromise, address: string): Promise<KycStatus> {
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
    if (statusStr === 'Pending') return 'Pending';
    if (statusStr === 'Rejected') return 'Rejected';

    return 'NotStarted';
  } catch (error) {
    console.error('[Citizenship] Error fetching KYC status:', error);
    return 'NotStarted';
  }
}

// ── Blockchain Submission ───────────────────────────────────────────

export async function submitCitizenshipApplication(
  api: ApiPromise,
  keypair: KeyringPair,
  name: string,
  email: string,
  ipfsCid: string,
  notes: string = 'Citizenship application via Telegram MiniApp'
): Promise<CitizenshipResult> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx = api.tx as any;
    if (!tx?.identityKyc?.setIdentity || !tx?.identityKyc?.applyForKyc) {
      return { success: false, error: 'Identity KYC pallet not available' };
    }

    const address = keypair.address;

    // Check for pending application
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pendingApp = await (api.query as any).identityKyc.pendingKycApplications(address);
    if (!pendingApp.isEmpty) {
      return {
        success: false,
        error: 'You already have a pending citizenship application.',
      };
    }

    // Check if already approved
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const kycStatus = await (api.query as any).identityKyc.kycStatuses(address);
    if (kycStatus.toString() === 'Approved') {
      return {
        success: false,
        error: 'Your citizenship is already approved!',
      };
    }

    const cidString = String(ipfsCid);
    if (!cidString || cidString === 'undefined') {
      return { success: false, error: 'Invalid IPFS CID' };
    }

    // Step 1: Set identity
    const identityResult = await new Promise<CitizenshipResult>((resolve) => {
      tx.identityKyc
        .setIdentity(name, email)
        .signAndSend(
          keypair,
          { nonce: -1 },
          ({
            status,
            dispatchError,
          }: {
            status: { isInBlock: boolean; isFinalized: boolean };
            dispatchError?: { isModule: boolean; asModule: unknown; toString: () => string };
          }) => {
            if (status.isInBlock || status.isFinalized) {
              if (dispatchError) {
                let errorMessage = 'Identity transaction failed';
                if (dispatchError.isModule) {
                  const decoded = api.registry.findMetaError(
                    dispatchError.asModule as Parameters<typeof api.registry.findMetaError>[0]
                  );
                  errorMessage = `${decoded.section}.${decoded.name}`;
                }
                resolve({ success: false, error: errorMessage });
                return;
              }
              resolve({ success: true });
            }
          }
        )
        .catch((error: Error) => resolve({ success: false, error: error.message }));
    });

    if (!identityResult.success) {
      return identityResult;
    }

    // Step 2: Apply for KYC
    const kycResult = await new Promise<CitizenshipResult>((resolve) => {
      tx.identityKyc
        .applyForKyc(cidString, notes)
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
                let errorMessage = 'KYC application failed';
                if (dispatchError.isModule) {
                  const decoded = api.registry.findMetaError(
                    dispatchError.asModule as Parameters<typeof api.registry.findMetaError>[0]
                  );
                  errorMessage = `${decoded.section}.${decoded.name}`;
                }
                resolve({ success: false, error: errorMessage });
                return;
              }
              const blockHash = status.asFinalized?.toString() || status.asInBlock?.toString();
              resolve({ success: true, blockHash });
            }
          }
        )
        .catch((error: Error) => resolve({ success: false, error: error.message }));
    });

    return kycResult;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ── Citizen Number Generation ───────────────────────────────────────

export function generateCitizenNumber(
  ownerAddress: string,
  collectionId: number,
  itemId: number
): string {
  let hash = 0;
  for (let i = 0; i < ownerAddress.length; i++) {
    hash = (hash << 5) - hash + ownerAddress.charCodeAt(i);
    hash = hash & hash;
  }
  hash += collectionId * 1000 + itemId;
  hash = Math.abs(hash);
  return (hash % 1000000).toString().padStart(6, '0');
}
