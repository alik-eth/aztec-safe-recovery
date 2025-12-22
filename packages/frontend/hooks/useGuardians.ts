"use client";

import { useState, useCallback } from "react";
import { aztecConfig } from "@/lib/contracts";

export interface GuardianState {
  isLoading: boolean;
  error: string | null;
  guardianCount: number;
  threshold: number;
  isRegistered: boolean;
}

/**
 * Hook for managing guardians on the Aztec recovery contract.
 *
 * Note: This hook provides the interface for guardian management.
 * The actual Aztec contract calls would require the @aztec/aztec.js SDK
 * which needs to be configured with the deployed contract address.
 */
export function useGuardians(safeAddress: string | null) {
  const [state, setState] = useState<GuardianState>({
    isLoading: false,
    error: null,
    guardianCount: 0,
    threshold: 0,
    isRegistered: false,
  });

  /**
   * Register a Safe wallet with the Aztec recovery registry.
   * This links the EVM Safe address with the caller's Aztec wallet.
   */
  const registerSafe = useCallback(
    async (threshold: number): Promise<boolean> => {
      if (!safeAddress) {
        setState((prev) => ({ ...prev, error: "No Safe address provided" }));
        return false;
      }

      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        // TODO: Call Aztec contract
        // const contract = await getRecoveryContract();
        // await contract.methods.register_safe(safeAddress, threshold).send().wait();

        // For now, simulate success
        await new Promise((resolve) => setTimeout(resolve, 1000));

        setState((prev) => ({
          ...prev,
          isLoading: false,
          isRegistered: true,
          threshold,
        }));

        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to register Safe";
        setState((prev) => ({ ...prev, isLoading: false, error: message }));
        return false;
      }
    },
    [safeAddress]
  );

  /**
   * Add a guardian for the Safe.
   * Only the Safe's owner (on Aztec) can add guardians.
   */
  const addGuardian = useCallback(
    async (guardianAddress: string): Promise<boolean> => {
      if (!safeAddress) {
        setState((prev) => ({ ...prev, error: "No Safe address provided" }));
        return false;
      }

      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        // TODO: Call Aztec contract
        // const contract = await getRecoveryContract();
        // await contract.methods.add_guardian(safeAddress, guardianAddress).send().wait();

        // For now, simulate success
        await new Promise((resolve) => setTimeout(resolve, 1000));

        setState((prev) => ({
          ...prev,
          isLoading: false,
          guardianCount: prev.guardianCount + 1,
        }));

        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to add guardian";
        setState((prev) => ({ ...prev, isLoading: false, error: message }));
        return false;
      }
    },
    [safeAddress]
  );

  /**
   * Remove a guardian from the Safe.
   * Only the Safe's owner (on Aztec) can remove guardians.
   */
  const removeGuardian = useCallback(
    async (guardianAddress: string): Promise<boolean> => {
      if (!safeAddress) {
        setState((prev) => ({ ...prev, error: "No Safe address provided" }));
        return false;
      }

      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        // TODO: Call Aztec contract
        // const contract = await getRecoveryContract();
        // await contract.methods.remove_guardian(safeAddress, guardianAddress).send().wait();

        // For now, simulate success
        await new Promise((resolve) => setTimeout(resolve, 1000));

        setState((prev) => ({
          ...prev,
          isLoading: false,
          guardianCount: Math.max(0, prev.guardianCount - 1),
        }));

        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to remove guardian";
        setState((prev) => ({ ...prev, isLoading: false, error: message }));
        return false;
      }
    },
    [safeAddress]
  );

  /**
   * Update the voting threshold for the Safe.
   */
  const setThreshold = useCallback(
    async (newThreshold: number): Promise<boolean> => {
      if (!safeAddress) {
        setState((prev) => ({ ...prev, error: "No Safe address provided" }));
        return false;
      }

      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        // TODO: Call Aztec contract
        // const contract = await getRecoveryContract();
        // await contract.methods.set_threshold(safeAddress, newThreshold).send().wait();

        // For now, simulate success
        await new Promise((resolve) => setTimeout(resolve, 1000));

        setState((prev) => ({
          ...prev,
          isLoading: false,
          threshold: newThreshold,
        }));

        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to set threshold";
        setState((prev) => ({ ...prev, isLoading: false, error: message }));
        return false;
      }
    },
    [safeAddress]
  );

  /**
   * Check if the Safe is registered and get its guardian info.
   */
  const loadGuardianInfo = useCallback(async (): Promise<void> => {
    if (!safeAddress) return;

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      // TODO: Call Aztec contract
      // const contract = await getRecoveryContract();
      // const isRegistered = await contract.methods.is_safe_registered(safeAddress).view();
      // const threshold = await contract.methods.get_threshold(safeAddress).view();
      // const count = await contract.methods.get_guardian_count(safeAddress).view();

      // For now, return mock data
      await new Promise((resolve) => setTimeout(resolve, 500));

      setState((prev) => ({
        ...prev,
        isLoading: false,
        isRegistered: false,
        guardianCount: 0,
        threshold: 0,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load guardian info";
      setState((prev) => ({ ...prev, isLoading: false, error: message }));
    }
  }, [safeAddress]);

  return {
    ...state,
    registerSafe,
    addGuardian,
    removeGuardian,
    setThreshold,
    loadGuardianInfo,
  };
}
