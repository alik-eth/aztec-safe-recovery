// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IValidator7579} from "./interfaces/IValidator7579.sol";
import {ISafe} from "./interfaces/ISafe.sol";
import {IWormhole} from "wormhole/ethereum/contracts/interfaces/IWormhole.sol";

/// @title SafeRecoveryModule
/// @notice Singleton Safe module for Aztec guardian recovery
/// @dev Any Safe can enable this module. Recovery is triggered via Wormhole VAA from Aztec.
contract SafeRecoveryModule {
    bytes4 internal constant MAGICVALUE = 0x1626ba7e; // EIP-1271 magic

    IValidator7579 public immutable validator;
    IWormhole public immutable wormhole;
    address public owner;
    bool public paused;

    /// @notice Mapping of Safe address to their Aztec recovery contract address (as bytes32)
    /// @dev The Aztec address is 32 bytes, stored as bytes32
    mapping(address => bytes32) public aztecRecoveryContract;

    /// @notice Mapping of consumed VAA hashes to prevent replay
    mapping(bytes32 => bool) public consumedVaas;

    event RecoveryApplied(address indexed safe, uint256 threshold, bytes32 nonce);
    event AztecRecoveryContractSet(address indexed safe, bytes32 aztecContract);
    event Paused(bool value);
    event DebugPayload(uint256 payloadLen, address safe, address candidate, uint256 chainId, bytes32 emitter);

    error ModulePaused();
    error ValidationFailed();
    error SafeCallFailed();
    error ConsumeNonceFailed();
    error VaaAlreadyConsumed();
    error InvalidVaa();
    error WrongChain();

    constructor(address _validator, address _wormhole) {
        validator = IValidator7579(_validator);
        wormhole = IWormhole(_wormhole);
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

    /// @notice Set the Aztec recovery contract address for the caller Safe
    /// @dev Must be called by the Safe itself (via execTransaction or as initial setup)
    /// @param aztecContract The Aztec recovery contract address (32 bytes)
    function setAztecRecoveryContract(bytes32 aztecContract) external {
        aztecRecoveryContract[msg.sender] = aztecContract;
        emit AztecRecoveryContractSet(msg.sender, aztecContract);
    }

    /// @notice Get the Aztec recovery contract address for a Safe
    /// @param safe The Safe address to query
    /// @return The Aztec recovery contract address (32 bytes)
    function getAztecRecoveryContract(address safe) external view returns (bytes32) {
        return aztecRecoveryContract[safe];
    }

    /// @notice Apply recovery to a Safe wallet
    /// @dev The Safe must have enabled this module. Anyone can call this with a valid VAA.
    /// @param targetSafe The Safe wallet to recover
    /// @param newOwners Array of new owner addresses
    /// @param newThreshold New signing threshold
    /// @param nonce Unique nonce to prevent replay
    /// @param vaa Wormhole VAA containing the recovery authorization from Aztec
    function applyRecovery(
        address targetSafe,
        address[] calldata newOwners,
        uint256 newThreshold,
        bytes32 nonce,
        bytes calldata vaa
    ) external {
        if (paused) revert ModulePaused();

        // 1) Ask validator to verify this exact call against the VAA
        bytes memory callData = abi.encodeWithSelector(
            this.applyRecovery.selector, targetSafe, newOwners, newThreshold, nonce, vaa
        );
        if (validator.validate(callData, vaa) != MAGICVALUE) revert ValidationFailed();

        ISafe safe = ISafe(targetSafe);

        // 2) Read current owners
        address[] memory current = safe.getOwners();

        // 3) Mark which current owners to keep & add missing ones
        bool[] memory keep = new bool[](current.length);
        for (uint i = 0; i < newOwners.length; i++) {
            address o = newOwners[i];
            bool found;
            for (uint j = 0; j < current.length; j++) {
                if (current[j] == o) {
                    keep[j] = true;
                    found = true;
                    break;
                }
            }
            if (!found) {
                _moduleCall(safe, abi.encodeWithSelector(
                    ISafe.addOwnerWithThreshold.selector, o, safe.getThreshold()
                ));
            }
        }

        // 4) Remove owners not kept (Safe uses linked list with sentinel 0x1)
        address sentinel = address(0x1);
        for (uint j = 0; j < current.length; j++) {
            if (!keep[j]) {
                address prev = (j == 0) ? sentinel : current[j - 1];
                _moduleCall(safe, abi.encodeWithSelector(
                    ISafe.removeOwner.selector, prev, current[j], safe.getThreshold()
                ));
            }
        }

        // 5) Set final threshold
        _moduleCall(safe, abi.encodeWithSelector(ISafe.changeThreshold.selector, newThreshold));

        // 6) Mark nonce as consumed in validator
        (bool ok, ) = address(validator).call(abi.encodeWithSignature("markConsumed(bytes32)", nonce));
        if (!ok) revert ConsumeNonceFailed();

        emit RecoveryApplied(targetSafe, newThreshold, nonce);
    }

    function _moduleCall(ISafe safe, bytes memory data) internal {
        (bool success, ) = safe.execTransactionFromModuleReturnData(address(safe), 0, data, 0);
        if (!success) revert SafeCallFailed();
    }

    /// @notice Simple verify function for relayer compatibility
    /// @dev Parses VAA, extracts safe and candidate from payload, adds candidate as owner
    /// @param encodedVm Raw Wormhole VAA bytes
    function verify(bytes calldata encodedVm) external {
        if (paused) revert ModulePaused();

        // 1. Parse and verify VAA via Wormhole
        (IWormhole.VM memory vm, bool valid, ) = wormhole.parseAndVerifyVM(encodedVm);
        if (!valid) revert InvalidVaa();

        // 2. Check VAA hasn't been consumed
        bytes32 vaaHash = keccak256(encodedVm);
        if (consumedVaas[vaaHash]) revert VaaAlreadyConsumed();
        consumedVaas[vaaHash] = true;

        // 3. Extract from payload (Wormhole adds 32-byte txHash, then Aztec 31-byte LE fields compressed)
        // Payload layout: [txHash(32), module(20), chainId(3), safe(20), zeros(21), candidate(20), padding(17)]
        // Total: 32 + 20 + 3 + 20 + 21 + 20 + 17 = 133 bytes
        bytes memory payload = vm.payload;
        require(payload.length >= 116, "payload too short");

        address safeAddress = _extractAddressLE(payload, 55);  // safe at offset 32+20+3
        address candidate = _extractAddressLE(payload, 96);    // candidate at offset 32+20+3+20+21

        // 4. Verify chain ID matches (little-endian at offset 52, only 3 bytes)
        uint256 chainId = _extractChainIdLE(payload, 52);

        // Debug: emit extracted values before checks
        emit DebugPayload(payload.length, safeAddress, candidate, chainId, vm.emitterAddress);

        if (chainId != block.chainid) revert WrongChain();

        // 5. Get current owners and add candidate if not already owner
        ISafe safe = ISafe(safeAddress);
        address[] memory currentOwners = safe.getOwners();

        bool isOwner = false;
        for (uint i = 0; i < currentOwners.length; i++) {
            if (currentOwners[i] == candidate) {
                isOwner = true;
                break;
            }
        }

        if (!isOwner) {
            // Add candidate as new owner (keep current threshold)
            _moduleCall(safe, abi.encodeWithSelector(
                ISafe.addOwnerWithThreshold.selector, candidate, safe.getThreshold()
            ));
        }

        emit RecoveryApplied(safeAddress, safe.getThreshold(), vaaHash);
    }

    /// @dev Extract address from little-endian bytes (Aztec Field format)
    /// @param data The payload bytes
    /// @param offset Starting offset in the payload
    /// @return addr The extracted address
    function _extractAddressLE(bytes memory data, uint256 offset) internal pure returns (address) {
        uint160 addr;
        for (uint256 i = 0; i < 20; i++) {
            addr |= uint160(uint8(data[offset + i])) << uint160(8 * i);
        }
        return address(addr);
    }

    /// @dev Extract chain ID (3 bytes) from little-endian bytes
    /// @param data The payload bytes
    /// @param offset Starting offset in the payload
    /// @return value The extracted chain ID (max 24 bits)
    function _extractChainIdLE(bytes memory data, uint256 offset) internal pure returns (uint256) {
        uint256 value;
        for (uint i = 0; i < 3 && (offset + i) < data.length; i++) {
            value |= uint256(uint8(data[offset + i])) << (8 * i);
        }
        return value;
    }

    /// @dev Extract uint256 from little-endian bytes
    /// @param data The payload bytes
    /// @param offset Starting offset in the payload
    /// @return value The extracted uint256
    function _extractUint256LE(bytes memory data, uint256 offset) internal pure returns (uint256) {
        uint256 value;
        for (uint i = 0; i < 31 && (offset + i) < data.length; i++) {
            value |= uint256(uint8(data[offset + i])) << (8 * i);
        }
        return value;
    }
}
