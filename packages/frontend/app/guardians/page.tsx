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
import { formatAztecAddress, isValidAztecAddress, patchArtifact } from "@/lib/aztec";
import { shortenAddress } from "@/lib/utils";
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import {
  Shield,
  Users,
  CheckCircle,
  AlertCircle,
  UserPlus,
  Crown,
  ArrowRight,
  Wallet,
  Loader2,
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

export default function GuardiansPage() {
  const { isInSafeContext, safeInfo } = useSafeApps();
  const { disconnect: disconnectAzguard } = useAzguard();
  const [aztecWallet, setAztecWallet] = useState<AztecWallet | null>(null);
  const [aztecAddress, setAztecAddress] = useState<string | null>(null);
  const [contractAddress, setContractAddress] = useState("");
  const [safeAddress, setSafeAddress] = useState<string | null>(null);
  const [threshold, setThreshold] = useState<number | null>(null);
  const [isLoadingFromSafe, setIsLoadingFromSafe] = useState(false);
  const [safeInputAddress, setSafeInputAddress] = useState("");

  const [isAddingGuardian, setIsAddingGuardian] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [isOwner, setIsOwner] = useState<boolean | null>(null);
  const [isGuardian, setIsGuardian] = useState<boolean | null>(null);
  const [guardianCount, setGuardianCount] = useState<number | null>(null);
  const [newGuardianAddress, setNewGuardianAddress] = useState("");
  const [newGuardianAlias, setNewGuardianAlias] = useState("");
  const [guardianRecords, setGuardianRecords] = useState<Array<{ guardian: string; alias: string }>>([]);
  const [isLoadingRecords, setIsLoadingRecords] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleDisconnect = () => {
    disconnectAzguard();
    setAztecWallet(null);
    setAztecAddress(null);
    setContractAddress("");
    setSafeAddress(null);
    setThreshold(null);
    setGuardianRecords([]);
    setGuardianCount(null);
    setIsOwner(null);
    setIsGuardian(null);
  };

  // Auto-detect Safe address from Safe{Wallet} context
  useEffect(() => {
    if (isInSafeContext && safeInfo?.safeAddress && !safeInputAddress) {
      setSafeInputAddress(safeInfo.safeAddress);
    }
  }, [isInSafeContext, safeInfo, safeInputAddress]);

  // Load Aztec contract address from SafeRecoveryModule when Safe address is available
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

      // bytes32 of 0x0 means not registered
      if (aztecContractBytes && aztecContractBytes !== "0x0000000000000000000000000000000000000000000000000000000000000000") {
        setContractAddress(aztecContractBytes);
      } else {
        setError("No Aztec recovery contract found for this Safe. Set up recovery first.");
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

  const checkStatus = async () => {
    if (!aztecWallet || !contractAddress) return;

    setIsCheckingStatus(true);
    setError(null);
    setIsOwner(null);
    setIsGuardian(null);
    setGuardianCount(null);
    setSafeAddress(null);
    setThreshold(null);

    try {
      const { AztecAddress } = await import("@aztec/aztec.js/addresses");
      const { Contract } = await import("@aztec/aztec.js/contracts");
      const { recoveryArtifact: artifact } = await import("@/lib/recoveryArtifact");

      const contractAddr = AztecAddress.fromString(contractAddress);

      // Try to register contract (may fail if already registered with different artifact)
      try {
        await aztecWallet.registerContract(contractAddr, artifact);
      } catch (regErr) {
        console.warn("Contract registration warning:", regErr);
        // Continue anyway - contract may already be registered
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

      // Check guardian status (pass caller's address)
      const guardianResult = await contract.methods.is_guardian(walletAddress).simulate({ from: walletAddress });

      // Unwrap boolean - Aztec may return wrapped value like { inner: true } or direct boolean
      let isGuardianBool = false;
      if (typeof guardianResult === 'boolean') {
        isGuardianBool = guardianResult;
      } else if (guardianResult && typeof guardianResult === 'object') {
        // Check for .inner (common Aztec wrapper)
        if (typeof (guardianResult as any).inner === 'boolean') {
          isGuardianBool = (guardianResult as any).inner;
        } else if (typeof (guardianResult as any).value === 'boolean') {
          isGuardianBool = (guardianResult as any).value;
        } else {
          // Try to coerce - non-zero/non-empty means true
          isGuardianBool = Boolean(guardianResult);
        }
      }
      console.log("is_guardian result:", guardianResult, "-> parsed:", isGuardianBool);
      setIsGuardian(isGuardianBool);

      // Get guardian count (private - only visible notes)
      const countResult = await contract.methods.get_guardian_count().simulate({ from: walletAddress });
      setGuardianCount(Number(countResult));

      // Don't set isOwner here - it will be determined by loadGuardianRecords
      // If user can successfully call get_my_guardian_records(), they are the owner

    } catch (err) {
      console.error("Error checking status:", err);
      setError(err instanceof Error ? err.message : "Failed to check status");
    } finally {
      setIsCheckingStatus(false);
    }
  };

  // Load guardian records when contract is loaded (for owner)
  const handleLoadContract = async () => {
    await checkStatus();
    // Try to load guardian records - this determines if user is owner
    await loadGuardianRecords();
  };

  const handleAddGuardian = async () => {
    if (!aztecWallet || !newGuardianAddress || !contractAddress) return;

    setIsAddingGuardian(true);
    setError(null);
    setSuccess(null);

    try {
      const { AztecAddress } = await import("@aztec/aztec.js/addresses");
      const { Contract } = await import("@aztec/aztec.js/contracts");
      const { SponsoredFeePaymentMethod } = await import("@aztec/aztec.js/fee/testing");
      const { Fr } = await import("@aztec/aztec.js/fields");
      const { getContractInstanceFromInstantiationParams } = await import("@aztec/aztec.js/contracts");
      const { SponsoredFPCContract } = await import("@aztec/noir-contracts.js/SponsoredFPC");
      const { recoveryArtifact: artifact } = await import("@/lib/recoveryArtifact");

      const contractAddr = AztecAddress.fromString(contractAddress);
      const guardianAztecAddress = AztecAddress.fromString(newGuardianAddress);

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

      // Convert alias to Field (simple hash for now - first 31 bytes of string)
      const aliasField = newGuardianAlias
        ? new Fr(BigInt('0x' + Buffer.from(newGuardianAlias.slice(0, 31).padEnd(31, '\0')).toString('hex')))
        : new Fr(0n);

      // Add guardian with alias (only owner can do this)
      const receipt = await contract.methods
        .add_guardian(guardianAztecAddress, aliasField)
        .send({
          fee: { paymentMethod: sponsoredPaymentMethod },
          from: walletAddress,
        })
        .wait();

      console.log("Guardian added:", receipt);
      const aliasDisplay = newGuardianAlias ? ` (${newGuardianAlias})` : '';
      setSuccess(`Guardian added: ${formatAztecAddress(newGuardianAddress, 8)}${aliasDisplay}`);
      setNewGuardianAddress("");
      setNewGuardianAlias("");

      // Refresh status and records
      await checkStatus();
      await loadGuardianRecords();

    } catch (err) {
      console.error("Error adding guardian:", err);
      const message = err instanceof Error ? err.message : "Failed to add guardian";
      if (message.includes("Not owner")) {
        setError("You are not the owner of this recovery contract");
        setIsOwner(false);
      } else if (message.includes("already exists") || message.includes("Guardian already exists")) {
        setError("This guardian is already registered");
      } else {
        setError(message);
      }
    } finally {
      setIsAddingGuardian(false);
    }
  };

  const loadGuardianRecords = async () => {
    if (!aztecWallet || !contractAddress) return;

    setIsLoadingRecords(true);

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

      const contract = await Contract.at(contractAddr, artifact, aztecWallet);

      const accounts = await aztecWallet.getAccounts();
      const walletAddress = accounts[0].item;

      // Get guardian records (only works for owner)
      const records = await contract.methods.get_my_guardian_records().simulate({ from: walletAddress });

      console.log("Guardian records raw:", records);
      console.log("Guardian records type:", typeof records);
      console.log("Guardian records keys:", records ? Object.keys(records) : 'null');
      console.log("Guardian records JSON:", JSON.stringify(records, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2));

      // Parse records - each record has guardian (AztecAddress) and alias (Field)
      const parsed: Array<{ guardian: string; alias: string }> = [];

      // Handle BoundedVec which has { storage: [...], len: N }
      let recordsArray: any[] = [];
      let recordsLen = 0;

      if (records && typeof records === 'object' && (records as any).storage) {
        recordsArray = (records as any).storage;
        recordsLen = Number((records as any).len) || 0;
      } else if (Array.isArray(records)) {
        recordsArray = records;
        recordsLen = records.length;
      }

      console.log("Records array length:", recordsLen, "storage length:", recordsArray.length);

      // Only process the first 'len' records (rest are zero-padding)
      for (let i = 0; i < recordsLen && i < recordsArray.length; i++) {
        const record = recordsArray[i];
        if (record && record.guardian) {
          const guardianAddr = typeof record.guardian === 'string'
            ? record.guardian
            : (record.guardian.toString?.() || String(record.guardian));

          // Skip zero addresses
          if (guardianAddr === '0x0000000000000000000000000000000000000000000000000000000000000000') {
            continue;
          }

          console.log("Processing record:", i, guardianAddr);

          // Convert alias field back to string
          let aliasStr = '';
          if (record.alias) {
            try {
              const aliasBigInt = typeof record.alias === 'bigint'
                ? record.alias
                : BigInt(record.alias.toString?.() || '0');
              if (aliasBigInt > 0n) {
                const hex = aliasBigInt.toString(16).padStart(62, '0');
                const bytes = Buffer.from(hex, 'hex');
                aliasStr = bytes.toString('utf8').replace(/\0/g, '').trim();
              }
            } catch (e) {
              console.warn("Could not parse alias:", e);
            }
          }
          parsed.push({ guardian: guardianAddr, alias: aliasStr });
        }
      }

      setGuardianRecords(parsed);
      // If we successfully got guardian records, user is the owner
      setIsOwner(true);

    } catch (err) {
      console.error("Error loading guardian records:", err);
      const errorMsg = err instanceof Error ? err.message : String(err);
      // If error is "Not owner", user is not the owner - this is expected
      if (errorMsg.includes("Not owner") || errorMsg.includes("caller == owner")) {
        setIsOwner(false);
      }
      // Other errors - don't change owner status, might be network issue
    } finally {
      setIsLoadingRecords(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-900 to-black">
      <Header />

      <main className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">Guardian Management</h1>
          <p className="mt-2 text-zinc-400">
            Add and manage guardians for your Safe on Aztec
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
                            setIsOwner(null);
                            setIsGuardian(null);
                            setGuardianCount(null);
                            setSafeAddress(null);
                            setThreshold(null);
                            setError(null);
                            setSuccess(null);
                          }}
                          className="flex-1 font-mono text-sm"
                        />
                        <Button
                          onClick={handleLoadContract}
                          isLoading={isCheckingStatus || isLoadingRecords}
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
                          <p className="text-white">{threshold} guardian(s)</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Status Cards */}
              {safeAddress && (isOwner !== null || isGuardian !== null || guardianCount !== null) && (
                <div className="grid gap-4 md:grid-cols-3">
                  <Card>
                    <CardContent className="py-6">
                      <div className="flex items-center gap-4">
                        <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${
                          isOwner ? "bg-yellow-900/30" : "bg-zinc-800"
                        }`}>
                          <Crown className={`h-6 w-6 ${isOwner ? "text-yellow-400" : "text-zinc-500"}`} />
                        </div>
                        <div>
                          <p className="text-lg font-semibold text-white">
                            {isOwner ? "Owner" : "Not Owner"}
                          </p>
                          <p className="text-sm text-zinc-400">On Aztec</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="py-6">
                      <div className="flex items-center gap-4">
                        <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${
                          isGuardian ? "bg-green-900/30" : "bg-zinc-800"
                        }`}>
                          {isGuardian ? (
                            <CheckCircle className="h-6 w-6 text-green-400" />
                          ) : (
                            <Shield className="h-6 w-6 text-zinc-500" />
                          )}
                        </div>
                        <div>
                          <p className="text-lg font-semibold text-white">
                            {isGuardian ? "Guardian" : "Not Guardian"}
                          </p>
                          <p className="text-sm text-zinc-400">For this Safe</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="py-6">
                      <div className="flex items-center gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-900/30">
                          <Users className="h-6 w-6 text-blue-400" />
                        </div>
                        <div>
                          <p className="text-2xl font-bold text-white">
                            {guardianCount ?? "?"}
                          </p>
                          <p className="text-sm text-zinc-400">Total Guardians</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Guardian List (only visible to owner) */}
              {isOwner && guardianRecords.length > 0 && (
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-900/30">
                        <Users className="h-6 w-6 text-green-400" />
                      </div>
                      <div>
                        <CardTitle>Your Guardians</CardTitle>
                        <CardDescription>
                          Guardians you&apos;ve added (only visible to you)
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {guardianRecords.map((record, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/50"
                        >
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-green-900/30 flex items-center justify-center">
                              <Shield className="h-4 w-4 text-green-400" />
                            </div>
                            <div>
                              {record.alias && (
                                <p className="text-sm font-medium text-white">{record.alias}</p>
                              )}
                              <p className="font-mono text-xs text-zinc-400">
                                {formatAztecAddress(record.guardian, 8)}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Add Guardian (only if owner) */}
              {isOwner && (
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-900/30">
                        <UserPlus className="h-6 w-6 text-purple-400" />
                      </div>
                      <div>
                        <CardTitle>Add Guardian</CardTitle>
                        <CardDescription>
                          Add a new guardian by their Aztec address
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <Input
                        placeholder="Guardian Aztec address (0x... 64 chars)"
                        value={newGuardianAddress}
                        onChange={(e) => setNewGuardianAddress(e.target.value)}
                        className="font-mono text-sm"
                      />

                      {newGuardianAddress && !isValidAztecAddress(newGuardianAddress) && (
                        <p className="text-sm text-yellow-400">
                          Aztec addresses are 64 hex characters (0x + 64 chars)
                        </p>
                      )}

                      <Input
                        placeholder="Alias (optional, e.g., 'Alice', 'Bob')"
                        value={newGuardianAlias}
                        onChange={(e) => setNewGuardianAlias(e.target.value.slice(0, 31))}
                        className="text-sm"
                      />
                      <p className="text-xs text-zinc-500">
                        Give your guardian a name so you remember who they are
                      </p>

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

                      <Button
                        onClick={handleAddGuardian}
                        isLoading={isAddingGuardian}
                        disabled={!newGuardianAddress || !isValidAztecAddress(newGuardianAddress)}
                        className="w-full"
                      >
                        Add Guardian
                      </Button>

                      <p className="text-xs text-zinc-500 text-center">
                        Share your friend&apos;s Aztec address to add them as a guardian.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Not Owner Message */}
              {isOwner === false && !isGuardian && (
                <Card>
                  <CardContent className="py-6">
                    <div className="text-center">
                      <AlertCircle className="h-12 w-12 text-yellow-400 mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-white mb-2">
                        Not the Owner
                      </h3>
                      <p className="text-sm text-zinc-400 mb-4">
                        Only the contract owner can add guardians.
                        Make sure you&apos;re using the same Aztec wallet that deployed this contract.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Guardian Portal Link */}
              {isGuardian && (
                <Card>
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-900/30">
                          <CheckCircle className="h-6 w-6 text-green-400" />
                        </div>
                        <div>
                          <p className="font-medium text-white">You are a Guardian</p>
                          <p className="text-sm text-zinc-400">Vote on recovery requests</p>
                        </div>
                      </div>
                      <Button
                        variant="secondary"
                        onClick={() => window.location.href = "/guardian"}
                        className="gap-2"
                      >
                        Guardian Portal
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
