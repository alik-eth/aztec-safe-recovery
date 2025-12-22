import { loadSchnorrAccount } from "../utils/address.ts";
import { deployRecovery } from "../utils/deployment.ts";
import { setupWallet } from "../utils/wallet.ts";
import { AztecAddress, EthAddress } from "@aztec/aztec.js/addresses";

import * as path from "path";
import { readJson } from "../utils/utils.ts";

async function main() {
  const RECOVERY_ADDRESS_FILE = path.join(
    process.cwd(),
    "../config/recovery.json",
  );
  const WORMHOLE_ADDRESS_FILE = path.join(
    process.cwd(),
    "../config/wormhole.json",
  );
  const RECOVERY_PARAMS_FILE = path.join(
    process.cwd(),
    "../config/recovery_params.json",
  );

  // Get deployment params from environment or use defaults
  const CHAIN_ID = BigInt(process.env.TARGET_CHAIN_ID || "11155111"); // Sepolia default
  const SAFE_ADDRESS = EthAddress.fromString(
    process.env.SAFE_ADDRESS || "0x0000000000000000000000000000000000000000"
  );
  const DESTINATION_ADDRESS = EthAddress.fromString(
    process.env.DESTINATION_ADDRESS || "0x0000000000000000000000000000000000000000"
  );
  const THRESHOLD = Number(process.env.THRESHOLD || "1");

  const ownerWallet = await setupWallet();
  const ownerAccount = await loadSchnorrAccount(ownerWallet, "wallet0");
  const ownerAddress = ownerAccount.address;

  const wormholeAddressString = readJson<{ wormhole: string }>(
    WORMHOLE_ADDRESS_FILE,
  )?.wormhole;
  if (!wormholeAddressString) {
    throw new Error(
      `wormhole.json missing "wormhole" at ${WORMHOLE_ADDRESS_FILE}`,
    );
  }
  const wormholeAddress = AztecAddress.fromString(wormholeAddressString);

  console.log("Deployment parameters:");
  console.log(`  Chain ID: ${CHAIN_ID}`);
  console.log(`  Safe Address: ${SAFE_ADDRESS}`);
  console.log(`  Destination Address: ${DESTINATION_ADDRESS}`);
  console.log(`  Threshold: ${THRESHOLD}`);

  await deployRecovery(
    ownerWallet,
    RECOVERY_ADDRESS_FILE,
    RECOVERY_PARAMS_FILE,
    {
      from: ownerAddress,
    },
    {
      ownerAddress,
      wormholeAddress,
      chainId: CHAIN_ID,
      safeAddress: SAFE_ADDRESS,
      destinationAddress: DESTINATION_ADDRESS,
      threshold: THRESHOLD,
    },
  );
}

main().catch((err) => {
  console.error(`Error in deployment script: ${err}`);
  process.exit(1);
});
