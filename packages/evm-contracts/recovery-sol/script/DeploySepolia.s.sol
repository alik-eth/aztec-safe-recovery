// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {MockWormholeCore} from "../src/mocks/MockWormholeCore.sol";
import {AztecGuardianRecoveryValidator} from "../src/AztecGuardianRecoveryValidator.sol";
import {SafeAdapterHelper} from "../src/SafeAdapterHelper.sol";

/// @title DeploySepolia
/// @notice Deploy the full Aztec recovery module stack to Sepolia
contract DeploySepolia is Script {
    // Wormhole Core on Sepolia (testnet)
    address constant WORMHOLE_CORE_SEPOLIA = 0x4a8bc80Ed5a4067f1CCf107057b8270E0cC11A78;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        // Optional: use existing Safe address from env, or deploy new one
        address safeAddress = vm.envOr("SAFE_ADDRESS", address(0));

        // Optional: use mock wormhole instead of real one
        bool useMock = vm.envOr("USE_MOCK_WORMHOLE", false);

        console2.log("=== DEPLOYING AZTEC RECOVERY MODULE TO SEPOLIA ===");
        console2.log("Deployer:", deployer);
        console2.log("Using mock Wormhole:", useMock);

        vm.startBroadcast(deployerPrivateKey);

        address wormholeAddress;

        if (useMock) {
            // Deploy mock Wormhole for testing
            MockWormholeCore mockWormhole = new MockWormholeCore();
            wormholeAddress = address(mockWormhole);
            console2.log("MockWormholeCore deployed at:", wormholeAddress);
        } else {
            // Use real Wormhole Core on Sepolia
            wormholeAddress = WORMHOLE_CORE_SEPOLIA;
            console2.log("Using Wormhole Core at:", wormholeAddress);
        }

        // Deploy the validator (with no adapter initially)
        AztecGuardianRecoveryValidator validator = new AztecGuardianRecoveryValidator(
            wormholeAddress,
            address(0) // adapter set later
        );
        console2.log("AztecGuardianRecoveryValidator deployed at:", address(validator));

        // If we have a Safe address, deploy the adapter
        if (safeAddress != address(0)) {
            SafeAdapterHelper adapter = new SafeAdapterHelper(
                address(validator),
                safeAddress
            );
            console2.log("SafeAdapterHelper deployed at:", address(adapter));

            // Set adapter in validator
            validator.setAdapter(address(adapter));
            console2.log("Adapter configured in validator");

            console2.log("\n=== NEXT STEPS ===");
            console2.log("1. Enable the SafeAdapterHelper as a module in your Safe");
            console2.log("   Safe address:", safeAddress);
            console2.log("   Module to enable:", address(adapter));
        } else {
            console2.log("\n=== NEXT STEPS ===");
            console2.log("1. Deploy a Safe or set SAFE_ADDRESS env var");
            console2.log("2. Run DeployAdapter.s.sol to deploy SafeAdapterHelper");
        }

        vm.stopBroadcast();

        console2.log("\n=== DEPLOYMENT SUMMARY ===");
        console2.log("Wormhole:", wormholeAddress);
        console2.log("Validator:", address(validator));
        console2.log("\nUpdate your .env:");
        console2.log("VALIDATOR_ADDRESS=", address(validator));
        console2.log("WORMHOLE_ADDRESS=", wormholeAddress);

        // Output for relayer config
        console2.log("\n=== FOR RELAYER CONFIG ===");
        console2.log("ArbitrumTargetContract:", address(validator));
    }
}
