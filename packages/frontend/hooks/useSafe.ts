"use client";

import { useState, useCallback } from "react";
import { usePublicClient } from "wagmi";
import { getContracts } from "@/lib/contracts";
import type { SafeInfo } from "@/types";

const SAFE_ABI = [
  {
    inputs: [],
    name: "getOwners",
    outputs: [{ type: "address[]" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getThreshold",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "nonce",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
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

export function useSafe() {
  const [safeInfo, setSafeInfo] = useState<SafeInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const publicClient = usePublicClient();

  const loadSafeInfo = useCallback(
    async (safeAddress: string, chainId: number) => {
      if (!publicClient) {
        setError("No provider available");
        return null;
      }

      setIsLoading(true);
      setError(null);

      try {
        const contracts = getContracts(chainId);
        if (!contracts) {
          throw new Error("Unsupported chain");
        }

        const safeAddr = safeAddress as `0x${string}`;

        // Read Safe data
        const [owners, threshold, nonce, isModuleEnabled] = await Promise.all([
          publicClient.readContract({
            address: safeAddr,
            abi: SAFE_ABI,
            functionName: "getOwners",
          }),
          publicClient.readContract({
            address: safeAddr,
            abi: SAFE_ABI,
            functionName: "getThreshold",
          }),
          publicClient.readContract({
            address: safeAddr,
            abi: SAFE_ABI,
            functionName: "nonce",
          }),
          publicClient.readContract({
            address: safeAddr,
            abi: SAFE_ABI,
            functionName: "isModuleEnabled",
            args: [contracts.safeRecoveryModule],
          }),
        ]);

        const info: SafeInfo = {
          address: safeAddress,
          owners: owners as string[],
          threshold: Number(threshold),
          nonce: Number(nonce),
          modules: [],
          isRecoveryModuleInstalled: isModuleEnabled as boolean,
        };

        setSafeInfo(info);
        return info;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load Safe info";
        setError(message);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [publicClient]
  );

  const reset = useCallback(() => {
    setSafeInfo(null);
    setError(null);
  }, []);

  return {
    safeInfo,
    isLoading,
    error,
    loadSafeInfo,
    reset,
  };
}
