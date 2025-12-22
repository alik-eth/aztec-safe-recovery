"use client";

import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { checkPxeConnection, getRegisteredAccounts } from "@/lib/aztec";
import { aztecConfig } from "@/lib/contracts";

interface AztecContextState {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  pxeUrl: string;
  accounts: string[];
  selectedAccount: string | null;
  connect: (pxeUrl?: string) => Promise<boolean>;
  disconnect: () => void;
  selectAccount: (account: string) => void;
}

const AztecContext = createContext<AztecContextState | null>(null);

export function AztecProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pxeUrl, setPxeUrl] = useState(aztecConfig.pxeUrl);
  const [accounts, setAccounts] = useState<string[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);

  const connect = useCallback(async (url?: string): Promise<boolean> => {
    const targetUrl = url || pxeUrl;
    setIsConnecting(true);
    setError(null);

    try {
      const isAvailable = await checkPxeConnection(targetUrl);

      if (!isAvailable) {
        throw new Error("Cannot connect to Aztec PXE. Make sure it's running at " + targetUrl);
      }

      const fetchedAccounts = await getRegisteredAccounts(targetUrl);

      setPxeUrl(targetUrl);
      setAccounts(fetchedAccounts);
      setSelectedAccount(fetchedAccounts.length > 0 ? fetchedAccounts[0] : null);
      setIsConnected(true);
      setIsConnecting(false);

      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to connect to Aztec";
      setError(message);
      setIsConnected(false);
      setIsConnecting(false);
      return false;
    }
  }, [pxeUrl]);

  const disconnect = useCallback(() => {
    setIsConnected(false);
    setAccounts([]);
    setSelectedAccount(null);
    setError(null);
  }, []);

  const selectAccount = useCallback((account: string) => {
    if (accounts.includes(account)) {
      setSelectedAccount(account);
    }
  }, [accounts]);

  const value: AztecContextState = {
    isConnected,
    isConnecting,
    error,
    pxeUrl,
    accounts,
    selectedAccount,
    connect,
    disconnect,
    selectAccount,
  };

  return (
    <AztecContext.Provider value={value}>
      {children}
    </AztecContext.Provider>
  );
}

export function useAztecContext() {
  const context = useContext(AztecContext);
  if (!context) {
    throw new Error("useAztecContext must be used within an AztecProvider");
  }
  return context;
}
