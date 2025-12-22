use dep::aztec::{
    macros::notes::note,
    oracle::random::random,
    protocol_types::{address::{AztecAddress, EthAddress}, traits::{Deserialize, Packable, Serialize}},
};

/// GuardianNote - stores a guardian's Aztec address for a specific Safe
/// The `safe_address` links this guardian to an EVM Safe wallet
#[derive(Eq, Serialize, Deserialize, Packable)]
#[note]
pub struct GuardianNote {
    guardian: AztecAddress,      // The guardian's Aztec address
    safe_address: EthAddress,    // The EVM Safe this guardian protects
    owner: AztecAddress,         // The Aztec address that added this guardian
    randomness: Field,
}

impl GuardianNote {
    pub fn new(guardian: AztecAddress, safe_address: EthAddress, owner: AztecAddress) -> Self {
        // Safety: required for randomness
        let randomness = unsafe { random() };
        GuardianNote { guardian, safe_address, owner, randomness }
    }

    pub fn get_guardian(self) -> AztecAddress {
        self.guardian
    }

    pub fn get_safe_address(self) -> EthAddress {
        self.safe_address
    }
}

/// VoteNote - tracks votes for a recovery candidate
#[derive(Eq, Serialize, Deserialize, Packable)]
#[note]
pub struct VoteNote {
    votes: Field,
    finished: bool,
    safe_address: EthAddress,    // Which Safe this vote is for
    owner: AztecAddress,
    randomness: Field,
}

impl VoteNote {
    pub fn new(votes: Field, finished: bool, safe_address: EthAddress, owner: AztecAddress) -> Self {
        // Safety: required for randomness
        let randomness = unsafe { random() };
        VoteNote { votes, finished, safe_address, owner, randomness }
    }

    pub fn get_votes(self) -> Field {
        self.votes
    }

    pub fn is_finished(self) -> bool {
        self.finished
    }
}

// Keep the old AddressNote for backwards compatibility if needed
#[derive(Eq, Serialize, Deserialize, Packable)]
#[note]
pub struct AddressNote {
    address: AztecAddress,
    owner: AztecAddress,
    randomness: Field,
}

impl AddressNote {
    pub fn new(address: AztecAddress, owner: AztecAddress) -> Self {
        // Safety: required for randomness
        let randomness = unsafe { random() };
        AddressNote { address, owner, randomness }
    }

    pub fn get_address(self) -> AztecAddress {
        self.address
    }
}

/// GuardianRecordNote - owner's private record of a guardian they added
/// This allows the owner to remember who they added and set an alias
#[derive(Eq, Serialize, Deserialize, Packable)]
#[note]
pub struct GuardianRecordNote {
    guardian: AztecAddress,      // The guardian's Aztec address
    alias: Field,                // A short alias (e.g., hash of name or numeric ID)
    owner: AztecAddress,         // The owner who created this record (note owner)
    randomness: Field,
}

impl GuardianRecordNote {
    pub fn new(guardian: AztecAddress, alias: Field, owner: AztecAddress) -> Self {
        // Safety: required for randomness
        let randomness = unsafe { random() };
        GuardianRecordNote { guardian, alias, owner, randomness }
    }

    pub fn get_guardian(self) -> AztecAddress {
        self.guardian
    }

    pub fn get_alias(self) -> Field {
        self.alias
    }
}
