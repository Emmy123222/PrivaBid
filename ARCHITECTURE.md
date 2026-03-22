# PrivaBid — Technical Architecture

This document describes the cryptographic architecture of PrivaBid in depth.
Written for technical judges who want to understand *why* every design decision was made.

---

## Table of Contents

1. [Why FHE, Not ZK or Commit-Reveal](#1-why-fhe-not-zk-or-commit-reveal)
2. [Fhenix CoFHE — How It Works](#2-fhenix-cofhe--how-it-works)
3. [The Encrypted Type System](#3-the-encrypted-type-system)
4. [The ACL (Access Control Layer)](#4-the-acl-access-control-layer)
5. [Bid Flow — FHE Operations in Detail](#5-bid-flow--fhe-operations-in-detail)
6. [The Threshold Network Decryption](#6-the-threshold-network-decryption)
7. [Privacy Guarantees — What Is and Isn't Hidden](#7-privacy-guarantees--what-is-and-isnt-hidden)
8. [Gas Considerations](#8-gas-considerations)
9. [Security Model](#9-security-model)

---

## 1. Why FHE, Not ZK or Commit-Reveal

### The Core Requirement

A sealed-bid auction needs to answer the question: **"Which of these N encrypted bids is the highest?"**

This requires:
- Storing N encrypted values
- Computing comparisons across all N values
- Updating a running maximum without decrypting
- Conditionally updating the current winner

No existing technology other than FHE can do all four on a general-purpose smart contract platform.

### ZK Proofs Cannot Solve This

ZK proofs are great at verifying statements about known values:
- "I know a value `x` such that `x > 1000`" ✓
- "I know the preimage of this hash" ✓

But ZK proofs cannot compute *across* multiple private inputs held by different parties:
- "Given 50 sealed bids, find the maximum" ✗

To do this with ZK, you'd need to:
1. Have all bidders reveal their bids to a prover
2. The prover computes the max off-chain
3. The prover submits a ZK proof of correct computation

This reintroduces a trusted prover — defeating the purpose.

### Commit-Reveal Leaks Everything

Commit-reveal protects bids during the bidding phase. But at reveal:
- **All** bids become public
- Losing bidders' amounts are permanently on-chain
- Anyone can study historical auctions to model bidding strategies

PrivaBid's guarantee: **losing bids are never decrypted, ever.**
`FHE.allowPublic()` is called only on the winning bid handle.
All other bid ciphertexts are orphaned — unreadable forever.

### FHE Is the Right Tool

```
Requirement                      | ZK Proof | Commit-Reveal | FHE
─────────────────────────────────|──────────|───────────────|────
Store N encrypted bids           |    ✓     |       ✓       |  ✓
Compare bids without decrypting  |    ✗     |       ✗       |  ✓
Update winner without decrypting |    ✗     |       ✗       |  ✓
Losing bids never revealed       |    △     |       ✗       |  ✓
Trustless (no prover/operator)   |    △     |       ✓       |  ✓
General-purpose smart contract   |    △     |       ✓       |  ✓
```

---

## 2. Fhenix CoFHE — How It Works

Fhenix implements FHE as an **off-chain coprocessor** for EVM-compatible chains.

```
Smart Contract (Solidity)
       │
       │  FHE.gt(a, b) — submits a "task" to the coprocessor
       ▼
  Task Manager (on-chain)
       │
       │  task queued with ciphertext handles
       ▼
  Slim Listener (off-chain)
       │
       │  picks up task, forwards to FHE execution
       ▼
  FheOS Server (off-chain)
       │
       │  performs FHE computation on actual ciphertexts
       │  returns encrypted result
       ▼
  Result Processor (off-chain → on-chain)
       │
       │  submits encrypted result back to blockchain
       ▼
Smart Contract receives euint64 result
```

Key insight: **the EVM never touches actual ciphertext**. The on-chain contract works with *handles* — 32-byte identifiers that reference ciphertexts stored in the CoFHE coprocessor. FHE operations are asynchronous: the contract submits a task and receives a result.

This is why FHE operations cost more gas than standard operations — they involve multiple on-chain steps plus off-chain computation.

---

## 3. The Encrypted Type System

Fhenix's `FHE.sol` library introduces encrypted variants of standard Solidity types:

| Encrypted Type | Plaintext Equivalent | Use in PrivaBid |
|---|---|---|
| `euint64` | `uint64` | Encrypted bid amounts |
| `eaddress` | `address` | Encrypted bidder addresses |
| `ebool` | `bool` | Encrypted comparison results |
| `euint8` | `uint8` | (available, not used in PrivaBid) |
| `euint32` | `uint32` | (available, not used in PrivaBid) |

### Why `euint64` for bids?

- Supports values up to 18,446,744,073,709,551,615 (~18 quintillion)
- More than sufficient for any real-world auction value (even at 6 decimal places for USDC: max ~18 trillion USDC)
- `euint32` (max ~4.2 billion) would be too small for large institutional auctions

### Why `eaddress` for the bidder?

The winner's address needs to be hidden during the auction. If `highestBidder` were stored as a regular `address`, anyone could watch who is currently winning and adjust their strategy. By using `eaddress`, even the current leader is unknown to all participants.

---

## 4. The ACL (Access Control Layer)

Every encrypted value in Fhenix is controlled by an Access Control List. This determines which contracts and addresses can **use** a given ciphertext handle.

### Why the ACL Exists

Without an ACL, any contract could take any encrypted handle and submit it to FHE operations, potentially leaking information through side channels. The ACL ensures only authorized parties can work with each ciphertext.

### How PrivaBid Uses the ACL

```
Constructor:
  highestBid    = FHE.asEuint64(0)    // handle created, owned by constructor call
  FHE.allowThis(highestBid)           // grants PrivaBid contract permission

bid():
  enc           = FHE.asEuint64(amount)
  isHigher      = FHE.gt(enc, highestBid)
  highestBid    = FHE.max(enc, highestBid)   // NEW handle — old one replaced
  highestBidder = FHE.select(...)             // NEW handle — old one replaced
  FHE.allowThis(highestBid)                  // re-grant on new handle
  FHE.allowThis(highestBidder)               // re-grant on new handle

closeBidding():
  FHE.allowPublic(highestBid)         // Threshold Network can now decrypt this
  FHE.allowPublic(highestBidder)      // Threshold Network can now decrypt this
```

### The Immutability Pattern

FHE values are immutable — `FHE.max(a, b)` doesn't modify `a` or `b`. It returns a **new** encrypted value with a new handle. This means:

1. After `highestBid = FHE.max(enc, highestBid)`, the variable `highestBid` now points to a new handle
2. The old handle is still valid but no longer pointed to by anything in the contract
3. The new handle has no ACL permissions yet — we must call `FHE.allowThis()` on it
4. If we forget `FHE.allowThis()`, the next `bid()` call fails with an ACL error when it tries to use `highestBid`

---

## 5. Bid Flow — FHE Operations in Detail

### Concrete Example: Three Bidders

```
Initial state:
  highestBid    = encrypt(0)
  highestBidder = encrypt(address(0))

─────────────────────────────────────────────────────
Bidder A calls bid(3000):

  enc       = FHE.asEuint64(3000)          → [ciphertext_A]
  isHigher  = FHE.gt([ciphertext_A], [0])  → [encrypted: TRUE]
  highestBid    = FHE.max([ct_A], [0])     → [ciphertext: 3000]
  highestBidder = FHE.select([TRUE],
                   [encrypt(addr_A)],
                   [encrypt(addr_0)])       → [ciphertext: addr_A]

After Bidder A:
  highestBid    = [ciphertext: 3000]   ← nobody can read this
  highestBidder = [ciphertext: addr_A] ← nobody can read this

─────────────────────────────────────────────────────
Bidder B calls bid(7000):

  enc       = FHE.asEuint64(7000)               → [ciphertext_B]
  isHigher  = FHE.gt([ciphertext_B], [ct: 3000]) → [encrypted: TRUE]
  highestBid    = FHE.max([ct_B], [ct: 3000])   → [ciphertext: 7000]
  highestBidder = FHE.select([TRUE],
                   [encrypt(addr_B)],
                   [ct: addr_A])                 → [ciphertext: addr_B]

After Bidder B:
  highestBid    = [ciphertext: 7000]   ← nobody can read this
  highestBidder = [ciphertext: addr_B] ← nobody can read this

─────────────────────────────────────────────────────
Bidder C calls bid(5000):

  enc       = FHE.asEuint64(5000)               → [ciphertext_C]
  isHigher  = FHE.gt([ciphertext_C], [ct: 7000]) → [encrypted: FALSE]
  highestBid    = FHE.max([ct_C], [ct: 7000])   → [ciphertext: 7000]  ← unchanged
  highestBidder = FHE.select([FALSE],
                   [encrypt(addr_C)],
                   [ct: addr_B])                 → [ciphertext: addr_B] ← unchanged

After Bidder C:
  highestBid    = [ciphertext: 7000]   ← still 7000, nobody knows
  highestBidder = [ciphertext: addr_B] ← still addr_B, nobody knows

─────────────────────────────────────────────────────
After closeBidding() + revealWinner():
  winningBid    = 7000       ← revealed with cryptographic proof
  winningBidder = addr_B     ← revealed with cryptographic proof

  Bidder A's bid (3000): PERMANENTLY SEALED. Never decryptable.
  Bidder C's bid (5000): PERMANENTLY SEALED. Never decryptable.
```

Notice: **at no point does the contract know which bid is highest during the auction**. The comparison results are encrypted booleans. The update operations are conditional on encrypted conditions. The contract is operating blind on ciphertext.

---

## 6. The Threshold Network Decryption

### What Is the Threshold Network?

The Threshold Network is Fhenix's decentralized decryption system. It uses **Multi-Party Computation (MPC)** to enable decryption without any single party holding the full decryption key.

```
Full decryption key K is split into N shards:
  K₁, K₂, K₃, ... Kₙ

Each shard is held by a different node.

To decrypt ciphertext C:
  - Need ≥ T nodes to cooperate (threshold T of N)
  - Each node uses its shard to compute a partial decryption
  - Partial decryptions are combined → plaintext P
  - Nodes jointly sign (P, C) as proof

No single node can decrypt alone.
No subset < T can decrypt.
Only ≥ T honest nodes together can decrypt.
```

### The Decrypt-With-Proof Pattern

```typescript
// Step 1: After closeBidding(), get encrypted handles
const bidHandle    = await contract.getHighestBidHandle();
const bidderHandle = await contract.getHighestBidderHandle();

// Step 2: Request decryption from Threshold Network
// withoutPermit() works because FHE.allowPublic() was called on-chain
const bidResult = await client
  .decryptForTx(bidHandle)
  .withoutPermit()
  .execute();
// Returns: { ctHash: euint64, decryptedValue: bigint, signature: bytes }

const bidderResult = await client
  .decryptForTx(bidderHandle)
  .withoutPermit()
  .execute();
// Returns: { ctHash: eaddress, decryptedValue: string, signature: bytes }

// Step 3: Submit to contract — verified on-chain
await contract.revealWinner(
  bidResult.ctHash,    bidResult.decryptedValue,    bidResult.signature,
  bidderResult.ctHash, bidderResult.decryptedValue, bidderResult.signature
);
```

### On-Chain Verification

`FHE.publishDecryptResult(ctHash, plaintext, signature)` does the following:
1. Looks up the ciphertext handle in the CoFHE registry
2. Verifies the Threshold Network's signature: `verify(signature, ctHash, plaintext)`
3. If valid: stores plaintext on-chain and marks handle as decrypted
4. If invalid: **REVERTS** — the transaction is rejected

This means the winner result is not self-reported by the caller. It is **cryptographically verified** by math on-chain.

---

## 7. Privacy Guarantees — What Is and Isn't Hidden

### What Is Hidden

| Data | During Auction | After Close | After Reveal |
|---|---|---|---|
| Your bid amount | ✅ Hidden | ✅ Hidden | Winning bid only |
| Losing bid amounts | ✅ Hidden | ✅ Hidden | ✅ **Permanently hidden** |
| Who is currently winning | ✅ Hidden | ✅ Hidden | Revealed at reveal |
| Current highest bid value | ✅ Hidden | ✅ Hidden | Revealed at reveal |

### What Is Public

| Data | Visibility |
|---|---|
| Bidder wallet addresses | Public (on-chain event) |
| Number of bids | Public (totalBids counter) |
| Reserve price | Public (standard practice) |
| Auction end time | Public |
| Winner address + amount | Public after reveal |

### The Losing Bid Guarantee

This is the most important privacy property that other solutions miss.

In commit-reveal: all bids revealed at the end. Losers' amounts are on-chain forever.
In PrivaBid: `FHE.allowPublic()` is called ONLY on `highestBid` and `highestBidder`.

The losing bids exist only as intermediate FHE operation outputs — ephemeral encrypted handles that were passed to `FHE.max()` and `FHE.select()` but never stored with `allowPublic()`. They are computationally indistinguishable from random data on-chain.

Even a fully compromised Threshold Network cannot reveal losing bids — they were never marked as decryptable.

---

## 8. Gas Considerations

FHE operations are more expensive than standard EVM operations because:
1. They require CoFHE coprocessor round-trips
2. Encrypted operations work on large ciphertexts
3. The ACL update is an on-chain write

### Approximate Gas Costs (Fhenix Testnet)

| Operation | Approximate Gas |
|---|---|
| `FHE.asEuint64()` | ~50,000 gas |
| `FHE.gt()` | ~80,000 gas |
| `FHE.max()` | ~80,000 gas |
| `FHE.select()` | ~80,000 gas |
| `FHE.allowThis()` | ~20,000 gas |
| Full `bid()` call | ~500,000–700,000 gas |

**Note:** Gas costs in mock/test environment are higher than production due to simulation overhead. Production CoFHE gas costs are being actively optimized by the Fhenix team.

### Optimization Strategy

For Wave 3+, PrivaBid will implement:
- Batch bid submission (multiple bids in one transaction)
- Gas estimation helper for frontend bidders
- Layer 2 deployment (Arbitrum Sepolia) to reduce absolute ETH cost

---

## 9. Security Model

### What PrivaBid Trusts

| Component | Trust Level | Why |
|---|---|---|
| Fhenix CoFHE | High trust | Encrypted computation infrastructure |
| Threshold Network | Distributed trust (≥T nodes) | Multi-party, no single point of failure |
| Solidity EVM | Standard trust | Same as any smart contract |
| Auctioneer | Limited — only can close | Cannot read bids, cannot manipulate outcome |
| Bidders | Trustless | Interact with public interface only |

### Attack Vectors and Mitigations

**Malicious Auctioneer**
- Can close the auction early → Bidders lose their window, but bids are never exposed
- Cannot read bids → FHE type system prevents it
- Cannot manipulate winner → `revealWinner()` requires Threshold Network proof

**Front-Running the Bid Transaction**
- Attacker sees `bid(5000)` in mempool
- Attacker submits `bid(5001)` with higher gas
- **Mitigation:** This is *exactly* the attack FHE prevents — the attacker cannot see the bid amount (it's encrypted on arrival), so they cannot intelligently outbid

**Fake Winner Submission**
- Attacker calls `revealWinner()` with a fake address and amount
- **Mitigation:** `FHE.publishDecryptResult()` verifies Threshold Network signature — invalid input reverts

**Threshold Network Collusion**
- ≥T nodes cooperate to decrypt winning bid early
- **Mitigation:** `FHE.allowPublic()` is only called after close — before that, even the Threshold Network cannot decrypt (no permission registered in ACL)
- After close, decryption of *winner* is intentional — that's the reveal mechanism
- Losing bids remain undecryptable regardless of Threshold Network behavior

**Re-entrancy**
- No external calls are made from `bid()` or `closeBidding()`
- State changes happen before any external interaction
- Standard CEI (Checks-Effects-Interactions) pattern followed

---

*For the complete smart contract with annotations: [`contracts/PrivaBid.sol`](contracts/PrivaBid.sol)*

*For the project overview: [`README.md`](README.md)*
