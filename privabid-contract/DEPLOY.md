# How to Deploy PrivaBid to Arbitrum Sepolia

Step-by-step guide. Follow in order.

---

## Step 1 — Install Dependencies

```bash
cd privabid-contracts
npm install -g pnpm   # if you don't have pnpm
pnpm install
```

---

## Step 2 — Set Up Environment

```bash
cp .env.example .env
```

Open `.env` and fill in:

```
PRIVATE_KEY=your_wallet_private_key_without_0x
ARB_SEPOLIA_RPC=https://sepolia-rollup.arbitrum.io/rpc
```

To get your private key from MetaMask:
`MetaMask → Three dots → Account Details → Export Private Key`

---

## Step 3 — Fund Your Wallet

You need testnet ETH on Arbitrum Sepolia.

Get it here: **https://faucet.triangleplatform.com/arbitrum/sepolia**

Paste your wallet address and request 0.1 ETH. Takes about 30 seconds.

---

## Step 4 — Choose Your Auction Mode

Open `scripts/deploy.ts` and change the `mode` in `DEPLOY_CONFIG`:

```typescript
const DEPLOY_CONFIG = {
  mode: AuctionMode.FIRST_PRICE,  // ← change this
  // AuctionMode.FIRST_PRICE  = 0  (highest bid wins, pays own amount)
  // AuctionMode.VICKREY      = 1  (highest bid wins, pays second-highest)
  // AuctionMode.DUTCH        = 2  (descending price, encrypted thresholds)
  // AuctionMode.REVERSE      = 3  (lowest ask wins — procurement)
```

Also update `itemName`, `reservePrice`, and `duration` as needed.

---

## Step 5 — Compile

```bash
pnpm compile
```

Should print: `Compiled 1 Solidity file successfully`

---

## Step 6 — Deploy

```bash
pnpm deploy:arb
```

You will see output like:

```
✓ Deployed successfully!
  Contract:  0x1234...abcd
  Tx Hash:   0xabcd...1234
  Block:     12345678

── Arbiscan ──
  Contract: https://sepolia.arbiscan.io/address/0x1234...abcd
  Tx:       https://sepolia.arbiscan.io/tx/0xabcd...1234
```

**Copy the contract address** — you need it for your submission.

---

## Step 7 — Verify on Arbiscan (Optional but Recommended)

```bash
pnpm hardhat verify --network arb-sepolia <CONTRACT_ADDRESS> \
  0 \
  "PrivaBid Genesis Auction #001" \
  "First live auction on PrivaBid" \
  1000000 \
  86400 \
  10000000 \
  1000000 \
  100
```

After verification, judges can read your source code directly on Arbiscan.

---

## Step 8 — Run Tests Locally

```bash
pnpm test
```

Tests run against a local mock FHE environment — no testnet needed.
This verifies all four auction modes work correctly with FHE operations.

---

## Troubleshooting

**"max fee per gas less than block base fee"**
→ Open MetaMask → Edit gas → Switch to "Market" fee → Retry

**"insufficient funds"**
→ Get more testnet ETH from the faucet above

**"Cannot find module cofhe-hardhat-plugin"**
→ Run `pnpm install` again

**Contract deployed but not showing on Arbiscan**
→ Wait 2-3 minutes — testnet indexing can be slow

---

## Deployed Contract Addresses

| Network | Mode | Address | Arbiscan |
|---|---|---|---|
| Arbitrum Sepolia | FIRST_PRICE | `0x...` | [View]() |

*(Update this table after each deployment)*
