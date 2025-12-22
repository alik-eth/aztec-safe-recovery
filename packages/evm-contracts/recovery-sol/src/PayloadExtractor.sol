// SPDX-License-Identifier: Apache 2
pragma solidity ^0.8.20;

    /**
     * @notice Parsed payload structure
     */
    struct ParsedPayload {
        bytes32 txId;           // Aztec transaction hash
        address addressField5;  // Address from Aztec field 5 (reversed)
        uint16 chainId;        // Chain ID from field 6 (reversed)
        uint8 amount;          // Amount from field 7 (first byte)
        address addressField7; // Full address from field 7 (reversed)
    }

/**
 * @title PayloadExtractor
 * @notice Utility contract to extract fields from Aztec VAA payloads
 * @dev Handles byte reversal from Aztec's little-endian Field elements
 */
contract PayloadExtractor {
    
    /**
     * @notice Extract all fields from the payload
     * @param payload The 96-byte VAA payload from Aztec
     * @return parsed Struct containing all extracted and corrected fields
     */
    function parsePayload(bytes memory payload) 
        public 
        pure 
        returns (ParsedPayload memory parsed) 
    {
        require(payload.length >= 75, "Payload too short");
        
        // Extract Transaction ID (offset 0, no reversal needed)
        bytes32 txId;
        assembly {
            txId := mload(add(payload, 32))
        }
        parsed.txId = txId;
        
        // Extract and reverse address from field 5 (offset 32, 20 bytes)
        parsed.addressField5 = extractAndReverseAddress(payload, 32);
        
        // Extract and reverse chain ID (offset 52, 2 bytes)
        parsed.chainId = extractAndReverseUint16(payload, 52);
        
        // Extract amount (offset 54, 1 byte - no reversal needed)
        parsed.amount = uint8(payload[54]);
        
        // Extract and reverse address from field 7 (offset 55, 20 bytes)
        parsed.addressField7 = extractAndReverseAddress(payload, 55);
        
        return parsed;
    }
    
    /**
     * @notice Extract just the test address (field 7) from the payload
     * @param payload The VAA payload
     * @return The original address (with bytes reversed back)
     */
    function extractTestAddress(bytes memory payload) 
        public 
        pure 
        returns (address) 
    {
        require(payload.length >= 75, "Payload too short");
        return extractAndReverseAddress(payload, 55);
    }
    
    /**
     * @notice Extract just the recipient address (field 5) from the payload
     * @param payload The VAA payload
     * @return The original address (with bytes reversed back)
     */
    function extractRecipientAddress(bytes memory payload) 
        public 
        pure 
        returns (address) 
    {
        require(payload.length >= 52, "Payload too short");
        return extractAndReverseAddress(payload, 32);
    }
    
    /**
     * @notice Extract an address from the payload and reverse its bytes
     * @param payload The payload bytes
     * @param offset The byte offset where the address starts
     * @return The address with bytes reversed to correct order
     */
    function extractAndReverseAddress(bytes memory payload, uint256 offset) 
        internal 
        pure 
        returns (address) 
    {
        require(payload.length >= offset + 20, "Insufficient bytes for address");
        
        // Extract 20 bytes by copying them one by one
        bytes memory reversedBytes = new bytes(20);
        for (uint i = 0; i < 20; i++) {
            reversedBytes[i] = payload[offset + i];
        }
        
        // Convert to bytes20
        bytes20 reversedAddr;
        assembly {
            reversedAddr := mload(add(reversedBytes, 32))
        }
        
        // Reverse the bytes using our working reverseBytes20 function
        uint160 original = reverseBytes20(reversedAddr);
        
        return address(original);
    }
    
    /**
     * @notice Extract a uint16 from the payload and reverse its bytes
     * @param payload The payload bytes
     * @param offset The byte offset where the uint16 starts
     * @return The uint16 with bytes reversed
     */
    function extractAndReverseUint16(bytes memory payload, uint256 offset) 
        public 
        pure 
        returns (uint16) 
    {
        require(payload.length >= offset + 2, "Insufficient bytes for uint16");
        
        // Extract 2 bytes
        uint8 byte0 = uint8(payload[offset]);
        uint8 byte1 = uint8(payload[offset + 1]);
        
        // Reverse: big-endian to little-endian (or vice versa)
        return (uint16(byte1) << 8) | uint16(byte0);
    }
    
    /**
     * @notice Reverse the byte order of a bytes20 value
     * @param input The bytes20 to reverse
     * @return The reversed value as uint160
     */
    function reverseBytes20(bytes20 input) public pure returns (uint160) {
        uint160 reversed = 0;
        
        // Reverse each byte
        // input[0] should become the last byte (position 19)
        // input[19] should become the first byte (position 0)
        for (uint i = 0; i < 20; i++) {
            // Extract byte at position i from input
            uint8 b = uint8(bytes1(input << (i * 8)));
            // Place it at position (19 - i) in the output
            reversed |= uint160(b) << (8 * i);
        }
        
        return reversed;
    }
    
    /**
     * @notice Alternative implementation using inline assembly for gas efficiency
     */
    function reverseBytes20Assembly(bytes20 input) internal pure returns (uint160) {
        uint160 reversed;
        
        assembly {
            let temp := input
            
            // Reverse bytes using assembly
            // This is more gas efficient but harder to read
            reversed := or(
                or(
                    or(
                        or(
                            or(
                                or(
                                    or(
                                        or(
                                            or(
                                                or(
                                                    shl(152, and(temp, 0xff)),
                                                    shl(144, and(shr(8, temp), 0xff))
                                                ),
                                                shl(136, and(shr(16, temp), 0xff))
                                            ),
                                            shl(128, and(shr(24, temp), 0xff))
                                        ),
                                        shl(120, and(shr(32, temp), 0xff))
                                    ),
                                    shl(112, and(shr(40, temp), 0xff))
                                ),
                                shl(104, and(shr(48, temp), 0xff))
                            ),
                            shl(96, and(shr(56, temp), 0xff))
                        ),
                        shl(88, and(shr(64, temp), 0xff))
                    ),
                    shl(80, and(shr(72, temp), 0xff))
                ),
                or(
                    or(
                        or(
                            or(
                                or(
                                    or(
                                        or(
                                            or(
                                                or(
                                                    shl(72, and(shr(80, temp), 0xff)),
                                                    shl(64, and(shr(88, temp), 0xff))
                                                ),
                                                shl(56, and(shr(96, temp), 0xff))
                                            ),
                                            shl(48, and(shr(104, temp), 0xff))
                                        ),
                                        shl(40, and(shr(112, temp), 0xff))
                                    ),
                                    shl(32, and(shr(120, temp), 0xff))
                                ),
                                shl(24, and(shr(128, temp), 0xff))
                            ),
                            shl(16, and(shr(136, temp), 0xff))
                        ),
                        shl(8, and(shr(144, temp), 0xff))
                    ),
                    and(shr(152, temp), 0xff)
                )
            )
        }
        
        return reversed;
    }
}