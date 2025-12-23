# Aztec Guardian Recovery

Privacy-preserving social recovery for Safe wallets using secret guardians on Aztec Network.

> **Demo Ready**: This project is deployed on Aztec Devnet + Sepolia and ready for testing.

## Demo

**Try it now:** 

Either:

- Deploy a new safe with our app: [Safe App Link](https://app.safe.global/share/safe-app?appUrl=https%3A%2F%2Ffrontend-coral-gamma-16.vercel.app&chain=sep)
- Use existing safe and add app in the "Apps" section as "Custom App"

### 1. Setup: Enable Recovery Module on Safe

Open Safe → Apps → Custom Apps → Add frontend-coral-gamma-16.vercel.app → Open it → Press "Get Started" → Connect Aztec wallet → Enable module → Press "Manage Guardians" → Add new guardian

<video src="https://ue1ux310la.ufs.sh/f/pG8rpZ83YylkTw0zq9U0HwqyN9As856PGTcxYaMrjlh1SO2K" controls width="100%"></video>

### 2. Guardian Portal

Guardian opens frontend-coral-gamma-16.vercel.app → connects Aztec wallet → Enters Safe address → Votes for new owner

<video src="https://ue1ux310la.ufs.sh/f/pG8rpZ83Yylk2l5hxHHrQkbFn0EIABiNq4soerv93OgjGcZy" controls width="100%"></video>

### 3. Recovery In Progress

Guardians vote for recovery candidate

![Recovery in progress](media/3.recovery-in-progress.webp)

### 4. Recovery Complete

Once threshold reached, Wormhole relays to Sepolia and Safe ownership transfers

<video src="https://ue1ux310la.ufs.sh/f/pG8rpZ83YylkwOr2bvLtIC1E6J0A7iRl5fsurGyMO9SWN3jp" controls width="100%"></video>

## Quick Start

**Requirements**: Chrome 85+, [Azguard Wallet](https://azguardwallet.io/)

```bash
# 1. Clone and install
git clone https://github.com/alik-eth/aztec-safe-recovery.git
cd aztec-safe-recovery
npm install

# 2. Start the frontend
cd packages/frontend
npm run dev
# Open http://localhost:3000
```

## The Problem

Traditional social recovery systems expose guardian identities on-chain. This creates privacy and security risks:
- Attackers know who to target for social engineering
- Guardians can be coerced or bribed
- The social graph of wallet owners is publicly visible

## The Solution

**Secret Guardians on Aztec**: Store guardian identities privately on Aztec Network. When recovery is needed, guardians vote anonymously, and only the recovery action (not guardian identities) is revealed.

## How It Works

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SETUP PHASE                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   Safe Owner                    Aztec Network                                │
│   ──────────                    ─────────────                                │
│                                                                              │
│   1. Register Safe ──────────►  Recovery Registry                            │
│      (links EVM Safe to           │                                          │
│       Aztec wallet)               │                                          │
│                                   │                                          │
│   2. Add Secret Guardians ────►   │  [Guardian Notes - PRIVATE]              │
│      (Aztec addresses)            │  - Guardian A: 0x123...                  │
│                                   │  - Guardian B: 0x456...                  │
│                                   │  - Guardian C: 0x789...                  │
│                                   │                                          │
│   3. Set Threshold ───────────►   │  Threshold: 2 of 3                       │
│                                   │                                          │
│   4. Install Module ──────────►  Safe Wallet (EVM)                           │
│      on Safe                      │                                          │
│                                   │  [SafeRecoveryModule enabled]            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                           RECOVERY PHASE                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   Guardian A (Aztec)            Aztec Network           Safe (EVM)           │
│   ──────────────────            ─────────────           ──────────           │
│                                                                              │
│   1. Start Vote ─────────────►  Recovery Registry                            │
│      candidate: 0xNEW_OWNER       │                                          │
│      (EVM address)                │  Vote started for                        │
│                                   │  Safe: 0xSAFE                            │
│                                   │  Candidate: 0xNEW_OWNER                  │
│                                   │  Votes: 1/2                              │
│                                                                              │
│   Guardian B (Aztec)              │                                          │
│   ──────────────────              │                                          │
│                                   │                                          │
│   2. Vote ───────────────────►    │  Votes: 2/2 ✓                            │
│      (anonymous)                  │  Threshold reached!                      │
│                                   │                                          │
│                                   │                                          │
│   3. Send Wormhole Message ───────┼──────────────────►  Wormhole             │
│      [Safe, NewOwner]             │                       │                  │
│                                   │                       │                  │
│                                   │                       ▼                  │
│                                   │               Relayer picks up           │
│                                   │               VAA message                │
│                                   │                       │                  │
│                                   │                       ▼                  │
│                              ◄────┼───────────────  SafeRecoveryModule       │
│                                   │               executes recovery          │
│                                   │                       │                  │
│                                   │                       ▼                  │
│                                   │               Safe owner changed         │
│                                   │               to 0xNEW_OWNER             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Key Privacy Properties

| What's Private | What's Public |
|---------------|---------------|
| Guardian identities (Aztec addresses) | That a Safe has recovery enabled |
| Number of guardians | Recovery threshold |
| Who voted | That threshold was reached |
| Guardian-owner relationships | The new owner address (after recovery) |

## Architecture

```
packages/
├── aztec-contracts/
│   └── recovery/           # Noir contract - Secret guardian registry
│       ├── src/main.nr     # Main contract logic
│       ├── src/notes.nr    # GuardianNote, VoteNote definitions
│       └── src/config.nr   # Configuration structs
│
├── evm-contracts/
│   └── recovery-sol/       # Solidity contracts
│       ├── SafeRecoveryModule.sol      # Module enabled on Safe
│       └── AztecRecoveryValidator.sol  # Validates Wormhole messages
│
├── relayer/                # Go service
│   └── relayer.go          # Bridges Wormhole VAAs to EVM
│
└── frontend/               # Next.js 15 + React 19
    ├── app/
    │   ├── page.tsx        # Landing page
    │   ├── setup/          # Setup wizard for Safe owners
    │   └── guardian/       # Guardian portal for voting
    └── components/
        ├── safe/           # Safe wallet integration
        └── providers/      # Wagmi + RainbowKit
```

## Contracts

### Aztec Recovery Registry (Noir)

A **shared registry** where multiple Safe wallets can register their secret guardians.

```noir
// Storage structure
struct Storage {
    safe_owners: Map<EthAddress, AztecAddress>,     // Safe → Owner's Aztec wallet
    thresholds: Map<EthAddress, u32>,               // Safe → Required votes
    guardians: PrivateSet<GuardianNote>,            // Private guardian storage
    votes: Map<EthAddress, Map<EthAddress, VoteNote>>, // Safe → Candidate → Votes
}

// Key functions
fn register_safe(safe_address: EthAddress, threshold: u32)
fn add_guardian(safe_address: EthAddress, guardian: AztecAddress)    // Private
fn remove_guardian(safe_address: EthAddress, guardian: AztecAddress) // Private
fn start_vote(safe_address: EthAddress, candidate: EthAddress)       // Private
fn vote(safe_address: EthAddress, candidate: EthAddress)             // Private
fn send_wormhole_message(safe_address: EthAddress, candidate: EthAddress, msg: [[u8; 31]; 7])
```

### SafeRecoveryModule (Solidity)

A **singleton module** that any Safe can enable. Receives recovery instructions via Wormhole.

```solidity
contract SafeRecoveryModule {
    IValidator7579 public immutable validator;

    function applyRecovery(
        address targetSafe,
        address[] calldata newOwners,
        uint256 newThreshold,
        bytes32 nonce,
        bytes calldata vaa      // Wormhole Verified Action Approval
    ) external;
}
```

### AztecRecoveryValidator (Solidity)

Validates that recovery messages originated from the Aztec contract via Wormhole.

```solidity
contract AztecRecoveryValidator is IValidator7579 {
    IWormhole public wormhole;
    bytes32 public aztecEmitterAddress;
    uint16 public aztecChainId;

    function validate(bytes calldata callData, bytes calldata vaa)
        external view returns (bytes4);
}
```

## Deployed Contracts (Testnet)

### Sepolia (EVM)

| Contract | Address | Etherscan |
|----------|---------|-----------|
| SafeRecoveryModule | `0x641a72f4B0BabE087A955aFeC6Da9E58bdB18643` | [View](https://sepolia.etherscan.io/address/0x641a72f4B0BabE087A955aFeC6Da9E58bdB18643) |
| AztecRecoveryValidator | `0x6b27676c01108FaB773e9731Fe3453d3E35a12E3` | [View](https://sepolia.etherscan.io/address/0x6b27676c01108FaB773e9731Fe3453d3E35a12E3) |
| MockWormholeCore | `0xcA17193413115D712eE57ed74c9968f819Ae4b7E` | [View](https://sepolia.etherscan.io/address/0xcA17193413115D712eE57ed74c9968f819Ae4b7E) |

### Aztec Devnet

| Contract | Address |
|----------|---------|
| Recovery Registry | Deploy your own via `/setup` or use existing |
| Wormhole Core | Built into Aztec devnet |

> **Note**: Each Safe owner deploys their own Recovery contract on Aztec. The contract address is registered with the SafeRecoveryModule on Sepolia.

## Setup

### Prerequisites

- Node.js >= 20.9.0
- Go >= 1.21 (for relayer)
- Foundry (for Solidity contracts)
- Aztec CLI (for Noir contracts)

### Installation

```bash
# Install dependencies
npm install

# Build Aztec contracts
cd packages/aztec-contracts/recovery
aztec-nargo compile

# Build EVM contracts
cd packages/evm-contracts/recovery-sol
forge build

# Build relayer
cd packages/relayer
go build -o relayer .

# Install frontend dependencies
cd packages/frontend
npm install
```

### Configuration

Copy environment files:

```bash
cp packages/relayer/.env.example packages/relayer/.env
cp packages/frontend/.env.example packages/frontend/.env
```

Configure the relayer (`.env`):
```env
SPY_RPC_HOST=localhost:7073
SOURCE_CHAIN_ID=56              # Aztec application messages
DEST_CHAIN_ID=10002             # Sepolia chain ID in Wormhole
EVM_RPC_URL=https://0xrpc.io/sep
PRIVATE_KEY=0x...your_private_key
EVM_TARGET_CONTRACT=0x641a72f4B0BabE087A955aFeC6Da9E58bdB18643
ACCEPT_ANY_EMITTER=true         # For testing
```

> **Important**: Use `SOURCE_CHAIN_ID=56` for recovery VAAs. Chain 26 is for Aztec internal messages only.

Configure the frontend (`.env`):
```env
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id
NEXT_PUBLIC_AZTEC_PXE_URL=https://pxe.devnet.aztec.network
```

> **Note**: The Aztec recovery contract is deployed per-Safe during setup. Use Azguard wallet for Aztec devnet.

### Running

```bash
# Build and start the relayer
cd packages/relayer
go build -o relayer .
./relayer

# Start the frontend (in another terminal)
cd packages/frontend
npm run dev
```

### E2E Testing

Run the full end-to-end test (Aztec → Wormhole → Sepolia):

```bash
# Terminal 1: Start the relayer
cd packages/relayer
./relayer

# Terminal 2: Run the e2e test
cd packages/aztec-contracts/recovery-ts
PRIVATE_KEY=0x... npx tsx scripts/e2e_test.ts
```

The e2e test creates a new Safe, enables the module, deploys an Aztec recovery contract, adds a guardian, votes, and verifies the recovery completes via Wormhole.

## User Flows

### For Safe Owners (Setup)

1. **Connect Safe**: Enter your Safe wallet address
2. **Connect Aztec**: Connect your Aztec wallet (runs PXE locally)
3. **Add Guardians**: Add Aztec addresses of your trusted guardians
4. **Set Threshold**: Choose how many guardians needed (e.g., 2 of 3)
5. **Install Module**: Enable SafeRecoveryModule on your Safe

### For Guardians (Recovery)

1. **Connect Aztec Wallet**: Connect to see Safes you're guarding
2. **Initiate Recovery**: Start a vote with proposed new owner (EVM address)
3. **Vote**: Other guardians vote to approve
4. **Execute**: Once threshold reached, recovery is sent via Wormhole

## Security Considerations

- **Guardian Privacy**: Guardian addresses are stored in Aztec private notes, never revealed on-chain
- **Double-Vote Prevention**: Nullifiers prevent guardians from voting twice
- **Threshold Delay**: Threshold changes have a time delay to prevent last-minute attacks
- **Wormhole Verification**: All recovery messages are verified through Wormhole's guardian network

## Testing

```bash
# Run Aztec contract tests
cd packages/aztec-contracts/recovery
aztec-nargo test

# Run EVM contract tests
cd packages/evm-contracts/recovery-sol
forge test
```

## License

MIT License - see [LICENSE](LICENSE)
