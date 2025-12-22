import { Fr, GrumpkinScalar } from "@aztec/aztec.js/fields";
import { createAztecNodeClient } from "@aztec/aztec.js/node";
import { TestWallet } from "@aztec/test-wallet/server";

async function main() {
  console.log("Connecting to Aztec devnet...");
  const node = createAztecNodeClient("https://devnet.aztec-labs.com");
  const wallet = await TestWallet.create(node);

  // Generate random keys for new wallet
  const secretKey = Fr.random();
  const signingKey = GrumpkinScalar.random();
  const salt = Fr.random();

  const account = await wallet.createSchnorrAccount(secretKey, salt, signingKey);

  console.log("\n========================================");
  console.log("New Aztec Wallet Address:");
  console.log(account.address.toString());
  console.log("========================================\n");
  console.log("(Note: This account is not deployed, just generated)");
}

main().catch(console.error);
