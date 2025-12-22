package main

import (
	"context"
	"crypto/ecdsa"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"math/big"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	spyv1 "github.com/certusone/wormhole/node/pkg/proto/spy/v1"
	"github.com/joho/godotenv"
	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/ethclient"
	vaaLib "github.com/wormhole-foundation/wormhole/sdk/vaa"
	"go.uber.org/zap"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

// Global logger for initial setup
var logger *zap.Logger

// Initialize global logger
func initLogger() {
	var err error

	// Check for LOG_LEVEL environment variable
	logLevel := os.Getenv("LOG_LEVEL")

	var config zap.Config
	if logLevel == "debug" {
		config = zap.NewDevelopmentConfig()
		config.Level = zap.NewAtomicLevelAt(zap.DebugLevel)
	} else {
		config = zap.NewProductionConfig()
		if logLevel == "info" {
			config.Level = zap.NewAtomicLevelAt(zap.InfoLevel)
		} else if logLevel == "warn" {
			config.Level = zap.NewAtomicLevelAt(zap.WarnLevel)
		} else if logLevel == "error" {
			config.Level = zap.NewAtomicLevelAt(zap.ErrorLevel)
		}
	}

	logger, err = config.Build()
	if err != nil {
		// Fallback to standard logger if zap fails
		fmt.Printf("Failed to initialize zap logger: %v\n", err)
		logger = zap.NewExample()
	}
}


// Config holds all configuration parameters for the relayer
type Config struct {
	// Wormhole configuration
	SpyRPCHost       string // Wormhole spy service endpoint
	SourceChainID    uint16 // Source chain ID (Aztec)
	DestChainID      uint16 // Destination chain ID (EVM chain)
	WormholeContract string // Wormhole core contract address on Aztec
	EmitterAddress   string // Emitter address to monitor
	AcceptAnyEmitter bool   // Accept any emitter from source chain (for testing)

	// EVM chain configuration (Sepolia)
	EVMRPCURL         string // RPC URL for EVM chain
	PrivateKey        string // Private key for signing transactions
	EVMTargetContract string // SafeRecoveryModule contract on EVM

	// Custom VAA processor (optional)
	vaaProcessor func(*Relayer, *VAAData) error
}

// NewConfigFromEnv creates a Config from environment variables
func NewConfigFromEnv() Config {
	return Config{
		// Wormhole
		SpyRPCHost:       getEnvOrDefault("SPY_RPC_HOST", "localhost:7073"),
		SourceChainID:    uint16(getEnvIntOrDefault("SOURCE_CHAIN_ID", 56)),    // Aztec
		DestChainID:      uint16(getEnvIntOrDefault("DEST_CHAIN_ID", 10002)),   // Sepolia
		WormholeContract: getEnvOrDefault("WORMHOLE_CONTRACT", ""),
		EmitterAddress:   getEnvOrDefault("EMITTER_ADDRESS", ""),
		AcceptAnyEmitter: getEnvBoolOrDefault("ACCEPT_ANY_EMITTER", false),

		// EVM chain
		EVMRPCURL:         getEnvOrDefault("EVM_RPC_URL", ""),
		PrivateKey:        getEnvOrDefault("PRIVATE_KEY", ""),
		EVMTargetContract: getEnvOrDefault("EVM_TARGET_CONTRACT", ""),
	}
}

// VAAData encapsulates a VAA and its metadata
type VAAData struct {
	VAA        *vaaLib.VAA // The parsed VAA
	RawBytes   []byte      // Raw VAA bytes
	ChainID    uint16      // Source chain ID
	EmitterHex string      // Hex-encoded emitter address
	Sequence   uint64      // VAA sequence number
	TxID       string      // Source transaction ID
}

// SpyClient handles connections to the Wormhole spy service
type SpyClient struct {
	conn   *grpc.ClientConn
	client spyv1.SpyRPCServiceClient
	logger *zap.Logger
}

// NewSpyClient creates a new client for the Wormhole spy service
func NewSpyClient(endpoint string) (*SpyClient, error) {
	client := &SpyClient{
		logger: logger.With(zap.String("component", "SpyClient")),
	}

	client.logger.Info("Connecting to spy service", zap.String("endpoint", endpoint))
	conn, err := grpc.Dial(endpoint, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return nil, fmt.Errorf("failed to connect to spy: %v", err)
	}

	client.conn = conn
	client.client = spyv1.NewSpyRPCServiceClient(conn)
	return client, nil
}

// Close closes the connection to the spy service
func (c *SpyClient) Close() {
	if c.conn != nil {
		c.conn.Close()
	}
}

// SubscribeSignedVAA subscribes to all signed VAAs with retry logic
func (c *SpyClient) SubscribeSignedVAA(ctx context.Context) (spyv1.SpyRPCService_SubscribeSignedVAAClient, error) {
	const maxRetries = 5
	const retryDelay = 2 * time.Second

	c.logger.Debug("Subscribing to signed VAAs")

	var stream spyv1.SpyRPCService_SubscribeSignedVAAClient
	var err error

	for attempt := 1; attempt <= maxRetries; attempt++ {
		// Create a fresh connection for each attempt
		endpoint := c.conn.Target()
		conn, err := grpc.DialContext(ctx, endpoint,
			grpc.WithTransportCredentials(insecure.NewCredentials()),
			grpc.WithBlock())
		if err != nil {
			if attempt < maxRetries {
				c.logger.Warn("Connection attempt failed",
					zap.Int("attempt", attempt),
					zap.Error(err),
					zap.Duration("retryIn", retryDelay))
				time.Sleep(retryDelay)
				continue
			}
			return nil, fmt.Errorf("failed to create connection after %d attempts: %v", maxRetries, err)
		}

		client := spyv1.NewSpyRPCServiceClient(conn)
		stream, err = client.SubscribeSignedVAA(ctx, &spyv1.SubscribeSignedVAARequest{})
		if err == nil {
			return stream, nil
		}

		conn.Close() // Close the failed connection

		if attempt < maxRetries {
			c.logger.Warn("Subscribe attempt failed",
				zap.Int("attempt", attempt),
				zap.Error(err),
				zap.Duration("retryIn", retryDelay))

			select {
			case <-time.After(retryDelay):
				// Continue to next retry
			case <-ctx.Done():
				return nil, fmt.Errorf("context cancelled during retry: %v", ctx.Err())
			}
		}
	}

	return nil, fmt.Errorf("failed to subscribe after %d attempts: %v", maxRetries, err)
}

// EVMClient handles interactions with EVM-compatible blockchains
type EVMClient struct {
	client     *ethclient.Client
	privateKey *ecdsa.PrivateKey
	address    common.Address
	logger     *zap.Logger
	nonceMu    sync.Mutex
}

// NewEVMClient creates a new client for EVM-compatible blockchains
func NewEVMClient(rpcURL, privateKeyHex string) (*EVMClient, error) {
	client := &EVMClient{
		logger: logger.With(zap.String("component", "EVMClient")),
	}

	client.logger.Info("Connecting to EVM chain", zap.String("rpcURL", rpcURL))
	ethClient, err := ethclient.Dial(rpcURL)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to EVM node: %v", err)
	}

	privateKey, err := crypto.HexToECDSA(strings.TrimPrefix(privateKeyHex, "0x"))
	if err != nil {
		return nil, fmt.Errorf("invalid private key: %v", err)
	}

	publicKey := privateKey.Public()
	publicKeyECDSA, ok := publicKey.(*ecdsa.PublicKey)
	if !ok {
		return nil, fmt.Errorf("error casting public key to ECDSA")
	}
	address := crypto.PubkeyToAddress(*publicKeyECDSA)

	client.client = ethClient
	client.privateKey = privateKey
	client.address = address

	return client, nil
}

// GetAddress returns the public address for this client
func (c *EVMClient) GetAddress() common.Address {
	return c.address
}

// getFreshNonce gets a fresh nonce by taking the max of confirmed and pending nonce
func (c *EVMClient) getFreshNonce(ctx context.Context) (uint64, error) {
	// Get confirmed nonce (transactions that are mined)
	confirmedNonce, err := c.client.NonceAt(ctx, c.address, nil)
	if err != nil {
		return 0, fmt.Errorf("failed to get confirmed nonce: %v", err)
	}

	// Get pending nonce (includes pending transactions in mempool)
	pendingNonce, err := c.client.PendingNonceAt(ctx, c.address)
	if err != nil {
		return 0, fmt.Errorf("failed to get pending nonce: %v", err)
	}

	// Use the higher of the two to avoid conflicts
	nonce := confirmedNonce
	if pendingNonce > confirmedNonce {
		nonce = pendingNonce
	}

	c.logger.Debug("Fresh nonce fetched",
		zap.Uint64("confirmed", confirmedNonce),
		zap.Uint64("pending", pendingNonce),
		zap.Uint64("using", nonce))

	return nonce, nil
}

// SendVerifyTransaction sends a transaction to the verify function
func (c *EVMClient) SendVerifyTransaction(ctx context.Context, targetContract string, vaaBytes []byte) (string, error) {
	// Lock to prevent concurrent nonce conflicts
	c.nonceMu.Lock()
	defer c.nonceMu.Unlock()

	c.logger.Debug("Sending verify transaction to EVM", zap.Int("vaaLength", len(vaaBytes)))

	const abiJSON = `[{
        "inputs": [
            {"internalType": "bytes", "name": "encodedVm", "type": "bytes"}
        ],
        "name": "verify",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    }]`

	parsedABI, err := abi.JSON(strings.NewReader(abiJSON))
	if err != nil {
		return "", fmt.Errorf("ABI parse error: %v", err)
	}

	data, err := parsedABI.Pack("verify", vaaBytes)
	if err != nil {
		return "", fmt.Errorf("ABI pack error: %v", err)
	}

	chainID, err := c.client.NetworkID(ctx)
	if err != nil {
		return "", fmt.Errorf("failed to get chain ID: %v", err)
	}

	targetAddr := common.HexToAddress(targetContract)

	// Retry loop for nonce conflicts
	maxRetries := 3
	for attempt := 0; attempt < maxRetries; attempt++ {
		// Always fetch fresh nonce for each attempt
		nonce, err := c.getFreshNonce(ctx)
		if err != nil {
			return "", err
		}

		// Get fresh gas price
		gasPrice, err := c.client.SuggestGasPrice(ctx)
		if err != nil {
			return "", fmt.Errorf("failed to get gas price: %v", err)
		}

		// Add 20% to gas price to help with replacement
		if attempt > 0 {
			bump := new(big.Int).Div(gasPrice, big.NewInt(5))
			gasPrice = new(big.Int).Add(gasPrice, bump)
			c.logger.Debug("Bumped gas price for retry",
				zap.Int("attempt", attempt+1),
				zap.String("gasPrice", gasPrice.String()))
		}

		tx := types.NewTransaction(
			nonce,
			targetAddr,
			big.NewInt(0),
			3000000,
			gasPrice,
			data,
		)

		signedTx, err := types.SignTx(tx, types.NewEIP155Signer(chainID), c.privateKey)
		if err != nil {
			return "", fmt.Errorf("failed to sign transaction: %v", err)
		}

		c.logger.Debug("Attempting to send transaction",
			zap.Int("attempt", attempt+1),
			zap.Uint64("nonce", nonce),
			zap.String("gasPrice", gasPrice.String()),
			zap.String("txHash", signedTx.Hash().Hex()))

		err = c.client.SendTransaction(ctx, signedTx)
		if err != nil {
			errStr := err.Error()
			// Check for nonce-related errors that warrant a retry
			if strings.Contains(errStr, "replacement transaction underpriced") ||
				strings.Contains(errStr, "nonce too low") ||
				strings.Contains(errStr, "already known") {
				c.logger.Warn("Nonce conflict, retrying with fresh nonce",
					zap.Int("attempt", attempt+1),
					zap.Error(err))
				// Small delay before retry
				time.Sleep(2 * time.Second)
				continue
			}
			return "", fmt.Errorf("failed to send transaction: %v", err)
		}

		c.logger.Info("Transaction sent successfully",
			zap.Uint64("nonce", nonce),
			zap.String("txHash", signedTx.Hash().Hex()))

		return signedTx.Hash().Hex(), nil
	}

	return "", fmt.Errorf("failed to send transaction after %d attempts due to nonce conflicts", maxRetries)
}

// Relayer coordinates processing VAAs from the spy service
type Relayer struct {
	spyClient *SpyClient
	evmClient *EVMClient
	config      Config
	vaaProcessor       func(*Relayer, *VAAData) error
	logger             *zap.Logger
	dedupeMu           sync.Mutex
	inflightVAAs       map[string]struct{}
	processedVAAs      map[string]time.Time
	dedupeTTL          time.Duration
	// Dynamic emitter tracking
	emittersMu         sync.RWMutex
	registeredEmitters map[string]common.Address // aztecContract -> safeAddress
}

// AztecRecoveryContractSet event signature
const aztecRecoveryContractSetEventSig = "AztecRecoveryContractSet(address,bytes32)"

// Block number to start scanning for events (deployment block)
const emitterScanStartBlock = 9856363

// NewRelayer creates a new relayer instance
func NewRelayer(config Config) (*Relayer, error) {
	relayer := &Relayer{
		config:             config,
		logger:             logger.With(zap.String("component", "Relayer")),
		inflightVAAs:       make(map[string]struct{}),
		processedVAAs:      make(map[string]time.Time),
		dedupeTTL:          15 * time.Minute,
		registeredEmitters: make(map[string]common.Address),
	}

	// Connect to the spy service
	spyClient, err := NewSpyClient(config.SpyRPCHost)
	if err != nil {
		return nil, fmt.Errorf("failed to create spy client: %v", err)
	}

	// Connect to EVM chain
	evmClient, err := NewEVMClient(config.EVMRPCURL, config.PrivateKey)
	if err != nil {
		spyClient.Close()
		return nil, fmt.Errorf("failed to create EVM client: %v", err)
	}

	relayer.spyClient = spyClient
	relayer.evmClient = evmClient

	if config.vaaProcessor == nil {
		relayer.vaaProcessor = defaultVAAProcessor
	} else {
		relayer.vaaProcessor = config.vaaProcessor
	}

	return relayer, nil
}

// Close cleans up resources used by the relayer
func (r *Relayer) Close() {
	if r.spyClient != nil {
		r.spyClient.Close()
	}
}

// loadRegisteredEmitters queries the SafeRecoveryModule for AztecRecoveryContractSet events
func (r *Relayer) loadRegisteredEmitters(ctx context.Context) error {
	if r.config.EVMTargetContract == "" {
		r.logger.Warn("No EVM target contract configured, skipping emitter loading")
		return nil
	}

	r.logger.Info("Loading registered Aztec emitters from SafeRecoveryModule",
		zap.String("contract", r.config.EVMTargetContract),
		zap.Int64("fromBlock", emitterScanStartBlock))

	// Event signature hash: keccak256("AztecRecoveryContractSet(address,bytes32)")
	eventSigHash := crypto.Keccak256Hash([]byte(aztecRecoveryContractSetEventSig))

	// Query logs
	query := ethereum.FilterQuery{
		FromBlock: big.NewInt(emitterScanStartBlock),
		Addresses: []common.Address{common.HexToAddress(r.config.EVMTargetContract)},
		Topics:    [][]common.Hash{{eventSigHash}},
	}

	logs, err := r.evmClient.client.FilterLogs(ctx, query)
	if err != nil {
		return fmt.Errorf("failed to query logs: %v", err)
	}

	r.emittersMu.Lock()
	defer r.emittersMu.Unlock()

	for _, log := range logs {
		if len(log.Topics) < 2 || len(log.Data) < 32 {
			continue
		}

		// Topics[0] = event signature
		// Topics[1] = indexed safe address (padded to 32 bytes)
		safeAddress := common.HexToAddress(log.Topics[1].Hex())

		// Data = aztecContract (bytes32)
		aztecContract := hex.EncodeToString(log.Data[:32])

		r.registeredEmitters[aztecContract] = safeAddress
		r.logger.Info("Registered emitter",
			zap.String("aztecContract", aztecContract),
			zap.String("safeAddress", safeAddress.Hex()))
	}

	r.logger.Info("Loaded registered emitters",
		zap.Int("count", len(r.registeredEmitters)))

	return nil
}

// watchNewEmitters subscribes to new AztecRecoveryContractSet events and adds them dynamically
func (r *Relayer) watchNewEmitters(ctx context.Context) {
	if r.config.EVMTargetContract == "" {
		r.logger.Warn("No EVM target contract configured, skipping emitter watcher")
		return
	}

	r.logger.Info("Starting emitter watcher for new registrations",
		zap.String("contract", r.config.EVMTargetContract))

	// Event signature hash: keccak256("AztecRecoveryContractSet(address,bytes32)")
	eventSigHash := crypto.Keccak256Hash([]byte(aztecRecoveryContractSetEventSig))

	query := ethereum.FilterQuery{
		Addresses: []common.Address{common.HexToAddress(r.config.EVMTargetContract)},
		Topics:    [][]common.Hash{{eventSigHash}},
	}

	// Subscribe to new events
	logs := make(chan types.Log)
	sub, err := r.evmClient.client.SubscribeFilterLogs(ctx, query, logs)
	if err != nil {
		// Fallback to polling if subscription not supported
		r.logger.Warn("Log subscription not supported, falling back to polling",
			zap.Error(err))
		r.pollNewEmitters(ctx)
		return
	}
	defer sub.Unsubscribe()

	r.logger.Info("Subscribed to new emitter registrations")

	for {
		select {
		case <-ctx.Done():
			return
		case err := <-sub.Err():
			r.logger.Warn("Emitter subscription error, restarting",
				zap.Error(err))
			time.Sleep(5 * time.Second)
			go r.watchNewEmitters(ctx)
			return
		case log := <-logs:
			r.handleNewEmitterEvent(log)
		}
	}
}

// pollNewEmitters periodically checks for new emitter registrations (fallback when subscriptions not supported)
func (r *Relayer) pollNewEmitters(ctx context.Context) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	lastBlock := int64(emitterScanStartBlock)

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			currentBlock, err := r.evmClient.client.BlockNumber(ctx)
			if err != nil {
				r.logger.Warn("Failed to get current block", zap.Error(err))
				continue
			}

			if int64(currentBlock) <= lastBlock {
				continue
			}

			eventSigHash := crypto.Keccak256Hash([]byte(aztecRecoveryContractSetEventSig))
			query := ethereum.FilterQuery{
				FromBlock: big.NewInt(lastBlock + 1),
				ToBlock:   big.NewInt(int64(currentBlock)),
				Addresses: []common.Address{common.HexToAddress(r.config.EVMTargetContract)},
				Topics:    [][]common.Hash{{eventSigHash}},
			}

			logs, err := r.evmClient.client.FilterLogs(ctx, query)
			if err != nil {
				r.logger.Warn("Failed to poll for new emitters", zap.Error(err))
				continue
			}

			for _, log := range logs {
				r.handleNewEmitterEvent(log)
			}

			lastBlock = int64(currentBlock)
		}
	}
}

// handleNewEmitterEvent processes a new AztecRecoveryContractSet event
func (r *Relayer) handleNewEmitterEvent(log types.Log) {
	if len(log.Topics) < 2 || len(log.Data) < 32 {
		return
	}

	safeAddress := common.HexToAddress(log.Topics[1].Hex())
	aztecContract := hex.EncodeToString(log.Data[:32])

	r.emittersMu.Lock()
	defer r.emittersMu.Unlock()

	// Check if already registered
	if _, exists := r.registeredEmitters[aztecContract]; exists {
		return
	}

	r.registeredEmitters[aztecContract] = safeAddress
	r.logger.Info("New emitter registered dynamically",
		zap.String("aztecContract", aztecContract),
		zap.String("safeAddress", safeAddress.Hex()),
		zap.Uint64("block", log.BlockNumber))
}

// isRegisteredEmitter checks if the given emitter address is registered
func (r *Relayer) isRegisteredEmitter(emitterHex string) (bool, common.Address) {
	// The VAA emitter might be hex-encoded ASCII, try to decode it
	decodedEmitter := emitterHex
	if decoded, err := hex.DecodeString(emitterHex); err == nil {
		// Check if it looks like ASCII (printable characters)
		isAscii := true
		for _, b := range decoded {
			if b < 0x20 || b > 0x7e {
				isAscii = false
				break
			}
		}
		if isAscii {
			decodedEmitter = string(decoded)
			r.logger.Debug("Decoded emitter from hex-encoded ASCII",
				zap.String("original", emitterHex),
				zap.String("decoded", decodedEmitter))
		}
	}

	// Normalize the emitter address (remove leading zeros, lowercase)
	normalizedEmitter := strings.ToLower(strings.TrimLeft(decodedEmitter, "0"))

	// First check if it matches the configured Wormhole emitter (accepts all messages from Wormhole)
	if r.config.EmitterAddress != "" {
		normalizedConfigEmitter := strings.ToLower(strings.TrimLeft(r.config.EmitterAddress, "0"))
		if normalizedEmitter == normalizedConfigEmitter || decodedEmitter == r.config.EmitterAddress {
			r.logger.Debug("Emitter matches configured Wormhole emitter",
				zap.String("emitter", decodedEmitter))
			// Return true with zero address - we'll parse the Safe address from payload
			return true, common.Address{}
		}
	}

	r.emittersMu.RLock()
	defer r.emittersMu.RUnlock()

	for aztecContract, safeAddr := range r.registeredEmitters {
		normalizedRegistered := strings.ToLower(strings.TrimLeft(aztecContract, "0"))
		if normalizedEmitter == normalizedRegistered || decodedEmitter == aztecContract {
			return true, safeAddr
		}
	}
	return false, common.Address{}
}

// Start begins listening for VAAs and processing them
func (r *Relayer) Start(ctx context.Context) error {
	r.logger.Info("Starting Aztec->EVM relayer",
		zap.String("evmAddress", r.evmClient.GetAddress().Hex()),
		zap.Uint16("sourceChain", r.config.SourceChainID),
		zap.String("evmTarget", r.config.EVMTargetContract))

	// Load registered emitters from SafeRecoveryModule
	if err := r.loadRegisteredEmitters(ctx); err != nil {
		r.logger.Warn("Failed to load registered emitters", zap.Error(err))
	}

	// Start watching for new emitter registrations in the background
	go r.watchNewEmitters(ctx)

	var wg sync.WaitGroup

	stream, err := r.spyClient.SubscribeSignedVAA(ctx)
	if err != nil {
		return fmt.Errorf("subscribe to VAA stream: %v", err)
	}

	r.logger.Info("Listening for VAAs")

	processingCtx, cancelProcessing := context.WithCancel(context.Background())
	defer cancelProcessing()

	for {
		select {
		case <-ctx.Done():
			r.logger.Info("Shutting down relayer")
			cancelProcessing()
			r.logger.Info("Waiting for all VAA processing to complete")
			wg.Wait()
			r.logger.Info("Shutdown complete")
			return nil
		default:
			resp, err := stream.Recv()
			if err != nil {
				r.logger.Warn("Stream error, retrying in 5s", zap.Error(err))
				time.Sleep(5 * time.Second)
				stream, err = r.spyClient.SubscribeSignedVAA(ctx)
				if err != nil {
					cancelProcessing()
					wg.Wait()
					return fmt.Errorf("subscribe to VAA stream after retry: %v", err)
				}
				continue
			}

			key := computeVAAKey(resp.VaaBytes)
			if !r.beginProcessingVAA(key) {
				r.logger.Debug("Skipping duplicate VAA", zap.String("vaaHash", key))
				continue
			}

			wg.Add(1)
			go func(vaaBytes []byte, dedupeKey string) {
				defer wg.Done()
				if err := r.processVAA(processingCtx, vaaBytes); err != nil {
					r.finishProcessingVAA(dedupeKey, false)
				} else {
					r.finishProcessingVAA(dedupeKey, true)
				}
			}(resp.VaaBytes, key)
		}
	}
}

func (r *Relayer) processVAA(ctx context.Context, vaaBytes []byte) error {
	select {
	case <-ctx.Done():
		r.logger.Debug("Processing cancelled for VAA")
		return ctx.Err()
	default:
	}

	wormholeVAA, err := vaaLib.Unmarshal(vaaBytes)
	if err != nil {
		r.logger.Error("Failed to parse VAA", zap.Error(err))
		return err
	}

	txID := ""
	if len(wormholeVAA.Payload) >= 32 {
		txIDBytes := wormholeVAA.Payload[:32]
		txID = fmt.Sprintf("0x%x", txIDBytes)
		r.logger.Debug("Extracted txID from payload", zap.String("txID", txID))
	}

	vaaData := &VAAData{
		VAA:        wormholeVAA,
		RawBytes:   vaaBytes,
		ChainID:    uint16(wormholeVAA.EmitterChain),
		EmitterHex: fmt.Sprintf("%064x", wormholeVAA.EmitterAddress),
		Sequence:   wormholeVAA.Sequence,
		TxID:       txID,
	}

	r.logger.Debug("Processing VAA",
		zap.Uint16("chain", vaaData.ChainID),
		zap.Uint64("sequence", vaaData.Sequence),
		zap.String("emitter", vaaData.EmitterHex),
		zap.String("sourceTxID", vaaData.TxID))

	if err := r.vaaProcessor(r, vaaData); err != nil {
		r.logger.Error("Error processing VAA", zap.Error(err))
		return err
	}

	return nil
}

func (r *Relayer) beginProcessingVAA(key string) bool {
	r.dedupeMu.Lock()
	defer r.dedupeMu.Unlock()

	if ts, ok := r.processedVAAs[key]; ok {
		if time.Since(ts) < r.dedupeTTL {
			return false
		}
		delete(r.processedVAAs, key)
	}

	if _, ok := r.inflightVAAs[key]; ok {
		return false
	}

	r.inflightVAAs[key] = struct{}{}
	return true
}

func (r *Relayer) finishProcessingVAA(key string, success bool) {
	r.dedupeMu.Lock()
	defer r.dedupeMu.Unlock()

	delete(r.inflightVAAs, key)

	if success {
		r.processedVAAs[key] = time.Now()
	}

	cutoff := time.Now().Add(-r.dedupeTTL)
	for k, ts := range r.processedVAAs {
		if ts.Before(cutoff) {
			delete(r.processedVAAs, k)
		}
	}
}

func computeVAAKey(vaaBytes []byte) string {
	hash := sha256.Sum256(vaaBytes)
	return hex.EncodeToString(hash[:])
}

// defaultVAAProcessor routes VAAs between Aztec and EVM chains
func defaultVAAProcessor(r *Relayer, vaaData *VAAData) error {
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	r.logger.Debug("VAA Details",
		zap.Uint16("emitterChain", vaaData.ChainID),
		zap.String("emitterAddress", vaaData.EmitterHex),
		zap.Uint64("sequence", vaaData.Sequence),
		zap.Time("timestamp", vaaData.VAA.Timestamp),
		zap.Int("payloadLength", len(vaaData.VAA.Payload)),
		zap.String("sourceTxID", vaaData.TxID))

	r.logger.Debug("VAA Payload", zap.String("payloadHex", fmt.Sprintf("%x", vaaData.VAA.Payload)))

	if len(vaaData.VAA.Payload) >= 32 {
		r.parseAndLogPayload(vaaData.VAA.Payload)
	}

	var txHash string
	var err error
	var direction string

	// Only process VAAs from Aztec (source chain) -> send to EVM
	if vaaData.ChainID != r.config.SourceChainID {
		r.logger.Debug("Skipping VAA (not from Aztec)",
			zap.Uint64("sequence", vaaData.Sequence),
			zap.Uint16("chain", vaaData.ChainID))
		return nil
	}

	// Check if emitter is registered in SafeRecoveryModule (unless AcceptAnyEmitter is set)
	var safeAddr common.Address
	if r.config.AcceptAnyEmitter {
		r.logger.Info("Accepting VAA from any emitter (AcceptAnyEmitter=true)",
			zap.Uint64("sequence", vaaData.Sequence),
			zap.String("emitter", vaaData.EmitterHex))
	} else {
		isRegistered, registeredSafeAddr := r.isRegisteredEmitter(vaaData.EmitterHex)
		if !isRegistered {
			r.logger.Debug("Skipping VAA (emitter not registered)",
				zap.Uint64("sequence", vaaData.Sequence),
				zap.String("emitter", vaaData.EmitterHex))
			return nil
		}
		safeAddr = registeredSafeAddr
	}

	direction = "Aztec->EVM"

	r.logger.Info("Processing VAA from Aztec to EVM",
		zap.Uint64("sequence", vaaData.Sequence),
		zap.String("sourceTxID", vaaData.TxID),
		zap.String("safeAddress", safeAddr.Hex()),
		zap.String("emitter", vaaData.EmitterHex))

	txHash, err = r.evmClient.SendVerifyTransaction(ctx, r.config.EVMTargetContract, vaaData.RawBytes)

	if err != nil {
		if ctx.Err() != nil {
			r.logger.Warn("Transaction sending cancelled or timed out", zap.Error(ctx.Err()))
			return fmt.Errorf("transaction interrupted: %v", ctx.Err())
		}

		r.logger.Error("Failed to send verify transaction",
			zap.String("direction", direction),
			zap.Uint64("sequence", vaaData.Sequence),
			zap.String("sourceTxID", vaaData.TxID),
			zap.Error(err))
		return fmt.Errorf("transaction failed: %v", err)
	}

	r.logger.Info("VAA verification completed",
		zap.String("direction", direction),
		zap.Uint64("sequence", vaaData.Sequence),
		zap.String("txHash", txHash),
		zap.String("sourceTxID", vaaData.TxID))

	return nil
}

// parseAndLogPayload parses and logs payload structure
func (r *Relayer) parseAndLogPayload(payload []byte) {
	const txIDOffset = 32
	const arraySize = 31

	if len(payload) >= 32 {
		txIDBytes := payload[:32]
		r.logger.Debug("Source Transaction ID", zap.String("txID", fmt.Sprintf("0x%x", txIDBytes)))
	}

	for i := txIDOffset; i < len(payload); i += arraySize {
		end := i + arraySize
		if end > len(payload) {
			end = len(payload)
		}

		arrayIndex := (i - txIDOffset) / arraySize
		r.logger.Debug(fmt.Sprintf("Payload array %d", arrayIndex),
			zap.String("hex", fmt.Sprintf("0x%x", payload[i:end])))

		switch arrayIndex {
		case 0:
			if i+20 <= end {
				r.logger.Debug("Address", zap.String("address", fmt.Sprintf("0x%x", payload[i:i+20])))
			}
		case 1:
			if i+2 <= end {
				chainIDLower := uint16(payload[i])
				chainIDUpper := uint16(payload[i+1])
				chainID := (chainIDUpper << 8) | chainIDLower
				r.logger.Debug("Chain ID", zap.Uint16("chainID", chainID))
			}
		case 2:
			if i < end {
				amount := uint64(payload[i])
				r.logger.Debug("Amount", zap.Uint64("amount", amount))
			}
		}
	}
}

// Environment variable helpers
func getEnvOrDefault(key, defaultValue string) string {
	val, exists := os.LookupEnv(key)
	if !exists {
		return defaultValue
	}
	return val
}

func getEnvIntOrDefault(key string, defaultValue int) int {
	val, exists := os.LookupEnv(key)
	if !exists {
		return defaultValue
	}

	result, err := strconv.Atoi(val)
	if err != nil {
		logger.Warn("Invalid environment variable value, using default",
			zap.String("key", key),
			zap.Int("default", defaultValue))
		return defaultValue
	}
	return result
}

func getEnvBoolOrDefault(key string, defaultValue bool) bool {
	val, exists := os.LookupEnv(key)
	if !exists {
		return defaultValue
	}
	return strings.ToLower(val) == "true" || val == "1"
}

func main() {
	// Load .env file if present (ignore error if not found)
	_ = godotenv.Load()

	initLogger()
	defer logger.Sync()

	logger.Info("Starting Aztec-EVM Wormhole relayer")

	config := NewConfigFromEnv()

	logger.Info("Config loaded",
		zap.Uint16("sourceChainID", config.SourceChainID),
		zap.Uint16("destChainID", config.DestChainID),
		zap.String("evmTarget", config.EVMTargetContract))

	relayer, err := NewRelayer(config)
	if err != nil {
		logger.Fatal("Failed to initialize relayer", zap.Error(err))
	}
	defer relayer.Close()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	c := make(chan os.Signal, 1)
	signal.Notify(c, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-c
		logger.Info("Received shutdown signal")
		cancel()
	}()

	if err := relayer.Start(ctx); err != nil {
		logger.Fatal("Relayer stopped with error", zap.Error(err))
	}
}
