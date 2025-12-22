// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IWormhole} from "wormhole/ethereum/contracts/interfaces/IWormhole.sol";

/// @notice Mock Wormhole Core that accepts any VAA and parses the payload
contract MockWormholeCore is IWormhole {
    /// @notice Parse and verify VM - always returns valid=true for testing
    /// @dev Extracts the payload from the raw VAA bytes
    function parseAndVerifyVM(bytes calldata encodedVM) external pure returns (VM memory vm, bool valid, string memory reason) {
        // Parse the VAA to extract payload
        // VAA format: version(1) + guardianSetIndex(4) + signatureCount(1) + signatures(66*count) + body
        // Body: timestamp(4) + nonce(4) + emitterChainId(2) + emitterAddress(32) + sequence(8) + consistencyLevel(1) + payload(rest)

        require(encodedVM.length >= 6, "VAA too short");

        uint8 sigCount = uint8(encodedVM[5]);
        uint256 bodyOffset = 6 + (sigCount * 66);

        require(encodedVM.length >= bodyOffset + 51, "VAA body too short");

        // Parse body fields
        vm.timestamp = uint32(bytes4(encodedVM[bodyOffset:bodyOffset+4]));
        vm.nonce = uint32(bytes4(encodedVM[bodyOffset+4:bodyOffset+8]));
        vm.emitterChainId = uint16(bytes2(encodedVM[bodyOffset+8:bodyOffset+10]));
        vm.emitterAddress = bytes32(encodedVM[bodyOffset+10:bodyOffset+42]);
        vm.sequence = uint64(bytes8(encodedVM[bodyOffset+42:bodyOffset+50]));
        vm.consistencyLevel = uint8(encodedVM[bodyOffset+50]);

        // Payload is the rest
        uint256 payloadOffset = bodyOffset + 51;
        vm.payload = encodedVM[payloadOffset:];

        return (vm, true, "");
    }

    // Stub implementations for IWormhole interface
    function publishMessage(uint32, bytes memory, uint8) external payable returns (uint64) { return 0; }
    function initialize() external {}
    function verifyVM(VM memory) external pure returns (bool, string memory) { return (true, ""); }
    function verifySignatures(bytes32, Signature[] memory, GuardianSet memory) external pure returns (bool, string memory) { return (true, ""); }
    function parseVM(bytes memory) external pure returns (VM memory vm) { return vm; }
    function quorum(uint) external pure returns (uint) { return 1; }
    function getGuardianSet(uint32) external pure returns (GuardianSet memory gs) { return gs; }
    function getCurrentGuardianSetIndex() external pure returns (uint32) { return 0; }
    function getGuardianSetExpiry() external pure returns (uint32) { return 0; }
    function governanceActionIsConsumed(bytes32) external pure returns (bool) { return false; }
    function isInitialized(address) external pure returns (bool) { return true; }
    function chainId() external pure returns (uint16) { return 0; }
    function isFork() external pure returns (bool) { return false; }
    function governanceChainId() external pure returns (uint16) { return 0; }
    function governanceContract() external pure returns (bytes32) { return bytes32(0); }
    function messageFee() external pure returns (uint256) { return 0; }
    function evmChainId() external pure returns (uint256) { return 0; }
    function nextSequence(address) external pure returns (uint64) { return 0; }
    function parseContractUpgrade(bytes memory) external pure returns (ContractUpgrade memory) { revert(); }
    function parseGuardianSetUpgrade(bytes memory) external pure returns (GuardianSetUpgrade memory) { revert(); }
    function parseSetMessageFee(bytes memory) external pure returns (SetMessageFee memory) { revert(); }
    function parseTransferFees(bytes memory) external pure returns (TransferFees memory) { revert(); }
    function parseRecoverChainId(bytes memory) external pure returns (RecoverChainId memory) { revert(); }
    function submitContractUpgrade(bytes memory) external {}
    function submitSetMessageFee(bytes memory) external {}
    function submitNewGuardianSet(bytes memory) external {}
    function submitTransferFees(bytes memory) external {}
    function submitRecoverChainId(bytes memory) external {}
}