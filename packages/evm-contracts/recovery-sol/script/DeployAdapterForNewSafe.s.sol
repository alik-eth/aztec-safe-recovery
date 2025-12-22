// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {SafeAdapterHelper} from "../src/SafeAdapterHelper.sol";

contract DeployAdapterForNewSafe is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address validator = vm.envAddress("VALIDATOR_ADDRESS");
        address newSafe = 0xce7f33D081fBf740574083C77D310ED487CFD201;
        
        console2.log("=== DEPLOYING ADAPTER FOR NEW SAFE ===");
        console2.log("Validator:", validator);
        console2.log("New Safe:", newSafe);
        
        vm.startBroadcast(pk);
        
        // Deploy new adapter for the new Safe
        SafeAdapterHelper newAdapter = new SafeAdapterHelper(validator, newSafe);
        console2.log("New Adapter deployed:", address(newAdapter));
        
        vm.stopBroadcast();
        
        console2.log("\n=== DEPLOYMENT COMPLETE ===");
        console2.log("Update your .env file:");
        console2.log("NEW_ADAPTER_ADDRESS=", address(newAdapter));
        console2.log("\nNow you need to:");
        console2.log("1. Enable this adapter as a module on the Safe");
        console2.log("2. Update the validator to use this new adapter");
    }
}