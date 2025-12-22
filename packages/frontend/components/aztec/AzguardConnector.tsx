"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useAzguard } from "@/hooks/useAzguard";
import { formatAztecAddress } from "@/lib/aztec";
import { Wallet, ExternalLink, CheckCircle, AlertCircle } from "lucide-react";
import type { AztecWallet } from "@azguardwallet/aztec-wallet";

interface AzguardConnectorProps {
  onConnected?: (address: string, wallet: AztecWallet) => void;
}

export function AzguardConnector({ onConnected }: AzguardConnectorProps) {
  const { isConnected, isConnecting, address, allAccounts, wallet, error, connect, disconnect, selectAccount } = useAzguard();
  const [selectedChain, setSelectedChain] = useState<"devnet" | "sandbox">("devnet");

  // Call onConnected when address and wallet are available
  useEffect(() => {
    if (isConnected && address && wallet && onConnected) {
      onConnected(address, wallet);
    }
  }, [isConnected, address, wallet, onConnected]);

  const handleConnect = async () => {
    await connect(selectedChain);
  };

  if (isConnected && address) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-900/30">
                <CheckCircle className="h-5 w-5 text-green-400" />
              </div>
              <div>
                <CardTitle>Azguard Connected</CardTitle>
                <CardDescription>Your Aztec wallet is connected</CardDescription>
              </div>
            </div>
            <Badge variant="success">Connected</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Account selector if multiple accounts */}
            {allAccounts.length > 1 ? (
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Select Account
                </label>
                <select
                  value={address || ''}
                  onChange={(e) => selectAccount(e.target.value)}
                  className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-4 py-2 text-sm text-white font-mono"
                >
                  {allAccounts.map((acc) => (
                    <option key={acc.address} value={acc.address}>
                      {acc.alias ? `${acc.alias} - ` : ''}{formatAztecAddress(acc.address, 8)}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="flex items-center justify-between rounded-lg bg-zinc-800/50 px-4 py-3">
                <span className="text-sm text-zinc-400">Address</span>
                <span className="font-mono text-sm text-white">
                  {formatAztecAddress(address, 10)}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between rounded-lg bg-zinc-800/50 px-4 py-3">
              <span className="text-sm text-zinc-400">Network</span>
              <span className="text-sm text-white capitalize">{selectedChain}</span>
            </div>
            <Button variant="outline" onClick={disconnect} className="w-full">
              Disconnect
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-900/30">
            <Wallet className="h-5 w-5 text-purple-400" />
          </div>
          <div>
            <CardTitle>Connect Azguard Wallet</CardTitle>
            <CardDescription>
              Connect your Aztec wallet to manage secret guardians
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Network Selection */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Aztec Network
            </label>
            <div className="flex gap-2">
              {(["devnet", "sandbox"] as const).map((chain) => (
                <button
                  key={chain}
                  onClick={() => setSelectedChain(chain)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    selectedChain === chain
                      ? "bg-purple-600 text-white"
                      : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                  }`}
                >
                  {chain === "devnet" ? "Devnet" : "Local Sandbox"}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-red-900/20 border border-red-800 p-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-red-400">{error}</p>
                  {error.includes("not installed") && (
                    <a
                      href="https://azguard.io"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-red-400/70 hover:text-red-400 mt-1"
                    >
                      Install Azguard <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}

          <Button
            onClick={handleConnect}
            isLoading={isConnecting}
            className="w-full"
          >
            Connect Azguard
          </Button>

          <div className="rounded-lg bg-zinc-800/50 p-3">
            <p className="text-xs text-zinc-400">
              Azguard is a browser extension wallet for Aztec Network.
              Your secret guardians will be stored privately on Aztec.
            </p>
            <a
              href="https://azguard.io"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 mt-2"
            >
              Get Azguard Wallet <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
