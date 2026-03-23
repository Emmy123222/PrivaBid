# PrivaBid 🔒
### The FHE Auction Platform on Fhenix

> *"Front-runners can't front-run what they can't see."*

**PrivaBid** is a multi-mode encrypted auction platform where every bid, ask, and threshold is cryptographically sealed on-chain from submission to reveal. Built natively on [Fhenix](https://fhenix.io) Fully Homomorphic Encryption — not retrofitted with commit-reveal hacks or trusted intermediaries.

PrivaBid is not a single auction contract. It is a **platform of auction primitives** — each one unlocking a market that cannot exist on transparent rails.

[![Built on Fhenix](https://img.shields.io/badge/Built%20on-Fhenix%20FHE-00FF94?style=flat-square)](https://fhenix.io)
[![Wave 1](https://img.shields.io/badge/Buildathon-Wave%201-blue?style=flat-square)](https://akindo.io)
[![Network](https://img.shields.io/badge/Network-Arbitrum%20Sepolia-purple?style=flat-square)](https://sepolia.arbiscan.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)

---

## Table of Contents

1. [The Problem](#1-the-problem)
2. [Why Existing Solutions Fail](#2-why-existing-solutions-fail)
3. [What PrivaBid Does](#3-what-privabid-does)
4. [Why FHE is the Only Real Solution](#4-why-fhe-is-the-only-real-solution)
5. [The Four Auction Modes](#5-the-four-auction-modes)
6. [Architecture & Flow](#6-architecture--flow)
7. [FHE Primitives Used](#7-fhe-primitives-used)
8. [Smart Contract Overview](#8-smart-contract-overview)
9. [Use Cases](#9-use-cases)
10. [Long-Term Vision](#10-long-term-vision)
11. [Roadmap](#11-roadmap)
12. [Technical Stack](#12-technical-stack)
13. [Getting Started](#13-getting-started)

---

## 1. The Problem

Public blockchains made transparency the default. That transparency enables trustless systems — but it also creates hard limits on what you can build.

**On-chain auctions are broken by design.**

The moment a bidder submits a transaction, their bid amount is visible to the entire network — before it is even confirmed. This creates three compounding vulnerabilities:

### MEV / Front-Running
Automated bots monitor the Ethereum mempool in real-time. When they detect a bid of `5,000 USDC`, they immediately submit a bid of `5,001 USDC` with a higher gas fee, ensuring their transaction is mined first. The original bidder loses — not because someone valued the item more, but because a bot had read access to their transaction.

> **$500M+** is extracted from DeFi users annually through MEV. 75% of those losses hit trades under $20K — retail users, not whales.

### Bid Sniping
Because the current highest bid is always visible, rational bidders wait until the last possible moment and place a minimal outbid. This collapses true price discovery — the final auction price reflects the second-highest bidder's patience, not the item's real market value.

### Strategic Collusion
In institutional settings — procurement, RWA liquidations, corporate M&A — knowing a competitor's bid is valuable intelligence. A company evaluating on-chain infrastructure for procurement cannot use transparent rails. Compliance will not allow it.

> This is why institutions are not using on-chain auctions. Not because they do not want to. Because they **cannot**.

---

## 2. Why Existing Solutions Fail

Developers have tried to work around transparent auctions for years. None of the existing approaches actually solve the problem:

### Commit-Reveal Schemes
Bidders hash their bid + a secret in Phase 1, reveal in Phase 2.

**Why it fails:**
- The reveal phase exposes **all bids publicly** — losers' amounts become permanently visible on-chain
- A committed hash is still gameable — adversaries can brute-force common bid amounts
- Requires two separate transactions (double the gas, double the UX friction)
- Bids can be front-run **between** the commit and reveal phases

### Off-Chain Matching with On-Chain Settlement
Bids go to a centralized server; settlement happens on-chain.

**Why it fails:**
- Reintroduces a trusted third party — the exact problem DeFi was built to eliminate
- The operator can leak bids to favored participants, manipulate results, or get hacked
- Not trustless. Not verifiable. Just a database with a blockchain attached.

### ZK Proofs Alone
Zero-knowledge proofs can verify that a bid meets a condition without revealing the value.

**Why it fails:**
- ZK proofs verify statements about values — they do not enable computation across multiple encrypted values
- You can prove "my bid is above the reserve" but you cannot compute "which of these 50 encrypted bids is the highest" without custom circuits for every comparison — not practical at scale

### The Real Issue
All of these approaches share a fundamental flaw: they add privacy as a layer on top of a transparent system. PrivaBid takes the opposite approach — **privacy is baked into the architecture from day one.**

---

## 3. What PrivaBid Does

PrivaBid is a platform of FHE-native auction contracts. Across all modes, the same guarantee holds:

| What happens | What observers see |
|---|---|
| Bidder submits `bid(amount)` | Bidder's wallet address, timestamp |
| Contract encrypts and stores bid | An opaque ciphertext handle |
| Contract compares bids | That a comparison occurred |
| Contract updates winner | That state changed |
| Auction closes | That the auction is closed |
| Threshold Network decrypts winner | The winner's address and winning amount |
| All losing bids | **Nothing. Permanently sealed.** |

**The key guarantee:** A bidder cannot adjust their strategy based on what others bid — because they cannot see what others bid. True sealed-bid mechanics, enforced by cryptography, not by rules.

---

## 4. Why FHE is the Only Real Solution

Fully Homomorphic Encryption (FHE) is a class of encryption that allows arbitrary mathematical operations to be performed **directly on ciphertext**. The result, when decrypted, is identical to performing the same operations on the original plaintext.

```
// Normal encryption — compute impossible without decrypting:
encrypt(5,000) + encrypt(3,000)  →  ??? ERROR

// FHE — compute directly on ciphertexts:
FHE_encrypt(5,000) + FHE_encrypt(3,000)  →  FHE_encrypt(8,000)
decrypt(FHE_encrypt(8,000))  →  8,000  ✓
```

This is the only cryptographic primitive that allows a smart contract to:
- **Compare** two bid values without knowing what either value is
- **Find the maximum or minimum** without decrypting either value
- **Conditionally update** the winner without branching on plaintext
- **Track multiple encrypted values** simultaneously (e.g. first and second highest bids)
- **Reveal the result** with a cryptographic proof of correctness

No other technology — not ZK, not MPC alone, not commit-reveal — gives you all five properties simultaneously on a general-purpose smart contract platform.

Fhenix implements FHE as a **co-processor (CoFHE)** for EVM-compatible chains. Solidity contracts call `FHE.gt()`, `FHE.max()`, `FHE.select()` just like any other function — encrypted computation happens off-chain on the CoFHE coprocessor and results are returned on-chain.

---

## 5. The Four Auction Modes

PrivaBid is expanding beyond a single auction type. Each mode uses FHE differently and targets a different market.

---

### Mode 1 — Sealed-Bid First-Price Auction ✅ Live
**"Highest bid wins, pays their own amount."**

The classic sealed-bid format. Bids are encrypted on submission. The contract tracks the highest encrypted bid using `FHE.gt()` and `FHE.max()`. Winner pays exactly what they bid.

**FHE operations:** `FHE.asEuint64`, `FHE.gt`, `FHE.max`, `FHE.select`
**Target markets:** NFT auctions, token launches, one-off asset sales

---

### Mode 2 — Vickrey Auction (Second-Price) 🔨 Wave 2
**"Highest bid wins, but pays the second-highest amount."**

The Vickrey auction is mathematically proven to be the fairest auction format — it incentivises every bidder to bid their true value. Used in Google Ads, government spectrum auctions, and corporate procurement.

Building this on FHE requires tracking **two encrypted values simultaneously** — `highestBid` and `secondHighestBid` — and updating both on every incoming bid without ever decrypting either. This is a meaningfully more complex FHE operation than Mode 1.

```solidity
euint64 private highestBid;
euint64 private secondHighestBid;  // winner pays this amount
eaddress private highestBidder;

function bid(uint64 amount) external {
    euint64 enc = FHE.asEuint64(amount);

    ebool isHighest = FHE.gt(enc, highestBid);
    ebool isSecond  = FHE.gt(enc, secondHighestBid);

    // Update second highest BEFORE overwriting highest
    // If new bid is highest: second = old highest
    // If new bid is second: second = new bid
    // Otherwise: second unchanged
    secondHighestBid = FHE.select(isHighest, highestBid,
                         FHE.select(isSecond, enc, secondHighestBid));

    highestBid    = FHE.max(enc, highestBid);
    highestBidder = FHE.select(isHighest,
                     FHE.asEaddress(msg.sender), highestBidder);

    FHE.allowThis(highestBid);
    FHE.allowThis(secondHighestBid);
    FHE.allowThis(highestBidder);
}
```

At reveal, the winner pays `secondHighestBid` — proven by two separate Threshold Network decryptions.

**FHE operations:** All of Mode 1 plus dual-value tracking with nested `FHE.select`
**Target markets:** Government procurement, spectrum auctions, institutional asset sales

---

### Mode 3 — Dutch Auction with Encrypted Thresholds 🔨 Wave 3
**"Price descends until a bidder's secret threshold is met."**

In a traditional Dutch auction, the price starts high and drops over time. The first bidder to accept wins. On a transparent chain this is gameable — you can see when others are close to accepting.

PrivaBid's Dutch auction adds an FHE twist: bidders submit an **encrypted threshold** — the lowest price they are willing to pay. The contract checks `FHE.lte(currentPrice, encryptedThreshold)` on each block to find the first match — without revealing any bidder's threshold until they win.

This enables true blind Dutch auctions where no bidder can time their acceptance based on observing others.

**FHE operations:** `FHE.lte`, `FHE.select`, time-based price curve logic
**Target markets:** Token distributions, declining-price liquidations, time-sensitive asset sales

---

### Mode 4 — Reverse Auction / Procurement 🔨 Wave 4
**"Sellers compete by submitting encrypted asks. Buyer picks the lowest."**

A reverse auction flips the model: instead of buyers competing for an item, sellers compete to offer the lowest price for a contract or service. This is how most corporate and government procurement works.

On transparent chains, vendors can see each other's prices and undercut by the minimum amount. PrivaBid's reverse auction uses `FHE.min()` to track the lowest encrypted ask — no vendor ever sees a competitor's price.

```solidity
euint64  private lowestAsk;
eaddress private lowestSeller;

function submitAsk(uint64 price) external {
    euint64 enc     = FHE.asEuint64(price);
    ebool   isLower = FHE.lt(enc, lowestAsk);   // FHE.lt instead of gt
    lowestAsk    = FHE.min(enc, lowestAsk);      // FHE.min instead of max
    lowestSeller = FHE.select(isLower,
                     FHE.asEaddress(msg.sender), lowestSeller);
    FHE.allowThis(lowestAsk);
    FHE.allowThis(lowestSeller);
}
```

**FHE operations:** `FHE.lt`, `FHE.min`, `FHE.select`
**Target markets:** Corporate procurement, freelance platform bidding, DAO service contracts, government tenders

---

### Bonus Feature — Encrypted Reserve Price (All Modes)
In all modes, the reserve price can optionally be encrypted. The auctioneer sets a sealed floor — bidders cannot see the minimum, cannot game it, and the auction fails silently if no bid clears the reserve without revealing what the reserve was.

```solidity
euint64 private encryptedReserve;

// At reveal — verify winner clears reserve in FHE space
ebool meetsReserve = FHE.gte(highestBid, encryptedReserve);
```

---

## 6. Architecture & Flow

### System Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                      PrivaBid Platform                            │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │              Auction Mode Router                          │    │
│  │  FirstPrice │ Vickrey │ Dutch │ Reverse │ Custom         │    │
│  └──────────────────────┬───────────────────────────────────┘    │
│                         │                                          │
│         ┌───────────────┼────────────────┐                        │
│         ▼               ▼                ▼                        │
│   ┌──────────┐   ┌──────────┐   ┌──────────────┐                 │
│   │ Bidder   │   │Auctioneer│   │    Seller    │                 │
│   │ bid()    │   │ close()  │   │ submitAsk()  │                 │
│   └────┬─────┘   └────┬─────┘   └──────┬───────┘                 │
│        │              │                 │                          │
│        └──────────────┴─────────────────┘                         │
│                         │                                          │
│              ┌──────────▼──────────────────┐                      │
│              │     PrivaBid.sol            │                      │
│              │                             │                      │
│              │  euint64  highestBid        │                      │
│              │  euint64  secondHighestBid  │  ← Vickrey           │
│              │  euint64  lowestAsk         │  ← Reverse           │
│              │  eaddress highestBidder     │                      │
│              │                             │                      │
│              │  FHE.gt / FHE.lt            │  ← comparisons       │
│              │  FHE.max / FHE.min          │  ← updates           │
│              │  FHE.select                 │  ← winner tracking   │
│              └──────────┬──────────────────┘                      │
│                         │                                          │
│                FHE tasks submitted to coprocessor                  │
│                         │                                          │
│              ┌──────────▼──────────────────┐                      │
│              │   Fhenix CoFHE Coprocessor  │                      │
│              │   Encrypted compute layer   │                      │
│              └──────────┬──────────────────┘                      │
│                         │                                          │
│                After close: decryption request                     │
│                         │                                          │
│              ┌──────────▼──────────────────┐                      │
│              │  Fhenix Threshold Network   │                      │
│              │  MPC decryption + signature │                      │
│              └──────────┬──────────────────┘                      │
│                         │                                          │
│              ┌──────────▼──────────────────┐                      │
│              │  FHE.publishDecryptResult() │                      │
│              │  On-chain proof verification│                      │
│              └─────────────────────────────┘                      │
└──────────────────────────────────────────────────────────────────┘
```

### Complete Auction Lifecycle

#### Phase 1 — Deploy
Contract deployed with auction mode, item details, reserve price, duration.
Encrypted state initialised with trivial FHE zeros. `FHE.allowThis()` grants contract ACL access.

#### Phase 2 — Bidding / Ask Submission
Each call runs sequential FHE operations. All values stay ciphertext throughout.
Bidder addresses are public. Bid amounts are encrypted.

#### Phase 3 — Close
Auctioneer calls `closeBidding()`. `FHE.allowPublic()` authorises Threshold Network decryption of winning values only. Losing bids remain permanently sealed.

#### Phase 4 — Off-Chain Decryption
`client.decryptForTx(handle).withoutPermit().execute()` — Threshold Network returns `(plaintext, signature)`.

#### Phase 5 — On-Chain Reveal
`FHE.publishDecryptResult()` verifies signature on-chain. Reverts if invalid. Winner stored trustlessly with cryptographic proof.

---

## 7. FHE Primitives Used

| Function | Purpose | Auction Modes |
|---|---|---|
| `FHE.asEuint64(amount)` | Encrypt plaintext bid immediately | All |
| `FHE.asEaddress(addr)` | Encrypt bidder/seller address | All |
| `FHE.gt(a, b)` | Encrypted greater-than → `ebool` | First-price, Vickrey |
| `FHE.lt(a, b)` | Encrypted less-than → `ebool` | Reverse, Dutch |
| `FHE.max(a, b)` | Encrypted maximum → `euint64` | First-price, Vickrey |
| `FHE.min(a, b)` | Encrypted minimum → `euint64` | Reverse, Dutch |
| `FHE.select(cond, a, b)` | Encrypted ternary → any type | All |
| `FHE.gte(a, b)` | Encrypted ≥ comparison | Encrypted reserve check |
| `FHE.lte(a, b)` | Encrypted ≤ comparison | Dutch threshold check |
| `FHE.allowThis(handle)` | Grant contract ACL access | All — after every operation |
| `FHE.allowPublic(handle)` | Authorize Threshold Network decryption | All — at close |
| `FHE.publishDecryptResult()` | Verify Threshold Network proof on-chain | All — at reveal |

---

## 8. Smart Contract Overview

### First-Price (Mode 1) — Core Logic
```solidity
// SPDX-License-Identifier: MIT
pragma solidity >=0.8.19 <0.9.0;
import "@fhenixprotocol/cofhe-contracts/FHE.sol";

contract PrivaBidFirstPrice {
    euint64  private highestBid;       // ENCRYPTED
    eaddress private highestBidder;    // ENCRYPTED
    uint64   public  winningBid;       // revealed after proof
    address  public  winningBidder;    // revealed after proof

    function bid(uint64 amount) external {
        euint64 enc      = FHE.asEuint64(amount);
        ebool   isHigher = FHE.gt(enc, highestBid);
        highestBid       = FHE.max(enc, highestBid);
        highestBidder    = FHE.select(isHigher,
                             FHE.asEaddress(msg.sender), highestBidder);
        FHE.allowThis(highestBid);
        FHE.allowThis(highestBidder);
    }
}
```

### Vickrey (Mode 2) — Dual Encrypted Value Tracking
```solidity
contract PrivaBidVickrey {
    euint64  private highestBid;
    euint64  private secondHighestBid;  // winner PAYS this
    eaddress private highestBidder;

    function bid(uint64 amount) external {
        euint64 enc      = FHE.asEuint64(amount);
        ebool   isHighest = FHE.gt(enc, highestBid);
        ebool   isSecond  = FHE.gt(enc, secondHighestBid);

        // Update second before overwriting highest
        secondHighestBid = FHE.select(isHighest, highestBid,
                             FHE.select(isSecond, enc, secondHighestBid));
        highestBid       = FHE.max(enc, highestBid);
        highestBidder    = FHE.select(isHighest,
                             FHE.asEaddress(msg.sender), highestBidder);

        FHE.allowThis(highestBid);
        FHE.allowThis(secondHighestBid);
        FHE.allowThis(highestBidder);
    }
}
```

### Reverse Auction (Mode 4) — FHE.min instead of FHE.max
```solidity
contract PrivaBidReverse {
    euint64  private lowestAsk;
    eaddress private lowestSeller;

    function submitAsk(uint64 price) external {
        euint64 enc     = FHE.asEuint64(price);
        ebool   isLower = FHE.lt(enc, lowestAsk);
        lowestAsk       = FHE.min(enc, lowestAsk);   // FHE.min
        lowestSeller    = FHE.select(isLower,
                            FHE.asEaddress(msg.sender), lowestSeller);
        FHE.allowThis(lowestAsk);
        FHE.allowThis(lowestSeller);
    }
}
```

> Full annotated contracts: [`contracts/`](contracts/)

### What makes this privacy-by-design:

1. **Privacy is the default** — `euint64` cannot be read. No configuration needed. Enforced at the type level.
2. **Losing bids are permanently private** — `FHE.allowPublic()` is called only on winning handles. All others are sealed forever.
3. **No trusted third party** — Threshold Network is decentralised. No single entity controls the decryption key.
4. **Math enforces it, not rules** — the auctioneer cannot see bids even if they wanted to.
5. **Multiple auction modes, same guarantee** — every mode uses FHE differently, but the privacy property is identical across all of them.

---

## 9. Use Cases

### Confidential DeFi
**NFT Auctions** — First-price or Vickrey mode. Eliminate sniping and whale manipulation. True price discovery.

**Token Launches / IDOs** — Vickrey mode ensures fair allocation. No one can front-run encrypted order books.

**MEV-Protected Order Flow** — The PrivaBid pattern generalises to DEX execution: encrypted orders, matched in FHE space, eliminating sandwich attacks entirely.

### Institutional & Compliance
**Government & Corporate Procurement** — Reverse auction mode. Vendors submit encrypted asks. The buyer gets the best price. No vendor sees a competitor's offer. Legally required in most jurisdictions for public tenders.

**RWA Liquidations** — First-price or Vickrey mode. Institutional-grade privacy for sensitive asset sales. Publicly verifiable outcome.

**DAO Treasury Auctions** — Any mode. DAOs selling treasury assets or procuring services without leaking strategic pricing to the market.

### Novel FHE-Only Use Cases
**Blind Dutch Auctions** — Encrypted thresholds mean no bidder can time their acceptance by watching others. Impossible on transparent chains.

**Double-Blind Procurement** — Both the buyer's budget and the sellers' asks are encrypted. The contract finds the optimal match in FHE space. A genuinely new financial primitive.

---

## 10. Long-Term Vision

PrivaBid is not a single auction contract. It is the **standard auction primitive layer for the FHE ecosystem**.

### The Auction Factory
Long term, PrivaBid ships as an **Auction Factory** — a single deployed contract that lets anyone spin up any auction type with one call:

```solidity
auctionFactory.create(AuctionMode.VICKREY, itemName, reservePrice, duration);
auctionFactory.create(AuctionMode.REVERSE, contractDescription, budget, deadline);
auctionFactory.create(AuctionMode.DUTCH, assetName, startingPrice, floorPrice);
```

Any protocol integrates PrivaBid as a module. No custom FHE development needed.

### Composability
- NFT marketplaces plug in PrivaBid as their auction engine
- Lending protocols use it for encrypted liquidation auctions
- DAOs use it for sealed treasury allocation votes
- RWA platforms build compliant workflows on top of it
- Government procurement systems use the reverse auction module

### The Institutional Gateway
Institutions with compliance requirements currently cannot use on-chain auctions. PrivaBid removes that blocker. As FHE matures, PrivaBid becomes the entry point for institutional capital into DeFi — a genuinely better product than traditional sealed-bid systems.

Traditional sealed bids require: a trusted auctioneer, legal agreements, escrow, and post-audit. PrivaBid replaces all of that with a deployed contract, math, and a publicly verifiable result.

---

## 11. Roadmap

| Wave | Dates | Deliverables |
|---|---|---|
| **Wave 1** ✅ | Mar 21 – Mar 28 | First-price sealed-bid contract, deployed on Arbitrum Sepolia, full architecture documentation, multi-mode platform design |
| **Wave 2** 🔨 | Mar 30 – Apr 6 | Vickrey (second-price) contract with dual encrypted value tracking, encrypted reserve price feature, ERC-20 (USDC) bid deposits, Hardhat test suite |
| **Wave 3** 📋 | Apr 8 – May 8 | Dutch auction with encrypted thresholds, full React + TypeScript frontend, live testnet demo with wallet integration, `@cofhe/sdk` full flow |
| **Wave 4** 📋 | May 11 – May 20 | Reverse/procurement auction (`FHE.min`), Auction Factory contract, Privara SDK integration for confidential settlement |
| **Wave 5** 📋 | May 23 – Jun 1 | Mainnet prep, security audit of FHE access control model, PrivaBid SDK for third-party protocol integration, ecosystem outreach |

---

## 12. Technical Stack

| Layer | Technology | Purpose |
|---|---|---|
| FHE Infrastructure | [Fhenix CoFHE](https://fhenix.io) | Encrypted compute coprocessor |
| Smart Contracts | Solidity `^0.8.19` + `FHE.sol` | On-chain encrypted auction logic across all modes |
| Contract Dev | Hardhat + `cofhe-hardhat-plugin` | Local development with mock FHE environment |
| Client SDK | `@cofhe/sdk` | Encrypt inputs, manage permits, Threshold Network decryption |
| Frontend | React + TypeScript + `@cofhe/react` | `useEncrypt`, `useDecrypt` hooks |
| Payments | `@reineira-os/sdk` (Privara) | Confidential payment settlement |
| Networks | Arbitrum Sepolia, Base Sepolia, Ethereum Sepolia | FHE-compatible testnets |

---

## 13. Getting Started

### Prerequisites
- Node.js v20+
- pnpm

### Install
```bash
git clone https://github.com/yourusername/privabid
cd privabid/contracts
pnpm install
```

### Run Tests (Mock FHE Environment)
```bash
pnpm test
```

### Deploy to Arbitrum Sepolia
```bash
cp .env.example .env
# Fill in PRIVATE_KEY and ARB_SEPOLIA_RPC
pnpm hardhat run scripts/deploy.ts --network arb-sepolia
```

---

## Resources

- [Fhenix Documentation](https://docs.fhenix.io)
- [CoFHE Quick Start](https://cofhe-docs.fhenix.zone/fhe-library/introduction/quick-start)
- [Official Auction Example](https://cofhe-docs.fhenix.zone/fhe-library/examples/auction-example)
- [FHE Encrypted Operations](https://cofhe-docs.fhenix.zone/fhe-library/core-concepts/encrypted-operations)
- [Threshold Network / Decryption](https://cofhe-docs.fhenix.zone/fhe-library/core-concepts/decryption-operations)
- [Fhenix Sandbox](https://www.fhenix.io/sandbox)
- [Privara SDK](https://www.npmjs.com/package/@reineira-os/sdk)
- [Fhenix Buildathon Telegram](https://t.me/+rA9gI3AsW8c3YzIx)

---

*Built for the Fhenix Privacy-by-Design .*
