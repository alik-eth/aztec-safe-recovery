import { deploySchnorrAccount } from "../utils/address.ts";
import { setupWallet } from "../utils/wallet.ts";

async function main() {
  const wallet0 = await setupWallet();
  const wallet1 = await setupWallet();

  await deploySchnorrAccount(wallet0, "wallet0");
  await deploySchnorrAccount(wallet1, "wallet1");

  console.log("\nBoth wallets deployed and registered with PXE.");
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
