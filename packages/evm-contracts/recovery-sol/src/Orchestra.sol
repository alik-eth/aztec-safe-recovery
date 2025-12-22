//SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BytesLib} from "wormhole/ethereum/contracts/libraries/external/BytesLib.sol";
import {IWormhole} from "wormhole/ethereum/contracts/interfaces/IWormhole.sol";
import {PayloadExtractor, ParsedPayload} from "./PayloadExtractor.sol";

contract Orchestra {
    using BytesLib for bytes;

    address private owner;
    address private wormholeAddress;

    mapping(uint16 => bytes32) knownEmitters;
    mapping(bytes32 => bool) consumedMessages;

    error CallerNotOwner();
    error InvalidTxID();
    error MessageAlreadyConsumed();

    event MessageProcessed();
    event Show(bytes data);

    address public latestRecovered;

    PayloadExtractor private extractor;

    constructor(address _wormhole) {
        wormholeAddress = _wormhole;
        owner = msg.sender;
        extractor = new PayloadExtractor();
    }

    // function isOwner(address _owner) internal view {
    //     require(_owner == owner, CallerNotOwner());
    // }

    function wormhole() internal view returns (IWormhole) {
        return IWormhole(wormholeAddress);
    }

    function verify(bytes memory encodedVm) external {
        bytes memory payload = _verify(encodedVm);

        _processPayload(payload);
    }

    function _verify(
        bytes memory encodedVm
    ) internal view returns (bytes memory) {
        (IWormhole.VM memory vm, bool valid, string memory reason) = wormhole()
            .parseAndVerifyVM(encodedVm);

        require(valid, reason);

        // require(verifyAuthorizedEmitter(vm), "Invalid emitter: source not recognized");

        return vm.payload;
    }

    function _processPayload(bytes memory payload) internal {
        // require(!isFork(), "Invalid fork: expected chainID mismatch");

        // uint256 txIdOffset = 32;

        // Ensure payload is long enough (needs txId + amount data)
        // Minimum: 32 bytes (txId) + 95 bytes (to reach amount at offset 126) = 127 bytes
        // require(payload.length >= 127, "Payload too short");

        // Extract txId from the first 32 bytes
        // bytes32 txId;
        // assembly {
        //     txId := mload(add(payload, 32)) // First 32 bytes are the txId
        // }

        // require(txId != bytes32(0), InvalidTxID());
        // require(!consumedMessages[txId], MessageAlreadyConsumed());
        // consumedMessages[txId] = true;

        // address recoveredAddress;
        // assembly {
        //     // Load the 32 bytes after txId (which includes our 20 byte address)
        //     let addressData := mload(add(payload, 64)) // 32 (data offset) + 32 (txId offset) = 64
        //     // Shift right by 12 bytes (32 - 20) to align the address
        //     recoveredAddress := shr(96, addressData)
        // }
        // require(recoveredAddress != address(0), "Invalid address");

        ParsedPayload memory extracted = extractor.parsePayload(payload);
        
        latestRecovered = extracted.addressField7;
    }
}
