// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// Minimal 7579 validator shape for demo.
interface IValidator7579 {
    function isModuleType(uint256 t) external pure returns (bool); // 1 = validator
    function onInstall(bytes calldata data) external;
    function onUninstall(bytes calldata data) external;

    /// `callData` is the exact call being attempted (here: adapter.applyRecovery(...))
    /// `vaa` is the cross-chain attested message (mocked).
    function validate(bytes calldata callData, bytes calldata vaa) external view returns (bytes4);
}