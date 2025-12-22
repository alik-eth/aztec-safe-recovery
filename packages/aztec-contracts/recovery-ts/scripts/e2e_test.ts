/**
 * E2E Test Script for ZK-7579 Recovery System
 *
 * PREREQUISITES:
 * 1. Start the relayer in a separate terminal:
 *    cd packages/relayer && ./relayer
 *    (with EVM_TARGET_CONTRACT=0x641a72f4B0BabE087A955aFeC6Da9E58bdB18643)
 *
 * This script tests the full recovery flow:
 * 1. Create a new Safe on Sepolia
 * 2. Enable SafeRecoveryModule on the Safe
 * 3. Deploy Aztec Recovery contract linked to this Safe
 * 4. Register Recovery contract as Wormhole emitter in SafeRecoveryModule
 * 5. Add Aztec wallet as guardian (threshold=1 for testing)
 * 6. Guardian votes for candidate → triggers Wormhole message
 * 7. Relayer picks up VAA and calls verify() on module
 * 8. Module executes recovery → candidate becomes Safe owner
 *
 * Key Wormhole Architecture:
 * - Aztec Chain ID: 56 for application messages
 * - Emitter: The RECOVERY CONTRACT is the emitter (not Wormhole Core)
 * - Payload: 133 bytes (txHash + compressed 31-byte LE fields)
 */

import { createPublicClient, createWalletClient, http, encodeFunctionData, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { Contract } from "@aztec/aztec.js/contracts";
import { AztecAddress, EthAddress } from "@aztec/aztec.js/addresses";
import { SponsoredFeePaymentMethod } from "@aztec/aztec.js/fee/testing";
import { SponsoredFPCContract } from "@aztec/noir-contracts.js/SponsoredFPC";
import { createLogger } from "@aztec/aztec.js/log";
import type { Logger } from "@aztec/aztec.js/log";

import { setupWallet } from "../utils/wallet.ts";
import { loadSchnorrAccount, deploySchnorrAccount } from "../utils/address.ts";
import { RecoveryContractArtifact } from "../utils/deployment.ts";
import { getSponsoredFPCInstance } from "../utils/fpc.ts";
import { readJson } from "../utils/utils.ts";

import * as path from "path";
import * as fs from "fs";

const logger: Logger = createLogger("e2e:recovery");

// Configuration (PRIVATE_KEY must be set via environment)
const SEPOLIA_RPC = process.env.EVM_RPC_URL || "https://0xrpc.io/sep";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
if (!PRIVATE_KEY) {
  throw new Error("PRIVATE_KEY environment variable is required");
}
const SAFE_RECOVERY_MODULE = process.env.SAFE_RECOVERY_MODULE || "0x641a72f4B0BabE087A955aFeC6Da9E58bdB18643";
const CHAIN_ID = 11155111n; // Sepolia

// Safe Factory addresses on Sepolia
const SAFE_PROXY_FACTORY = "0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2";
const SAFE_SINGLETON = "0xd9Db270c1B5E3Bd161E8c8503c55cEABeE709552";
const SAFE_FALLBACK_HANDLER = "0xf48f2B2d2a534e402487b3ee7C18c33Aec0Fe5e4";

// ABIs
const SAFE_PROXY_FACTORY_ABI = [
  {
    inputs: [
      { name: "_singleton", type: "address" },
      { name: "initializer", type: "bytes" },
      { name: "saltNonce", type: "uint256" }
    ],
    name: "createProxyWithNonce",
    outputs: [{ name: "proxy", type: "address" }],
    stateMutability: "nonpayable",
    type: "function"
  }
] as const;

const SAFE_ABI = [
  {
    inputs: [
      { name: "_owners", type: "address[]" },
      { name: "_threshold", type: "uint256" },
      { name: "to", type: "address" },
      { name: "data", type: "bytes" },
      { name: "fallbackHandler", type: "address" },
      { name: "paymentToken", type: "address" },
      { name: "payment", type: "uint256" },
      { name: "paymentReceiver", type: "address" }
    ],
    name: "setup",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{ name: "module", type: "address" }],
    name: "enableModule",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [],
    name: "getOwners",
    outputs: [{ type: "address[]" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "getThreshold",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ name: "module", type: "address" }],
    name: "isModuleEnabled",
    outputs: [{ type: "bool" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "data", type: "bytes" },
      { name: "operation", type: "uint8" },
      { name: "safeTxGas", type: "uint256" },
      { name: "baseGas", type: "uint256" },
      { name: "gasPrice", type: "uint256" },
      { name: "gasToken", type: "address" },
      { name: "refundReceiver", type: "address" },
      { name: "signatures", type: "bytes" }
    ],
    name: "execTransaction",
    outputs: [{ type: "bool" }],
    stateMutability: "payable",
    type: "function"
  },
  {
    inputs: [],
    name: "nonce",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "domainSeparator",
    outputs: [{ type: "bytes32" }],
    stateMutability: "view",
    type: "function"
  }
] as const;

async function checkRelayerBalance(publicClient: any, address: string): Promise<boolean> {
  const balance = await publicClient.getBalance({ address: address as `0x${string}` });
  const balanceEth = Number(balance) / 1e18;
  logger.info(`💰 Relayer balance: ${balanceEth.toFixed(6)} ETH`);

  if (balanceEth < 0.001) {
    logger.warn(`⚠️  Relayer balance is low! Need at least 0.001 ETH for gas.`);
    return false;
  }
  return true;
}

async function createSafe(
  walletClient: any,
  publicClient: any,
  owners: string[],
  threshold: number
): Promise<string> {
  logger.info("🏗️  Creating new Safe wallet...");
  logger.info(`   Owners: ${owners.join(", ")}`);
  logger.info(`   Threshold: ${threshold}`);

  // Encode Safe setup call
  const setupData = encodeFunctionData({
    abi: SAFE_ABI,
    functionName: "setup",
    args: [
      owners as `0x${string}`[],
      BigInt(threshold),
      "0x0000000000000000000000000000000000000000" as `0x${string}`, // to
      "0x" as `0x${string}`, // data
      SAFE_FALLBACK_HANDLER as `0x${string}`, // fallbackHandler
      "0x0000000000000000000000000000000000000000" as `0x${string}`, // paymentToken
      0n, // payment
      "0x0000000000000000000000000000000000000000" as `0x${string}` // paymentReceiver
    ]
  });

  // Generate a random salt
  const saltNonce = BigInt(Math.floor(Math.random() * 1000000000));

  // Create Safe proxy
  const { request } = await publicClient.simulateContract({
    address: SAFE_PROXY_FACTORY as `0x${string}`,
    abi: SAFE_PROXY_FACTORY_ABI,
    functionName: "createProxyWithNonce",
    args: [SAFE_SINGLETON as `0x${string}`, setupData, saltNonce],
    account: walletClient.account,
  });

  const hash = await walletClient.writeContract(request);
  logger.info(`   Transaction hash: ${hash}`);

  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  // Parse the ProxyCreation event to get the Safe address
  // Event signature: ProxyCreation(address proxy, address singleton)
  // The addresses are in the data field (not indexed): first 32 bytes = proxy, second 32 bytes = singleton
  let safeAddress: string | null = null;

  // Method 1: Find ProxyCreation event from the factory
  const proxyCreationLog = receipt.logs.find(
    (log: any) => log.topics && log.topics[0] === "0x4f51faf6c4561ff95f067657e43439f0f856d97c04d9ec9070a6199ad418e235"
  );

  if (proxyCreationLog && proxyCreationLog.data && proxyCreationLog.data.length >= 66) {
    // Data format: 0x + 64 hex chars (proxy address padded to 32 bytes) + 64 hex chars (singleton)
    // Extract proxy address: bytes 12-32 of first 32 bytes (skip 0x prefix and 24 zeros)
    safeAddress = "0x" + proxyCreationLog.data.slice(26, 66);
  } else {
    // Method 2: The Safe address is the emitter of the SafeSetup event (first log usually)
    // Find a log that's NOT from the factory
    const nonFactoryLog = receipt.logs.find((log: any) =>
      log.address.toLowerCase() !== SAFE_PROXY_FACTORY.toLowerCase()
    );
    if (nonFactoryLog) {
      safeAddress = nonFactoryLog.address;
    }
  }

  if (!safeAddress) {
    logger.warn("Could not parse Safe address from logs");
    logger.info(`Receipt logs: ${JSON.stringify(receipt.logs.map((l: any) => ({ address: l.address, topics: l.topics, data: l.data?.slice(0, 130) })), null, 2)}`);
    throw new Error("Could not determine Safe address from transaction receipt");
  }

  logger.info(`✅ Safe created at: ${safeAddress}`);

  return safeAddress;
}

const SAFE_RECOVERY_MODULE_ABI = [
  {
    inputs: [{ name: "aztecContract", type: "bytes32" }],
    name: "setAztecRecoveryContract",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  }
] as const;

async function registerAztecContract(
  walletClient: any,
  publicClient: any,
  safeAddress: string,
  moduleAddress: string,
  aztecContractAddress: string
): Promise<void> {
  logger.info("📝 Registering Aztec Recovery contract with SafeRecoveryModule...");
  logger.info(`   Aztec contract: ${aztecContractAddress}`);

  // Aztec addresses are already 32 bytes (0x + 64 hex chars)
  const aztecBytes32 = aztecContractAddress as `0x${string}`;
  logger.info(`   As bytes32: ${aztecBytes32}`);

  // Encode the setAztecRecoveryContract call
  const setAztecData = encodeFunctionData({
    abi: SAFE_RECOVERY_MODULE_ABI,
    functionName: "setAztecRecoveryContract",
    args: [aztecBytes32]
  });

  // Get Safe nonce
  const nonce = await publicClient.readContract({
    address: safeAddress as `0x${string}`,
    abi: SAFE_ABI,
    functionName: "nonce"
  });

  // Create pre-approved signature
  const ownerAddress = walletClient.account.address.toLowerCase().slice(2);
  const r = "000000000000000000000000" + ownerAddress;
  const s = "0".repeat(64);
  const v = "01";
  const signature = r + s + v;

  // Execute Safe transaction to call setAztecRecoveryContract on the module
  const { request } = await publicClient.simulateContract({
    address: safeAddress as `0x${string}`,
    abi: SAFE_ABI,
    functionName: "execTransaction",
    args: [
      moduleAddress as `0x${string}`, // to (module)
      0n, // value
      setAztecData, // data
      0, // operation (Call)
      0n, // safeTxGas
      0n, // baseGas
      0n, // gasPrice
      "0x0000000000000000000000000000000000000000" as `0x${string}`, // gasToken
      "0x0000000000000000000000000000000000000000" as `0x${string}`, // refundReceiver
      ("0x" + signature) as `0x${string}` // signatures
    ],
    account: walletClient.account
  });

  const hash = await walletClient.writeContract(request);
  logger.info(`   Transaction hash: ${hash}`);

  await publicClient.waitForTransactionReceipt({ hash });
  logger.info(`✅ Aztec Recovery contract registered`);
}

async function enableModule(
  walletClient: any,
  publicClient: any,
  safeAddress: string,
  moduleAddress: string
): Promise<void> {
  logger.info("🔧 Enabling SafeRecoveryModule on Safe...");

  // For a 1-of-1 Safe where we are the owner, we can directly call execTransaction
  // First, encode the enableModule call
  const enableModuleData = encodeFunctionData({
    abi: SAFE_ABI,
    functionName: "enableModule",
    args: [moduleAddress as `0x${string}`]
  });

  // Get domain separator and nonce for signing
  const [nonce, domainSeparator] = await Promise.all([
    publicClient.readContract({
      address: safeAddress as `0x${string}`,
      abi: SAFE_ABI,
      functionName: "nonce"
    }),
    publicClient.readContract({
      address: safeAddress as `0x${string}`,
      abi: SAFE_ABI,
      functionName: "domainSeparator"
    })
  ]);

  // Prepare Safe transaction hash
  // For simplicity with 1-of-1 Safe, we use pre-approved signature format
  // r = owner address padded to 32 bytes, s = 0 (32 bytes), v = 1 (approved hash)
  const ownerAddress = walletClient.account.address.toLowerCase().slice(2); // Remove 0x prefix
  // r: 32 bytes with address right-padded (address goes in last 20 bytes of 32)
  const r = "000000000000000000000000" + ownerAddress;
  // s: 32 bytes of zeros
  const s = "0".repeat(64);
  // v: 1 byte, value 1 for pre-approved
  const v = "01";
  const signature = r + s + v;

  // Execute the Safe transaction
  const { request } = await publicClient.simulateContract({
    address: safeAddress as `0x${string}`,
    abi: SAFE_ABI,
    functionName: "execTransaction",
    args: [
      safeAddress as `0x${string}`, // to (self)
      0n, // value
      enableModuleData, // data
      0, // operation (Call)
      0n, // safeTxGas
      0n, // baseGas
      0n, // gasPrice
      "0x0000000000000000000000000000000000000000" as `0x${string}`, // gasToken
      "0x0000000000000000000000000000000000000000" as `0x${string}`, // refundReceiver
      ("0x" + signature) as `0x${string}` // signatures
    ],
    account: walletClient.account
  });

  const hash = await walletClient.writeContract(request);
  logger.info(`   Transaction hash: ${hash}`);

  await publicClient.waitForTransactionReceipt({ hash });

  // Verify module is enabled
  const isEnabled = await publicClient.readContract({
    address: safeAddress as `0x${string}`,
    abi: SAFE_ABI,
    functionName: "isModuleEnabled",
    args: [moduleAddress as `0x${string}`]
  });

  if (!isEnabled) {
    throw new Error("Module was not enabled successfully");
  }

  logger.info(`✅ SafeRecoveryModule enabled on Safe`);
}

async function deployAztecRecovery(
  wallet: any,
  safeAddress: string,
  candidateAddress: string,
  wormholeAddress: AztecAddress,
  ownerAddress: AztecAddress
): Promise<Contract> {
  logger.info("🚀 Deploying Aztec Recovery contract...");
  logger.info(`   Safe: ${safeAddress}`);
  logger.info(`   Candidate: ${candidateAddress}`);
  logger.info(`   Chain ID: ${CHAIN_ID}`);

  const sponsoredFPC = await getSponsoredFPCInstance();
  await wallet.registerContract({
    instance: sponsoredFPC,
    artifact: SponsoredFPCContract.artifact,
  });
  const sponsoredPaymentMethod = new SponsoredFeePaymentMethod(sponsoredFPC.address);

  // Deploy Recovery contract
  // Constructor: owner, wormhole_address, chain_id, safe_address, destination_address, threshold
  const recovery = await Contract.deploy(wallet, RecoveryContractArtifact, [
    ownerAddress,
    wormholeAddress,
    CHAIN_ID,
    EthAddress.fromString(safeAddress),
    EthAddress.fromString(SAFE_RECOVERY_MODULE), // destination is the module
    1 // threshold of 1 for testing (single vote triggers Wormhole)
  ])
    .send({ from: ownerAddress, fee: { paymentMethod: sponsoredPaymentMethod } })
    .deployed();

  await wallet.registerContract({
    instance: recovery.instance,
    artifact: RecoveryContractArtifact,
  });

  logger.info(`✅ Aztec Recovery deployed at: ${recovery.address.toString()}`);
  return recovery;
}

async function waitForRecovery(
  publicClient: any,
  safeAddress: string,
  candidateAddress: string,
  timeoutMs: number = 300000
): Promise<boolean> {
  logger.info(`⏳ Waiting for recovery to complete (timeout: ${timeoutMs / 1000}s)...`);
  logger.info(`   Expecting ${candidateAddress} to become owner of ${safeAddress}`);

  const startTime = Date.now();
  const pollInterval = 10000; // 10 seconds

  while (Date.now() - startTime < timeoutMs) {
    try {
      const owners = await publicClient.readContract({
        address: safeAddress as `0x${string}`,
        abi: SAFE_ABI,
        functionName: "getOwners"
      });

      const isOwner = (owners as string[]).some(
        (owner) => owner.toLowerCase() === candidateAddress.toLowerCase()
      );

      if (isOwner) {
        logger.info(`✅ Recovery successful! ${candidateAddress} is now a Safe owner.`);
        logger.info(`   Current owners: ${(owners as string[]).join(", ")}`);
        return true;
      }

      logger.info(`   Still waiting... Current owners: ${(owners as string[]).join(", ")}`);
    } catch (err) {
      logger.warn(`   Error checking owners: ${err}`);
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  logger.error(`❌ Timeout waiting for recovery`);
  return false;
}

async function main() {
  logger.info("═══════════════════════════════════════════════════════════════");
  logger.info("       ZK-7579 Recovery E2E Test");
  logger.info("═══════════════════════════════════════════════════════════════");

  // Setup EVM clients
  const account = privateKeyToAccount(PRIVATE_KEY as Hex);
  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(SEPOLIA_RPC)
  });
  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(SEPOLIA_RPC)
  });

  logger.info(`📍 EVM Account: ${account.address}`);
  logger.info(`📍 SafeRecoveryModule: ${SAFE_RECOVERY_MODULE}`);

  // Check relayer balance
  const hasBalance = await checkRelayerBalance(publicClient, account.address);
  if (!hasBalance) {
    throw new Error("Insufficient relayer balance");
  }

  // Setup Aztec wallet
  logger.info("\n🔐 Setting up Aztec wallets...");
  const aztecWallet = await setupWallet();

  // Load or create Aztec accounts
  let wallet0, wallet1;
  try {
    wallet0 = await loadSchnorrAccount(aztecWallet, "wallet0");
    logger.info(`   wallet0: ${wallet0.address.toString()}`);
  } catch {
    logger.info("   Creating wallet0...");
    wallet0 = await deploySchnorrAccount(aztecWallet, "wallet0");
  }

  try {
    wallet1 = await loadSchnorrAccount(aztecWallet, "wallet1");
    logger.info(`   wallet1: ${wallet1.address.toString()}`);
  } catch {
    logger.info("   Creating wallet1...");
    wallet1 = await deploySchnorrAccount(aztecWallet, "wallet1");
  }

  // Load wormhole address
  const WORMHOLE_ADDRESS_FILE = path.join(process.cwd(), "../config/wormhole.json");
  const wormholeAddressString = readJson<{ wormhole: string }>(WORMHOLE_ADDRESS_FILE)?.wormhole;
  if (!wormholeAddressString) {
    throw new Error(`wormhole.json missing at ${WORMHOLE_ADDRESS_FILE}`);
  }
  const wormholeAddress = AztecAddress.fromString(wormholeAddressString);
  logger.info(`   Wormhole: ${wormholeAddress.toString()}`);

  // Step 1: Create Safe
  logger.info("\n📦 STEP 1: Create Sepolia Safe");
  const safeAddress = await createSafe(walletClient, publicClient, [account.address], 1);

  // Step 2: Enable SafeRecoveryModule
  logger.info("\n📦 STEP 2: Enable SafeRecoveryModule");
  await enableModule(walletClient, publicClient, safeAddress, SAFE_RECOVERY_MODULE);

  // Step 3: Deploy Aztec Recovery contract
  logger.info("\n📦 STEP 3: Deploy Aztec Recovery Contract");

  // Generate a random candidate address for testing
  const candidateAddress = "0x" + [...Array(40)].map(() => Math.floor(Math.random() * 16).toString(16)).join("");
  logger.info(`   Test candidate: ${candidateAddress}`);

  const recovery = await deployAztecRecovery(
    aztecWallet,
    safeAddress,
    candidateAddress,
    wormholeAddress,
    wallet0.address
  );

  // Save recovery address for reference
  const recoveryAddressFile = path.join(process.cwd(), "../config/e2e_recovery.json");
  fs.writeFileSync(recoveryAddressFile, JSON.stringify({
    recovery: recovery.address.toString(),
    safe: safeAddress,
    candidate: candidateAddress,
    timestamp: new Date().toISOString()
  }, null, 2));

  // Step 4: Register Aztec Recovery contract with SafeRecoveryModule
  // IMPORTANT: The emitter in VAAs is the RECOVERY CONTRACT (the calling contract),
  // not the Wormhole Core. When publish_message is called, the caller becomes the emitter.
  // Chain 56 = Aztec application messages (chain 26 = internal heartbeats)
  logger.info("\n📦 STEP 4: Register Recovery Contract Emitter with Module");
  logger.info(`   Recovery contract emitter: ${recovery.address.toString()}`);
  await registerAztecContract(
    walletClient,
    publicClient,
    safeAddress,
    SAFE_RECOVERY_MODULE,
    recovery.address.toString()
  );

  // Step 5: Add guardian (only 1 needed with threshold=1)
  logger.info("\n📦 STEP 5: Add Guardian");

  const sponsoredFPCForGuardians = await getSponsoredFPCInstance();
  const sponsoredPaymentForGuardians = new SponsoredFeePaymentMethod(sponsoredFPCForGuardians.address);

  // Add wallet0 as guardian
  logger.info(`   Adding wallet0 as guardian...`);
  await recovery.methods
    .add_guardian(wallet0.address, 1n)
    .send({ from: wallet0.address, fee: { paymentMethod: sponsoredPaymentForGuardians } })
    .wait({ timeout: 180000 });
  logger.info("   ✅ Guardian added");

  // Verify guardian count
  const guardianCount = await recovery.methods.get_guardian_count().simulate({ from: wallet0.address });
  logger.info(`   Guardian count: ${guardianCount}`);

  // Step 6: Guardians vote
  logger.info("\n📦 STEP 6: Guardian Voting");

  // Setup sponsored fee payment
  const sponsoredFPC = await getSponsoredFPCInstance();
  const sponsoredPaymentMethod = new SponsoredFeePaymentMethod(sponsoredFPC.address);
  const candidate = EthAddress.fromString(candidateAddress);

  // Guardian 0 votes (with threshold=1, this triggers Wormhole message)
  logger.info(`🗳️  Guardian 0 voting (threshold=1, should trigger Wormhole message)...`);
  await recovery.methods
    .vote(candidate)
    .send({ from: wallet0.address, fee: { paymentMethod: sponsoredPaymentMethod } })
    .wait({ timeout: 180000 });
  logger.info(`✅ Guardian 0 vote submitted`);

  // Check vote count
  let voteCount = await recovery.methods.get_vote_count(EthAddress.fromString(candidateAddress)).simulate({ from: wallet0.address });
  logger.info(`   Current vote count: ${voteCount}`);

  // Check if recovery was sent
  const recoverySent = await recovery.methods.is_recovery_sent(EthAddress.fromString(candidateAddress)).simulate({ from: wallet0.address });
  logger.info(`   Recovery sent: ${recoverySent}`);

  // Step 7: Wait for Relayer to Process VAA
  logger.info("\n📦 STEP 7: Wait for Recovery");
  logger.info("   The relayer will pick up the Wormhole VAA and call verify() on the module");

  // Wormhole devnet can take up to 20 minutes for guardian signatures
  const success = await waitForRecovery(publicClient, safeAddress, candidateAddress, 1200000);

  // Final summary
  logger.info("\n═══════════════════════════════════════════════════════════════");
  logger.info("       E2E TEST SUMMARY");
  logger.info("═══════════════════════════════════════════════════════════════");
  logger.info(`   Safe Address: ${safeAddress}`);
  logger.info(`   Recovery Contract: ${recovery.address.toString()}`);
  logger.info(`   Candidate: ${candidateAddress}`);
  logger.info(`   Result: ${success ? "✅ SUCCESS" : "❌ FAILED"}`);
  logger.info("═══════════════════════════════════════════════════════════════");

  if (!success) {
    process.exit(1);
  }
}

main().catch((err) => {
  logger.error(`E2E Test failed: ${err}`);
  console.error(err);
  process.exit(1);
});
