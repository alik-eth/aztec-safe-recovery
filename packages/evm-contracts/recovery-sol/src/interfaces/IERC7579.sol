// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title Minimal ERC-7579 Interfaces
 * @notice Simplified interfaces for ERC-7579 without external dependencies
 */

// ModeCode type for execution modes
type ModeCode is bytes32;

// Execution struct
struct Execution {
    address target;
    uint256 value;
    bytes callData;
}

interface IERC7579Module {
    function onInstall(bytes calldata data) external;
    function onUninstall(bytes calldata data) external;
    function isModuleType(uint256 moduleTypeId) external view returns (bool);
}

interface IERC7579Account {
    function execute(ModeCode mode, bytes calldata executionCalldata) external;
    function executeFromExecutor(ModeCode mode, bytes calldata executionCalldata) 
        external returns (bytes[] memory);
    function isModuleInstalled(uint256 moduleType, address module, bytes calldata additionalContext) 
        external view returns (bool);
    function accountId() external view returns (string memory);
    function supportsModule(uint256 moduleTypeId) external view returns (bool);
    function supportsExecutionMode(ModeCode mode) external view returns (bool);
}

library ModeLib {
    function encodeSimpleSingle() internal pure returns (ModeCode mode) {
        assembly {
            mode := 0x0000000000000000000000000000000000000000000000000000000000000000
        }
    }
    
    function encodeSimpleBatch() internal pure returns (ModeCode mode) {
        assembly {
            mode := 0x0100000000000000000000000000000000000000000000000000000000000000
        }
    }
}

library ExecutionLib {
    function encodeSingle(
        address target,
        uint256 value,
        bytes memory callData
    ) internal pure returns (bytes memory) {
        return abi.encode(target, value, callData);
    }
    
    function decodeSingle(bytes calldata executionCalldata) 
        internal pure returns (address target, uint256 value, bytes memory callData) {
        return abi.decode(executionCalldata, (address, uint256, bytes));
    }
    
    function encodeBatch(Execution[] memory executions) internal pure returns (bytes memory) {
        return abi.encode(executions);
    }
    
    function decodeBatch(bytes calldata executionCalldata) 
        internal pure returns (Execution[] memory executions) {
        return abi.decode(executionCalldata, (Execution[]));
    }
}