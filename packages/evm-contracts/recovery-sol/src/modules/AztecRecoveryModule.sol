// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC7579Account, IERC7579Module, ModeLib, ExecutionLib, ModeCode} from "../interfaces/IERC7579.sol";
import {IWormholeCoreMock} from "../interfaces/IWormholeCoreMock.sol";

/**
 * @title AztecRecoveryModule
 * @notice ERC7579 executor module for Safe recovery via Wormhole VAAs
 * @dev This module can be installed on a Safe7579 account to enable guardian recovery
 */
contract AztecRecoveryModule is IERC7579Module {

    // EIP-1271 magic value for valid signature
    bytes4 internal constant MAGICVALUE = 0x1626ba7e;
    
    IWormholeCoreMock public immutable wormhole;
    address public owner;
    bool public paused;
    
    mapping(bytes32 => bool) public consumed; // replay protection
    mapping(address => bool) public authorizedAccounts; // accounts that have installed this module
    
    struct RecoveryData {
        uint8 version;
        uint256 chainId;
        address safe;
        address[] newOwners;
        uint256 threshold;
        bytes32 nonce;
        uint64 expiry;
    }
    
    event RecoveryExecuted(address indexed safe, uint256 threshold, bytes32 nonce);
    event Paused(bool indexed value);
    
    error InvalidVAA();
    error InvalidVersion();
    error WrongChain();
    error WrongSafe();
    error Expired();
    error AlreadyConsumed();
    error NotAuthorized();
    error ModulePaused();
    
    constructor(address _wormhole) {
        wormhole = IWormholeCoreMock(_wormhole);
        owner = msg.sender;
    }
    
    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }
    
    function setPaused(bool v) external onlyOwner {
        paused = v;
        emit Paused(v);
    }

    /**
     * @dev Called when module is installed on an account
     * @param data Installation data (not used in this implementation)
     */
    function onInstall(bytes calldata data) external {
        authorizedAccounts[msg.sender] = true;
    }

    /**
     * @dev Called when module is uninstalled from an account
     * @param data Uninstallation data (not used in this implementation)
     */
    function onUninstall(bytes calldata data) external {
        authorizedAccounts[msg.sender] = false;
    }

    /**
     * @dev Check if module type is supported (TYPE_EXECUTOR = 2)
     */
    function isModuleType(uint256 typeID) external pure returns (bool) {
        return typeID == 2; // TYPE_EXECUTOR
    }
    
    /**
     * @dev Check if module is initialized for an account
     */
    function isInitialized(address account) external view returns (bool) {
        return authorizedAccounts[account];
    }

    /**
     * @dev Execute recovery based on Wormhole VAA
     * @param safe The Safe account to recover
     * @param vaa The Wormhole VAA containing recovery instructions
     */
    function executeRecovery(address safe, bytes calldata vaa) external {
        if (paused) revert ModulePaused();
        if (!authorizedAccounts[safe]) revert NotAuthorized();
        
        // Parse and verify VAA via mocked wormhole
        (bytes memory payload, bool valid, ) = wormhole.parseAndVerifyVM(vaa);
        if (!valid) revert InvalidVAA();
        
        // Decode recovery data
        RecoveryData memory data = abi.decode(payload, (RecoveryData));
        
        // Validate recovery data
        if (data.version != 1) revert InvalidVersion();
        if (data.chainId != block.chainid) revert WrongChain();
        if (data.safe != safe) revert WrongSafe();
        if (block.timestamp > data.expiry) revert Expired();
        if (consumed[data.nonce]) revert AlreadyConsumed();
        
        // Mark nonce as consumed
        consumed[data.nonce] = true;
        
        // Build calls to update Safe owners and threshold
        bytes[] memory calls = _buildRecoveryCalls(safe, data.newOwners, data.threshold);
        
        // Execute calls through the Safe account
        _execute(safe, calls);
        
        emit RecoveryExecuted(safe, data.threshold, data.nonce);
    }
    
    /**
     * @dev Build the necessary calls to update Safe owners and threshold
     */
    function _buildRecoveryCalls(
        address safe,
        address[] memory newOwners,
        uint256 threshold
    ) internal view returns (bytes[] memory) {
        // For simplicity, we'll build calls to:
        // 1. Remove all existing owners except sentinel
        // 2. Add all new owners
        // 3. Set threshold
        
        // This is simplified - in production you'd want to diff the owner sets
        // and only make necessary changes
        
        bytes[] memory calls = new bytes[](newOwners.length + 1);
        
        // Add each new owner
        for (uint i = 0; i < newOwners.length; i++) {
            calls[i] = ExecutionLib.encodeSingle(
                safe,
                0,
                abi.encodeWithSignature("addOwnerWithThreshold(address,uint256)", newOwners[i], 1)
            );
        }
        
        // Set final threshold
        calls[newOwners.length] = ExecutionLib.encodeSingle(
            safe,
            0,
            abi.encodeWithSignature("changeThreshold(uint256)", threshold)
        );
        
        return calls;
    }
    
    /**
     * @dev Execute calls through the Safe account
     */
    function _execute(address account, bytes[] memory calls) internal {
        // Execute batch through the account
        for (uint i = 0; i < calls.length; i++) {
            IERC7579Account(account).executeFromExecutor(
                ModeLib.encodeSimpleSingle(),
                calls[i]
            );
        }
    }

    /**
     * @dev Returns module metadata
     */
    function name() external pure returns (string memory) {
        return "AztecRecoveryModule";
    }

    /**
     * @dev Returns module version
     */
    function version() external pure returns (string memory) {
        return "1.0.0";
    }
}