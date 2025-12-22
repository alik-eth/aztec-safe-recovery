use crate::Recovery;
use aztec::protocol_types::{address::{AztecAddress, EthAddress}};
use aztec::test::helpers::test_environment::TestEnvironment;

/// Returns (env, contract_address, admin, user1, user2, test_safe_address)
pub unconstrained fn setup_contract() -> (&mut TestEnvironment, AztecAddress, AztecAddress, AztecAddress, AztecAddress, EthAddress) {
    let mut env = TestEnvironment::new();

    let admin = env.create_light_account();
    let user = env.create_light_account();
    let user2 = env.create_light_account();

    // Create test EVM addresses
    let safe_address = EthAddress::from_field(0xcafe);
    let destination_address = EthAddress::from_field(0xbeef);
    let chain_id: Field = 11155111; // Sepolia
    let threshold: u32 = 2;

    let wormhole_address = deploy_wormhole_contract(&mut env);
    let contract_address = deploy_recovery_contract(&mut env, admin, wormhole_address, chain_id, safe_address, destination_address, threshold);

    (&mut env, contract_address, admin, user, user2, safe_address)
}

pub unconstrained fn deploy_wormhole_contract(env: &mut TestEnvironment) -> AztecAddress {
    let address = env.deploy("@dummyhole/DummyHole").without_initializer();
    address
}

pub unconstrained fn deploy_recovery_contract(
    env: &mut TestEnvironment,
    owner: AztecAddress,
    wormhole_address: AztecAddress,
    chain_id: Field,
    safe_address: EthAddress,
    destination_address: EthAddress,
    threshold: u32,
) -> AztecAddress {
    // Constructor: owner, wormhole_address, chain_id, safe_address, destination_address, threshold
    let initializer_call_interface =
        Recovery::interface().constructor(owner, wormhole_address, chain_id, safe_address, destination_address, threshold);

    let address = env.deploy("Recovery").with_public_initializer(owner, initializer_call_interface);

    address
}
