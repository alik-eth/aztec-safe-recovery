"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { shortenAddress } from "@/lib/utils";
import { formatAztecAddress, patchArtifact } from "@/lib/aztec";
import { Rocket, CheckCircle, Loader2, AlertCircle, Settings } from "lucide-react";
import type { AztecWallet } from "@azguardwallet/aztec-wallet";

interface AztecContractDeployerProps {
  safeAddress: string;
  wallet: AztecWallet;
  onDeployed?: (contractAddress: string) => void;
}

type DeployStep = "config" | "deploying" | "complete" | "error";

export function AztecContractDeployer({
  safeAddress,
  wallet,
  onDeployed,
}: AztecContractDeployerProps) {
  const [step, setStep] = useState<DeployStep>("config");
  const [error, setError] = useState<string | null>(null);
  const [deployedAddress, setDeployedAddress] = useState<string | null>(null);

  // Config options
  const [threshold, setThreshold] = useState(1);
  const [destinationAddress, setDestinationAddress] = useState("");

  // Wormhole address on Aztec devnet
  const WORMHOLE_ADDRESS = "0x2b13cff4daef709134419f1506ccae28956e02102a5ef5f2d0077e4991a9f493";
  const CHAIN_ID = 11155111n; // Sepolia

  const handleDeploy = async () => {
    setStep("deploying");
    setError(null);

    try {
      // Dynamic imports
      const { AztecAddress, EthAddress } = await import("@aztec/aztec.js/addresses");
      const { Contract } = await import("@aztec/aztec.js/contracts");
      const { SponsoredFeePaymentMethod } = await import("@aztec/aztec.js/fee/testing");
      const { Fr } = await import("@aztec/aztec.js/fields");
      const { getContractInstanceFromInstantiationParams } = await import("@aztec/aztec.js/contracts");
      const { SponsoredFPCContract } = await import("@aztec/noir-contracts.js/SponsoredFPC");
      const { recoveryArtifact: artifact } = await import("@/lib/recoveryArtifact");

      // Get wallet's account address
      const accounts = await wallet.getAccounts();
      if (accounts.length === 0) {
        throw new Error("No accounts found in wallet");
      }
      const ownerAddress = accounts[0].item;
      console.log("Owner address:", ownerAddress.toString());

      // Setup sponsored fee payment
      console.log("Setting up sponsored fee payment...");
      const patchedFPCArtifact = patchArtifact(SponsoredFPCContract.artifact);
      const sponsoredFPC = await getContractInstanceFromInstantiationParams(
        patchedFPCArtifact as any,
        { constructorArgs: [], salt: new Fr(0) }
      );
      const sponsoredPaymentMethod = new SponsoredFeePaymentMethod(sponsoredFPC.address);
      await wallet.registerContract(sponsoredFPC, patchedFPCArtifact as any);

      // Prepare constructor args
      const wormholeAddr = AztecAddress.fromString(WORMHOLE_ADDRESS);
      const safeEthAddr = EthAddress.fromString(safeAddress);
      const destAddr = EthAddress.fromString(destinationAddress || safeAddress); // Default to Safe address

      console.log("Deploying Recovery contract...");
      console.log("  Owner:", ownerAddress.toString());
      console.log("  Wormhole:", wormholeAddr.toString());
      console.log("  Chain ID:", CHAIN_ID);
      console.log("  Safe:", safeEthAddr.toString());
      console.log("  Destination:", destAddr.toString());
      console.log("  Threshold:", threshold);

      // Deploy contract
      // Constructor: owner, wormhole_address, chain_id, safe_address, destination_address, threshold
      const deployedContract = await Contract.deploy(wallet as any, artifact, [
        ownerAddress,
        wormholeAddr,
        CHAIN_ID,
        safeEthAddr,
        destAddr,
        threshold,
      ])
        .send({
          fee: { paymentMethod: sponsoredPaymentMethod },
          from: ownerAddress,
        })
        .deployed();

      console.log("Contract deployed at:", deployedContract.address.toString());

      const contractAddr = deployedContract.address.toString();
      setDeployedAddress(contractAddr);
      setStep("complete");
      onDeployed?.(contractAddr);
    } catch (err) {
      console.error("Deployment error:", err);
      const message = err instanceof Error ? err.message : "Failed to deploy contract";
      setError(message);
      setStep("error");
    }
  };

  if (step === "complete" && deployedAddress) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-900/30">
              <CheckCircle className="h-6 w-6 text-green-400" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <CardTitle>Recovery Contract Deployed</CardTitle>
                <Badge variant="success">Complete</Badge>
              </div>
              <CardDescription>
                Your Aztec recovery contract is ready
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg bg-zinc-800/50 p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-zinc-400">Contract Address</span>
              <span className="font-mono text-white text-xs">
                {formatAztecAddress(deployedAddress, 10)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-zinc-400">Protected Safe</span>
              <span className="font-mono text-white">{shortenAddress(safeAddress)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-zinc-400">Threshold</span>
              <span className="text-white">{threshold} guardian(s)</span>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-900/30">
            {step === "deploying" ? (
              <Loader2 className="h-6 w-6 text-purple-400 animate-spin" />
            ) : (
              <Rocket className="h-6 w-6 text-purple-400" />
            )}
          </div>
          <div className="flex-1">
            <CardTitle>Deploy Recovery Contract</CardTitle>
            <CardDescription>
              Create your private recovery contract on Aztec
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {step === "config" && (
            <>
              <div className="rounded-lg bg-zinc-800/50 p-4 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-400">Protected Safe</span>
                  <span className="font-mono text-white">{shortenAddress(safeAddress)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-400">Target Chain</span>
                  <span className="text-white">Sepolia</span>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-sm text-zinc-400 mb-1 block">
                    Guardian Threshold
                  </label>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={threshold}
                    onChange={(e) => setThreshold(parseInt(e.target.value) || 1)}
                    className="w-full"
                  />
                  <p className="text-xs text-zinc-500 mt-1">
                    Number of guardians required to approve recovery
                  </p>
                </div>

                <div>
                  <label className="text-sm text-zinc-400 mb-1 block">
                    Recovery Destination (optional)
                  </label>
                  <Input
                    placeholder={`Default: ${shortenAddress(safeAddress)}`}
                    value={destinationAddress}
                    onChange={(e) => setDestinationAddress(e.target.value)}
                    className="w-full font-mono text-sm"
                  />
                  <p className="text-xs text-zinc-500 mt-1">
                    EVM contract that will receive recovery messages
                  </p>
                </div>
              </div>
            </>
          )}

          {error && (
            <div className="rounded-lg bg-red-900/20 border border-red-800 p-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
                <p className="text-sm text-red-400">{error}</p>
              </div>
            </div>
          )}

          <Button
            onClick={handleDeploy}
            disabled={step === "deploying"}
            isLoading={step === "deploying"}
            className="w-full"
          >
            {step === "deploying" ? "Deploying..." : "Deploy Contract"}
          </Button>

          <p className="text-xs text-zinc-500 text-center">
            This deploys a new recovery contract specifically for your Safe.
            You will become the owner who can add guardians.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
