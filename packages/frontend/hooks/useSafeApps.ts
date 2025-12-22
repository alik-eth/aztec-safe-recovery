"use client";

import { useState, useEffect, useCallback } from "react";
import SafeAppsSDK, { SafeInfo } from "@safe-global/safe-apps-sdk";

interface SafeAppsState {
  isInSafeContext: boolean;
  isLoading: boolean;
  safeInfo: SafeInfo | null;
  error: string | null;
}

let sdkInstance: SafeAppsSDK | null = null;

function getSDK(): SafeAppsSDK {
  if (!sdkInstance) {
    sdkInstance = new SafeAppsSDK();
  }
  return sdkInstance;
}

/**
 * Hook to detect if running inside Safe{Wallet} and get Safe info.
 *
 * When your app runs inside Safe{Wallet}:
 * - isInSafeContext will be true
 * - safeInfo will contain the Safe's address, chainId, owners, threshold
 * - You can use the SDK to propose transactions
 */
export function useSafeApps() {
  const [state, setState] = useState<SafeAppsState>({
    isInSafeContext: false,
    isLoading: true,
    safeInfo: null,
    error: null,
  });

  useEffect(() => {
    const sdk = getSDK();
    let mounted = true;

    async function detectSafeContext() {
      try {
        // Try to get Safe info - this will work if we're inside Safe{Wallet}
        const info = await Promise.race([
          sdk.safe.getInfo(),
          // Timeout after 1 second - if we're not in Safe context, it won't respond
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 1000)),
        ]);

        if (!mounted) return;

        if (info) {
          setState({
            isInSafeContext: true,
            isLoading: false,
            safeInfo: info,
            error: null,
          });
        } else {
          setState({
            isInSafeContext: false,
            isLoading: false,
            safeInfo: null,
            error: null,
          });
        }
      } catch (err) {
        if (!mounted) return;
        setState({
          isInSafeContext: false,
          isLoading: false,
          safeInfo: null,
          error: null, // Not an error if we're not in Safe context
        });
      }
    }

    detectSafeContext();

    return () => {
      mounted = false;
    };
  }, []);

  /**
   * Send transactions through Safe{Wallet}.
   * This will open the transaction confirmation modal in Safe{Wallet}.
   */
  const sendTransactions = useCallback(
    async (txs: Array<{ to: string; value: string; data: string }>) => {
      if (!state.isInSafeContext) {
        throw new Error("Not in Safe{Wallet} context");
      }

      const sdk = getSDK();
      try {
        const result = await sdk.txs.send({ txs });
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to send transaction";
        throw new Error(message);
      }
    },
    [state.isInSafeContext]
  );

  return {
    ...state,
    sdk: state.isInSafeContext ? getSDK() : null,
    sendTransactions,
  };
}
