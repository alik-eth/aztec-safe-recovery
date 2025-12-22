// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// Minimal install API for a Safe7579 adapter (validator install).
interface ISafe7579Adapter {
    /// moduleType: 1 = validator (ERC-7579)
    function installValidator(address validator, bytes calldata initData) external;

    /// Optional (varies by adapter impl): query if installed
    function isValidatorInstalled(address account, address validator) external view returns (bool);
}