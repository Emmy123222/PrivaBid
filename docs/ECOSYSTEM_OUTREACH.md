# Ecosystem outreach — PrivaBid

Wave 5 deliverable: integration targets, pitch, and demo assets for the Fhenix / privacy ecosystem.

---

## Elevator pitch

**PrivaBid** is the first multi-mode **FHE-native auction platform** on Fhenix. Four auction types — first-price, Vickrey, Dutch, and reverse procurement — with bids sealed on-chain from submission to reveal. No commit-reveal hacks, no trusted auctioneer, no mempool front-running.

**Live demo:** Arbitrum Sepolia · [docs/DEPLOYED_ADDRESSES.md](./DEPLOYED_ADDRESSES.md)

---

## Integration targets

| Segment | Use case | PrivaBid mode |
|---------|----------|--------------|
| NFT marketplaces | Sealed-bid collection drops | First-price / Vickrey |
| DAOs | Treasury asset sales, grant RFPs | Vickrey / Reverse |
| DeFi protocols | Liquidation auctions without MEV | Dutch |
| Public sector / RWA | Verifiable sealed procurement | Reverse |
| Gaming | Blind item auctions | Dutch / First-price |

---

## What we offer integrators

1. **`@privabid/sdk`** — factory deploy, addresses, ABIs ([privabid-sdk/README.md](../privabid-sdk/README.md))
2. **Factory V2** — permissionless auction creation with optional encrypted reserve
3. **Hosted UI** — embed via `?address=` deep links ([INTEGRATION.md](./INTEGRATION.md))
4. **Documentation** — [ARCHITECTURE.md](../ARCHITECTURE.md), [FHE_EXPLAINER.md](../FHE_EXPLAINER.md), [SECURITY_AUDIT.md](../SECURITY_AUDIT.md)

---

## Demo script (5 minutes)

1. Open `/home` → pick **Vickrey** or **Create Auction**
2. Connect MetaMask → Arbitrum Sepolia
3. Submit encrypted bid → show Arbiscan (ciphertext, not amount)
4. Auctioneer closes → Reveal via Threshold Network
5. Optional: Privara confidential settlement on testnet

---

## Community channels

| Channel | Link |
|---------|------|
| Fhenix Telegram | [t.me/Fhenixio](https://t.me/Fhenixio) |
| Fhenix Buildathon | [t.me/+rA9gI3AsW8c3YzIx](https://t.me/+rA9gI3AsW8c3YzIx) |
| CoFHE docs | [cofhe-docs.fhenix.zone](https://cofhe-docs.fhenix.zone) |
| GitHub | [github.com/privabid/privabid](https://github.com/privabid/privabid) |

---

## Outreach checklist

- [ ] Post demo thread with Arbiscan links + screen recording
- [ ] Share in Fhenix Buildathon Telegram with `#PrivaBid` tag
- [ ] Submit to Fhenix sandbox / ecosystem project list
- [ ] Open integration issue template for partner protocols
- [ ] Schedule office hours for DAOs wanting sealed treasury sales

---

## Limitations (transparent)

- **Testnet only** for buildathon — no mainnet deployment ([MAINNET_PREP.md](./MAINNET_PREP.md))
- **No on-chain USDC deposits** yet — bids are cryptographically sealed but not escrowed
- **FHE gas costs** — higher than plaintext; suitable for high-value auctions

---

*Demo UI: run `npm run dev` from repo root (or `privabid-frontend/`).*
