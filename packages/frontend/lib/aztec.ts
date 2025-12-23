import { aztecConfig } from "./contracts";

/**
 * Patch artifact to add missing isInternal field to functions
 * This is needed due to version mismatch between @aztec/noir-contracts.js and wallet
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function patchArtifact<T>(artifact: T): T {
  const art = artifact as any;
  if (!art.functions) return artifact;

  return {
    ...art,
    functions: art.functions.map((fn: any) => ({
      ...fn,
      isInternal: fn.isInternal ?? false,
    })),
  } as T;
}

export interface AztecWallet {
  address: string;
  isConnected: boolean;
}

export interface AztecConnection {
  pxeUrl: string;
  isConnected: boolean;
  wallet: AztecWallet | null;
}

/**
 * Check if PXE is available at the configured URL
 */
export async function checkPxeConnection(pxeUrl?: string): Promise<boolean> {
  const url = pxeUrl || aztecConfig.pxeUrl;
  try {
    const response = await fetch(`${url}/status`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Get registered accounts from PXE
 */
export async function getRegisteredAccounts(pxeUrl?: string): Promise<string[]> {
  const url = pxeUrl || aztecConfig.pxeUrl;
  try {
    const response = await fetch(`${url}/accounts`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    if (!response.ok) return [];
    const data = await response.json();
    return data.accounts || [];
  } catch {
    return [];
  }
}

/**
 * Format Aztec address for display
 */
export function formatAztecAddress(address: string, chars = 8): string {
  if (!address) return "";
  if (address.length <= chars * 2 + 2) return address;
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

/**
 * Validate Aztec address format
 * Aztec addresses are 32 bytes (64 hex chars + 0x prefix)
 */
export function isValidAztecAddress(address: string): boolean {
  if (!address) return false;
  // Aztec addresses are 32 bytes = 64 hex characters + 0x prefix
  const aztecAddressRegex = /^0x[a-fA-F0-9]{64}$/;
  return aztecAddressRegex.test(address);
}

/**
 * Convert EVM address to bytes for Aztec contract calls
 */
export function evmAddressToBytes(address: string): Uint8Array {
  // Remove 0x prefix and convert to bytes
  const hex = address.slice(2);
  const bytes = new Uint8Array(20);
  for (let i = 0; i < 20; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
