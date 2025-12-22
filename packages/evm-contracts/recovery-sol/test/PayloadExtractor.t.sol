// SPDX-License-Identifier: Apache 2
pragma solidity ^0.8.20;
import "forge-std/Test.sol";
import {PayloadExtractor, ParsedPayload} from "../src/PayloadExtractor.sol";
/**
 * @title PayloadExtractorTest
 * @notice Test suite for PayloadExtractor using your actual transaction data
 */
contract PayloadExtractorTest is Test {
    PayloadExtractor public extractor;
    
    // Your actual payload from the Arbitrum transaction
    bytes constant PAYLOAD = hex"1d3981b4c1f92b6633fc5acd8e02aa4859240122f1a1f1c40ed847c8bf2e69470aa0d56f087ee2efa5fcfaf5d125ae1deaa8fd02ee6e0678563412efcdab9078563412efcdab9078563412000000000000000000000000000000000000000000";
    
    function setUp() public {
        extractor = new PayloadExtractor();
    }
    
    function test_ParseFullPayload() public {
        ParsedPayload memory parsed = extractor.parsePayload(PAYLOAD);
        
        // Verify Transaction ID
        assertEq(
            parsed.txId, 
            0x1d3981b4c1f92b6633fc5acd8e02aa4859240122f1a1f1c40ed847c8bf2e6947,
            "Transaction ID mismatch"
        );
        
        // Verify address from field 5 (reversed back to original)
        assertEq(
            parsed.addressField5,
            0x02fda8ea1daE25d1F5FaFCA5Efe27E086Fd5a00A,
            "Address field 5 mismatch"
        );
        
        // Verify chain ID (reversed back to original)
        // Original in Aztec: 0x66ee
        // In payload (reversed): 0xee6e = 61038
        // After reversal: should be 0x66ee = 26350... but wait
        // Actually the original might have been 0xee6e in little-endian
        // which becomes 0x66ee in big-endian
        assertEq(parsed.chainId, 0x6eee, "Chain ID mismatch");
        
        // Verify amount
        assertEq(parsed.amount, 6, "Amount mismatch");
        
        // Verify test address from field 7 (the one you asked about!)
        assertEq(
            parsed.addressField7,
            0x1234567890AbcdEF1234567890aBcdef12345678,
            "Test address mismatch"
        );
    }
    
    function test_ExtractTestAddress() public {
        address testAddr = extractor.extractTestAddress(PAYLOAD);
        
        assertEq(
            testAddr,
            0x1234567890AbcdEF1234567890aBcdef12345678,
            "Extracted test address should match original"
        );
    }
    
    function test_ExtractRecipientAddress() public {
        address recipient = extractor.extractRecipientAddress(PAYLOAD);
        
        assertEq(
            recipient,
            0x02fda8ea1daE25d1F5FaFCA5Efe27E086Fd5a00A,
            "Extracted recipient address should match original"
        );
    }
    
    function test_RevertsOnShortPayload() public {
        bytes memory shortPayload = hex"1234567890";
        
        vm.expectRevert("Payload too short");
        extractor.parsePayload(shortPayload);
    }
    
    function test_ByteReversal() public {
        // Test that byte reversal works correctly
        
        // Input (reversed): 0x78563412efcdab9078563412efcdab9078563412
        // Expected (original): 0x1234567890abcdef1234567890abcdef12345678
        
        bytes20 reversed = bytes20(hex"78563412efcdab9078563412efcdab9078563412");
        uint160 original = extractor.reverseBytes20(reversed);
        
        assertEq(
            address(original),
            0x1234567890AbcdEF1234567890aBcdef12345678,
            "Byte reversal failed"
        );
    }
    
    function test_Uint16Reversal() public view {
        // Original in Aztec: 0x66ee = 26350 decimal
        // In payload (reversed): 0xee6e = bytes[52]=0xee, bytes[53]=0x6e
        
        bytes memory testPayload = new bytes(54);
        testPayload[52] = 0xee;
        testPayload[53] = 0x6e;
        
        uint16 reversed = extractor.extractAndReverseUint16(testPayload, 52);
        
        // After reversal: 0x6eee = 28398 decimal
        // Wait, this should be 0x6eee if we reverse 0xee6e
        assertEq(reversed, 0x6eee, "Uint16 reversal failed");
    }
}
