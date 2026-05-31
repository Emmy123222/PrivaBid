# PrivaBid Frontend

React + TypeScript + Vite UI for **PrivaBid** FHE auctions on **Arbitrum Sepolia** (testnet).

## Quick start

```bash
npm install
cp .env.example .env   # optional
npm run dev
```

Connect MetaMask to chain **421614**.

## Routes

| Path | Description |
|------|-------------|
| `/` | Landing page |
| `/home` | Mode picker + factory feed |
| `/create` | Deploy via Factory V2 |
| `/auction/:mode` | first-price, vickrey, dutch |
| `/reverse-auction` | Procurement / reverse |
| `/dashboard` | Auction dashboard |

## Config

Contract addresses: `src/config/contracts.ts`  
Override via env: `VITE_FACTORY_V2_ADDRESS`, `VITE_DEMO_AUCTION_ADDRESS`, `VITE_ARB_SEPOLIA_RPC`

## Stack

- wagmi + viem (wallet)
- `@cofhe/react` (FHE encrypt/decrypt)
- `@reineira-os/sdk` (Privara settlement — testnet)

See [docs/INTEGRATION.md](../docs/INTEGRATION.md) and [docs/DEPLOYED_ADDRESSES.md](../docs/DEPLOYED_ADDRESSES.md).
