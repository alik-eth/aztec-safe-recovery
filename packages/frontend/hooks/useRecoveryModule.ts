"use client";

import { useState, useCallback } from "react";
import { usePublicClient, useWalletClient } from "wagmi";
import { encodeFunctionData } from "viem";
import { getContracts } from "@/lib/contracts";

export interface RecoveryModuleState {
  isInstalled: boolean;
  isLoading: boolean;
  error: string | null;
  pendingTxHash: string | null;
}

const SAFE_ABI = [
  {
    inputs: [{ name: "module", type: "address" }],
    name: "enableModule",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "module", type: "address" }],
    name: "isModuleEnabled",
    outputs: [{ type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

/**
 * Hook for managing the SafeRecoveryModule on a Safe wallet.
 */
export function useRecoveryModule(safeAddress: string | null, chainId: number) {
  const [state, setState] = useState<RecoveryModuleState>({
    isInstalled: false,
    isLoading: false,
    error: null,
    pendingTxHash: null,
  });

  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const contracts = getContracts(chainId);
  const moduleAddress = contracts?.safeRecoveryModule;

  /**
   * Check if the recovery module is installed on the Safe.
   */
  const checkModuleInstalled = useCallback(async (): Promise<boolean> => {
    if (!safeAddress || !publicClient || !moduleAddress) {
      return false;
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const isEnabled = await publicClient.readContract({
        address: safeAddress as `0x${string}`,
        abi: SAFE_ABI,
        functionName: "isModuleEnabled",
        args: [moduleAddress],
      });

      setState((prev) => ({
        ...prev,
        isLoading: false,
        isInstalled: isEnabled as boolean,
      }));

      return isEnabled as boolean;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to check module status";
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: message,
        isInstalled: false,
      }));
      return false;
    }
  }, [safeAddress, publicClient, moduleAddress]);

  /**
   * Install the recovery module on the Safe.
   *
   * Note: This creates a transaction that needs to be signed by Safe owners.
   * If the caller is a Safe owner, they can sign directly.
   * Otherwise, this will need to go through the Safe transaction flow.
   */
  const installModule = useCallback(async (): Promise<string | null> => {
    if (!safeAddress || !walletClient || !moduleAddress) {
      setState((prev) => ({ ...prev, error: "Missing required parameters" }));
      return null;
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null, pendingTxHash: null }));

    try {
      // Encode the enableModule call
      const data = encodeFunctionData({
        abi: SAFE_ABI,
        functionName: "enableModule",
        args: [moduleAddress],
      });

      // Send transaction to enable the module
      // Note: This assumes the caller can send transactions to the Safe
      // In practice, this might need to use Safe's SDK for multi-sig
      const hash = await walletClient.sendTransaction({
        to: safeAddress as `0x${string}`,
        data,
      });

      setState((prev) => ({
        ...prev,
        isLoading: false,
        pendingTxHash: hash,
      }));

      return hash;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to install module";
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: message,
      }));
      return null;
    }
  }, [safeAddress, walletClient, moduleAddress]);

  /**
   * Get the module address for the current chain.
   */
  const getModuleAddress = useCallback((): string | null => {
    return moduleAddress || null;
  }, [moduleAddress]);

  return {
    ...state,
    moduleAddress,
    checkModuleInstalled,
    installModule,
    getModuleAddress,
  };
}
