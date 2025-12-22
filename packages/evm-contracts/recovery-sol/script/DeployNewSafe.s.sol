// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";

interface ISafeProxyFactory {
    function createProxyWithNonce(
        address _singleton,
        bytes memory initializer,
        uint256 saltNonce
    ) external returns (address proxy);
}

interface ISafe {
    function setup(
        address[] calldata _owners,
        uint256 _threshold,
        address to,
        bytes calldata data,
        address fallbackHandler,
        address paymentToken,
        uint256 payment,
        address payable paymentReceiver
    ) external;
}

/// Deploy a new Safe with you as the sole owner
contract DeployNewSafe is Script {
    // Sepolia Safe contracts
    address constant SAFE_SINGLETON = 0x41675C099F32341bf84BFc5382aF534df5C7461a;
    address constant SAFE_PROXY_FACTORY = 0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67;
    
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address owner = vm.addr(pk);
        
        console2.log("=== DEPLOYING NEW SAFE ===");
        console2.log("Owner:", owner);
        
        // Prepare Safe setup data
        address[] memory owners = new address[](1);
        owners[0] = owner;
        uint256 threshold = 1;
        
        bytes memory initializer = abi.encodeWithSelector(
            ISafe.setup.selector,
            owners,
            threshold,
            address(0), // to
            "",         // data
            address(0), // fallbackHandler
            address(0), // paymentToken
            0,          // payment
            address(0)  // paymentReceiver
        );
        
        // Generate a unique salt
        uint256 saltNonce = uint256(keccak256(abi.encodePacked(owner, block.timestamp)));
        
        vm.startBroadcast(pk);
        
        // Deploy the Safe proxy
        ISafeProxyFactory factory = ISafeProxyFactory(SAFE_PROXY_FACTORY);
        address newSafe = factory.createProxyWithNonce(
            SAFE_SINGLETON,
            initializer,
            saltNonce
        );
        
        vm.stopBroadcast();
        
        console2.log("\n=== NEW SAFE DEPLOYED ===");
        console2.log("Safe address:", newSafe);
        console2.log("Owner:", owner);
        console2.log("Threshold:", threshold);
        console2.log("\nYou can view your Safe at:");
        console2.log(string(abi.encodePacked("https://app.safe.global/sep:", vm.toString(newSafe))));
        console2.log("\n>>> IMPORTANT: Save this Safe address!");
        console2.log(">>> NEW_SAFE_ADDRESS=", newSafe);
    }
}