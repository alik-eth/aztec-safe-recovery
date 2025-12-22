import { createAztecNodeClient } from "@aztec/aztec.js/node";
import { TestWallet } from "@aztec/test-wallet/server";

export async function setupWallet(): Promise<TestWallet> {
  const useDevnet = true;
  const nodeUrl = useDevnet
    ? "https://devnet.aztec-labs.com"
    : "https://aztec-testnet-fullnode.zkv.xyz";

  const node = createAztecNodeClient(nodeUrl);
  const wallet = await TestWallet.create(node);
  return wallet;
}
