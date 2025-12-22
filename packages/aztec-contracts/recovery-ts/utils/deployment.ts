import { SponsoredFeePaymentMethod } from "@aztec/aztec.js/fee/testing";
import RecoveryJson from "../../recovery/target/recovery-Recovery.json" with { type: "json" };
import { getSponsoredFPCInstance } from "./fpc.ts";
import {
  loadContractArtifact,
  type NoirCompiledContract,
  type ContractArtifact,
} from "@aztec/aztec.js/abi";
import { AztecAddress, EthAddress } from "@aztec/aztec.js/addresses";
import {
  Contract,
  type ContractInstanceWithAddress,
  type DeployOptions,
  getContractInstanceFromInstantiationParams,
} from "@aztec/aztec.js/contracts";
import { type Logger, createLogger } from "@aztec/aztec.js/log";
import { TestWallet } from "@aztec/test-wallet/server";
import { SponsoredFPCContract } from "@aztec/noir-contracts.js/SponsoredFPC";
import { Fr } from "@aztec/aztec.js/fields";

import * as fs from "fs";

const logger: Logger = createLogger("aztec:deployment");

export const RecoveryContractArtifact = loadContractArtifact(
  RecoveryJson as NoirCompiledContract,
);

export interface RecoveryDeploymentArgs {
  ownerAddress: AztecAddress;
  wormholeAddress: AztecAddress;
  chainId: bigint;
  safeAddress: EthAddress;
  destinationAddress: EthAddress;
  threshold?: number;
}

export async function deployRecovery(
  wallet: TestWallet,
  recoveryAddressFile: string,
  recoveryParamsFile: string,
  options: DeployOptions,
  args: RecoveryDeploymentArgs,
): Promise<Contract> {
  const { ownerAddress, wormholeAddress, chainId, safeAddress, destinationAddress, threshold = 3 } = args;

  logger.info("Deploying Recovery contract...");
  logger.info(`  Owner: ${ownerAddress}`);
  logger.info(`  Wormhole: ${wormholeAddress}`);
  logger.info(`  Chain ID: ${chainId}`);
  logger.info(`  Safe Address: ${safeAddress}`);
  logger.info(`  Destination Address: ${destinationAddress}`);
  logger.info(`  Threshold: ${threshold}`);

  const sponsoredFPC = await getSponsoredFPCInstance();
  await wallet.registerContract({
    instance: sponsoredFPC,
    artifact: SponsoredFPCContract.artifact,
  });
  const sponsoredPaymentMethod = new SponsoredFeePaymentMethod(
    sponsoredFPC.address,
  );

  // Constructor: owner, wormhole_address, chain_id, safe_address, destination_address, threshold
  const recovery = await Contract.deploy(wallet, RecoveryContractArtifact, [
    ownerAddress,
    wormholeAddress,
    chainId,
    safeAddress,
    destinationAddress,
    threshold,
  ])
    .send({ ...options, fee: { paymentMethod: sponsoredPaymentMethod } })
    .deployed();
  await wallet.registerContract({
    instance: recovery.instance,
    artifact: RecoveryContractArtifact,
  });

  logger.info(`✅ Recovery deployed at ${recovery.address.toString()}`);

  const deploymentParams = {
    salt: recovery.instance.salt.toString(),
    deployer: recovery.instance.deployer.toString(),
    constructorArgs: [
      ownerAddress.toString(),
      wormholeAddress.toString(),
      chainId.toString(),
      safeAddress.toString(),
      destinationAddress.toString(),
      threshold.toString(),
    ],
  };

  fs.writeFileSync(
    recoveryAddressFile,
    JSON.stringify({ recovery: recovery.address.toString() }, null, 2),
  );
  fs.writeFileSync(
    recoveryParamsFile,
    JSON.stringify(deploymentParams, null, 2),
  );
  logger.info(`💾 Deployment parameters saved to ${recoveryParamsFile}`);

  return recovery;
}

export async function loadRecovery(
  paramsFilePath: string,
  artifact: ContractArtifact,
): Promise<ContractInstanceWithAddress> {
  return await getContractInstanceFromParamsFile(
    paramsFilePath,
    artifact,
    processRecoveryConstructorArgs,
  );
}

export async function getContractInstanceFromParamsFile(
  paramsFilePath: string,
  artifact: ContractArtifact,
  processConstructorArgs: (args: string[]) => any,
) {
  logger.info(`📦 Loading deployment parameters from ${paramsFilePath}...`);

  if (!fs.existsSync(paramsFilePath)) {
    throw new Error(
      `Deployment parameters file not found at ${paramsFilePath}`,
    );
  }

  const paramsJson = JSON.parse(fs.readFileSync(paramsFilePath, "utf-8"));
  const { salt, deployer, constructorArgs } = paramsJson;

  if (!salt || !deployer || !constructorArgs) {
    throw new Error(
      "Missing required deployment parameters (salt, deployer, constructorArgs)",
    );
  }

  logger.info("📦 Reconstructing contract instance from parameters...");

  const processedArgs = processConstructorArgs(constructorArgs);

  const instance = await getContractInstanceFromInstantiationParams(artifact, {
    constructorArgs: processedArgs,
    salt: Fr.fromString(salt),
    deployer: AztecAddress.fromString(deployer),
  });

  logger.info("✅ Contract instance reconstructed successfully");

  return instance;
}

function processRecoveryConstructorArgs(args: string[]): any[] {
  return [
    AztecAddress.fromString(args[0]),  // owner
    AztecAddress.fromString(args[1]),  // wormhole_address
    BigInt(args[2]),                   // chain_id
    EthAddress.fromString(args[3]),    // safe_address
    EthAddress.fromString(args[4]),    // destination_address
    Number(args[5]),                   // threshold
  ];
}
