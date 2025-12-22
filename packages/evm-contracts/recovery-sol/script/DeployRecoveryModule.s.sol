// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {MockWormholeCore} from "../src/mocks/MockWormholeCore.sol";
import {AztecRecoveryValidator} from "../src/AztecRecoveryValidator.sol";
import {SafeRecoveryModule} from "../src/SafeRecoveryModule.sol";

/// @title DeployRecoveryModule
/// @notice Deploy the singleton Aztec recovery module stack
/// @dev Deploys: MockWormholeCore (optional), AztecRecoveryValidator, SafeRecoveryModule
contract DeployRecoveryModule is Script {
    // Wormhole Core on Sepolia (testnet)
    address constant WORMHOLE_CORE_SEPOLIA = 0x4a8bc80Ed5a4067f1CCf107057b8270E0cC11A78;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        bool useMock = vm.envOr("USE_MOCK_WORMHOLE", true);

        console2.log("=== DEPLOYING AZTEC RECOVERY MODULE (SINGLETON) ===");
        console2.log("Deployer:", deployer);
        console2.log("Using mock Wormhole:", useMock);

        vm.startBroadcast(deployerPrivateKey);

        address wormholeAddress;

        if (useMock) {
            MockWormholeCore mockWormhole = new MockWormholeCore();
            wormholeAddress = address(mockWormhole);
            console2.log("MockWormholeCore deployed at:", wormholeAddress);
        } else {
            wormholeAddress = WORMHOLE_CORE_SEPOLIA;
            console2.log("Using Wormhole Core at:", wormholeAddress);
        }

        // Deploy the validator
        AztecRecoveryValidator validator = new AztecRecoveryValidator(wormholeAddress);
        console2.log("AztecRecoveryValidator deployed at:", address(validator));

        // Deploy the singleton recovery module (needs both validator and wormhole)
        SafeRecoveryModule module = new SafeRecoveryModule(address(validator), wormholeAddress);
        console2.log("SafeRecoveryModule deployed at:", address(module));

        // Authorize the module in the validator
        validator.setModuleAuthorized(address(module), true);
        console2.log("Module authorized in validator");

        vm.stopBroadcast();

        console2.log("\n=== DEPLOYMENT COMPLETE ===");
        console2.log("Wormhole:", wormholeAddress);
        console2.log("Validator:", address(validator));
        console2.log("Module:", address(module));

        console2.log("\n=== HOW TO USE ===");
        console2.log("1. Enable SafeRecoveryModule as a module in your Safe:");
        console2.log("   Module address:", address(module));
        console2.log("2. The module is now ready to receive recovery requests from Aztec");

        console2.log("\n=== FOR RELAYER CONFIG ===");
        console2.log("ARBITRUM_TARGET_CONTRACT=", address(module));
    }
}
