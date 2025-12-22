// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IValidator7579} from "./interfaces/IValidator7579.sol";
import {ISafe} from "./interfaces/ISafe.sol";

/// Regular Safe module that:
/// 1) asks the 7579 validator to approve a specific applyRecovery(...),
/// 2) then mutates the **Safe itself** via execTransactionFromModuleReturnData.
contract SafeAdapterHelper {
    bytes4 internal constant MAGICVALUE = 0x1626ba7e; // EIP-1271 magic

    IValidator7579 public validator;
    ISafe public safe;

    event RecoveryApplied(address indexed safe, uint256 threshold, bytes32 nonce);

    constructor(address _validator, address _safe) {
        validator = IValidator7579(_validator);
        safe = ISafe(_safe);
    }

    function applyRecovery(
        address targetSafe,
        address[] calldata newOwners,
        uint256 newThreshold,
        bytes32 nonce,
        bytes calldata vaa
    ) external {
        require(targetSafe == address(safe), "wrong safe");

        // 1) ask validator to OK this exact call
        bytes memory callData = abi.encodeWithSelector(
            this.applyRecovery.selector, targetSafe, newOwners, newThreshold, nonce, vaa
        );
        require(validator.validate(callData, vaa) == MAGICVALUE, "validation failed");

        // 2) Read current owners
        address[] memory current = safe.getOwners();

        // 3) mark which current owners to keep & add missing
        bool[] memory keep = new bool[](current.length);
        for (uint i=0; i<newOwners.length; i++) {
            address o = newOwners[i];
            bool found;
            for (uint j=0; j<current.length; j++) {
                if (current[j] == o) { keep[j] = true; found = true; break; }
            }
            if (!found) {
                _moduleCall(address(safe), abi.encodeWithSelector(
                    ISafe.addOwnerWithThreshold.selector, o, _safeThreshold()
                ));
            }
        }

        // 4) remove owners not kept (need prevOwner; Safe uses linked list w/ sentinel 0x1)
        address SENTINEL = address(0x1);
        for (uint j=0; j<current.length; j++) {
            if (!keep[j]) {
                address prev = (j == 0) ? SENTINEL : current[j-1];
                _moduleCall(address(safe), abi.encodeWithSelector(
                    ISafe.removeOwner.selector, prev, current[j], _safeThreshold()
                ));
            }
        }

        // 5) set final threshold
        _moduleCall(address(safe), abi.encodeWithSelector(ISafe.changeThreshold.selector, newThreshold));

        // 6) mark nonce consumed
        (bool ok, ) = address(validator).call(abi.encodeWithSignature("markConsumed(bytes32)", nonce));
        require(ok, "consume failed");

        emit RecoveryApplied(address(safe), newThreshold, nonce);
    }

    function _moduleCall(address to, bytes memory data) internal {
        (bool success, ) = safe.execTransactionFromModuleReturnData(to, 0, data, 0 /* CALL */);
        require(success, "safe module call failed");
    }

    function _safeThreshold() internal view returns (uint256) {
        return safe.getThreshold();
    }
}