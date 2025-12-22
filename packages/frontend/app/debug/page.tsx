"use client";

import { useState } from "react";
import { useAccount, useChainId, usePublicClient } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Header } from "@/components/Header";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { getContracts } from "@/lib/contracts";
import { shortenAddress } from "@/lib/utils";
import { useSafeApps } from "@/hooks/useSafeApps";
import { encodeFunctionData } from "viem";
import { Bug, Trash2, CheckCircle, XCircle, RefreshCw, AlertTriangle } from "lucide-react";

const SAFE_ABI = [
  {
    inputs: [{ name: "module", type: "address" }],
    name: "isModuleEnabled",
    outputs: [{ type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "prevModule", type: "address" },
      { name: "module", type: "address" },
    ],
    name: "disableModule",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "start", type: "address" },
      { name: "pageSize", type: "uint256" },
    ],
    name: "getModulesPaginated",
    outputs: [
      { name: "array", type: "address[]" },
      { name: "next", type: "address" },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

// Sentinel address used by Safe for linked list
const SENTINEL_MODULES = "0x0000000000000000000000000000000000000001";

export default function DebugPage() {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { isInSafeContext, safeInfo, sendTransactions } = useSafeApps();

  const [safeAddress, setSafeAddress] = useState("");
  const [isModuleInstalled, setIsModuleInstalled] = useState<boolean | null>(null);
  const [modules, setModules] = useState<string[]>([]);
  const [isChecking, setIsChecking] = useState(false);
  const [isUninstalling, setIsUninstalling] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const contracts = getContracts(chainId);
  const moduleAddress = contracts?.safeRecoveryModule;

  // Auto-fill Safe address from Safe context
  const effectiveSafeAddress = isInSafeContext && safeInfo?.safeAddress
    ? safeInfo.safeAddress
    : safeAddress;

  const checkModuleStatus = async () => {
    if (!publicClient || !moduleAddress || !effectiveSafeAddress) return;

    setIsChecking(true);
    setError(null);

    try {
      // Check if module is enabled
      const isEnabled = await publicClient.readContract({
        address: effectiveSafeAddress as `0x${string}`,
        abi: SAFE_ABI,
        functionName: "isModuleEnabled",
        args: [moduleAddress],
      });
      setIsModuleInstalled(isEnabled as boolean);

      // Get all modules
      const [moduleList] = await publicClient.readContract({
        address: effectiveSafeAddress as `0x${string}`,
        abi: SAFE_ABI,
        functionName: "getModulesPaginated",
        args: [SENTINEL_MODULES as `0x${string}`, BigInt(10)],
      });
      setModules(moduleList as string[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to check module status");
    } finally {
      setIsChecking(false);
    }
  };

  const uninstallModule = async () => {
    if (!moduleAddress || !effectiveSafeAddress || !isInSafeContext) return;

    setIsUninstalling(true);
    setError(null);
    setTxHash(null);

    try {
      // Find the previous module in the linked list
      // If our module is first, prevModule is SENTINEL
      // Otherwise, we need to find which module points to ours
      let prevModule = SENTINEL_MODULES;

      if (modules.length > 0) {
        const moduleIndex = modules.findIndex(
          (m) => m.toLowerCase() === moduleAddress.toLowerCase()
        );
        if (moduleIndex > 0) {
          prevModule = modules[moduleIndex - 1];
        }
      }

      // Encode the disableModule call
      const data = encodeFunctionData({
        abi: SAFE_ABI,
        functionName: "disableModule",
        args: [prevModule as `0x${string}`, moduleAddress],
      });

      const result = await sendTransactions([
        {
          to: effectiveSafeAddress,
          value: "0",
          data: data,
        },
      ]);

      setTxHash(result.safeTxHash);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to uninstall module");
    } finally {
      setIsUninstalling(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-900 to-black">
      <Header />

      <main className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-8">
          <div className="flex items-center gap-3">
            <Bug className="h-8 w-8 text-yellow-500" />
            <div>
              <h1 className="text-3xl font-bold text-white">Debug Menu</h1>
              <p className="mt-1 text-zinc-400">
                Developer tools for testing and debugging
              </p>
            </div>
          </div>
        </div>

        {/* Warning Banner */}
        <div className="mb-6 rounded-lg bg-yellow-900/20 border border-yellow-800/50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-yellow-500">Development Only</p>
              <p className="text-xs text-yellow-500/70 mt-1">
                These tools are for testing purposes. Use with caution.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {!isConnected ? (
            <Card>
              <CardHeader>
                <CardTitle>Connect Wallet</CardTitle>
                <CardDescription>Connect your wallet to access debug tools</CardDescription>
              </CardHeader>
              <CardContent>
                <ConnectButton />
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Safe Address Input */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Safe Wallet</CardTitle>
                      <CardDescription>
                        {isInSafeContext
                          ? "Auto-detected from Safe{Wallet}"
                          : "Enter the Safe address to debug"}
                      </CardDescription>
                    </div>
                    {isInSafeContext && <Badge variant="info">Safe App</Badge>}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-3">
                    <Input
                      placeholder="Safe address (0x...)"
                      value={effectiveSafeAddress}
                      onChange={(e) => setSafeAddress(e.target.value)}
                      disabled={isInSafeContext}
                      className="flex-1 font-mono"
                    />
                    <Button
                      onClick={checkModuleStatus}
                      isLoading={isChecking}
                      disabled={!effectiveSafeAddress}
                      variant="secondary"
                      className="gap-2"
                    >
                      <RefreshCw className="h-4 w-4" />
                      Check
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Module Status */}
              {isModuleInstalled !== null && (
                <Card>
                  <CardHeader>
                    <CardTitle>Recovery Module Status</CardTitle>
                    <CardDescription>
                      {moduleAddress ? shortenAddress(moduleAddress) : "N/A"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-4 rounded-lg bg-zinc-800/50">
                        <span className="text-zinc-400">Module Installed</span>
                        <div className="flex items-center gap-2">
                          {isModuleInstalled ? (
                            <>
                              <CheckCircle className="h-5 w-5 text-green-400" />
                              <span className="text-green-400">Yes</span>
                            </>
                          ) : (
                            <>
                              <XCircle className="h-5 w-5 text-zinc-500" />
                              <span className="text-zinc-500">No</span>
                            </>
                          )}
                        </div>
                      </div>

                      {modules.length > 0 && (
                        <div className="p-4 rounded-lg bg-zinc-800/50">
                          <p className="text-sm text-zinc-400 mb-2">All Installed Modules:</p>
                          <div className="space-y-1">
                            {modules.map((mod, i) => (
                              <div key={i} className="flex items-center justify-between">
                                <span className="font-mono text-xs text-white">
                                  {shortenAddress(mod)}
                                </span>
                                {mod.toLowerCase() === moduleAddress?.toLowerCase() && (
                                  <Badge variant="info" className="text-xs">Recovery</Badge>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Uninstall Module */}
              {isModuleInstalled && (
                <Card className="border-red-900/50">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-900/30">
                        <Trash2 className="h-6 w-6 text-red-400" />
                      </div>
                      <div>
                        <CardTitle className="text-red-400">Uninstall Module</CardTitle>
                        <CardDescription>
                          Remove the recovery module from this Safe
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {!isInSafeContext && (
                        <div className="rounded-lg bg-yellow-900/20 border border-yellow-800/50 p-3">
                          <p className="text-sm text-yellow-400">
                            Open this page in Safe{"{Wallet}"} to uninstall the module
                          </p>
                        </div>
                      )}

                      {error && (
                        <div className="rounded-lg bg-red-900/20 border border-red-800 p-3">
                          <p className="text-sm text-red-400">{error}</p>
                        </div>
                      )}

                      {txHash && (
                        <div className="rounded-lg bg-green-900/20 border border-green-800 p-3">
                          <p className="text-sm text-green-400">Transaction submitted!</p>
                          <a
                            href={`https://app.safe.global/transactions/tx?safe=sep:${effectiveSafeAddress}&id=multisig_${effectiveSafeAddress}_${txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-green-400/70 hover:text-green-400 underline"
                          >
                            View in Safe{"{Wallet}"}
                          </a>
                        </div>
                      )}

                      <Button
                        onClick={uninstallModule}
                        isLoading={isUninstalling}
                        disabled={!isInSafeContext || isUninstalling}
                        variant="outline"
                        className="w-full border-red-800 text-red-400 hover:bg-red-900/20 gap-2"
                      >
                        <Trash2 className="h-4 w-4" />
                        Uninstall Recovery Module
                      </Button>

                      <p className="text-xs text-zinc-500 text-center">
                        This will create a Safe transaction to disable the module
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Contract Addresses */}
              <Card>
                <CardHeader>
                  <CardTitle>Contract Addresses</CardTitle>
                  <CardDescription>Deployed contract addresses for this network</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/50">
                      <span className="text-sm text-zinc-400">SafeRecoveryModule</span>
                      <span className="font-mono text-xs text-white">
                        {contracts?.safeRecoveryModule
                          ? shortenAddress(contracts.safeRecoveryModule)
                          : "N/A"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/50">
                      <span className="text-sm text-zinc-400">AztecRecoveryValidator</span>
                      <span className="font-mono text-xs text-white">
                        {contracts?.aztecRecoveryValidator
                          ? shortenAddress(contracts.aztecRecoveryValidator)
                          : "N/A"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/50">
                      <span className="text-sm text-zinc-400">Chain ID</span>
                      <span className="font-mono text-xs text-white">{chainId}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
