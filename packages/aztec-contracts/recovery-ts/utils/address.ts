import { createLogger } from "@aztec/aztec.js/log";
import type { Logger } from "@aztec/aztec.js/log";
import { Fr, GrumpkinScalar } from "@aztec/aztec.js/fields";
import { SponsoredFeePaymentMethod } from "@aztec/aztec.js/fee/testing";
import { SponsoredFPCContract } from "@aztec/noir-contracts.js/SponsoredFPC";
import { getSponsoredFPCInstance } from "./fpc.ts";
import * as fs from "fs";
import * as path from "path";
import { AccountManager } from "@aztec/aztec.js/wallet";
import { TestWallet } from "@aztec/test-wallet/server";
import { AztecAddress } from "@aztec/aztec.js/addresses";

export async function deploySchnorrAccount(
  activeWallet: TestWallet,
  label: string,
  save: boolean = true,
): Promise<AccountManager> {
  const logger: Logger = createLogger("schnorr-account");

  logger.info("👤 Starting Schnorr account deployment...");

  logger.info("🔐 Generating account keys...");
  let secretKey = Fr.random();
  let signingKey = GrumpkinScalar.random();
  let salt = Fr.random();
  logger.info(`Save the following SECRET and SALT in .env for future use.`);
  logger.info(`🔑 Secret key generated: ${secretKey.toString()}`);
  logger.info(`🖊️ Signing key generated: ${signingKey.toString()}`);
  logger.info(`🧂 Salt generated: ${salt.toString()}`);

  logger.info("🏗️  Creating Schnorr account instance...");
  const account = await activeWallet.createSchnorrAccount(
    secretKey,
    salt,
    signingKey,
  );
  logger.info(`📍 Account address will be: ${account.address}`);

  const deployMethod = await account.getDeployMethod();

  // Setup sponsored FPC
  logger.info("💰 Setting up sponsored fee payment for account deployment...");
  const sponsoredFPC = await getSponsoredFPCInstance();
  logger.info(`💰 Sponsored FPC instance obtained at: ${sponsoredFPC.address}`);

  logger.info("📝 Registering sponsored FPC contract with PXE...");
  await activeWallet.registerContract({
    instance: sponsoredFPC,
    artifact: SponsoredFPCContract.artifact,
  });
  const sponsoredPaymentMethod = new SponsoredFeePaymentMethod(
    sponsoredFPC.address,
  );
  logger.info(
    "✅ Sponsored fee payment method configured for account deployment",
  );

  // Deploy account
  let tx = await deployMethod
    .send({
      from: AztecAddress.ZERO,
      fee: { paymentMethod: sponsoredPaymentMethod },
    })
    .wait({ timeout: 120000 });

  logger.info(`✅ Account deployment transaction successful!`);
  logger.info(`📋 Transaction hash: ${tx.txHash}`);

  if (save) {
    const accountData = {
      address: account.address.toString(),
      secret: secretKey.toString(),
      signingKey: signingKey.toString(),
      salt: salt.toString(),
    };

    const accountsFile = path.join(process.cwd(), `../config/${label}.json`);
    fs.writeFileSync(accountsFile, JSON.stringify(accountData, null, 2));
  }

  return account;
}

export async function loadSchnorrAccount(
  activeWallet: TestWallet,
  label: string,
) {
  const accountsFile = path.join(process.cwd(), `../config/${label}.json`);

  if (!fs.existsSync(accountsFile)) {
    throw new Error(`Account file ${accountsFile} not found`);
  }

  const accountData = JSON.parse(fs.readFileSync(accountsFile, "utf8"));

  const secretKey = Fr.fromString(accountData.secret);
  const signingKey = GrumpkinScalar.fromString(accountData.signingKey);
  const salt = Fr.fromString(accountData.salt);

  const account = await activeWallet.createSchnorrAccount(
    secretKey,
    salt,
    signingKey,
  );
  return account;
}
