"use client";

import { useState, useEffect } from "react";
import { useChainId } from "wagmi";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { useSafe } from "@/hooks/useSafe";
import { useSafeApps } from "@/hooks/useSafeApps";
import { isAddress } from "viem";
import { Shield, CheckCircle } from "lucide-react";

interface SafeConnectorProps {
  onConnected?: (address: string) => void;
}

export function SafeConnector({ onConnected }: SafeConnectorProps) {
  const [address, setAddress] = useState("");
  const chainId = useChainId();
  const { loadSafeInfo, isLoading, error } = useSafe();
  const { isInSafeContext, safeInfo: safeAppsInfo, isLoading: safeAppsLoading } = useSafeApps();

  // Auto-connect if running inside Safe{Wallet}
  useEffect(() => {
    if (isInSafeContext && safeAppsInfo && onConnected) {
      loadSafeInfo(safeAppsInfo.safeAddress, safeAppsInfo.chainId).then((info) => {
        if (info) {
          onConnected(safeAppsInfo.safeAddress);
        }
      });
    }
  }, [isInSafeContext, safeAppsInfo, onConnected, loadSafeInfo]);

  const handleConnect = async () => {
    if (!isAddress(address)) {
      return;
    }

    const info = await loadSafeInfo(address, chainId);
    if (info && onConnected) {
      onConnected(address);
    }
  };

  const isValidAddress = address === "" || isAddress(address);

  // Show auto-detected Safe info if running inside Safe{Wallet}
  if (isInSafeContext && safeAppsInfo) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-900/30">
                <CheckCircle className="h-5 w-5 text-green-400" />
              </div>
              <div>
                <CardTitle>Safe Detected</CardTitle>
                <CardDescription>
                  Running inside Safe{"{"} Wallet {"}"}
                </CardDescription>
              </div>
            </div>
            <Badge variant="success">Auto-connected</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg bg-zinc-800/50 px-4 py-3">
              <span className="text-sm text-zinc-400">Safe Address</span>
              <span className="font-mono text-sm text-white">
                {safeAppsInfo.safeAddress.slice(0, 10)}...{safeAppsInfo.safeAddress.slice(-8)}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-zinc-800/50 px-4 py-3">
              <span className="text-sm text-zinc-400">Chain ID</span>
              <span className="text-sm text-white">{safeAppsInfo.chainId}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-zinc-800/50 px-4 py-3">
              <span className="text-sm text-zinc-400">Threshold</span>
              <span className="text-sm text-white">{safeAppsInfo.threshold} of {safeAppsInfo.owners.length}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show loading state while checking Safe context
  if (safeAppsLoading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center gap-3">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-600 border-t-blue-500" />
            <span className="text-zinc-400">Detecting Safe context...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connect Your Safe</CardTitle>
        <CardDescription>
          Enter your Safe wallet address to get started.
          Or open this app inside Safe{"{"} Wallet {"}"} for auto-detection.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <Input
            label="Safe Address"
            placeholder="0x..."
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            error={!isValidAddress ? "Invalid address format" : undefined}
          />
          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}
          <Button
            onClick={handleConnect}
            isLoading={isLoading}
            disabled={!address || !isValidAddress}
            className="w-full"
          >
            Connect Safe
          </Button>
          <p className="text-xs text-zinc-500 text-center">
            Tip: Add this app to Safe{"{"} Wallet {"}"} for seamless integration
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
