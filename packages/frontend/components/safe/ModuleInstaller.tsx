"use client";

import { useState, useEffect, useCallback } from "react";
import { useAccount, useChainId, useWalletClient, usePublicClient } from "wagmi";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { getContracts } from "@/lib/contracts";
import { shortenAddress } from "@/lib/utils";
import { useSafeApps } from "@/hooks/useSafeApps";
import { encodeFunctionData } from "viem";
import { Shield, ExternalLink, Loader2, CheckCircle } from "lucide-react";

interface ModuleInstallerProps {
  safeAddress: string;
  isInstalled: boolean;
  aztecContractAddress?: string; // The Aztec recovery contract to link
  onInstalled?: () => void;
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

const MODULE_ABI = [
  {
    inputs: [{ name: "aztecContract", type: "bytes32" }],
    name: "setAztecRecoveryContract",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "safe", type: "address" }],
    name: "getAztecRecoveryContract",
    outputs: [{ type: "bytes32" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

type InstallState = "idle" | "submitting" | "pending" | "verifying" | "success" | "error";

// Convert Aztec address (0x + 64 hex chars) to bytes32
function aztecAddressToBytes32(aztecAddress: string): `0x${string}` {
  // Aztec address is 32 bytes, should be 0x + 64 chars
  // Pad to bytes32 if needed
  const cleanAddr = aztecAddress.toLowerCase().replace("0x", "");
  return `0x${cleanAddr.padStart(64, "0")}` as `0x${string}`;
}

export function ModuleInstaller({ safeAddress, isInstalled, aztecContractAddress, onInstalled }: ModuleInstallerProps) {
  const [state, setState] = useState<InstallState>(isInstalled ? "success" : "idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { address } = useAccount();
  const chainId = useChainId();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { isInSafeContext, sendTransactions } = useSafeApps();

  const contracts = getContracts(chainId);
  const moduleAddress = contracts?.safeRecoveryModule;

  // Check if module is enabled
  const checkModuleInstalled = useCallback(async (): Promise<boolean> => {
    if (!publicClient || !moduleAddress) return false;

    try {
      const isEnabled = await publicClient.readContract({
        address: safeAddress as `0x${string}`,
        abi: SAFE_ABI,
        functionName: "isModuleEnabled",
        args: [moduleAddress],
      });
      return isEnabled as boolean;
    } catch {
      return false;
    }
  }, [publicClient, safeAddress, moduleAddress]);

  // Poll for module installation after transaction is submitted
  useEffect(() => {
    if (state !== "pending" && state !== "verifying") return;

    const pollInterval = setInterval(async () => {
      const installed = await checkModuleInstalled();
      if (installed) {
        setState("success");
        onInstalled?.();
        clearInterval(pollInterval);
      }
    }, 3000); // Check every 3 seconds

    // Stop polling after 5 minutes
    const timeout = setTimeout(() => {
      clearInterval(pollInterval);
    }, 5 * 60 * 1000);

    return () => {
      clearInterval(pollInterval);
      clearTimeout(timeout);
    };
  }, [state, checkModuleInstalled, onInstalled]);

  const handleInstall = async () => {
    if (!moduleAddress) return;

    setState("submitting");
    setError(null);
    setTxHash(null);

    try {
      // Build transaction list
      const transactions: { to: string; value: string; data: string }[] = [];

      // 1. Enable module on Safe
      const enableModuleData = encodeFunctionData({
        abi: SAFE_ABI,
        functionName: "enableModule",
        args: [moduleAddress],
      });
      transactions.push({
        to: safeAddress,
        value: "0",
        data: enableModuleData,
      });

      // 2. If we have an Aztec contract address, link it to the module
      if (aztecContractAddress) {
        const aztecBytes32 = aztecAddressToBytes32(aztecContractAddress);
        const setAztecData = encodeFunctionData({
          abi: MODULE_ABI,
          functionName: "setAztecRecoveryContract",
          args: [aztecBytes32],
        });
        transactions.push({
          to: moduleAddress,
          value: "0",
          data: setAztecData,
        });
      }

      // If running inside Safe{Wallet}, use Safe Apps SDK
      if (isInSafeContext) {
        const result = await sendTransactions(transactions);
        setTxHash(result.safeTxHash);
        setState("pending");
      } else if (walletClient && address) {
        // Direct call - only send first transaction (for testing)
        const hash = await walletClient.sendTransaction({
          to: safeAddress as `0x${string}`,
          data: enableModuleData,
          account: address,
        });
        setTxHash(hash);
        setState("verifying");
      } else {
        throw new Error("No wallet connected. Connect via RainbowKit or open in Safe{Wallet}.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to install module";
      setError(message);
      setState("error");
    }
  };

  // Already installed state
  if (state === "success" || isInstalled) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-900/30">
              <Shield className="h-6 w-6 text-green-400" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <CardTitle>Recovery Module Active</CardTitle>
                <CheckCircle className="h-5 w-5 text-green-400" />
              </div>
              <CardDescription>Your Safe is protected with Aztec Guardian Recovery</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-lg bg-zinc-800/50 px-4 py-3">
            <span className="text-sm text-zinc-400">Module Address</span>
            <span className="font-mono text-sm text-white">
              {moduleAddress ? shortenAddress(moduleAddress) : "N/A"}
            </span>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Pending transaction state
  if (state === "pending" || state === "verifying") {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-yellow-900/30">
              <Loader2 className="h-6 w-6 text-yellow-400 animate-spin" />
            </div>
            <div className="flex-1">
              <CardTitle>
                {state === "pending" ? "Transaction Pending" : "Verifying Installation"}
              </CardTitle>
              <CardDescription>
                {state === "pending"
                  ? "Waiting for Safe owners to sign and execute"
                  : "Confirming module installation on-chain"}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="rounded-lg bg-yellow-900/20 border border-yellow-800/50 p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-yellow-900/50">
                  <Loader2 className="h-4 w-4 text-yellow-400 animate-spin" />
                </div>
                <div>
                  <p className="text-sm font-medium text-yellow-400">
                    {state === "pending" ? "Awaiting Signatures" : "Confirming..."}
                  </p>
                  <p className="text-xs text-yellow-400/70">
                    {state === "pending"
                      ? "Complete the transaction in Safe{Wallet}"
                      : "This may take a few moments"}
                  </p>
                </div>
              </div>

              {txHash && isInSafeContext && (
                <a
                  href={`https://app.safe.global/transactions/tx?safe=sep:${safeAddress}&id=multisig_${safeAddress}_${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-2 px-4 rounded-lg bg-yellow-900/30 text-yellow-400 hover:bg-yellow-900/50 transition-colors text-sm"
                >
                  Open in Safe{"{Wallet}"} <ExternalLink className="h-4 w-4" />
                </a>
              )}

              {txHash && !isInSafeContext && (
                <a
                  href={`https://sepolia.etherscan.io/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-2 px-4 rounded-lg bg-yellow-900/30 text-yellow-400 hover:bg-yellow-900/50 transition-colors text-sm"
                >
                  View on Etherscan <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </div>

            <div className="text-center">
              <p className="text-xs text-zinc-500">
                We&apos;ll automatically detect when the module is installed
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Idle/Error state - show install button
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-900/30">
            <Shield className="h-6 w-6 text-blue-400" />
          </div>
          <div>
            <CardTitle>Install Recovery Module</CardTitle>
            <CardDescription>
              Enable the Aztec Guardian Recovery module on your Safe
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="rounded-lg bg-zinc-800/50 p-4">
            <p className="text-sm text-zinc-300 mb-3">
              Installing this module allows your secret guardians on Aztec to help recover your Safe if you lose access.
            </p>
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-400">Module</span>
              <span className="font-mono text-white">
                {moduleAddress ? shortenAddress(moduleAddress) : "N/A"}
              </span>
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-red-900/20 border border-red-800 p-3">
              <p className="text-sm text-red-400">{error}</p>
              <p className="text-xs text-red-400/70 mt-1">
                Note: Module installation requires a Safe transaction. If you&apos;re not using Safe Apps,
                propose this transaction through the Safe{"{Wallet}"} interface.
              </p>
            </div>
          )}

          <Button
            onClick={handleInstall}
            isLoading={state === "submitting"}
            disabled={!moduleAddress || state === "submitting"}
            className="w-full"
          >
            Install Module
          </Button>

          <p className="text-xs text-zinc-500 text-center">
            This will create a Safe transaction that needs to be signed by {" "}
            the required number of owners.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
