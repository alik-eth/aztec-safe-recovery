"use client";

import { useState } from "react";
import { useAccount, useChainId } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Header } from "@/components/Header";
import { SafeConnector } from "@/components/safe/SafeConnector";
import { SafeStats } from "@/components/safe/SafeStats";
import { ModuleInstaller } from "@/components/safe/ModuleInstaller";
import { AzguardConnector } from "@/components/aztec/AzguardConnector";
import { AztecContractDeployer } from "@/components/aztec/AztecContractDeployer";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useSafe } from "@/hooks/useSafe";
import type { SetupStep } from "@/types";
import type { AztecWallet } from "@azguardwallet/aztec-wallet";
import { CheckCircle, ArrowRight, ArrowLeft, Shield, Sparkles, ExternalLink, PartyPopper } from "lucide-react";

const STEPS: { id: SetupStep; label: string }[] = [
  { id: "connect", label: "Connect Safe" },
  { id: "aztec", label: "Connect Aztec" },
  { id: "install", label: "Install Module" },
];

// Success Modal Component
function SuccessModal({
  safeAddress,
  aztecAddress,
  isAlreadySetUp,
  onClose
}: {
  safeAddress: string;
  aztecAddress: string | null;
  isAlreadySetUp?: boolean;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-lg mx-4">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-zinc-800 to-zinc-900 border border-zinc-700 shadow-2xl">
          {/* Decorative gradient */}
          <div className="absolute inset-0 bg-gradient-to-br from-green-500/10 via-transparent to-purple-500/10" />

          {/* Sparkle decorations */}
          <div className="absolute top-4 left-8 text-yellow-400 animate-pulse">
            <Sparkles className="h-6 w-6" />
          </div>
          <div className="absolute top-12 right-12 text-green-400 animate-pulse delay-100">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="absolute bottom-20 left-12 text-purple-400 animate-pulse delay-200">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="absolute bottom-32 right-8 text-blue-400 animate-pulse delay-300">
            <Sparkles className="h-4 w-4" />
          </div>

          {/* Content */}
          <div className="relative p-8 text-center">
            {/* Success Icon */}
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-green-500 to-green-600 shadow-lg shadow-green-500/25">
              <PartyPopper className="h-10 w-10 text-white" />
            </div>

            {/* Title */}
            <h2 className="text-2xl font-bold text-white mb-2">
              {isAlreadySetUp ? "Already Protected!" : "Setup Complete!"}
            </h2>
            <p className="text-zinc-400 mb-8">
              {isAlreadySetUp
                ? "This Safe already has Aztec Guardian Recovery enabled"
                : "Your Safe is now protected with Aztec Guardian Recovery"}
            </p>

            {/* Summary Card */}
            <div className="rounded-xl bg-zinc-800/50 border border-zinc-700 p-4 mb-6 text-left">
              <div className="space-y-3">
                <div className="flex items-center justify-between py-2 border-b border-zinc-700">
                  <span className="text-sm text-zinc-400">Safe Wallet</span>
                  <span className="font-mono text-sm text-white">
                    {safeAddress.slice(0, 8)}...{safeAddress.slice(-6)}
                  </span>
                </div>
                {aztecAddress && (
                  <div className="flex items-center justify-between py-2 border-b border-zinc-700">
                    <span className="text-sm text-zinc-400">Secret Guardian</span>
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-purple-400" />
                      <span className="font-mono text-sm text-white">
                        {aztecAddress.slice(0, 8)}...{aztecAddress.slice(-6)}
                      </span>
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-zinc-400">Recovery Module</span>
                  <span className="flex items-center gap-2 text-sm text-green-400">
                    <CheckCircle className="h-4 w-4" />
                    Installed
                  </span>
                </div>
              </div>
            </div>

            {/* What's Next */}
            <div className="rounded-xl bg-purple-900/20 border border-purple-800/50 p-4 mb-6 text-left">
              <h3 className="text-sm font-medium text-purple-400 mb-2">What&apos;s Next?</h3>
              <ul className="space-y-2 text-sm text-zinc-300">
                <li className="flex items-start gap-2">
                  <span className="text-purple-400 mt-0.5">1.</span>
                  <span>Add more guardians for extra security</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-400 mt-0.5">2.</span>
                  <span>Share your guardian address with trusted friends</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-400 mt-0.5">3.</span>
                  <span>If you ever lose access, guardians can help recover</span>
                </li>
              </ul>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-3">
              <Button
                onClick={() => window.location.href = "/guardians"}
                className="w-full gap-2"
              >
                Manage Guardians
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                onClick={onClose}
                className="w-full"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SetupPage() {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { safeInfo, loadSafeInfo } = useSafe();

  const [currentStep, setCurrentStep] = useState<SetupStep>("connect");
  const [safeAddress, setSafeAddress] = useState("");
  const [aztecAddress, setAztecAddress] = useState<string | null>(null);
  const [aztecWallet, setAztecWallet] = useState<AztecWallet | null>(null);
  const [deployedContractAddress, setDeployedContractAddress] = useState<string | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [isAlreadySetUp, setIsAlreadySetUp] = useState(false);

  const currentStepIndex = STEPS.findIndex((s) => s.id === currentStep);

  const handleSafeConnected = async (addr: string) => {
    setSafeAddress(addr);
    const info = await loadSafeInfo(addr, chainId);

    // If module is already installed, show success modal
    if (info?.isRecoveryModuleInstalled) {
      setIsAlreadySetUp(true);
      setShowSuccessModal(true);
    } else {
      setCurrentStep("aztec");
    }
  };

  const handleAztecConnected = (address: string, wallet: AztecWallet) => {
    setAztecAddress(address);
    setAztecWallet(wallet);
  };

  const handleModuleInstalled = () => {
    setShowSuccessModal(true);
  };

  const canProceed = () => {
    switch (currentStep) {
      case "connect":
        return !!safeInfo;
      case "aztec":
        return !!aztecAddress && !!aztecWallet;
      case "install":
        return true;
      default:
        return false;
    }
  };

  const nextStep = () => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < STEPS.length) {
      setCurrentStep(STEPS[nextIndex].id);
    }
  };

  const prevStep = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(STEPS[prevIndex].id);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-900 to-black">
      <Header />

      <main className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">Setup Guardian Recovery</h1>
          <p className="mt-2 text-zinc-400">
            Protect your Safe wallet with a secret guardian on Aztec
          </p>
        </div>

        {/* Progress Steps */}
        <div className="mb-12">
          <div className="flex items-center justify-between">
            {STEPS.map((step, index) => (
              <div key={step.id} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-full border-2 ${
                      index < currentStepIndex
                        ? "border-green-500 bg-green-500 text-white"
                        : index === currentStepIndex
                        ? "border-blue-500 bg-blue-500 text-white"
                        : "border-zinc-700 bg-zinc-800 text-zinc-500"
                    }`}
                  >
                    {index < currentStepIndex ? (
                      <CheckCircle className="h-5 w-5" />
                    ) : (
                      <span>{index + 1}</span>
                    )}
                  </div>
                  <span
                    className={`mt-2 text-xs ${
                      index <= currentStepIndex ? "text-white" : "text-zinc-500"
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
                {index < STEPS.length - 1 && (
                  <div
                    className={`mx-4 h-0.5 w-24 ${
                      index < currentStepIndex ? "bg-green-500" : "bg-zinc-700"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Step Content */}
        <div className="space-y-6">
          {!isConnected ? (
            <Card>
              <CardHeader>
                <CardTitle>Connect Your Wallet</CardTitle>
                <CardDescription>
                  Connect your wallet to get started
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ConnectButton />
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Step 1: Connect Safe */}
              {currentStep === "connect" && (
                <>
                  <SafeConnector onConnected={handleSafeConnected} />
                  {safeInfo && <SafeStats safeInfo={safeInfo} />}
                </>
              )}

              {/* Step 2: Connect Aztec */}
              {currentStep === "aztec" && (
                <AzguardConnector onConnected={handleAztecConnected} />
              )}

              {/* Step 3: Install Module */}
              {currentStep === "install" && safeInfo && (
                <>
                  {/* Review Configuration */}
                  <Card className="mb-6">
                    <CardHeader>
                      <CardTitle>Review Configuration</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div className="flex justify-between py-2 border-b border-zinc-800">
                          <span className="text-zinc-400">Safe Address</span>
                          <span className="font-mono text-white">
                            {safeAddress.slice(0, 10)}...{safeAddress.slice(-8)}
                          </span>
                        </div>
                        <div className="flex justify-between py-2 border-b border-zinc-800">
                          <span className="text-zinc-400">Aztec Owner</span>
                          <div className="flex items-center gap-2">
                            <Shield className="h-4 w-4 text-purple-400" />
                            <span className="font-mono text-white">
                              {aztecAddress?.slice(0, 10)}...{aztecAddress?.slice(-8)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Step 3a: Deploy Aztec Recovery Contract */}
                  <AztecContractDeployer
                    safeAddress={safeAddress}
                    wallet={aztecWallet!}
                    onDeployed={(addr) => setDeployedContractAddress(addr)}
                  />

                  {/* Step 3b: Enable Module on Safe (only after contract deployment) */}
                  {deployedContractAddress && (
                    <ModuleInstaller
                      safeAddress={safeAddress}
                      isInstalled={safeInfo.isRecoveryModuleInstalled}
                      aztecContractAddress={deployedContractAddress}
                      onInstalled={handleModuleInstalled}
                    />
                  )}
                </>
              )}

              {/* Navigation */}
              <div className="flex justify-between pt-6">
                <Button
                  variant="outline"
                  onClick={prevStep}
                  disabled={currentStepIndex === 0}
                  className="gap-2"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
                {currentStep !== "install" && (
                  <Button
                    onClick={nextStep}
                    disabled={!canProceed()}
                    className="gap-2"
                  >
                    Continue
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </main>

      {/* Success Modal */}
      {showSuccessModal && safeAddress && (
        <SuccessModal
          safeAddress={safeAddress}
          aztecAddress={deployedContractAddress || aztecAddress}
          isAlreadySetUp={isAlreadySetUp}
          onClose={() => setShowSuccessModal(false)}
        />
      )}
    </div>
  );
}
