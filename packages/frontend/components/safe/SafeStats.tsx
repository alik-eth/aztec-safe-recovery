"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { shortenAddress } from "@/lib/utils";
import type { SafeInfo } from "@/types";
import { Shield, Users, Hash, CheckCircle, XCircle } from "lucide-react";

interface SafeStatsProps {
  safeInfo: SafeInfo;
}

export function SafeStats({ safeInfo }: SafeStatsProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Safe Wallet</CardTitle>
          <Badge variant={safeInfo.isRecoveryModuleInstalled ? "success" : "warning"}>
            {safeInfo.isRecoveryModuleInstalled ? "Protected" : "Not Protected"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Address */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-800">
              <Shield className="h-5 w-5 text-zinc-400" />
            </div>
            <div>
              <p className="text-sm text-zinc-400">Address</p>
              <p className="font-mono text-white">{shortenAddress(safeInfo.address, 6)}</p>
            </div>
          </div>

          {/* Owners */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-800">
              <Users className="h-5 w-5 text-zinc-400" />
            </div>
            <div>
              <p className="text-sm text-zinc-400">Owners</p>
              <p className="text-white">
                {safeInfo.threshold} of {safeInfo.owners.length} required
              </p>
            </div>
          </div>

          {/* Nonce */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-800">
              <Hash className="h-5 w-5 text-zinc-400" />
            </div>
            <div>
              <p className="text-sm text-zinc-400">Transaction Count</p>
              <p className="text-white">{safeInfo.nonce}</p>
            </div>
          </div>

          {/* Module Status */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-800">
              {safeInfo.isRecoveryModuleInstalled ? (
                <CheckCircle className="h-5 w-5 text-green-400" />
              ) : (
                <XCircle className="h-5 w-5 text-yellow-400" />
              )}
            </div>
            <div>
              <p className="text-sm text-zinc-400">Recovery Module</p>
              <p className={safeInfo.isRecoveryModuleInstalled ? "text-green-400" : "text-yellow-400"}>
                {safeInfo.isRecoveryModuleInstalled ? "Installed" : "Not Installed"}
              </p>
            </div>
          </div>

          {/* Owner List */}
          <div className="mt-6 border-t border-zinc-800 pt-4">
            <p className="text-sm font-medium text-zinc-300 mb-3">Owners</p>
            <div className="space-y-2">
              {safeInfo.owners.map((owner, index) => (
                <div
                  key={owner}
                  className="flex items-center justify-between rounded-lg bg-zinc-800/50 px-3 py-2"
                >
                  <span className="text-sm text-zinc-400">Owner {index + 1}</span>
                  <span className="font-mono text-sm text-white">
                    {shortenAddress(owner)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
