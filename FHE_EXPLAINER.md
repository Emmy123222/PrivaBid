# How FHE Powers PrivaBid
### A Plain-English Explainer

This document explains Fully Homomorphic Encryption (FHE) and why it's the only technology that can power a truly private on-chain auction — written for readers without a cryptography background.

---

## Start Here: The Safe Analogy

Imagine you have a **magic safe**. You can put two sealed envelopes inside — each containing a secret number. You close the safe and press a button labeled "COMPARE."

The safe tells you: "The left envelope wins" — without ever opening either envelope.

Nobody sees the numbers. The safe did the comparison in the dark. Only the result came out.

**That is Fully Homomorphic Encryption.**

---

## What "Homomorphic" Means

"Homomorphic" means: *the same structure is preserved across transformations.*

In practical terms: mathematical operations on encrypted data produce encrypted results that, when decrypted, match what you'd get if you had operated on the original data.

```
Normal math:
  5 + 3 = 8

FHE math:
  encrypt(5) ⊕ encrypt(3) = encrypt(8)
  decrypt(encrypt(8)) = 8  ✓
```

The operation happened on the encrypted values. The result is also encrypted.
When you decrypt it, you get the correct answer.

"Fully" homomorphic means this works for **any** operation — addition, multiplication, comparison, selection — not just a limited set.

---

## Why This Matters for Auctions

### The Problem With Normal Encryption

Normal encryption is like a box with a lock. You can lock the box (encrypt) and unlock the box (decrypt). But you can't **do anything with what's inside** while it's locked.

On a blockchain, this means:
- You can store an encrypted bid ✓
- But to compare it with another bid, you must decrypt first ✗
- And decryption puts the value in plaintext — visible to everyone ✗

### What FHE Changes

FHE is like a box where you can **manipulate the contents from outside without unlocking it**.

You can:
- Put two locked boxes in the machine and ask "which has the bigger number?" → get back a locked answer
- Put two locked boxes in and ask "return the bigger one" → get back a locked box with the larger value inside
- Ask "if box A > box B, give me box C, otherwise give me box D" → get back the right box, locked

In PrivaBid:
- Each bid is a locked box (encrypted with `FHE.asEuint64`)
- `FHE.gt()` asks: which locked box has the bigger number? Returns a locked "yes/no"
- `FHE.max()` asks: return a locked box with the larger of these two values
- `FHE.select()` asks: given a locked "yes/no" answer, return this locked box or that one

At every step, nothing is unlocked. Everything stays encrypted.

---

## The Four FHE Operations in PrivaBid

When you call `bid(5000)`, here's what happens in plain language:

### Step 1: Lock Your Bid
```
FHE.asEuint64(5000)
```
*"Take the number 5000 and lock it in a box. Nobody can open this box. Give me the locked box."*

From this point, nobody — not the contract, not observers, not block validators — can see your bid amount.

### Step 2: Compare Without Opening
```
FHE.gt(yourLockedBid, currentHighestLockedBid)
```
*"Without opening either box, tell me: is my box bigger than the current highest box?"*

The answer comes back as... another locked box. An encrypted yes/no. The contract cannot open this box either. It can only pass it to the next operation.

### Step 3: Update the Highest Bid
```
FHE.max(yourLockedBid, currentHighestLockedBid)
```
*"Without opening either box, give me a new box containing whichever of these two has the larger number inside."*

The result is a new locked box. Nobody knows if it contains 5000 (your bid) or the previous highest.

### Step 4: Update the Winner's Identity
```
FHE.select(encryptedYesNo, yourLockedAddress, currentLeaderLockedAddress)
```
*"Given the locked yes/no answer from Step 2: if it's yes, give me a locked box with my address in it. If it's no, give me the box with the current leader's address. Don't tell me which one you returned."*

The result: a locked box with the winner's address. Neither the contract nor anyone watching knows if the winner changed.

---

## Why Losing Bids Are Never Revealed

This is the critical guarantee that makes PrivaBid different from everything else.

When the auction ends, the auctioneer calls `closeBidding()`. This calls:
```
FHE.allowPublic(highestBid)
FHE.allowPublic(highestBidder)
```

This is saying: *"The Threshold Network is allowed to open these two specific locked boxes."*

Only these two. Your losing bid was never granted this permission.

It exists somewhere in the history of locked boxes that passed through `FHE.max()` and `FHE.select()` operations — but it was never marked as openable. The key to open it was never issued to anyone.

**Even if someone had unlimited computational resources, they cannot open a box that has never been given an opening key.**

---

## The Threshold Network: Decentralized Key Holding

The "key" to open FHE-encrypted values is not held by any single party. It is split among a network of nodes using **Multi-Party Computation**.

Imagine 100 people, each holding one piece of a puzzle. You need at least 51 pieces to reconstruct the full puzzle. Any 51 people can cooperate and reconstruct it. But 50 or fewer people cannot reconstruct anything useful.

The Threshold Network works the same way:
- The decryption key is split into many shards
- Each shard is held by a different node
- A threshold number of nodes must cooperate to decrypt
- No single node can decrypt alone
- The nodes cooperate, produce the decrypted value, and sign it to prove correctness

When `revealWinner()` is called on-chain, `FHE.publishDecryptResult()` verifies this signature. If the signature doesn't match, the transaction reverts. The result is not just claimed — it's proven.

---

## What This Enables That Nothing Else Can

| Feature | Traditional Auction | Commit-Reveal | Off-Chain Sealed Bid | PrivaBid (FHE) |
|---|---|---|---|---|
| Bids hidden during auction | ✗ | ✓ | ✓ | ✓ |
| Losing bids hidden after auction | ✗ | ✗ | Sometimes | ✓ Always |
| No trusted operator needed | N/A | ✓ | ✗ | ✓ |
| Winner proven cryptographically | ✗ | ✓ | ✗ | ✓ |
| Works on public blockchain | ✓ | ✓ | ✗ | ✓ |
| Compliant for institutions | ✗ | ✗ | ✓ | ✓ |

PrivaBid is the only architecture that satisfies all six requirements simultaneously.

---

## Summary

FHE lets a smart contract:
1. **Store** bid amounts without anyone being able to read them
2. **Compare** bids without decrypting either value
3. **Find the maximum** without knowing what the maximum is
4. **Update the winner** without knowing who is currently winning
5. **Reveal only the winner** — with cryptographic proof — while permanently sealing all other bids

This isn't a workaround or a clever trick. It's a fundamental cryptographic capability that makes a new category of application possible.

PrivaBid is the first application of this capability to the auction problem — and it's built on Fhenix, the only production FHE infrastructure for EVM smart contracts.

---

*For the technical implementation: [`ARCHITECTURE.md`](ARCHITECTURE.md)*
*For the smart contract: [`contracts/PrivaBid.sol`](contracts/PrivaBid.sol)*
