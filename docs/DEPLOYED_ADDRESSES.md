# Deployed addresses (Arbitrum Sepolia)

**Chain ID:** `421614`  
**Network:** Arbitrum Sepolia  
**Explorer:** [sepolia.arbiscan.io](https://sepolia.arbiscan.io)

> Testnet only. Do not send mainnet assets to these addresses.

---

## Standalone demo contracts

| Mode | Contract | Address | Arbiscan |
|------|----------|---------|----------|
| First-price | `PrivaBid` | `0xCD105F5853abac7a95a1BfaF56d673E32aC1D25C` | [View](https://sepolia.arbiscan.io/address/0xCD105F5853abac7a95a1BfaF56d673E32aC1D25C) |
| Vickrey | `PrivaBidVickrey` | `0x471991CDCD48d847ea31a2e87Ba743f41F43c3FD` | [View](https://sepolia.arbiscan.io/address/0x471991CDCD48d847ea31a2e87Ba743f41F43c3FD) |
| Dutch | `PrivaBidDutch` | `0xab016ADDf7097D77652C712310c7a24F8EAFC913` | [View](https://sepolia.arbiscan.io/address/0xab016ADDf7097D77652C712310c7a24F8EAFC913) |
| Reverse | `PrivaBidReverse` | `0xFa038951671e0bE59F2acA05Ca52e37bc6081Ffc` | [View](https://sepolia.arbiscan.io/address/0xFa038951671e0bE59F2acA05Ca52e37bc6081Ffc) |

## Factories

| Version | Contract | Address | Arbiscan |
|---------|----------|---------|----------|
| V1 | `PrivaBidFactory` | `0x16027C8826BFcef3Ad71C8be56b49eC6BE1e0054` | [View](https://sepolia.arbiscan.io/address/0x16027C8826BFcef3Ad71C8be56b49eC6BE1e0054) |
| V2 | `PrivaBidFactoryV2` | `0x7ED138dE78f24fEde79eB54F6DddEA38D3db2339` | [View](https://sepolia.arbiscan.io/address/0x7ED138dE78f24fEde79eB54F6DddEA38D3db2339) |

## Wave 4 demo

| Item | Address |
|------|---------|
| Encrypted-reserve demo auction | `0xf96F8611Fa57d75398eaa4e410e953586acf6533` |

---

## Deployment artifacts

JSON records live in `privabid-contract/deployments/`:

- `arb-sepolia.json` — genesis first-price
- `arb-sepolia-factory.json` / `arb-sepolia-factory-v2.json`
- `arb-sepolia-reverse.json`
- `arb-sepolia-wave4-demo.json`

---

## Frontend / SDK sync

When redeploying, update:

1. `privabid-frontend/src/config/contracts.ts`
2. `privabid-sdk/src/addresses.ts`
3. `privabid-frontend/src/config/site.ts` (genesis link)
4. This file

Optional env overrides:

- `VITE_FACTORY_V2_ADDRESS`
- `VITE_DEMO_AUCTION_ADDRESS`
- `VITE_ARB_SEPOLIA_RPC`
