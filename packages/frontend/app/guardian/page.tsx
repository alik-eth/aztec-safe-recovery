"use client";

import { useState, useEffect } from "react";
import { Header } from "@/components/Header";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { AzguardConnector } from "@/components/aztec/AzguardConnector";
import { useAzguard } from "@/hooks/useAzguard";
import { useSafeApps } from "@/hooks/useSafeApps";
import { contracts } from "@/lib/contracts";
import { shortenAddress } from "@/lib/utils";
import { formatAztecAddress, isValidAztecAddress, patchArtifact } from "@/lib/aztec";
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import {
  Vote,
  CheckCircle,
  AlertCircle,
  Plus,
  Wallet,
  Loader2,
  PartyPopper,
  ExternalLink,
  Rocket,
} from "lucide-react";
import type { AztecWallet } from "@azguardwallet/aztec-wallet";

const MODULE_ABI = [
  {
    inputs: [{ name: "safe", type: "address" }],
    name: "getAztecRecoveryContract",
    outputs: [{ type: "bytes32" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const RECOVERY_APPLIED_ABI = [
  {
    type: "event",
    name: "RecoveryApplied",
    inputs: [
      { name: "safe", type: "address", indexed: true },
      { name: "threshold", type: "uint256", indexed: false },
      { name: "nonce", type: "bytes32", indexed: false },
    ],
  },
] as const;

type RelayStatus = "idle" | "awaiting" | "success" | "failed";

export default function GuardianPage() {
  const { isInSafeContext, safeInfo } = useSafeApps();
  const { disconnect: disconnectAzguard } = useAzguard();
  const [aztecWallet, setAztecWallet] = useState<AztecWallet | null>(null);
  const [aztecAddress, setAztecAddress] = useState<string | null>(null);

  const handleDisconnect = () => {
    disconnectAzguard();
    setAztecWallet(null);
    setAztecAddress(null);
    setContractAddress("");
    setSafeAddress(null);
    setThreshold(null);
    setVoteCount(null);
    setIsRecoverySent(false);
    setShowVoteForm(false);
    setRelayStatus("idle");
    setRecoveryTxHash(null);
    setPollingStartBlock(null);
  };

  // Contract info
  const [contractAddress, setContractAddress] = useState("");
  const [safeAddress, setSafeAddress] = useState<string | null>(null);
  const [threshold, setThreshold] = useState<number | null>(null);
  const [safeInputAddress, setSafeInputAddress] = useState("");
  const [isLoadingFromSafe, setIsLoadingFromSafe] = useState(false);

  // Voting
  const [newOwnerAddress, setNewOwnerAddress] = useState("");
  const [voteCount, setVoteCount] = useState<number | null>(null);
  const [isRecoverySent, setIsRecoverySent] = useState(false);

  // UI state
  const [isLoadingContract, setIsLoadingContract] = useState(false);
  const [isCheckingVotes, setIsCheckingVotes] = useState(false);
  const [isVoting, setIsVoting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showVoteForm, setShowVoteForm] = useState(false);

  // Relay tracking
  const [relayStatus, setRelayStatus] = useState<RelayStatus>("idle");
  const [recoveryTxHash, setRecoveryTxHash] = useState<string | null>(null);
  const [pollingStartBlock, setPollingStartBlock] = useState<bigint | null>(null);

  // Auto-detect Safe address from Safe{Wallet} context
  useEffect(() => {
    if (isInSafeContext && safeInfo?.safeAddress && !safeInputAddress) {
      setSafeInputAddress(safeInfo.safeAddress);
    }
  }, [isInSafeContext, safeInfo, safeInputAddress]);

  // Poll for RecoveryApplied event when awaiting relay
  useEffect(() => {
    if (relayStatus !== "awaiting" || !safeAddress || !pollingStartBlock) return;

    const pollInterval = setInterval(async () => {
      try {
        const client = createPublicClient({
          chain: sepolia,
          transport: http(),
        });

        const currentBlock = await client.getBlockNumber();

        // Get logs for RecoveryApplied event
        const logs = await client.getLogs({
          address: contracts.sepolia.safeRecoveryModule as `0x${string}`,
          event: {
            type: "event",
            name: "RecoveryApplied",
            inputs: [
              { name: "safe", type: "address", indexed: true },
              { name: "threshold", type: "uint256", indexed: false },
              { name: "nonce", type: "bytes32", indexed: false },
            ],
          },
          args: {
            safe: safeAddress as `0x${string}`,
          },
          fromBlock: pollingStartBlock,
          toBlock: currentBlock,
        });

        if (logs.length > 0) {
          // Found the recovery event!
          const txHash = logs[0].transactionHash;
          console.log("Recovery executed! TX:", txHash);
          setRecoveryTxHash(txHash);
          setRelayStatus("success");
          clearInterval(pollInterval);
        }
      } catch (err) {
        console.error("Error polling for recovery event:", err);
      }
    }, 5000); // Poll every 5 seconds

    return () => clearInterval(pollInterval);
  }, [relayStatus, safeAddress, pollingStartBlock]);

  // Load Aztec contract address from SafeRecoveryModule
  const loadAztecContractFromSafe = async (safeAddr: string) => {
    if (!safeAddr) return;

    setIsLoadingFromSafe(true);
    setError(null);

    try {
      const client = createPublicClient({
        chain: sepolia,
        transport: http(),
      });

      const aztecContractBytes = await client.readContract({
        address: contracts.sepolia.safeRecoveryModule as `0x${string}`,
        abi: MODULE_ABI,
        functionName: "getAztecRecoveryContract",
        args: [safeAddr as `0x${string}`],
      });

      if (aztecContractBytes && aztecContractBytes !== "0x0000000000000000000000000000000000000000000000000000000000000000") {
        setContractAddress(aztecContractBytes);
      } else {
        setError("No Aztec recovery contract found for this Safe.");
      }
    } catch (err) {
      console.error("Error loading Aztec contract:", err);
      setError("Failed to load Aztec contract from Safe module");
    } finally {
      setIsLoadingFromSafe(false);
    }
  };

  const handleAztecConnected = (address: string, wallet: AztecWallet) => {
    setAztecAddress(address);
    setAztecWallet(wallet);
  };

  const loadContract = async () => {
    if (!aztecWallet || !contractAddress) return;

    setIsLoadingContract(true);
    setError(null);
    setSafeAddress(null);
    setThreshold(null);

    try {
      const { AztecAddress } = await import("@aztec/aztec.js/addresses");
      const { Contract } = await import("@aztec/aztec.js/contracts");
      const { recoveryArtifact: artifact } = await import("@/lib/recoveryArtifact");

      const contractAddr = AztecAddress.fromString(contractAddress);

      try {
        await aztecWallet.registerContract(contractAddr, artifact);
      } catch (regErr) {
        console.warn("Contract registration warning:", regErr);
      }

      const contract = await Contract.at(contractAddr, artifact, aztecWallet as any);

      // Get wallet address for 'from' field
      const accounts = await aztecWallet.getAccounts();
      const walletAddress = accounts[0].item;

      // Get Safe address this contract protects (public)
      const safeResult = await contract.methods.get_safe_address().simulate({ from: walletAddress });

      // Debug the actual structure
      console.log("Safe address raw result:", safeResult);
      console.log("Safe address type:", typeof safeResult);
      console.log("Safe address constructor:", safeResult?.constructor?.name);
      if (safeResult && typeof safeResult === 'object') {
        console.log("Safe address keys:", Object.keys(safeResult));
        console.log("Safe address JSON:", JSON.stringify(safeResult, (_, v) => typeof v === 'bigint' ? v.toString() : v));
      }

      // Extract hex string from EthAddress
      let safeHex: string = '';

      if (typeof safeResult === 'string' && safeResult.startsWith('0x')) {
        safeHex = safeResult;
      } else if (safeResult && typeof safeResult === 'object') {
        // Try toChecksumString first (EthAddress class method)
        if (typeof (safeResult as any).toChecksumString === 'function') {
          safeHex = (safeResult as any).toChecksumString();
        }
        // Try toString, but validate it returns a hex string
        else if (typeof (safeResult as any).toString === 'function') {
          const str = (safeResult as any).toString();
          if (str.startsWith('0x') && str.length === 42) {
            safeHex = str;
          }
        }
        // If it has a buffer property (EthAddress internal)
        if (!safeHex && (safeResult as any).buffer) {
          const buf = (safeResult as any).buffer;
          if (Buffer.isBuffer(buf)) {
            safeHex = '0x' + buf.toString('hex');
          } else if (buf.type === 'Buffer' && Array.isArray(buf.data)) {
            safeHex = '0x' + Buffer.from(buf.data).toString('hex');
          }
        }
        // Try inner property (common in Aztec types)
        if (!safeHex && (safeResult as any).inner !== undefined) {
          const inner = (safeResult as any).inner;
          if (typeof inner === 'bigint') {
            safeHex = '0x' + inner.toString(16).padStart(40, '0');
          } else if (typeof inner === 'string') {
            safeHex = inner.startsWith('0x') ? inner : '0x' + inner;
          }
        }
        // Last resort: check for fields array (Aztec serialization)
        if (!safeHex && Array.isArray((safeResult as any).fields)) {
          const field = (safeResult as any).fields[0];
          if (field && typeof field.toBigInt === 'function') {
            safeHex = '0x' + field.toBigInt().toString(16).padStart(40, '0');
          }
        }
      }

      if (!safeHex || !safeHex.startsWith('0x')) {
        console.error("Could not extract Safe address from result:", safeResult);
        safeHex = 'Unknown';
      }

      console.log("Safe address extracted:", safeHex);
      setSafeAddress(safeHex);

      // Get threshold (public)
      const thresholdResult = await contract.methods.get_threshold().simulate({ from: walletAddress });
      setThreshold(Number(thresholdResult));

    } catch (err) {
      console.error("Error loading contract:", err);
      setError(err instanceof Error ? err.message : "Failed to load contract");
    } finally {
      setIsLoadingContract(false);
    }
  };

  const checkVoteStatus = async () => {
    if (!aztecWallet || !contractAddress || !newOwnerAddress) return;

    setIsCheckingVotes(true);
    setVoteCount(null);
    setIsRecoverySent(false);

    try {
      const { AztecAddress, EthAddress } = await import("@aztec/aztec.js/addresses");
      const { Contract } = await import("@aztec/aztec.js/contracts");
      const { recoveryArtifact: artifact } = await import("@/lib/recoveryArtifact");

      const contractAddr = AztecAddress.fromString(contractAddress);
      const candidateAddr = EthAddress.fromString(newOwnerAddress);

      const contract = await Contract.at(contractAddr, artifact, aztecWallet as any);

      // Get wallet address for 'from' field
      const accounts = await aztecWallet.getAccounts();
      const walletAddress = accounts[0].item;

      // Get vote count for this candidate
      const countResult = await contract.methods.get_vote_count(candidateAddr).simulate({ from: walletAddress });
      setVoteCount(Number(countResult));

      // Check if recovery was already sent
      const sentResult = await contract.methods.is_recovery_sent(candidateAddr).simulate({ from: walletAddress });

      // Unwrap boolean if needed
      let isSent = false;
      if (typeof sentResult === 'boolean') {
        isSent = sentResult;
      } else if (sentResult && typeof sentResult === 'object') {
        isSent = Boolean((sentResult as any).inner ?? sentResult);
      }

      setIsRecoverySent(isSent);

      // If recovery was sent and we're not already tracking, start polling
      if (isSent && relayStatus === "idle") {
        console.log("Recovery already sent, starting to poll for EVM transaction...");
        const client = createPublicClient({
          chain: sepolia,
          transport: http(),
        });
        // Start from a recent block (last 1000 blocks ~= 3.5 hours on Sepolia)
        const currentBlock = await client.getBlockNumber();
        setPollingStartBlock(currentBlock - 1000n);
        setRelayStatus("awaiting");
      }

    } catch (err) {
      console.error("Error checking votes:", err);
    } finally {
      setIsCheckingVotes(false);
    }
  };

  const handleVote = async () => {
    if (!aztecWallet || !contractAddress || !newOwnerAddress) return;

    setIsVoting(true);
    setError(null);
    setSuccess(null);

    try {
      const { AztecAddress, EthAddress } = await import("@aztec/aztec.js/addresses");
      const { Contract } = await import("@aztec/aztec.js/contracts");
      const { SponsoredFeePaymentMethod } = await import("@aztec/aztec.js/fee/testing");
      const { Fr } = await import("@aztec/aztec.js/fields");
      const { getContractInstanceFromInstantiationParams } = await import("@aztec/aztec.js/contracts");
      const { SponsoredFPCContract } = await import("@aztec/noir-contracts.js/SponsoredFPC");
      const { recoveryArtifact: artifact } = await import("@/lib/recoveryArtifact");

      const contractAddr = AztecAddress.fromString(contractAddress);
      const candidateAddr = EthAddress.fromString(newOwnerAddress);

      // Setup sponsored fee payment
      const patchedFPCArtifact = patchArtifact(SponsoredFPCContract.artifact);
      const sponsoredFPC = await getContractInstanceFromInstantiationParams(
        patchedFPCArtifact as any,
        { constructorArgs: [], salt: new Fr(0) }
      );
      const sponsoredPaymentMethod = new SponsoredFeePaymentMethod(sponsoredFPC.address);

      try {
        await aztecWallet.registerContract(sponsoredFPC, patchedFPCArtifact as any);
        await aztecWallet.registerContract(contractAddr, artifact);
      } catch (regErr) {
        console.warn("Contract registration warning:", regErr);
      }

      const contract = await Contract.at(contractAddr, artifact, aztecWallet as any);

      // Get wallet address for 'from' field
      const accounts = await aztecWallet.getAccounts();
      const walletAddress = accounts[0].item;

      // Call vote(candidate) - no safe address param needed
      const receipt = await contract.methods
        .vote(candidateAddr)
        .send({
          fee: { paymentMethod: sponsoredPaymentMethod },
          from: walletAddress,
        })
        .wait();

      console.log("Vote receipt:", receipt);

      // Refresh vote count and check if recovery was triggered
      const { AztecAddress: AztecAddr, EthAddress: EthAddr } = await import("@aztec/aztec.js/addresses");
      const contractAddrCheck = AztecAddr.fromString(contractAddress);
      const candidateAddrCheck = EthAddr.fromString(newOwnerAddress);
      const contractCheck = await Contract.at(contractAddrCheck, artifact, aztecWallet as any);

      const countResult = await contractCheck.methods.get_vote_count(candidateAddrCheck).simulate({ from: walletAddress });
      const newVoteCount = Number(countResult);
      setVoteCount(newVoteCount);

      const sentResult = await contractCheck.methods.is_recovery_sent(candidateAddrCheck).simulate({ from: walletAddress });

      // Unwrap boolean if needed
      let isSent = false;
      if (typeof sentResult === 'boolean') {
        isSent = sentResult;
      } else if (sentResult && typeof sentResult === 'object') {
        isSent = Boolean((sentResult as any).inner ?? sentResult);
      }

      setIsRecoverySent(isSent);

      // If recovery was triggered, start polling for the EVM transaction
      if (isSent && relayStatus === "idle") {
        console.log("Recovery triggered! Starting to poll for EVM transaction...");
        const client = createPublicClient({
          chain: sepolia,
          transport: http(),
        });
        const currentBlock = await client.getBlockNumber();
        setPollingStartBlock(currentBlock);
        setRelayStatus("awaiting");
        // Keep the form open to show "Recovery in Progress" UI
      } else {
        // Recovery not triggered, show success and close form
        setSuccess(`Vote submitted for ${shortenAddress(newOwnerAddress)}`);
        setShowVoteForm(false);
      }

    } catch (err) {
      console.error("Vote error:", err);
      const message = err instanceof Error ? err.message : "Failed to submit vote";
      if (message.includes("not a guardian") || message.includes("Caller is not a guardian")) {
        setError("You are not a guardian for this recovery contract");
      } else if (message.includes("nullifier") || message.includes("already voted")) {
        setError("You have already voted for this candidate");
      } else if (message.includes("Recovery already sent")) {
        setError("Recovery has already been triggered for this candidate");
        setIsRecoverySent(true);
      } else {
        setError(message);
      }
    } finally {
      setIsVoting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-900 to-black">
      <Header />

      <main className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">Guardian Portal</h1>
          <p className="mt-2 text-zinc-400">
            Vote on recovery requests for Safes you&apos;re guarding
          </p>
        </div>

        <div className="space-y-6">
          {/* Step 1: Connect Azguard */}
          {!aztecWallet ? (
            <AzguardConnector onConnected={handleAztecConnected} />
          ) : (
            <>
              {/* Connected Status */}
              <Card>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-3 w-3 rounded-full bg-green-500" />
                      <div>
                        <p className="text-sm text-zinc-400">Aztec Wallet</p>
                        <p className="font-mono text-sm text-white">
                          {formatAztecAddress(aztecAddress!, 10)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="success">Connected</Badge>
                      <Button variant="outline" size="sm" onClick={handleDisconnect}>
                        Disconnect
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Step 2: Find Recovery Contract */}
              <Card>
                <CardHeader>
                  <CardTitle>Recovery Contract</CardTitle>
                  <CardDescription>
                    Look up by Safe address or enter Aztec contract directly
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {/* Option A: Look up from Safe */}
                    <div>
                      <label className="text-sm text-zinc-400 mb-1 block">
                        Look up from Safe address
                      </label>
                      <div className="flex gap-3">
                        <Input
                          placeholder="Safe address (0x...)"
                          value={safeInputAddress}
                          onChange={(e) => setSafeInputAddress(e.target.value)}
                          className="flex-1"
                          disabled={isInSafeContext}
                        />
                        <Button
                          onClick={() => loadAztecContractFromSafe(safeInputAddress)}
                          isLoading={isLoadingFromSafe}
                          disabled={!safeInputAddress}
                          variant="secondary"
                        >
                          {isLoadingFromSafe ? <Loader2 className="h-4 w-4 animate-spin" /> : "Look Up"}
                        </Button>
                      </div>
                      {isInSafeContext && (
                        <p className="text-xs text-blue-400 mt-1">Auto-detected from Safe{"{"}Wallet{"}"}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-px bg-zinc-800" />
                      <span className="text-xs text-zinc-500">or</span>
                      <div className="flex-1 h-px bg-zinc-800" />
                    </div>

                    {/* Option B: Direct contract entry */}
                    <div>
                      <label className="text-sm text-zinc-400 mb-1 block">
                        Enter Aztec contract directly
                      </label>
                      <div className="flex gap-3">
                        <Input
                          placeholder="Aztec contract address (0x... 64 chars)"
                          value={contractAddress}
                          onChange={(e) => {
                            setContractAddress(e.target.value);
                            setSafeAddress(null);
                            setThreshold(null);
                            setVoteCount(null);
                            setIsRecoverySent(false);
                            setError(null);
                            setSuccess(null);
                          }}
                          className="flex-1 font-mono text-sm"
                        />
                        <Button
                          onClick={loadContract}
                          isLoading={isLoadingContract}
                          disabled={!contractAddress || !isValidAztecAddress(contractAddress)}
                          variant="secondary"
                        >
                          Load
                        </Button>
                      </div>
                      {contractAddress && !isValidAztecAddress(contractAddress) && (
                        <p className="text-sm text-yellow-400 mt-1">
                          Aztec addresses are 64 hex characters (0x + 64 chars)
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Contract Info */}
              {safeAddress && (
                <Card>
                  <CardContent className="py-4">
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-900/30">
                        <Wallet className="h-6 w-6 text-blue-400" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm text-zinc-400">Protected Safe</p>
                        <p className="font-mono text-white">{shortenAddress(safeAddress)}</p>
                      </div>
                      {threshold !== null && (
                        <div className="text-right">
                          <p className="text-sm text-zinc-400">Threshold</p>
                          <p className="text-white">{threshold} vote(s)</p>
                        </div>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowVoteForm(!showVoteForm)}
                      >
                        {showVoteForm ? "Cancel" : (
                          <>
                            <Plus className="h-4 w-4 mr-2" />
                            Vote
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Vote Recovery Form */}
              {showVoteForm && safeAddress && (
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-900/30">
                        <Vote className="h-6 w-6 text-orange-400" />
                      </div>
                      <div>
                        <CardTitle>Vote for Recovery</CardTitle>
                        <CardDescription>
                          Submit your vote for a new Safe owner
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div>
                        <label className="text-sm text-zinc-400 mb-1 block">
                          New Owner Address (EVM)
                        </label>
                        <div className="flex gap-3">
                          <Input
                            placeholder="0x..."
                            value={newOwnerAddress}
                            onChange={(e) => {
                              setNewOwnerAddress(e.target.value);
                              setVoteCount(null);
                              setIsRecoverySent(false);
                            }}
                            className="flex-1"
                          />
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={checkVoteStatus}
                            disabled={!newOwnerAddress || isCheckingVotes}
                          >
                            {isCheckingVotes ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              "Check"
                            )}
                          </Button>
                        </div>
                      </div>

                      {/* Vote Status */}
                      {voteCount !== null && threshold !== null && (
                        <div className={`rounded-lg p-4 ${
                          isRecoverySent || relayStatus !== "idle"
                            ? relayStatus === "success"
                              ? "bg-green-900/20 border border-green-800"
                              : "bg-purple-900/20 border border-purple-800"
                            : "bg-zinc-800/50"
                        }`}>
                          {relayStatus === "success" ? (
                            <div className="space-y-4">
                              <div className="flex items-center gap-3">
                                <div className="relative">
                                  <PartyPopper className="h-8 w-8 text-green-400 animate-bounce" />
                                  <div className="absolute -top-1 -right-1 h-3 w-3 bg-green-400 rounded-full animate-ping" />
                                </div>
                                <div>
                                  <p className="text-lg font-semibold text-green-400">Recovery Complete!</p>
                                  <p className="text-sm text-green-400/70">
                                    Safe ownership has been transferred on Sepolia
                                  </p>
                                </div>
                              </div>
                              {recoveryTxHash && (
                                <a
                                  href={`https://sepolia.etherscan.io/tx/${recoveryTxHash}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center justify-center gap-2 w-full py-3 px-4 rounded-lg bg-green-600 hover:bg-green-500 text-white font-medium transition-colors"
                                >
                                  View Transaction on Etherscan
                                  <ExternalLink className="h-4 w-4" />
                                </a>
                              )}
                            </div>
                          ) : relayStatus === "awaiting" || isRecoverySent ? (
                            <div className="space-y-4">
                              <div className="flex items-center gap-3">
                                <div className="relative">
                                  <Rocket className="h-8 w-8 text-purple-400" />
                                  <div className="absolute inset-0 animate-ping">
                                    <Rocket className="h-8 w-8 text-purple-400 opacity-50" />
                                  </div>
                                </div>
                                <div>
                                  <p className="text-lg font-semibold text-purple-400">Recovery in Progress</p>
                                  <p className="text-sm text-purple-400/70">
                                    Wormhole message sent, waiting for relay to Sepolia...
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-purple-900/30">
                                <Loader2 className="h-5 w-5 text-purple-400 animate-spin" />
                                <div className="flex-1">
                                  <p className="text-sm text-purple-300">Polling for transaction...</p>
                                  <p className="text-xs text-purple-400/60">This usually takes 1-2 minutes</p>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-sm text-zinc-400">Current Votes</p>
                                <p className="text-2xl font-bold text-white">
                                  {voteCount} / {threshold}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-sm text-zinc-400">Status</p>
                                <p className={`font-medium ${
                                  voteCount >= threshold ? "text-green-400" : "text-yellow-400"
                                }`}>
                                  {voteCount >= threshold ? "Threshold Reached" : "Needs More Votes"}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="rounded-lg bg-yellow-900/20 border border-yellow-800 p-3">
                        <p className="text-sm text-yellow-400">
                          Your vote is recorded privately. Other guardians must vote
                          for the same address to reach threshold.
                        </p>
                      </div>

                      {error && (
                        <div className="rounded-lg bg-red-900/20 border border-red-800 p-3">
                          <div className="flex items-start gap-2">
                            <AlertCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
                            <p className="text-sm text-red-400">{error}</p>
                          </div>
                        </div>
                      )}

                      {success && (
                        <div className="rounded-lg bg-green-900/20 border border-green-800 p-3">
                          <div className="flex items-center gap-2">
                            <CheckCircle className="h-5 w-5 text-green-400" />
                            <p className="text-sm text-green-400">{success}</p>
                          </div>
                        </div>
                      )}

                      {relayStatus !== "success" && (
                        <Button
                          onClick={handleVote}
                          isLoading={isVoting}
                          disabled={!newOwnerAddress || isRecoverySent || relayStatus === "awaiting"}
                          className="w-full gap-2"
                        >
                          <Vote className="h-4 w-4" />
                          {relayStatus === "awaiting" ? "Awaiting Relay..." : isRecoverySent ? "Recovery Already Sent" : "Submit Vote"}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Success Message */}
              {success && !showVoteForm && (
                <Card>
                  <CardContent className="py-6">
                    <div className="text-center">
                      <CheckCircle className="h-12 w-12 text-green-400 mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-white mb-2">
                        Vote Submitted
                      </h3>
                      <p className="text-sm text-zinc-400">
                        {success}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Info Section */}
              <Card className="bg-zinc-900/80">
                <CardContent className="py-6">
                  <h3 className="text-white font-medium mb-4">How Guardian Voting Works</h3>
                  <div className="grid gap-4 md:grid-cols-3 text-sm">
                    <div>
                      <div className="flex items-center gap-2 text-blue-400 mb-2">
                        <div className="h-6 w-6 rounded-full bg-blue-900/50 flex items-center justify-center text-xs">1</div>
                        <span className="font-medium">Vote</span>
                      </div>
                      <p className="text-zinc-400">
                        Submit your vote for a new owner. Your identity stays completely private.
                      </p>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 text-blue-400 mb-2">
                        <div className="h-6 w-6 rounded-full bg-blue-900/50 flex items-center justify-center text-xs">2</div>
                        <span className="font-medium">Threshold</span>
                      </div>
                      <p className="text-zinc-400">
                        Other guardians vote for the same address. Once threshold is reached, recovery triggers automatically.
                      </p>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 text-blue-400 mb-2">
                        <div className="h-6 w-6 rounded-full bg-blue-900/50 flex items-center justify-center text-xs">3</div>
                        <span className="font-medium">Execute</span>
                      </div>
                      <p className="text-zinc-400">
                        Recovery message is sent via Wormhole to change Safe ownership on EVM.
                      </p>
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
