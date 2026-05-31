# Protocol integration guide

Integrate PrivaBid sealed-bid auctions into your dApp using the SDK, factory, and CoFHE client.

---

## Architecture

```
Your dApp UI
    ├── @privabid/sdk        → factory deploy, addresses, ABIs
    ├── @cofhe/sdk           → encrypt bids, Threshold decrypt
    └── ethers / wagmi       → Arbitrum Sepolia txs
              │
              ▼
    PrivaBidFactoryV2 ──creates──► PrivaBidV2 (per auction)
              │
              ▼
    Fhenix CoFHE coprocessor (FHE compute + Threshold reveal)
```

---

## 1. Install

```bash
npm install @privabid/sdk ethers @cofhe/sdk @cofhe/react
```

From monorepo: `cd privabid-sdk && npm run build`

---

## 2. Create an auction

```typescript
import { createAuctionViaFactory, AuctionMode, parseUsdcMicro } from "@privabid/sdk";

const { auctionAddress } = await createAuctionViaFactory(signer, {
  mode: AuctionMode.VICKREY,
  itemName: "DAO Treasury Asset #42",
  itemDescription: "Second-price sealed bid",
  reservePriceMicro: parseUsdcMicro("100"),
  durationSec: 86400n,
  useEncryptedReserve: true, // V2: hide reserve from bidders
});
```

---

## 3. Participant flow (CoFHE)

1. Connect wallet on **chain 421614**
2. Encrypt bid amount client-side (`@cofhe/react` `useCofheEncrypt` or SDK)
3. Submit tx: `bid(amount)`, `submitAsk(price)`, or `setThreshold(threshold)`

Reference implementation: `privabid-frontend/src/components/BidForm.tsx`

---

## 4. Close & reveal

1. **Owner** calls `closeBidding()` (auctioneer or reverse buyer)
2. Wait ~60s for CoFHE ACL propagation
3. Fetch handles: `getHighestBidHandle()`, etc.
4. `CofheClient.decryptForTx(handle).withoutPermit().execute()`
5. Submit `revealWinner(proofs)` on-chain

Reference: `privabid-frontend/src/components/RevealWinner.tsx`

Contract kind detection: `privabid-frontend/src/lib/revealTarget.ts`

---

## 5. Optional settlement (Privara)

Post-reveal, fund confidential USDC escrow:

```typescript
import { ReineiraSDK } from "@reineira-os/sdk";
// See PrivaraSettlement.tsx — testnet only
```

---

## 6. Embed routes

Link users to the hosted UI with query params:

| Mode | URL |
|------|-----|
| First-price | `/auction/first-price?address=0x…` |
| Vickrey | `/auction/vickrey?address=0x…` |
| Dutch | `/auction/dutch?address=0x…` |
| Reverse | `/reverse-auction?address=0x…` |

---

## 7. Events to index

| Event | Use |
|-------|-----|
| `AuctionDeployed` | New auction registry |
| `BidPlaced` / `AskSubmitted` / `ThresholdSet` | Activity feed (amounts encrypted) |
| `AuctionClosed` | Enable reveal UI |
| `WinnerRevealed` | Settlement, notifications |

---

## Resources

- [SECURITY_AUDIT.md](../SECURITY_AUDIT.md) — ACL model
- [DEPLOYED_ADDRESSES.md](./DEPLOYED_ADDRESSES.md) — testnet addresses
- [CoFHE docs](https://cofhe-docs.fhenix.zone)
- [privabid-sdk/README.md](../privabid-sdk/README.md)
