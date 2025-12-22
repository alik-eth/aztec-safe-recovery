// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Mocked Wormhole Core interface — only what we need.
interface IWormholeCoreMock {
    function parseAndVerifyVM(bytes calldata vaa)
        external
        view
        returns (bytes memory payload, bool valid, string memory reason);
}