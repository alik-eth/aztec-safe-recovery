"use client";

import { useState, useCallback, useEffect } from "react";
import { checkPxeConnection, getRegisteredAccounts } from "@/lib/aztec";
import { aztecConfig } from "@/lib/contracts";

export interface AztecState {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  pxeUrl: string;
  accounts: string[];
  selectedAccount: string | null;
}

export function useAztec() {
  const [state, setState] = useState<AztecState>({
    isConnected: false,
    isConnecting: false,
    error: null,
    pxeUrl: aztecConfig.pxeUrl,
    accounts: [],
    selectedAccount: null,
  });

  const connect = useCallback(async (pxeUrl?: string) => {
    const url = pxeUrl || state.pxeUrl;

    setState((prev) => ({ ...prev, isConnecting: true, error: null }));

    try {
      // Check if PXE is available
      const isAvailable = await checkPxeConnection(url);

      if (!isAvailable) {
        throw new Error("Cannot connect to Aztec PXE. Make sure it's running.");
      }

      // Get registered accounts
      const accounts = await getRegisteredAccounts(url);

      setState((prev) => ({
        ...prev,
        isConnected: true,
        isConnecting: false,
        pxeUrl: url,
        accounts,
        selectedAccount: accounts.length > 0 ? accounts[0] : null,
      }));

      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to connect to Aztec";
      setState((prev) => ({
        ...prev,
        isConnected: false,
        isConnecting: false,
        error: message,
      }));
      return false;
    }
  }, [state.pxeUrl]);

  const disconnect = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isConnected: false,
      accounts: [],
      selectedAccount: null,
      error: null,
    }));
  }, []);

  const selectAccount = useCallback((account: string) => {
    setState((prev) => ({
      ...prev,
      selectedAccount: account,
    }));
  }, []);

  const refreshAccounts = useCallback(async () => {
    if (!state.isConnected) return;

    try {
      const accounts = await getRegisteredAccounts(state.pxeUrl);
      setState((prev) => ({
        ...prev,
        accounts,
        selectedAccount: accounts.includes(prev.selectedAccount || "")
          ? prev.selectedAccount
          : accounts[0] || null,
      }));
    } catch (err) {
      console.error("Failed to refresh accounts:", err);
    }
  }, [state.isConnected, state.pxeUrl]);

  return {
    ...state,
    connect,
    disconnect,
    selectAccount,
    refreshAccounts,
  };
}
