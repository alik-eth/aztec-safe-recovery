"use client";

import { useState, useCallback } from "react";
import type { AztecWallet as AztecWalletType } from "@azguardwallet/aztec-wallet";

interface AzguardAccount {
  alias: string;
  address: string;
}

interface AzguardState {
  isConnected: boolean;
  isConnecting: boolean;
  address: string | null;
  allAccounts: AzguardAccount[];
  error: string | null;
  wallet: AztecWalletType | null;
  sessionId: string | null;
}

const DAPP_METADATA = {
  name: "Aztec Guardian Recovery",
  description: "Privacy-preserving social recovery for Safe wallets",
  url: typeof window !== "undefined" ? window.location.origin : "",
};

/**
 * Hook to connect to Azguard Aztec wallet.
 *
 * Azguard is a browser extension wallet for Aztec Network.
 * Install from: https://azguard.io
 */
export function useAzguard() {
  const [state, setState] = useState<AzguardState>({
    isConnected: false,
    isConnecting: false,
    address: null,
    allAccounts: [],
    error: null,
    wallet: null,
    sessionId: null,
  });

  const connect = useCallback(async (chain?: "devnet" | "sandbox") => {
    console.log("[Azguard] Starting connection...", chain);
    setState((prev) => ({ ...prev, isConnecting: true, error: null }));

    try {
      // Dynamic import to avoid SSR issues
      console.log("[Azguard] Importing AztecWallet...");
      const { AztecWallet } = await import("@azguardwallet/aztec-wallet");
      console.log("[Azguard] AztecWallet imported, connecting...");

      // Connect to Azguard wallet
      // This will prompt the user if the extension is installed
      const wallet = await AztecWallet.connect(
        DAPP_METADATA,
        chain ?? "devnet"
      );
      console.log("[Azguard] Connected!", wallet);

      // Get the wallet accounts (addresses)
      // Aliased<AztecAddress> has { alias, item } where item is the address
      const accounts = await wallet.getAccounts();
      console.log("[Azguard] All accounts:", accounts.map((a: any) => ({
        alias: a.alias,
        address: a.item?.toString()
      })));

      // Try to get selected account from session, otherwise use first
      let address: string | null = null;

      // Check if session has a selected account
      const session = (wallet as any).session;
      if (session?.selectedAccount) {
        address = session.selectedAccount.toString();
        console.log("[Azguard] Using selected account from session:", address);
      } else if (accounts.length > 0) {
        // Fallback to first account
        address = accounts[0].item.toString();
        console.log("[Azguard] Using first account:", address);
      }

      // Try to get session ID from wallet
      let sessionId: string | null = null;
      try {
        // The wallet object may have session info
        if ((wallet as any).session?.id) {
          sessionId = (wallet as any).session.id;
        } else if ((wallet as any).sessionId) {
          sessionId = (wallet as any).sessionId;
        }
      } catch (e) {
        console.warn("[Azguard] Could not get session ID:", e);
      }

      // Parse all accounts
      const allAccounts: AzguardAccount[] = accounts.map((a: any) => ({
        alias: a.alias || '',
        address: a.item?.toString() || '',
      }));

      // Setup disconnect listener
      wallet.onDisconnected.addHandler(() => {
        setState({
          isConnected: false,
          isConnecting: false,
          address: null,
          allAccounts: [],
          error: null,
          wallet: null,
          sessionId: null,
        });
      });

      setState({
        isConnected: true,
        isConnecting: false,
        address,
        allAccounts,
        error: null,
        wallet,
        sessionId,
      });

      return wallet;
    } catch (err) {
      console.error("[Azguard] Connection error:", err);
      const message = err instanceof Error ? err.message : "Failed to connect to Azguard";

      // Check for common errors
      let errorMessage = message;
      if (message.includes("not found") || message.includes("timeout") || message.includes("Timeout")) {
        errorMessage = "Azguard wallet not found. Please install from azguard.io";
      } else if (message.includes("rejected") || message.includes("denied") || message.includes("Rejected")) {
        errorMessage = "Connection rejected by user";
      }

      setState({
        isConnected: false,
        isConnecting: false,
        address: null,
        allAccounts: [],
        error: errorMessage,
        wallet: null,
        sessionId: null,
      });

      return null;
    }
  }, []);

  const disconnect = useCallback(async () => {
    console.log("[Azguard] Disconnecting...", { sessionId: state.sessionId });

    try {
      // Method 1: Try using window.azguard.createClient().request("close_session")
      if (typeof window !== 'undefined' && (window as any).azguard) {
        const client = (window as any).azguard.createClient();
        if (state.sessionId) {
          console.log("[Azguard] Closing session via window.azguard:", state.sessionId);
          await client.request("close_session", state.sessionId);
        }
      }

      // Method 2: Try wallet's disconnect method
      if (state.wallet && typeof (state.wallet as any).disconnect === 'function') {
        await (state.wallet as any).disconnect();
      }
    } catch (err) {
      console.warn("[Azguard] Disconnect error:", err);
    }

    setState({
      isConnected: false,
      isConnecting: false,
      address: null,
      allAccounts: [],
      error: null,
      wallet: null,
      sessionId: null,
    });
  }, [state.wallet, state.sessionId]);

  // Allow switching to a different account
  const selectAccount = useCallback((accountAddress: string) => {
    const account = state.allAccounts.find(a => a.address === accountAddress);
    if (account) {
      setState(prev => ({ ...prev, address: accountAddress }));
    }
  }, [state.allAccounts]);

  return {
    ...state,
    connect,
    disconnect,
    selectAccount,
  };
}
