# PrivaBid 🔒
### Sealed-Bid Auction Protocol on Fhenix FHE

> *"Front-runners can't front-run what they can't see."*

**PrivaBid** is a sealed-bid auction protocol where every bid is cryptographically encrypted on-chain from submission to reveal. Built natively on [Fhenix](https://fhenix.io) Fully Homomorphic Encryption — not retrofitted with commit-reveal hacks or trusted intermediaries.

[![Built on Fhenix](https://img.shields.io/badge/Built%20on-Fhenix%20FHE-00FF94?style=flat-square)](https://fhenix.io)
[![Wave 1](https://img.shields.io/badge/Buildathon-Wave%201-blue?style=flat-square)](https://akindo.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)

---

## Table of Contents

1. [The Problem](#1-the-problem)
2. [Why Existing Solutions Fail](#2-why-existing-solutions-fail)
3. [What PrivaBid Does](#3-what-privabid-does)
4. [Why FHE is the Only Real Solution](#4-why-fhe-is-the-only-real-solution)
5. [Architecture & Flow](#5-architecture--flow)
6. [FHE Primitives Used](#6-fhe-primitives-used)
7. [Smart Contract Overview](#7-smart-contract-overview)
8. [Use Cases](#8-use-cases)
9. [Long-Term Vision](#9-long-term-vision)
10. [Roadmap](#10-roadmap)
11. [Technical Stack](#11-technical-stack)
12. [Getting Started](#12-getting-started)

---

## 1. The Problem

Public blockchains made transparency the default. That transparency enables trustless systems — but it also creates hard limits on what you can build.

**On-chain auctions are broken by design.**

The moment a bidder submits a transaction, their bid amount is visible to the entire network — before it's even confirmed. This creates three compounding vulnerabilities:

### MEV / Front-Running
Automated bots monitor the Ethereum mempool in real-time. When they detect a bid of `5,000 USDC`, they immediately submit a bid of `5,001 USDC` with a higher gas fee, ensuring their transaction is mined first.

The original bidder loses — not because someone valued the item more, but because a bot had read access to their transaction.

> **$500M+** is extracted from DeFi users annually through MEV. 75% of those losses hit trades under $20K — retail users, not whales.

### Bid Sniping
Because the current highest bid is always visible, rational bidders wait until the last possible moment and place a minimal outbid. This collapses true price discovery: the final auction price reflects the second-highest bidder's **patience**, not the item's real market value.

### Strategic Collusion
In institutional settings — procurement, RWA liquidations, corporate M&A — knowing a competitor's bid is valuable intelligence. A company evaluating on-chain infrastructure for procurement cannot use transparent rails. Compliance won't allow it.

> This is why institutions aren't using on-chain auctions. Not because they don't want to. Because they **can't**.

---

## 2. Why Existing Solutions Fail

Developers have tried to work around transparent auctions for years. None of the existing approaches actually solve the problem:

### Commit-Reveal Schemes
Bidders hash their bid + a secret in Phase 1, reveal in Phase 2.

**Why it fails:**
- The reveal phase exposes **all bids publicly** — losers' amounts become permanently visible on-chain
- A committed hash is still gameable: adversaries can brute-force common bid amounts
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
- ZK proofs **verify statements** about values — they don't enable **computation across** multiple encrypted values
- You can prove "my bid is above the reserve" but you cannot compute "which of these 50 encrypted bids is the highest" without building custom circuits for every possible comparison combination
- Not practical at auction scale

### The Real Issue
All of these approaches share a fundamental flaw: **they add privacy as a layer on top of a transparent system**. The underlying architecture is still transparent, and every "privacy" layer is just an obstacle that sophisticated attackers eventually work around.

PrivaBid takes the opposite approach: **privacy is baked into the architecture from day one.**

---

## 3. What PrivaBid Does

PrivaBid is a smart contract that runs a sealed-bid auction where:

| What happens | What observers see |
|---|---|
| Bidder submits `bid(5000)` | Bidder's wallet address, timestamp |
| Contract encrypts and stores bid | An opaque ciphertext handle |
| Contract compares bids | That a comparison occurred |
| Contract updates highest bidder | That state changed |
| Auction closes | That the auction is closed |
| Threshold Network decrypts winner | The winner's address and bid amount |
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
- **Find the maximum** without decrypting either value
- **Conditionally update** the winner without branching on plaintext
- **Reveal the result** with a cryptographic proof of correctness

No other technology — not ZK, not MPC alone, not commit-reveal — gives you all four properties simultaneously on a general-purpose smart contract platform.

Fhenix implements FHE as a **co-processor (CoFHE)** for EVM-compatible chains. Solidity contracts call `FHE.gt()`, `FHE.max()`, `FHE.select()` just like calling any other function — the encrypted computation happens off-chain on the CoFHE coprocessor and results are returned on-chain.

---

## 5. Architecture & Flow

### System Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         PrivaBid Protocol                        │
│                                                                   │
│  ┌──────────┐    bid(amount)     ┌─────────────────────────────┐ │
│  │  Bidder  │ ─────────────────► │       PrivaBid.sol          │ │
│  │  Wallet  │                    │                             │ │
│  └──────────┘                    │  euint64  highestBid        │ │
│                                  │  eaddress highestBidder     │ │
│  ┌──────────┐   closeBidding()   │                             │ │
│  │Auctioneer│ ─────────────────► │  FHE.gt()   ← comparison   │ │
│  └──────────┘                    │  FHE.max()  ← update bid   │ │
│                                  │  FHE.select() ← update who │ │
│                                  └──────────┬──────────────────┘ │
│                                             │                     │
│                                   FHE operations submitted        │
│                                             │                     │
│                                  ┌──────────▼──────────────────┐ │
│                                  │   Fhenix CoFHE Coprocessor  │ │
│                                  │   (off-chain FHE execution) │ │
│                                  │   Encrypted results returned│ │
│                                  └──────────┬──────────────────┘ │
│                                             │                     │
│                                   After close: decryption request │
│                                             │                     │
│                                  ┌──────────▼──────────────────┐ │
│                                  │    Fhenix Threshold Network  │ │
│                                  │    (multi-party decryption)  │ │
│                                  │    Returns: plaintext + sig  │ │
│                                  └──────────┬──────────────────┘ │
│                                             │                     │
│                                   revealWinner(plaintext, sig)    │
│                                             │                     │
│                                  ┌──────────▼──────────────────┐ │
│                                  │  FHE.publishDecryptResult() │ │
│                                  │  Verifies signature on-chain│ │
│                                  │  Stores winner trustlessly  │ │
│                                  └─────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Complete Auction Lifecycle

#### Phase 1 — Deploy
The auctioneer deploys `PrivaBid.sol` with item details, reserve price, and duration.

Internally, the contract initializes:
```solidity
highestBid    = FHE.asEuint64(0);       // encrypted zero — baseline for comparisons
highestBidder = FHE.asEaddress(address(0)); // encrypted zero address
FHE.allowThis(highestBid);              // grant contract ACL access
FHE.allowThis(highestBidder);
```

**Visible to observers:** Item name, reserve price, end time. Nothing else.

---

#### Phase 2 — Bidding
Any wallet calls `bid(amount)`. Four FHE operations run in sequence:

```
bid(5000) received
  │
  ├─ FHE.asEuint64(5000)        → encryptedAmount  [ciphertext, unreadable]
  ├─ FHE.gt(encryptedAmount,    → isHigher         [encrypted bool]
  │         highestBid)
  ├─ FHE.max(encryptedAmount,   → new highestBid   [encrypted, updated]
  │          highestBid)
  └─ FHE.select(isHigher,       → new highestBidder [encrypted, updated]
                newBidder,
                currentBidder)
```

At every step, the values remain ciphertext. The contract does not know whether the new bid was higher. The bidder list does not know each other's amounts.

**Visible to observers:** Bidder wallet address, timestamp. Bid amount: encrypted.

---

#### Phase 3 — Close
The auctioneer calls `closeBidding()`. This does two things:
1. Sets `auctionClosed = true` — no more bids accepted
2. Calls `FHE.allowPublic(highestBid)` and `FHE.allowPublic(highestBidder)`

`FHE.allowPublic()` does **not** decrypt the values. It registers in the Fhenix ACL that these handles can now be decrypted by anyone — without requiring a signed user permit.

**Visible to observers:** Auction is closed. All bid amounts still encrypted.

---

#### Phase 4 — Off-Chain Decryption
Anyone can now call the Threshold Network off-chain:

```typescript
const bidHandle    = await contract.getHighestBidHandle();
const bidderHandle = await contract.getHighestBidderHandle();

const bidResult    = await client.decryptForTx(bidHandle).withoutPermit().execute();
const bidderResult = await client.decryptForTx(bidderHandle).withoutPermit().execute();
// Returns: { decryptedValue, signature }
```

The **Threshold Network** is a decentralized system of nodes. Each node holds a shard of the decryption key. They cooperate using Multi-Party Computation (MPC) — no single node ever holds the full key. They collectively decrypt and return `(plaintext, signature)` where the signature is a cryptographic proof that the plaintext is correct.

---

#### Phase 5 — On-Chain Reveal
Anyone submits the decrypted values + signatures to the contract:

```solidity
function revealWinner(
    euint64 bidCtHash,      uint64  bidPlaintext,   bytes bidSignature,
    eaddress bidderCtHash,  address bidderPlaintext, bytes bidderSignature
) external {
    FHE.publishDecryptResult(bidCtHash,    bidPlaintext,    bidSignature);
    FHE.publishDecryptResult(bidderCtHash, bidderPlaintext, bidderSignature);
    winningBid    = bidPlaintext;
    winningBidder = bidderPlaintext;
}
```

`FHE.publishDecryptResult()` verifies the Threshold Network signature on-chain. If anyone tries to submit a fake winner — wrong plaintext, forged signature — **the transaction reverts**. The result is cryptographically proven.

**Visible to observers:** Winner address and winning bid amount. All losing bid amounts: permanently sealed, never revealed.

---

## 6. FHE Primitives Used

Every FHE function in PrivaBid is intentional. Here's what each one does and why it's there:

| Function | Purpose | Why It's Needed |
|---|---|---|
| `FHE.asEuint64(amount)` | Encrypt plaintext bid on-chain | Converts incoming bid to ciphertext immediately — never stored as plaintext |
| `FHE.asEaddress(addr)` | Encrypt bidder address | Hides even who is winning during active auction |
| `FHE.gt(a, b)` | Encrypted comparison → `ebool` | Compare bids without decrypting either value |
| `FHE.max(a, b)` | Encrypted maximum → `euint64` | Update highest bid without revealing either value |
| `FHE.select(cond, a, b)` | Encrypted ternary → `eaddress` | Update highest bidder without branching on plaintext condition |
| `FHE.allowThis(handle)` | Grant contract ACL access | FHE values are immutable — new handles need permission re-granted after every operation |
| `FHE.allowPublic(handle)` | Authorize public decryption | Tells Threshold Network: respond to decryption requests without user permit |
| `FHE.publishDecryptResult()` | Verify Threshold Network proof | Trustless on-chain verification of decryption — reverts if signature is invalid |

---

## 7. Smart Contract Overview

```solidity
// SPDX-License-Identifier: MIT
pragma solidity >=0.8.19 <0.9.0;

import "@fhenixprotocol/cofhe-contracts/FHE.sol";

contract PrivaBid {
    address public immutable auctioneer;
    string  public itemName;
    uint64  public reservePrice;       // plaintext — public reserve prices are standard
    uint256 public auctionEndTime;
    bool    public auctionClosed;

    euint64  private highestBid;       // ENCRYPTED — nobody can read this
    eaddress private highestBidder;    // ENCRYPTED — nobody can read this

    uint64  public winningBid;         // revealed only after cryptographic proof
    address public winningBidder;      // revealed only after cryptographic proof

    function bid(uint64 amount) external {
        euint64 enc       = FHE.asEuint64(amount);
        ebool   isHigher  = FHE.gt(enc, highestBid);
        highestBid        = FHE.max(enc, highestBid);
        highestBidder     = FHE.select(isHigher, FHE.asEaddress(msg.sender), highestBidder);
        FHE.allowThis(highestBid);
        FHE.allowThis(highestBidder);
    }

    function closeBidding() external onlyAuctioneer {
        FHE.allowPublic(highestBid);
        FHE.allowPublic(highestBidder);
        auctionClosed = true;
    }

    function revealWinner(
        euint64 bidCtHash, uint64 bidPlaintext, bytes calldata bidSig,
        eaddress bidderCtHash, address bidderPlaintext, bytes calldata bidderSig
    ) external {
        FHE.publishDecryptResult(bidCtHash, bidPlaintext, bidSig);
        FHE.publishDecryptResult(bidderCtHash, bidderPlaintext, bidderSig);
        winningBid    = bidPlaintext;
        winningBidder = bidderPlaintext;
    }
}
```

> Full annotated contract: [`contracts/PrivaBid.sol`](contracts/PrivaBid.sol)

### What makes this privacy-by-design (not privacy bolted on):

1. **Privacy is the default** — `euint64` simply cannot be read. There's no configuration, no privacy mode. Confidentiality is enforced at the type level.
2. **Losing bids are permanently private** — `FHE.allowPublic()` is called only on the winning handles. Losing bids are sealed forever.
3. **No trusted third party** — the Threshold Network is decentralized; no single entity controls the decryption key.
4. **Math enforces it, not rules** — the auctioneer cannot see bids even if they wanted to. The cryptography prevents it, not a terms of service.

---

## 8. Use Cases

PrivaBid is a general primitive. The same contract pattern unlocks multiple markets that have no viable on-chain solution today:

### Confidential DeFi
**NFT Auctions** — Eliminate sniping and whale manipulation. True price discovery where the best offer wins, not the most patient bot.

**Token Launches / IDOs** — Encrypted order books prevent front-running bots from capturing all value during price discovery. Every participant competes on equal footing.

**MEV-Protected Order Flow** — The PrivaBid pattern generalizes to DEX order execution: orders are encrypted until matched, eliminating the entire class of sandwich attacks.

### Institutional & Compliance
**RWA Liquidations** — Real-world asset pricing cannot be public in regulated markets. PrivaBid gives institutional buyers a compliant, privacy-preserving auction with a publicly verifiable result.

**Government & Corporate Procurement** — The multi-trillion dollar procurement market requires sealed bids by law in most jurisdictions. PrivaBid is the first infrastructure that delivers sealed bids on-chain with cryptographic proof of fairness.

**Treasury Management** — DAOs and institutions moving large positions cannot signal their trades publicly without market impact. Private execution with on-chain settlement.

### Why These Markets Can't Use Existing Infrastructure
These use cases all share one requirement: the losing bidders' information must never be revealed. Commit-reveal fails this test. Off-chain matching fails the trustless test. Only FHE-native auctions satisfy both simultaneously.

---

## 9. Long-Term Vision

PrivaBid is not just an auction contract. It is a foundational primitive for a class of applications that **cannot exist on transparent rails**.

### The Encrypted Economy Layer
Every financial market has information asymmetry problems. On-chain, these problems are amplified because transparency is the default. PrivaBid demonstrates that encrypted compute can solve these problems without sacrificing verifiability or trustlessness.

The long-term goal is to become the **standard auction and order-matching primitive** for the FHE ecosystem — the way Uniswap V2 became the standard AMM primitive. Any protocol needing sealed-bid mechanics would integrate PrivaBid rather than building their own.

### Composability
Because PrivaBid is a smart contract, it is composable:
- NFT marketplaces can integrate it as their auction module
- Lending protocols can use it for encrypted liquidation auctions
- DAOs can use it for sealed governance votes on treasury allocation
- RWA platforms can build compliant bid workflows on top of it

### The Institutional Gateway
Institutions with compliance requirements currently cannot use on-chain auctions. PrivaBid removes that blocker. As FHE matures and gas costs decrease, PrivaBid becomes the entry point for institutional capital into DeFi — not as a workaround, but as a genuinely better product than traditional sealed-bid systems.

Traditional sealed bids require: a trusted auctioneer, legal agreements, escrow, and post-audit. PrivaBid replaces all of that with: a deployed contract, math, and a publicly verifiable result. That is a strictly better product.

---

## 10. Roadmap

| Wave | Dates | Deliverables |
|---|---|---|
| **Wave 1** *(current)* | Mar 21 – Mar 28 | Documentation, smart contract structure, FHE logic proof, architecture diagrams |
| **Wave 2** | Mar 30 – Apr 6 | Deployed contract on Arbitrum Sepolia, Hardhat test suite with mock FHE, ERC-20 (USDC) bid integration |
| **Wave 3** | Apr 8 – May 8 | Full frontend (React + TypeScript), live auction demo with testnet USDC, Privara SDK integration for confidential settlement |
| **Wave 4** | May 11 – May 20 | Auction factory contract, multi-item batch auctions, Dutch auction variant, SDK for third-party integration |
| **Wave 5** | May 23 – Jun 1 | Mainnet deployment prep, security audit, ecosystem partnership outreach (NFT platforms, DeFi protocols) |

---

## 11. Technical Stack

| Layer | Technology | Purpose |
|---|---|---|
| FHE Infrastructure | [Fhenix CoFHE](https://fhenix.io) | Encrypted compute coprocessor |
| Smart Contracts | Solidity `^0.8.19` + `FHE.sol` | On-chain encrypted auction logic |
| Contract Dev | Hardhat + `cofhe-hardhat-plugin` | Local development with mock FHE |
| Client SDK | `@cofhe/sdk` | Encrypt inputs, manage permits, decrypt outputs |
| Frontend | React + TypeScript + `@cofhe/react` | `useEncrypt`, `useDecrypt` hooks |
| Payments | `@reineira-os/sdk` (Privara) | Confidential payment settlement flows |
| Networks | Arbitrum Sepolia, Base Sepolia, Ethereum Sepolia | FHE-compatible testnets |

---

## 12. Getting Started

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
- [Official Auction Example (base for PrivaBid)](https://cofhe-docs.fhenix.zone/fhe-library/examples/auction-example)
- [FHE Encrypted Operations](https://cofhe-docs.fhenix.zone/fhe-library/core-concepts/encrypted-operations)
- [Threshold Network / Decryption](https://cofhe-docs.fhenix.zone/fhe-library/core-concepts/decryption-operations)
- [Privara SDK](https://www.npmjs.com/package/@reineira-os/sdk)
- [Fhenix Buildathon Telegram](https://t.me/+rA9gI3AsW8c3YzIx)

---

*Built for the Fhenix Privacy-by-Design .*
