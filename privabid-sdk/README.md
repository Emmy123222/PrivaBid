# @privabid/sdk

TypeScript helpers for integrating **PrivaBid** FHE auctions into third-party protocols.

> **Testnet only.** All bundled addresses are on **Arbitrum Sepolia** (chain `421614`). No mainnet deployment — use this SDK against testnet contracts while evaluating integration.

## Install

```bash
npm install @privabid/sdk ethers @cofhe/sdk
```

Or from the monorepo:

```bash
cd privabid-sdk && npm install && npm run build
```

## Quick start

```typescript
import { Wallet, JsonRpcProvider } from "ethers";
import {
  createAuctionViaFactory,
  AuctionMode,
  parseUsdcMicro,
  ADDRESSES,
  CHAIN_ID,
} from "@privabid/sdk";

const provider = new JsonRpcProvider("https://arbitrum-sepolia-rpc.publicnode.com");
const signer = new Wallet(process.env.PRIVATE_KEY!, provider);

const { auctionAddress, txHash } = await createAuctionViaFactory(signer, {
  mode: AuctionMode.FIRST_PRICE,
  itemName: "Protocol Treasury NFT #1",
  itemDescription: "Sealed-bid sale via PrivaBid",
  reservePriceMicro: parseUsdcMicro("1"),
  durationSec: 3600n,
});

console.log({ auctionAddress, txHash, factory: ADDRESSES.FACTORY_V2, chainId: CHAIN_ID });
```

## Exports

| Module | Contents |
|--------|----------|
| `ADDRESSES` | Testnet contract addresses (standalone demos + Factory V2) |
| `AuctionMode` | On-chain enum (0–3) |
| `parseUsdcMicro` / `formatUsdcMicro` | USDC 6-decimal helpers |
| `createAuctionViaFactory` | Deploy `PrivaBidV2` via factory |
| `ALL_ABIS` | Minimal ethers ABI fragments |

## CoFHE / reveal flow

1. Participants call `bid`, `submitAsk`, or `setThreshold` (amounts encrypted client-side via `@cofhe/sdk`).
2. Auction owner calls `closeBidding()`.
3. Use `CofheClient.decryptForTx(handle)` to obtain Threshold proofs for winner handles.
4. Call `revealWinner` / `revealVickreyWinner` / `revealDutchWinner` on-chain.

See [docs/INTEGRATION.md](../docs/INTEGRATION.md) for protocol integration patterns.

## License

MIT
