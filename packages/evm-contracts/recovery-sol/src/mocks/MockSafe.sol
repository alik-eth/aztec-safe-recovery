// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title MockSafe
 * @notice Simplified Safe mock for testing
 */
contract MockSafe {
    address[] public owners;
    uint256 public threshold;
    mapping(address => bool) public isOwner;
    mapping(address => bool) public modules;
    
    event OwnerAdded(address owner);
    event OwnerRemoved(address owner);
    event ThresholdChanged(uint256 threshold);
    
    function setup(address[] memory _owners, uint256 _threshold) external {
        require(owners.length == 0, "already setup");
        require(_threshold > 0 && _threshold <= _owners.length, "invalid threshold");
        
        for (uint256 i = 0; i < _owners.length; i++) {
            address owner = _owners[i];
            require(owner != address(0), "invalid owner");
            require(!isOwner[owner], "duplicate owner");
            
            owners.push(owner);
            isOwner[owner] = true;
        }
        
        threshold = _threshold;
    }
    
    function getOwners() external view returns (address[] memory) {
        return owners;
    }
    
    function getThreshold() external view returns (uint256) {
        return threshold;
    }
    
    function isModuleEnabled(address module) external view returns (bool) {
        return modules[module];
    }
    
    function enableModule(address module) external {
        modules[module] = true;
    }
    
    function disableModule(address module) external {
        modules[module] = false;
    }
    
    function addOwnerWithThreshold(address owner, uint256 _threshold) external {
        require(owner != address(0), "invalid owner");
        require(!isOwner[owner], "already owner");
        require(_threshold > 0 && _threshold <= owners.length + 1, "invalid threshold");
        
        owners.push(owner);
        isOwner[owner] = true;
        threshold = _threshold;
        
        emit OwnerAdded(owner);
        emit ThresholdChanged(_threshold);
    }
    
    function removeOwner(address prevOwner, address owner, uint256 _threshold) external {
        require(isOwner[owner], "not owner");
        require(_threshold > 0 && _threshold <= owners.length - 1, "invalid threshold");
        
        // Find and remove owner
        for (uint256 i = 0; i < owners.length; i++) {
            if (owners[i] == owner) {
                owners[i] = owners[owners.length - 1];
                owners.pop();
                break;
            }
        }
        
        isOwner[owner] = false;
        threshold = _threshold;
        
        emit OwnerRemoved(owner);
        emit ThresholdChanged(_threshold);
    }
    
    function changeThreshold(uint256 _threshold) external {
        require(_threshold > 0 && _threshold <= owners.length, "invalid threshold");
        threshold = _threshold;
        emit ThresholdChanged(_threshold);
    }
    
    function execTransactionFromModule(
        address to,
        uint256 value,
        bytes memory data,
        uint8 operation
    ) external returns (bool success, bytes memory returnData) {
        require(modules[msg.sender], "not a module");
        
        if (operation == 0) {
            // Call
            (success, returnData) = to.call{value: value}(data);
        } else if (operation == 1) {
            // DelegateCall
            (success, returnData) = to.delegatecall(data);
        } else {
            revert("invalid operation");
        }
    }
}