// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IValidator7579} from "./interfaces/IValidator7579.sol";
import {IWormholeCoreMock} from "./interfaces/IWormholeCoreMock.sol";

/// ERC-7579 validator that only approves adapter.applyRecovery(...) when
/// a Wormhole-verified (mocked) VAA authorizes a new owner set + threshold.
contract AztecGuardianRecoveryValidator is IValidator7579 {
    bytes4 internal constant MAGICVALUE = 0x1626ba7e; // EIP-1271

    IWormholeCoreMock public wormhole;
    address public adapter; // set at deploy or via onInstall
    address public owner;   // admin (pause/adapter set)
    bool    public paused;

    mapping(bytes32 => bool) public consumed; // replay protection

    event AdapterSet(address indexed adapter);
    event Paused(bool value);

    constructor(address _wormhole, address _adapter) {
        wormhole = IWormholeCoreMock(_wormhole);
        adapter  = _adapter;
        owner    = msg.sender;
        emit AdapterSet(_adapter);
    }

    modifier onlyOwner() { require(msg.sender == owner, "not owner"); _; }
    function setAdapter(address _adapter) external onlyOwner { adapter = _adapter; emit AdapterSet(_adapter); }
    function setPaused(bool v) external onlyOwner { paused = v; emit Paused(v); }

    // --- 7579 ---
    function isModuleType(uint256 t) external pure returns (bool) { return t == 1; } // validator
    function onInstall(bytes calldata data) external {
        if (adapter == address(0) && data.length == 20) {
            adapter = address(bytes20(data));
            emit AdapterSet(adapter);
        }
    }
    function onUninstall(bytes calldata) external {}

    /// payload = (uint8 version, uint256 chainId, address safe, address[] owners, uint256 thr, bytes32 nonce, uint64 expiry)
    function validate(bytes calldata callData, bytes calldata vaa) external view returns (bytes4) {
        require(!paused, "paused");
        require(adapter != address(0), "adapter unset");
        require(msg.sender == adapter, "only adapter");

        (bytes memory payload, bool ok, ) = wormhole.parseAndVerifyVM(vaa);
        require(ok, "invalid VAA");

        (uint8 version, uint256 chainId, address safe, address[] memory owners, uint256 thr, bytes32 nonce, uint64 expiry)
            = abi.decode(payload,(uint8,uint256,address,address[],uint256,bytes32,uint64));

        require(version == 1, "bad version");
        require(chainId == block.chainid, "wrong chain");
        require(block.timestamp <= expiry, "expired");
        require(!consumed[nonce], "replay");

        // selector must match applyRecovery(address,address[],uint256,bytes32,bytes)
        bytes4 selector; assembly { selector := calldataload(callData.offset) }
        require(selector == bytes4(keccak256("applyRecovery(address,address[],uint256,bytes32,bytes)")), "bad selector");

        // compare callData with payload to prevent mix-and-match
        _validateCallData(callData[4:], safe, owners, thr, nonce);

        return MAGICVALUE;
    }

    function markConsumed(bytes32 nonce) external {
        require(msg.sender == adapter, "only adapter");
        consumed[nonce] = true;
    }

    function _validateCallData(
        bytes calldata encodedData,
        address expectedSafe,
        address[] memory expectedOwners,
        uint256 expectedThr,
        bytes32 expectedNonce
    ) internal pure {
        (address callSafe, address[] memory callOwners, uint256 callThr, bytes32 callNonce, ) =
            abi.decode(encodedData, (address, address[], uint256, bytes32, bytes));

        require(callSafe == expectedSafe, "safe mismatch");
        require(callThr == expectedThr, "thr mismatch");
        require(callNonce == expectedNonce, "nonce mismatch");
        _requireSameArray(expectedOwners, callOwners);
    }

    function _requireSameArray(address[] memory a, address[] memory b) internal pure {
        require(a.length == b.length, "owners length");
        for (uint i; i < a.length; i++) require(a[i] == b[i], "owners diff");
    }
}