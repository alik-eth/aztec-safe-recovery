"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { aztecConfig } from "@/lib/contracts";
import { shortenAddress } from "@/lib/utils";
import { formatAztecAddress } from "@/lib/aztec";
import { Shield, CheckCircle, Loader2, AlertCircle } from "lucide-react";
import type { AztecWallet } from "@azguardwallet/aztec-wallet";

interface AztecRegistrationProps {
  safeAddress: string;
  guardianAddress: string;
  wallet: AztecWallet;
  isRegistered: boolean;
  onRegistered?: () => void;
}

type RegistrationStep = "checking" | "idle" | "registering" | "complete" | "error";

export function AztecRegistration({
  safeAddress,
  guardianAddress,
  wallet,
  isRegistered,
  onRegistered,
}: AztecRegistrationProps) {
  const [step, setStep] = useState<RegistrationStep>("checking");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [alreadyOwner, setAlreadyOwner] = useState(false);

  const contractAddress = aztecConfig.recoveryContract;

  // Check if already registered as owner on mount
  useEffect(() => {
    const checkOwnerStatus = async () => {
      if (!contractAddress || !wallet || !safeAddress) {
        setStep("idle");
        return;
      }

      try {
        const { AztecAddress, EthAddress } = await import("@aztec/aztec.js/addresses");
        const { Contract } = await import("@aztec/aztec.js/contracts");
        const { recoveryArtifact: artifact } = await import("@/lib/recoveryArtifact");

        const contractAddr = AztecAddress.fromString(contractAddress);
        const safeEthAddress = EthAddress.fromString(safeAddress);

        await wallet.registerContract(contractAddr, artifact);

        const contract = await Contract.at(contractAddr, artifact, wallet as any);

        // Get wallet address for 'from' field
        const accounts = await wallet.getAccounts();
        if (accounts.length === 0) {
          setStep("idle");
          return;
        }
        const walletAddress = accounts[0].item;

        // Check if already owner of this Safe
        console.log("Checking if already owner of Safe:", safeAddress);
        const isOwner = await contract.methods.is_owner(safeEthAddress).simulate({ from: walletAddress });
        console.log("Is owner:", isOwner);

        if (isOwner) {
          setAlreadyOwner(true);
          setStep("complete");
          onRegistered?.();
        } else {
          setStep("idle");
        }
      } catch (err) {
        console.error("Error checking owner status:", err);
        // If check fails, allow user to try registering
        setStep("idle");
      }
    };

    checkOwnerStatus();
  }, [contractAddress, wallet, safeAddress, onRegistered]);

  const handleRegister = async () => {
    if (!contractAddress) {
      setError("Aztec recovery contract address not configured");
      return;
    }

    setStep("registering");
    setError(null);

    try {
      // Dynamic imports to avoid SSR issues
      const { AztecAddress, EthAddress } = await import("@aztec/aztec.js/addresses");
      const { Contract } = await import("@aztec/aztec.js/contracts");
      const { SponsoredFeePaymentMethod } = await import("@aztec/aztec.js/fee/testing");
      const { Fr } = await import("@aztec/aztec.js/fields");
      const { getContractInstanceFromInstantiationParams } = await import("@aztec/aztec.js/contracts");
      const { SponsoredFPCContract } = await import("@aztec/noir-contracts.js/SponsoredFPC");
      const { recoveryArtifact: artifact } = await import("@/lib/recoveryArtifact");

      const contractAddr = AztecAddress.fromString(contractAddress);
      // Convert EVM Safe address to Aztec EthAddress type
      const safeEthAddress = EthAddress.fromString(safeAddress);

      // Get Sponsored FPC instance for fee payment
      console.log("Setting up sponsored fee payment...");
      const sponsoredFPC = await getContractInstanceFromInstantiationParams(
        SponsoredFPCContract.artifact,
        { constructorArgs: [], salt: new Fr(0) }
      );
      const sponsoredPaymentMethod = new SponsoredFeePaymentMethod(sponsoredFPC.address);
      console.log("Sponsored FPC address:", sponsoredFPC.address.toString());

      // Register the FPC contract with wallet
      await wallet.registerContract(sponsoredFPC, SponsoredFPCContract.artifact);

      // Register the Recovery contract with the wallet
      console.log("Registering Recovery contract with wallet...");
      await wallet.registerContract(contractAddr, artifact);
      console.log("Contract registered");

      // Get wallet's account address for the 'from' field
      const accounts = await wallet.getAccounts();
      if (accounts.length === 0) {
        throw new Error("No accounts found in wallet");
      }
      const walletAddress = accounts[0].item;
      console.log("Wallet address:", walletAddress.toString());

      // Use Contract.at with the wallet
      console.log("Creating contract instance...");
      const contract = await Contract.at(contractAddr, artifact, wallet as any);
      console.log("Contract instance created");

      // Register Safe on Aztec (makes caller the owner)
      console.log("Registering Safe on Aztec:", safeAddress);

      const registerTx = contract.methods.register_safe(safeEthAddress);
      const receipt = await registerTx.send({
        fee: { paymentMethod: sponsoredPaymentMethod },
        from: walletAddress,
      }).wait();
      console.log("Safe registered:", receipt);

      const txHash = receipt.txHash;

      setStep("complete");
      setTxHash(txHash?.toString() ?? null);
      onRegistered?.();
    } catch (err) {
      console.error("Registration error:", err);
      const message = err instanceof Error ? err.message : "Failed to register on Aztec";
      // Check for "already own" error
      if (message.toLowerCase().includes("already own")) {
        setAlreadyOwner(true);
        setStep("complete");
        onRegistered?.();
      } else {
        setError(message);
        setStep("error");
      }
    }
  };

  // Show registered state if parent says so or we detected it
  if (isRegistered || (step === "complete" && alreadyOwner)) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-900/30">
              <CheckCircle className="h-6 w-6 text-green-400" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <CardTitle>Safe Registered on Aztec</CardTitle>
                <Badge variant="success">Complete</Badge>
              </div>
              <CardDescription>
                {alreadyOwner
                  ? "You are the owner of this Safe on Aztec"
                  : "Your Safe is registered on Aztec"}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg bg-zinc-800/50 p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-zinc-400">Safe</span>
              <span className="font-mono text-white">{shortenAddress(safeAddress)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-zinc-400">Owner (Aztec)</span>
              <span className="font-mono text-white">{formatAztecAddress(guardianAddress, 8)}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Checking state
  if (step === "checking") {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-900/30">
              <Loader2 className="h-6 w-6 text-purple-400 animate-spin" />
            </div>
            <div className="flex-1">
              <CardTitle>Checking Aztec Status</CardTitle>
              <CardDescription>
                Verifying Safe registration...
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg bg-zinc-800/50 p-4 text-center">
            <p className="text-sm text-zinc-400">
              Checking if your Safe is already registered on Aztec
            </p>
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
            <Shield className="h-6 w-6 text-purple-400" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <CardTitle>Register Safe on Aztec</CardTitle>
              {step === "complete" && (
                <Badge variant="success">Complete</Badge>
              )}
            </div>
            <CardDescription>
              Link your Safe wallet to Aztec for guardian recovery
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">

          {error && (
            <div className="rounded-lg bg-red-900/20 border border-red-800 p-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-red-400">{error}</p>
                  {!contractAddress && (
                    <p className="text-xs text-red-400/70 mt-1">
                      Set NEXT_PUBLIC_AZTEC_RECOVERY_CONTRACT in .env
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {step === "complete" && txHash && (
            <div className="rounded-lg bg-green-900/20 border border-green-800 p-3">
              <p className="text-sm text-green-400">
                Successfully registered on Aztec!
              </p>
            </div>
          )}

          <Button
            onClick={handleRegister}
            disabled={step !== "idle" && step !== "error"}
            isLoading={step === "registering"}
            className="w-full"
          >
            {step === "idle" || step === "error"
              ? "Register Safe"
              : step === "registering"
              ? "Registering..."
              : "Registered"}
          </Button>

          <p className="text-xs text-zinc-500 text-center">
            This registers you as the owner of this Safe on Aztec.
            You can then add guardians to protect your wallet.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
