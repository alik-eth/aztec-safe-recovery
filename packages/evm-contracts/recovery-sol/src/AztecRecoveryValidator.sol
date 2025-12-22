// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IValidator7579} from "./interfaces/IValidator7579.sol";
import {IWormholeCoreMock} from "./interfaces/IWormholeCoreMock.sol";

/// @title AztecRecoveryValidator
/// @notice ERC-7579 validator that approves recovery calls when authorized by Wormhole VAA
/// @dev Singleton validator - multiple modules can be authorized to call validate()
contract AztecRecoveryValidator is IValidator7579 {
    bytes4 internal constant MAGICVALUE = 0x1626ba7e; // EIP-1271

    IWormholeCoreMock public immutable wormhole;
    address public owner;
    bool public paused;

    // Authorized modules that can call validate()
    mapping(address => bool) public authorizedModules;

    // Replay protection - consumed nonces
    mapping(bytes32 => bool) public consumed;

    event ModuleAuthorized(address indexed module, bool authorized);
    event Paused(bool value);
    event NonceConsumed(bytes32 indexed nonce);

    error NotOwner();
    error NotAuthorizedModule();
    error ValidatorPaused();
    error InvalidVAA();
    error BadVersion();
    error WrongChain();
    error Expired();
    error NonceAlreadyConsumed();
    error BadSelector();
    error SafeMismatch();
    error ThresholdMismatch();
    error NonceMismatch();
    error OwnersMismatch();

    constructor(address _wormhole) {
        wormhole = IWormholeCoreMock(_wormhole);
        owner = msg.sender;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    function setOwner(address _owner) external onlyOwner {
        owner = _owner;
    }

    function setPaused(bool v) external onlyOwner {
        paused = v;
        emit Paused(v);
    }

    /// @notice Authorize or deauthorize a module to call validate()
    function setModuleAuthorized(address module, bool authorized) external onlyOwner {
        authorizedModules[module] = authorized;
        emit ModuleAuthorized(module, authorized);
    }

    // --- 7579 Interface ---

    function isModuleType(uint256 t) external pure returns (bool) {
        return t == 1; // validator type
    }

    function onInstall(bytes calldata data) external {
        // When installed on a 7579 account, authorize the caller as a module
        if (data.length >= 20) {
            address module = address(bytes20(data));
            authorizedModules[module] = true;
            emit ModuleAuthorized(module, true);
        }
    }

    function onUninstall(bytes calldata) external {}

    /// @notice Validate a recovery call against a Wormhole VAA
    /// @dev VAA payload format: (uint8 version, uint256 chainId, address safe, address[] owners, uint256 threshold, bytes32 nonce, uint64 expiry)
    /// @param callData The calldata of the applyRecovery call
    /// @param vaa The Wormhole VAA from Aztec guardians
    /// @return bytes4 MAGICVALUE if valid
    function validate(bytes calldata callData, bytes calldata vaa) external view returns (bytes4) {
        if (paused) revert ValidatorPaused();
        if (!authorizedModules[msg.sender]) revert NotAuthorizedModule();

        // Parse and verify VAA
        (bytes memory payload, bool ok, ) = wormhole.parseAndVerifyVM(vaa);
        if (!ok) revert InvalidVAA();

        // Decode payload
        (
            uint8 version,
            uint256 chainId,
            address safe,
            address[] memory owners,
            uint256 threshold,
            bytes32 nonce,
            uint64 expiry
        ) = abi.decode(payload, (uint8, uint256, address, address[], uint256, bytes32, uint64));

        // Validate payload fields
        if (version != 1) revert BadVersion();
        if (chainId != block.chainid) revert WrongChain();
        if (block.timestamp > expiry) revert Expired();
        if (consumed[nonce]) revert NonceAlreadyConsumed();

        // Verify selector matches applyRecovery
        bytes4 selector;
        assembly {
            selector := calldataload(callData.offset)
        }
        if (selector != bytes4(keccak256("applyRecovery(address,address[],uint256,bytes32,bytes)"))) {
            revert BadSelector();
        }

        // Verify callData matches VAA payload
        _validateCallData(callData[4:], safe, owners, threshold, nonce);

        return MAGICVALUE;
    }

    /// @notice Mark a nonce as consumed (called by module after successful recovery)
    function markConsumed(bytes32 nonce) external {
        if (!authorizedModules[msg.sender]) revert NotAuthorizedModule();
        consumed[nonce] = true;
        emit NonceConsumed(nonce);
    }

    function _validateCallData(
        bytes calldata encodedData,
        address expectedSafe,
        address[] memory expectedOwners,
        uint256 expectedThreshold,
        bytes32 expectedNonce
    ) internal pure {
        (
            address callSafe,
            address[] memory callOwners,
            uint256 callThreshold,
            bytes32 callNonce,
        ) = abi.decode(encodedData, (address, address[], uint256, bytes32, bytes));

        if (callSafe != expectedSafe) revert SafeMismatch();
        if (callThreshold != expectedThreshold) revert ThresholdMismatch();
        if (callNonce != expectedNonce) revert NonceMismatch();

        if (expectedOwners.length != callOwners.length) revert OwnersMismatch();
        for (uint i; i < expectedOwners.length; i++) {
            if (expectedOwners[i] != callOwners[i]) revert OwnersMismatch();
        }
    }
}
