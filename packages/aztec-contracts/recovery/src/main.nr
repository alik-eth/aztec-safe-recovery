mod config;
mod notes;
pub mod test;

use aztec::macros::aztec;

#[aztec]
pub contract Recovery {
    use crate::config::Config;
    use crate::notes::{AddressNote, GuardianRecordNote};

    use aztec::context::PrivateContext;
    use aztec::keys::getters::get_public_keys;
    use aztec::macros::functions::{external, initializer};
    use aztec::macros::storage::storage;
    use aztec::messages::message_delivery::MessageDelivery;
    use aztec::note::{
        note_getter_options::NoteGetterOptions, note_interface::NoteProperties,
        retrieved_note::RetrievedNote,
    };
    use aztec::protocol_types::{address::{AztecAddress, EthAddress}, traits::{Hash, ToField}};
    use aztec::state_vars::{
        delayed_public_mutable::DelayedPublicMutable, map::Map,
        private_set::PrivateSet, public_immutable::PublicImmutable,
        public_mutable::PublicMutable,
    };
    use aztec::utils::comparison::Comparator;

    use std::hash::pedersen_hash;

    use wormhole::Wormhole;

    pub(crate) global CHANGE_AUTHORIZED_DELAY: u64 = 180;

    #[storage]
    struct Storage<Context> {
        config: PublicImmutable<Config, Context>,
        threshold: DelayedPublicMutable<u32, CHANGE_AUTHORIZED_DELAY, Context>,
        // Private guardian notes (visible to each guardian)
        guardians: PrivateSet<AddressNote, Context>,
        // Public guardian registry (for duplicate check and transparency)
        guardian_registered: Map<AztecAddress, PublicMutable<bool, Context>, Context>,
        guardian_count: PublicMutable<u32, Context>,
        // Public vote counts - anyone can see how many votes each candidate has
        vote_counts: Map<EthAddress, PublicMutable<u32, Context>, Context>,
        // Track if recovery was already sent for a candidate (prevent duplicates)
        recovery_sent: Map<EthAddress, PublicMutable<bool, Context>, Context>,
        // Owner's private records of guardians they added (with aliases)
        guardian_records: PrivateSet<GuardianRecordNote, Context>,
    }

    #[initializer]
    #[external("public")]
    fn constructor(
        owner: AztecAddress,
        wormhole_address: AztecAddress,
        chain_id: Field,
        safe_address: EthAddress,
        destination_address: EthAddress,
        threshold: u32
    ) {
        storage.config.initialize(Config { owner, wormhole_address, chain_id, safe_address, destination_address });
        storage.threshold.schedule_value_change(threshold);
    }

    #[external("public")]
    fn set_threshold(threshold: u32) {
        let caller = context.msg_sender().unwrap();

        let config = storage.config.read();
        assert(caller == config.owner, "Not owner");

        storage.threshold.schedule_value_change(threshold);
    }

    #[external("private")]
    fn add_guardian(guardian: AztecAddress, alias: Field) {
        let (owner, caller) = is_owner_macro(&mut context);

        // Create note and emit to GUARDIAN so they can see it
        let note = AddressNote::new(guardian, caller);
        storage.guardians.insert(note).emit(guardian, MessageDelivery.CONSTRAINED_ONCHAIN);

        // Create a record note for the OWNER to remember this guardian
        let record = GuardianRecordNote::new(guardian, alias, owner);
        storage.guardian_records.insert(record).emit(owner, MessageDelivery.CONSTRAINED_ONCHAIN);

        // Enqueue public call to register guardian
        Recovery::at(context.this_address()).register_guardian_public(guardian).enqueue(&mut context);
    }

    // Internal: register guardian in public state (only callable via enqueue from this contract)
    #[external("public")]
    fn register_guardian_public(guardian: AztecAddress) {
        // Ensure only this contract can call this function
        assert(context.msg_sender().unwrap() == context.this_address(), "Only callable internally");

        let already_registered = storage.guardian_registered.at(guardian).read();
        assert(!already_registered, "Guardian already exists");

        storage.guardian_registered.at(guardian).write(true);
        let count = storage.guardian_count.read();
        let new_count = count + 1;
        storage.guardian_count.write(new_count);

        // Auto-increment threshold to maintain security
        // Threshold should always be > half of guardians (majority required)
        let current_threshold = storage.threshold.get_current_value();
        let min_safe_threshold = (new_count / 2) + 1; // majority
        if current_threshold < min_safe_threshold {
            storage.threshold.schedule_value_change(min_safe_threshold);
        }
    }

    #[external("private")]
    fn remove_guardian(guardian: AztecAddress) {
        let (_, _caller) = is_owner_macro(&mut context);

        // Remove guardian's private note
        let notes = storage.guardians.pop_notes(NoteGetterOptions::new().select(
            AddressNote::properties().address,
            Comparator.EQ,
            guardian,
        ));
        assert(notes.len() > 0, "Guardian not found");

        // Remove owner's record note for this guardian
        let _records = storage.guardian_records.pop_notes(NoteGetterOptions::new().select(
            GuardianRecordNote::properties().guardian,
            Comparator.EQ,
            guardian,
        ));

        // Enqueue public call to unregister guardian
        Recovery::at(context.this_address()).unregister_guardian_public(guardian).enqueue(&mut context);
    }

    // Internal: unregister guardian in public state (only callable via enqueue from this contract)
    #[external("public")]
    fn unregister_guardian_public(guardian: AztecAddress) {
        // Ensure only this contract can call this function
        assert(context.msg_sender().unwrap() == context.this_address(), "Only callable internally");

        let is_registered = storage.guardian_registered.at(guardian).read();
        assert(is_registered, "Guardian not registered");

        storage.guardian_registered.at(guardian).write(false);
        let count = storage.guardian_count.read();
        storage.guardian_count.write(count - 1);
    }

    // Guardian votes for a new owner candidate
    #[external("private")]
    fn vote(candidate: EthAddress) {
        let caller = context.msg_sender().unwrap();
        assert(is_guardian_macro(&mut context, caller), "Caller is not a guardian");

        // Create nullifier to prevent double voting (private)
        let msg_sender_npk_m_hash = get_public_keys(caller).npk_m.hash();
        let secret = context.request_nsk_app(msg_sender_npk_m_hash);
        let nullifier = pedersen_hash([caller.to_field(), candidate.to_field(), secret]);
        context.push_nullifier(nullifier);

        // Enqueue public call to increment vote count
        Recovery::at(context.this_address()).increment_vote_internal(candidate).enqueue(&mut context);
    }

    // Internal public function to increment vote count and check threshold
    // Only callable from this contract via enqueue
    #[external("public")]
    fn increment_vote_internal(candidate: EthAddress) {
        // Ensure only this contract can call this function
        assert(context.msg_sender().unwrap() == context.this_address(), "Only callable internally");

        // Check if recovery already sent for this candidate
        let already_sent = storage.recovery_sent.at(candidate).read();
        assert(!already_sent, "Recovery already sent for this candidate");

        let current_votes = storage.vote_counts.at(candidate).read();
        let new_votes = current_votes + 1;
        storage.vote_counts.at(candidate).write(new_votes);

        // Check if threshold reached
        let threshold = storage.threshold.get_current_value();
        if new_votes >= threshold {
            // Mark as sent to prevent duplicates
            storage.recovery_sent.at(candidate).write(true);

            // Send recovery message via Wormhole (inlined)
            let config = storage.config.read();
            let wormhole_address = config.wormhole_address;
            let chain_id = config.chain_id;
            let safe_address = config.safe_address;
            let destination_address = config.destination_address;

            let candidate_field: Field = candidate.to_field();
            let candidate_bytes: [u8; 31] = candidate_field.to_le_bytes();

            let destination_field: Field = destination_address.to_field();
            let destination_bytes: [u8; 31] = destination_field.to_le_bytes();

            let chain_id_bytes: [u8; 31] = chain_id.to_le_bytes();

            let safe_field: Field = safe_address.to_field();
            let safe_bytes: [u8; 31] = safe_field.to_le_bytes();

            // Payload: [destination_address, chain_id, safe_address, candidate, padding...]
            let wormhole_payload: [[u8; 31]; 8] = [
                destination_bytes,
                chain_id_bytes,
                safe_bytes,
                candidate_bytes,
                [0; 31], [0; 31], [0; 31], [0; 31]
            ];

            let nonce = 1;
            let message_fee: u128 = 0;
            let consistency: u8 = 2;
            let from = context.msg_sender().unwrap();
            let token_nonce = 0;

            let _ = Wormhole::at(wormhole_address)
                .publish_message_in_public(
                    nonce,
                    wormhole_payload,
                    message_fee,
                    consistency,
                    from,
                    token_nonce,
                )
                .call(&mut context);
        }
    }

    // Get vote count for a candidate (public - anyone can read)
    #[external("public")]
    fn get_vote_count(candidate: EthAddress) -> u32 {
        storage.vote_counts.at(candidate).read()
    }

    // Check if recovery was already sent for a candidate
    #[external("public")]
    fn is_recovery_sent(candidate: EthAddress) -> bool {
        storage.recovery_sent.at(candidate).read()
    }

    // Get the Safe address this contract protects
    #[external("public")]
    fn get_safe_address() -> EthAddress {
        storage.config.read().safe_address
    }

    #[external("private")]
    fn is_guardian(address: AztecAddress) -> bool {
        is_guardian_macro(&mut context, address)
    }

    #[external("private")]
    fn get_guardian_note(address: AztecAddress) -> Option<AddressNote> {
        let notes = get_guardian_notes_macro(&mut context, address);
        if notes.len() > 0 {
            Option::some(notes.get(0).note)
        } else {
            Option::none()
        }
    }

    // Get total guardian count (public - reads from public counter)
    #[external("public")]
    fn get_guardian_count() -> u32 {
        storage.guardian_count.read()
    }

    #[external("public")]
    fn get_threshold() -> u32 {
        storage.threshold.get_current_value()
    }

    // Owner can retrieve their private guardian records (with aliases)
    // Returns up to 16 guardian records
    #[external("private")]
    fn get_my_guardian_records() -> BoundedVec<GuardianRecordNote, 16> {
        let (_owner, _caller) = is_owner_macro(&mut context);
        let notes = storage.guardian_records.get_notes(NoteGetterOptions::new());
        let mut records: BoundedVec<GuardianRecordNote, 16> = BoundedVec::new();
        let len = notes.len();
        for i in 0..16 {
            if i < len {
                records.push(notes.get(i).note);
            }
        }
        records
    }

    #[contract_library_method]
    fn is_owner_macro(context: &mut PrivateContext) -> (AztecAddress, AztecAddress) {
        let storage = Storage::init(context);
        let config = storage.config.read();
        let owner = config.owner;
        let caller = context.msg_sender().unwrap();

        assert(caller == owner, "Not owner");
        (owner, caller)
    }

    #[contract_library_method]
    fn is_guardian_macro(context: &mut PrivateContext, address: AztecAddress) -> bool {
        let notes = get_guardian_notes_macro(context, address);
        notes.len() > 0
    }

    #[contract_library_method]
    fn get_guardian_notes_macro(
        context: &mut PrivateContext,
        address: AztecAddress,
    ) -> BoundedVec<RetrievedNote<AddressNote>, 16> {
        let storage = Storage::init(context);
        storage.guardians.get_notes(NoteGetterOptions::new().select(
            AddressNote::properties().address,
            Comparator.EQ,
            address,
        ))
    }
}
