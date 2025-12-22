use aztec::protocol_types::{address::{AztecAddress, EthAddress}, traits::{Deserialize, Packable, Serialize}};
use std::meta::derive;

/// Config for this Recovery contract instance
/// One contract deployed per Safe
#[derive(Deserialize, Eq, Packable, Serialize)]
pub struct Config {
    pub owner: AztecAddress,            // Owner who controls guardians
    pub wormhole_address: AztecAddress, // Wormhole bridge contract
    pub chain_id: Field,                // Target EVM chain ID for recovery
    pub safe_address: EthAddress,       // The EVM Safe this contract protects
    pub destination_address: EthAddress, // EVM contract to receive recovery message
}
