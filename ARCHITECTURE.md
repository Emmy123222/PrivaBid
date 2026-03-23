# PrivaBid — Technical Architecture

This document describes the cryptographic architecture of PrivaBid in depth, covering all four auction modes and the FHE design decisions behind each one. Written for technical judges who want to understand *why* every decision was made.

---

## Table of Contents

1. [Why FHE, Not ZK or Commit-Reveal](#1-why-fhe-not-zk-or-commit-reveal)
2. [Fhenix CoFHE — How It Works](#2-fhenix-cofhe--how-it-works)
3. [The Encrypted Type System](#3-the-encrypted-type-system)
4. [The ACL (Access Control Layer)](#4-the-acl-access-control-layer)
5. [Mode 1 — First-Price: FHE Operations in Detail](#5-mode-1--first-price-fhe-operations-in-detail)
6. [Mode 2 — Vickrey: Dual Encrypted Value Tracking](#6-mode-2--vickrey-dual-encrypted-value-tracking)
7. [Mode 3 — Dutch: Encrypted Thresholds](#7-mode-3--dutch-encrypted-thresholds)
8. [Mode 4 — Reverse: FHE.min and Procurement](#8-mode-4--reverse-fhemin-and-procurement)
9. [The Threshold Network Decryption](#9-the-threshold-network-decryption)
10. [Privacy Guarantees Across All Modes](#10-privacy-guarantees-across-all-modes)
11. [Gas Considerations](#11-gas-considerations)
12. [Security Model](#12-security-model)

---

## 1. Why FHE, Not ZK or Commit-Reveal

### The Core Requirement

An encrypted auction needs to answer: **"Which of these N encrypted values wins, and by what amount?"**

Across PrivaBid's four modes, this requires:
- Storing N encrypted bid/ask values
- Computing comparisons across all N values without decrypting
- Updating a running maximum or minimum without decrypting
- Conditionally updating the winner identity without branching on plaintext
- In Vickrey mode: tracking the **top two** values simultaneously
- In Dutch mode: checking encrypted thresholds against a changing price
- In Reverse mode: finding the **minimum** of N encrypted asks

No existing technology other than FHE can satisfy all of these requirements on a general-purpose smart contract platform.

### ZK Proofs Cannot Solve This

ZK proofs verify statements about known values. They cannot compute across multiple private inputs held by different parties.

```
ZK can prove:  "my bid > 1000"  ✓
ZK cannot do:  "find max(bid_1, bid_2, ..., bid_50)"  ✗
```

To do multi-party max with ZK you need a trusted prover who sees all bids — defeating the purpose.

### Commit-Reveal Leaks Everything

Commit-reveal protects bids during the bidding phase. But at reveal, **all** bids become public. Losers' amounts are on-chain forever.

PrivaBid's guarantee: **losing bids are never decrypted**. `FHE.allowPublic()` is called only on winning handles. All other ciphertexts are computationally indistinguishable from random data — unreadable forever, regardless of computational power.

### Why FHE Is the Right Tool

```
Requirement                            | ZK  | Commit-Reveal | FHE
───────────────────────────────────────|─────|───────────────|────
Store N encrypted bids                 |  ✓  |      ✓        |  ✓
Compare bids without decrypting        |  ✗  |      ✗        |  ✓
Find max/min without decrypting        |  ✗  |      ✗        |  ✓
Track first AND second highest         |  ✗  |      ✗        |  ✓
Losing bids permanently sealed         |  △  |      ✗        |  ✓
Encrypted threshold comparisons        |  ✗  |      ✗        |  ✓
No trusted prover or operator          |  △  |      ✓        |  ✓
General-purpose smart contract         |  △  |      ✓        |  ✓
```

---

## 2. Fhenix CoFHE — How It Works

Fhenix implements FHE as an off-chain coprocessor for EVM-compatible chains.

```
Smart Contract (Solidity)
       │
       │  FHE.gt(a, b) → submits a task to the coprocessor
       ▼
  Task Manager (on-chain)
       │  task queued with ciphertext handles
       ▼
  Slim Listener (off-chain)
       │  picks up task, forwards to FHE execution
       ▼
  FheOS Server (off-chain)
       │  performs actual FHE computation on ciphertexts
       │  returns encrypted result
       ▼
  Result Processor (off-chain → on-chain)
       │  submits encrypted result back to blockchain
       ▼
Smart Contract receives encrypted result
```

Key insight: **the EVM never touches actual ciphertext**. On-chain contracts work with *handles* — 32-byte identifiers referencing ciphertexts in the CoFHE coprocessor. FHE operations are asynchronous: the contract submits a task and receives a result handle.

---

## 3. The Encrypted Type System

Fhenix's `FHE.sol` introduces encrypted variants of standard Solidity types:

| Encrypted Type | Plaintext Equivalent | Used in PrivaBid |
|---|---|---|
| `euint64` | `uint64` | Bid amounts, ask prices, thresholds, reserve price |
| `eaddress` | `address` | Bidder and seller addresses |
| `ebool` | `bool` | Comparison results (isHigher, isLower, isSecond) |

### Why `euint64` for all monetary values?

Supports up to 18.4 quintillion — sufficient for any real-world auction value at any decimal precision. Using `euint64` consistently across all four modes makes the contract interface uniform and composable.

### Why `eaddress` for winner identity?

If the current winner was stored as a regular `address`, anyone could watch who is currently leading and adjust their strategy. `eaddress` hides the current leader across all auction phases.

---

## 4. The ACL (Access Control Layer)

Every encrypted value in Fhenix is controlled by an Access Control List. This determines which contracts and addresses can use each ciphertext handle.

### The Immutability Pattern — Critical to Understand

FHE values are **immutable**. `FHE.max(a, b)` does not modify `a` or `b`. It returns a **new** handle. This means:

1. `highestBid = FHE.max(enc, highestBid)` replaces `highestBid` with a new handle
2. The new handle has no ACL permissions yet
3. `FHE.allowThis()` must be called on the new handle
4. If forgotten: the next `bid()` call fails with an ACL error

This is the most common mistake when first building with Fhenix FHE. Every mode in PrivaBid calls `FHE.allowThis()` after every operation that produces a new handle.

### ACL State Across the Auction Lifecycle

```
Constructor:
  FHE.allowThis(highestBid)          // contract can access
  FHE.allowThis(secondHighestBid)    // Vickrey only
  FHE.allowThis(lowestAsk)           // Reverse only

bid() / submitAsk():
  ... FHE operations produce new handles ...
  FHE.allowThis(newHandle)           // re-grant after EVERY operation

closeBidding():
  FHE.allowPublic(highestBid)        // Threshold Network can now decrypt
  FHE.allowPublic(secondHighestBid)  // Vickrey: winner pays this
  // losingBids: NEVER get allowPublic — permanently sealed

revealWinner():
  FHE.publishDecryptResult(...)      // verify Threshold Network proof
```

---

## 5. Mode 1 — First-Price: FHE Operations in Detail

### Concrete Example: Three Bidders

```
Initial state:
  highestBid    = encrypt(0)
  highestBidder = encrypt(address(0))

─────────────────────────────────────────────────────
Bidder A calls bid(3000):

  enc       = FHE.asEuint64(3000)           → [ct_A: 3000]
  isHigher  = FHE.gt([ct_A], [ct: 0])       → [encrypted: TRUE]
  highestBid    = FHE.max([ct_A], [ct: 0])  → [ct: 3000]
  highestBidder = FHE.select([TRUE],
                   [encrypt(addr_A)], [0])   → [ct: addr_A]

Nobody sees any of this. Everything is ciphertext.

─────────────────────────────────────────────────────
Bidder B calls bid(7000):

  enc       = FHE.asEuint64(7000)
  isHigher  = FHE.gt([ct: 7000], [ct: 3000]) → [encrypted: TRUE]
  highestBid    = FHE.max(...)               → [ct: 7000]
  highestBidder = FHE.select([TRUE], ...)    → [ct: addr_B]

─────────────────────────────────────────────────────
Bidder C calls bid(5000):

  enc       = FHE.asEuint64(5000)
  isHigher  = FHE.gt([ct: 5000], [ct: 7000]) → [encrypted: FALSE]
  highestBid    = FHE.max(...)               → [ct: 7000]  ← unchanged
  highestBidder = FHE.select([FALSE], ...)   → [ct: addr_B] ← unchanged

─────────────────────────────────────────────────────
After reveal:
  winningBid    = 7000   ← cryptographically proven
  winningBidder = addr_B ← cryptographically proven

  Bidder A's bid (3000): PERMANENTLY SEALED
  Bidder C's bid (5000): PERMANENTLY SEALED
```

At no point does the contract know which bid is highest. The comparison results are encrypted booleans. The contract operates completely blind on ciphertext.

---

## 6. Mode 2 — Vickrey: Dual Encrypted Value Tracking

### Why Vickrey Is More Complex

In Mode 1, the contract tracks one encrypted value: `highestBid`.

In Vickrey, the contract must simultaneously track **two** encrypted values:
- `highestBid` — determines the winner
- `secondHighestBid` — determines what the winner pays

Both values must be updated on every incoming bid without decrypting either one. This requires a nested `FHE.select` — a conditional inside a conditional, all in FHE space.

### The Update Logic

```
New bid enc arrives. Three cases:
  Case 1: enc > highestBid
    → secondHighestBid = old highestBid
    → highestBid = enc
    → highestBidder = new bidder

  Case 2: secondHighestBid < enc ≤ highestBid
    → secondHighestBid = enc
    → highestBid unchanged
    → highestBidder unchanged

  Case 3: enc ≤ secondHighestBid
    → nothing changes

In FHE, both conditions are evaluated simultaneously as encrypted booleans.
The nested FHE.select handles all three cases without ever knowing which one applies.
```

```solidity
ebool isHighest = FHE.gt(enc, highestBid);
ebool isSecond  = FHE.gt(enc, secondHighestBid);

// Outer select: if new bid is highest, second = old highest
// Inner select: if new bid is second-best, second = new bid
// Otherwise: second unchanged
secondHighestBid = FHE.select(
    isHighest,
    highestBid,
    FHE.select(isSecond, enc, secondHighestBid)
);
```

### At Reveal

Two separate Threshold Network decryptions:
1. `highestBid` → identifies the winner
2. `secondHighestBid` → determines the payment amount

Winner pays `secondHighestBid`, not `highestBid`. Both values are proven by separate cryptographic signatures.

---

## 7. Mode 3 — Dutch: Encrypted Thresholds

### The Traditional Dutch Auction Problem

In a Dutch auction, price descends from high to low. The first bidder to "accept" wins. On a transparent chain, this is gameable — you can watch the blockchain to see when others are getting close to accepting and time your move.

### PrivaBid's Solution: Encrypted Thresholds

Bidders submit an **encrypted threshold** — the lowest price they are willing to accept. The contract holds all thresholds as ciphertexts and checks them against the current (public) price each block:

```solidity
euint64 encryptedThreshold = FHE.asEuint64(myFloorPrice);
FHE.allowThis(encryptedThreshold);
thresholds[msg.sender] = encryptedThreshold;
```

Each block, the price drops. The contract checks:
```solidity
ebool thresholdMet = FHE.lte(currentPrice, encryptedThreshold);
// If TRUE (in FHE space): this bidder wins
```

No bidder can see any other bidder's threshold. Acceptance happens automatically when the descending price meets an encrypted floor — no one can time their acceptance by observing others.

### What This Enables

This is a genuinely new auction primitive that cannot exist on transparent chains. Blind Dutch auctions are used in:
- Token distributions where the issuer wants true price discovery
- Declining-price liquidation of distressed assets
- Time-sensitive sales where urgency should not be exploitable

---

## 8. Mode 4 — Reverse: FHE.min and Procurement

### Flipping the Model

All previous modes track the **highest** value. Reverse auctions track the **lowest**. This requires swapping `FHE.max` for `FHE.min` and `FHE.gt` for `FHE.lt`.

```solidity
// First-price (Mode 1):
ebool isHigher = FHE.gt(enc, highestBid);
highestBid     = FHE.max(enc, highestBid);

// Reverse (Mode 4):
ebool isLower = FHE.lt(enc, lowestAsk);
lowestAsk     = FHE.min(enc, lowestAsk);
```

The ACL model, `FHE.allowThis()` pattern, and Threshold Network reveal are identical. Only the comparison direction and the FHE aggregate function change.

### Why This Matters for Real Markets

Government and corporate procurement by law requires sealed competitive bids in most jurisdictions. On transparent chains, vendors can see each other's prices and engage in strategic undercutting. PrivaBid's reverse auction makes this impossible.

The buyer publishes a contract description and budget (optionally encrypted). Vendors submit encrypted asks. The contract finds `FHE.min()` of all asks. The buyer receives the best price — and no vendor ever sees a competitor's offer.

This is not hypothetical. The global procurement market is worth trillions annually. PrivaBid is the first infrastructure that delivers cryptographically enforced sealed-bid procurement on-chain.

---

## 9. The Threshold Network Decryption

### Architecture

The Threshold Network is Fhenix's decentralised decryption system using Multi-Party Computation (MPC).

```
Full decryption key K split into N shards:
  K₁, K₂, K₃, ..., Kₙ — each held by a different node

To decrypt ciphertext C:
  ≥ T nodes must cooperate (threshold T of N)
  Each computes a partial decryption using their shard
  Partials combined → plaintext P
  Nodes jointly sign (P, C) as cryptographic proof

No single node can decrypt.
No subset < T can decrypt.
Only ≥ T honest nodes together can decrypt.
```

### The Decrypt-With-Proof Pattern (All Modes)

```typescript
// After closeBidding() — handles are now publicly decryptable

// Mode 1 & 2: get winning bid handle
const bidHandle = await contract.getHighestBidHandle();

// Mode 2 only: get second-highest for payment amount
const secondHandle = await contract.getSecondHighestBidHandle();

// Request decryption — Threshold Network returns (plaintext, signature)
const bidResult = await client
  .decryptForTx(bidHandle).withoutPermit().execute();

// Submit proof on-chain — FHE.publishDecryptResult verifies signature
// REVERTS if signature is invalid or plaintext is wrong
await contract.revealWinner(
  bidResult.ctHash, bidResult.decryptedValue, bidResult.signature,
  ...
);
```

### Security Guarantee

`FHE.publishDecryptResult()` verifies the Threshold Network signature on-chain. If anyone submits a fake plaintext, the signature will not match and the transaction reverts. The winner result is not self-reported — it is cryptographically proven.

---

## 10. Privacy Guarantees Across All Modes

### What Is Hidden in Every Mode

| Data | During Auction | After Close | After Reveal |
|---|---|---|---|
| Individual bid/ask amounts | ✅ Hidden | ✅ Hidden | Winning amount only |
| Losing bid/ask amounts | ✅ Hidden | ✅ Hidden | **✅ Permanently hidden** |
| Current winner/leader | ✅ Hidden | ✅ Hidden | Revealed at reveal |
| Vickrey second-highest bid | ✅ Hidden | ✅ Hidden | Revealed as payment amount |
| Dutch bidder thresholds | ✅ Hidden | ✅ Hidden | Winner's threshold only |
| Encrypted reserve price | ✅ Hidden | ✅ Hidden | Never revealed |

### The Permanent Seal Guarantee

This is the critical property that other approaches miss.

After `closeBidding()`, only the winning handles have `FHE.allowPublic()` called on them. All other encrypted handles — every losing bid from every mode — exist as orphaned ciphertexts in the CoFHE registry. They were never granted a decryption key. Even a fully compromised Threshold Network cannot decrypt them, because they were never marked as decryptable.

---

## 11. Gas Considerations

FHE operations are more expensive than standard EVM operations.

| Operation | Approx Gas |
|---|---|
| `FHE.asEuint64()` | ~50,000 |
| `FHE.gt()` or `FHE.lt()` | ~80,000 |
| `FHE.max()` or `FHE.min()` | ~80,000 |
| `FHE.select()` | ~80,000 |
| `FHE.allowThis()` | ~20,000 |
| Full `bid()` — Mode 1 | ~500,000–700,000 |
| Full `bid()` — Mode 2 (Vickrey) | ~800,000–1,000,000 |

Vickrey mode costs more than Mode 1 because it runs an additional `FHE.gt` and a nested `FHE.select` per bid. This is the direct cost of the additional privacy guarantee — knowing which bid is second-highest without decrypting either value.

Arbitrum Sepolia is the recommended deployment target — L2 gas costs reduce absolute ETH spend significantly.

---

## 12. Security Model

### Trust Assumptions

| Component | Trust Level | Reasoning |
|---|---|---|
| Fhenix CoFHE | High | Encrypted compute infrastructure |
| Threshold Network | Distributed (≥T/N nodes) | MPC, no single point of failure |
| Smart Contract (EVM) | Standard | Same as any Solidity contract |
| Auctioneer | Limited (close only) | Cannot read bids, cannot manipulate outcome |
| Bidders/Sellers | Trustless | Public interface only |

### Attack Vectors and Mitigations

**Front-running bids** — Attacker sees `bid(5000)` in mempool but cannot read the amount (it is encrypted on arrival). Cannot intelligently outbid. FHE defeats this at the fundamental level.

**Fake winner submission** — Attacker calls `revealWinner()` with a fabricated result. `FHE.publishDecryptResult()` verifies the Threshold Network signature — invalid input reverts.

**Early decryption attempt** — Threshold Network nodes attempt to decrypt before `closeBidding()`. `FHE.allowPublic()` has not been called, so the ACL blocks the request.

**Malicious auctioneer** — Can close auction early, but cannot read any bids. Cannot manipulate the outcome — `revealWinner()` requires Threshold Network proof.

**Vickrey manipulation** — Auctioneer attempts to manipulate the second-highest bid to inflate payment. Both `highestBid` and `secondHighestBid` are revealed with separate Threshold Network signatures. Both must verify independently.

---

*For the plain-English FHE explainer: [`FHE_EXPLAINER.md`](FHE_EXPLAINER.md)*
*For the project overview: [`README.md`](README.md)*
