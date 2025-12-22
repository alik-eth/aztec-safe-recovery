// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {SafeAdapterHelper} from "../src/SafeAdapterHelper.sol";
import {AztecGuardianRecoveryValidator} from "../src/AztecGuardianRecoveryValidator.sol";

contract DeployAdapter is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address validatorAddress = vm.envAddress("VALIDATOR_ADDRESS");
        address safeAddress = vm.envAddress("SAFE_ADDRESS");
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy SafeAdapterHelper
        SafeAdapterHelper adapter = new SafeAdapterHelper(
            validatorAddress,
            safeAddress
        );
        console.log("SafeAdapterHelper deployed at:", address(adapter));
        
        // Update validator to point to new adapter
        AztecGuardianRecoveryValidator(validatorAddress).setAdapter(address(adapter));
        console.log("Adapter set in validator");
        
        vm.stopBroadcast();
        
        console.log("\n=== IMPORTANT ===");
        console.log("New adapter address:", address(adapter));
        console.log("You need to enable this as a module in your Safe!");
        console.log("\nUpdate your .env file:");
        console.log("ADAPTER_ADDRESS=", address(adapter));
    }
}