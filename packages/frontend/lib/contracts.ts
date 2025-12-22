export const contracts = {
  sepolia: {
    // Deployed 2024-12-23 for Aztec devnet + Sepolia E2E testing (MockWormhole)
    safeRecoveryModule: "0x641a72f4B0BabE087A955aFeC6Da9E58bdB18643" as const,
    aztecRecoveryValidator: "0x6b27676c01108FaB773e9731Fe3453d3E35a12E3" as const,
    mockWormhole: "0xcA17193413115D712eE57ed74c9968f819Ae4b7E" as const,
  },
} as const;

export const aztecConfig = {
  pxeUrl: process.env.NEXT_PUBLIC_AZTEC_PXE_URL || "https://pxe.devnet.aztec.network",
  // Aztec recovery registry contract address (deployed on Aztec testnet)
  recoveryContract: process.env.NEXT_PUBLIC_AZTEC_RECOVERY_CONTRACT || "",
};

export type SupportedChain = keyof typeof contracts;

export function getContracts(chainId: number) {
  switch (chainId) {
    case 11155111: // Sepolia
      return contracts.sepolia;
    default:
      return null;
  }
}
