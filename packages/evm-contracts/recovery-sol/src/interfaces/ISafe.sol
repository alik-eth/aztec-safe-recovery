// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// Minimal Safe v1.4+ surface we need for this demo.
interface ISafe {
    // Owner / threshold
    function getOwners() external view returns (address[] memory);
    function getThreshold() external view returns (uint256);
    function isOwner(address owner) external view returns (bool);
    function addOwnerWithThreshold(address owner, uint256 _threshold) external;
    function removeOwner(address prevOwner, address owner, uint256 _threshold) external;
    function changeThreshold(uint256 _threshold) external;

    // Module execution (called by enabled modules)
    function execTransactionFromModuleReturnData(
        address to,
        uint256 value,
        bytes calldata data,
        uint8 operation
    ) external returns (bool success, bytes memory returnData);
}