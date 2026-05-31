# Mainnet preparation checklist

PrivaBid is **deployed and demo-ready on Arbitrum Sepolia testnet only**. This checklist documents what is required before a future mainnet launch. **No mainnet deployment is planned for the buildathon** due to funding constraints.

---

## Current status: testnet-only ✅

| Item | Status |
|------|--------|
| Contracts on Arbitrum Sepolia | ✅ Deployed |
| Frontend + wallet + CoFHE flow | ✅ Live |
| Factory V2 + four auction modes | ✅ |
| PrivaBid SDK | ✅ `privabid-sdk/` |
| FHE ACL self-audit | ✅ `SECURITY_AUDIT.md` |
| Mainnet deployment | ❌ Deferred (no funds) |

---

## Pre-mainnet checklist (when funded)

### Infrastructure

- [ ] Confirm Fhenix CoFHE **mainnet** availability on target L2 (Arbitrum / Base / Ethereum)
- [ ] Update `@fhenixprotocol/cofhe-contracts` + `@cofhe/sdk` to mainnet-stable versions
- [ ] Provision dedicated RPC (Alchemy/Infura) — do not commit API keys
- [ ] Hardware wallet or multisig for deployer + factory owner

### Contracts

- [ ] Re-run full compile + test suite (once cofhe-hardhat-plugin supports 0.1.x mocks)
- [ ] Third-party security audit (see `SECURITY_AUDIT.md` recommendations)
- [ ] Deploy `PrivaBidFactoryV2` on mainnet
- [ ] Verify all contracts on block explorer
- [ ] Publish address registry in `docs/DEPLOYED_ADDRESSES.md`

### Economics

- [ ] Integrate ERC-20 USDC bid deposits + automatic refunds for losers
- [ ] Gas benchmarking for FHE ops on mainnet gas prices
- [ ] Privara / settlement path on mainnet USDC

### Operations

- [ ] Monitoring for `AuctionDeployed`, `BidPlaced`, `WinnerRevealed` events
- [ ] Runbook for failed Threshold decrypt / reveal retry
- [ ] Incident response if CoFHE coprocessor is unavailable

### Legal / product

- [ ] Jurisdiction review for sealed-bid auctions
- [ ] Terms of service for auction creators
- [ ] Rate limits / abuse prevention on factory spam

---

## Hardhat mainnet config (template — do not commit keys)

Add to `privabid-contract/hardhat.config.ts` when ready:

```typescript
// "arb-mainnet": {
//   url: process.env.ARB_MAINNET_RPC!,
//   accounts: [process.env.MAINNET_DEPLOYER_KEY!],
//   chainId: 42161,
//   gasMultiplier: 1.5,
// },
```

---

## Testnet → mainnet migration notes

1. **Addresses change** — update `privabid-frontend/src/config/contracts.ts` and `privabid-sdk/src/addresses.ts`
2. **Chain ID** — frontend `CHAIN_ID`, wagmi config, CoFHE `supportedChains`
3. **USDC address** — per-network USDC contract for deposits
4. **Privara network** — switch `@reineira-os/sdk` from `testnet` to production when available

---

*Wave 5 deliverable: mainnet **preparation** documentation without deployment.*
