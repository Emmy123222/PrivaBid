# How FHE Powers PrivaBid's Four Auction Modes
### A Plain-English Explainer

This document explains Fully Homomorphic Encryption (FHE) and how it powers each of PrivaBid's four auction types — written for readers without a cryptography background.

---

## Start Here: The Safe Analogy

Imagine you have a **magic safe**. You can put two sealed envelopes inside — each containing a secret number. You close the safe and press a button labeled "COMPARE."

The safe tells you: "The left envelope has the bigger number" — without ever opening either envelope.

Nobody sees the numbers. The safe did the comparison in the dark. Only the result came out.

**That is Fully Homomorphic Encryption.**

Now imagine the safe can also:
- Tell you which of two envelopes has the **smaller** number (for procurement)
- Track the **two biggest** numbers across hundreds of envelopes (for Vickrey auctions)
- Check if a descending counter has reached someone's **secret threshold** (for Dutch auctions)

All without opening any envelope. That is what PrivaBid does across its four auction modes.

---

## What "Homomorphic" Means

"Homomorphic" means: the same structure is preserved across transformations.

In practical terms: mathematical operations on encrypted data produce encrypted results that, when decrypted, match what you'd get if you had operated on the original data.

```
Normal math:
  5,000 + 3,000 = 8,000

FHE math:
  encrypt(5,000) ⊕ encrypt(3,000) = encrypt(8,000)
  decrypt(encrypt(8,000)) = 8,000  ✓
```

"Fully" homomorphic means this works for **any** operation — comparison, maximum, minimum, conditional selection — not just a limited set.

---

## The Four Core FHE Operations in PrivaBid

Before explaining each auction mode, here are the four FHE building blocks used across all of them:

### FHE.gt(a, b) and FHE.lt(a, b)
*"Without opening either box, tell me: is box A bigger than box B?"*

Returns an **encrypted yes/no** — not a regular true/false. Even the answer is sealed. The contract cannot read it. It can only pass it to the next operation.

### FHE.max(a, b) and FHE.min(a, b)
*"Without opening either box, give me a new sealed box containing the larger (or smaller) of the two."*

The result is a new sealed box. Nobody knows which value it contains.

### FHE.select(condition, a, b)
*"Given a sealed yes/no answer: if it's yes, give me box A. If it's no, give me box B. Don't tell me which you chose."*

An encrypted conditional. No branch is visible. This is how PrivaBid updates the current winner without anyone knowing who is winning.

### FHE.allowPublic(handle)
*"The Threshold Network is now allowed to open this specific box — but only this one."*

Called only on the winning box after the auction closes. Every losing box is never granted this permission. Losing bids are permanently sealed.

---

## Mode 1 — First-Price Sealed Bid

**"Highest bid wins, pays their own amount."**

### How FHE is used:

When you call `bid(5000)`:

```
Step 1: Lock your bid
  FHE.asEuint64(5000) → sealed box containing 5,000

Step 2: Compare without opening
  FHE.gt(your box, current highest box) → sealed YES or NO

Step 3: Update the highest bid
  FHE.max(your box, current highest box) → new sealed box with the larger value

Step 4: Update the winner identity
  FHE.select(sealed YES/NO, your address box, current winner box)
  → new sealed box with whoever is winning
```

Nothing is opened. The contract does not know if you are winning or losing. Nobody does.

### Why it beats commit-reveal:
In commit-reveal, all bids are revealed at the end. Losers' amounts are on-chain forever. In PrivaBid Mode 1, `FHE.allowPublic()` is called only on the winning bid. All losing bids are sealed permanently.

---

## Mode 2 — Vickrey Auction (Second-Price)

**"Highest bid wins, but pays the second-highest amount."**

This is the fairest auction format — it incentivises everyone to bid their true value. Used in Google Ads, government spectrum auctions, and high-stakes corporate procurement.

### Why this is harder with FHE:

Mode 1 tracks one encrypted value. Vickrey must track **two encrypted values simultaneously** — the highest bid and the second-highest bid — updating both on every incoming bid, without decrypting either.

### How FHE handles it:

The magic is a **nested** `FHE.select` — a conditional inside a conditional, all in encrypted space:

```
Three cases when a new bid arrives:
  If new bid is highest:
    → second-highest = old highest (bump it down)
    → highest = new bid
  If new bid is second-best:
    → second-highest = new bid
    → highest unchanged
  If new bid is lower than both:
    → nothing changes

The contract evaluates all three cases simultaneously
using nested encrypted conditionals — without ever
knowing which case applies.
```

```
isHighest = FHE.gt(new bid, current highest)   → sealed YES/NO
isSecond  = FHE.gt(new bid, current second)    → sealed YES/NO

secondHighest = FHE.select(
  isHighest,              ← "did new bid beat the top?"
  current highest,        ← if yes: old top becomes new second
  FHE.select(
    isSecond,             ← "did new bid beat the second?"
    new bid,              ← if yes: new bid is new second
    current second        ← if no: second unchanged
  )
)
```

At the end, the winner pays `secondHighestBid` — proven by its own separate Threshold Network signature. You can verify exactly what the winner paid and confirm it is correct.

### Why this matters:
A Vickrey auction on a transparent chain is gameable — bidders can see the second-highest bid and bid exactly one unit above it. PrivaBid's Vickrey mode keeps both values sealed until reveal. True Vickrey properties, for the first time, on-chain.

---

## Mode 3 — Dutch Auction with Encrypted Thresholds

**"Price descends from high to low. First bidder whose secret floor is met wins."**

### The traditional problem:

In a normal Dutch auction, the price ticks down over time. The first person to "accept" wins. On a transparent chain, bidders can watch each other's wallets and time their acceptance strategically — defeating the purpose.

### PrivaBid's FHE solution:

Before the auction starts, bidders submit an **encrypted threshold** — the lowest price they are willing to accept. The contract holds all thresholds as sealed ciphertexts.

As the price descends, the contract checks:

```
FHE.lte(currentPrice, encryptedThreshold)
→ sealed YES or NO
```

If YES (in encrypted space): this bidder wins automatically. Nobody had to reveal their floor. Nobody could watch and react.

### Why this is new:

A blind Dutch auction — where no bidder can see others' acceptance thresholds — simply cannot exist on a transparent chain. PrivaBid is the first protocol to make it possible.

The bidder sets their floor once, submits it encrypted, and walks away. If the price reaches their floor before anyone else's, they win. No timing games. No watching the blockchain.

---

## Mode 4 — Reverse Auction / Procurement

**"Sellers compete by offering the lowest price. Buyer picks the winner."**

This is how most real-world procurement works — companies submit bids to win a contract, and the buyer picks the lowest responsible offer.

### The transparent chain problem:

If a government agency runs procurement on a transparent chain, every vendor can see every competitor's price in real-time. They undercut by one cent. Strategic gaming replaces honest competitive pricing.

### How PrivaBid flips Mode 1:

Mode 4 is Mode 1 with one conceptual change: instead of finding the maximum, find the **minimum**. `FHE.max` becomes `FHE.min`. `FHE.gt` becomes `FHE.lt`.

```
Mode 1 (buyer competition):
  isHigher = FHE.gt(new bid, current highest)
  highest  = FHE.max(new bid, current highest)

Mode 4 (seller competition):
  isLower  = FHE.lt(new ask, current lowest)
  lowest   = FHE.min(new ask, current lowest)
```

The ACL model, Threshold Network reveal, and privacy guarantees are identical. Only the direction of competition changes.

### Why procurement specifically needs this:

Government procurement by law requires sealed bids in most jurisdictions. The law exists because transparent procurement enables collusion and bid-rigging. But "sealed" today means sending PDFs to a government email address — an offline system with no verifiable audit trail.

PrivaBid's reverse auction gives procurement:
- Cryptographically sealed bids (not just PDFs)
- Publicly verifiable outcome (on-chain with Threshold Network proof)
- No trusted operator to manipulate results
- Permanent record of all participation (addresses public, amounts sealed)

---

## The Permanent Seal — PrivaBid's Core Guarantee

Across all four modes, the same property holds:

**Losing bids, asks, and thresholds are never decrypted. Ever.**

After `closeBidding()`, `FHE.allowPublic()` is called only on the winning values. All other ciphertexts exist as orphaned encrypted handles in the Fhenix CoFHE registry. They were never granted a decryption key.

Even if every node in the Threshold Network was compromised, those losing bids could not be decrypted — because they were never marked as decryptable. The permission was never issued. The math makes it impossible.

This is what "privacy-by-design" means. Not a UI setting. Not a legal promise. A cryptographic impossibility.

---

## The Threshold Network: Who Holds the Key?

Across all modes, winner revelation works the same way:

1. The auctioneer calls `closeBidding()` — `FHE.allowPublic()` authorises decryption of the winning handle only
2. Anyone calls `client.decryptForTx(handle)` off-chain
3. The Threshold Network — multiple independent nodes each holding a key shard — cooperate to decrypt and jointly sign the result
4. The signature is submitted on-chain via `FHE.publishDecryptResult()`
5. The contract verifies the signature. If invalid: **transaction reverts**
6. If valid: winner stored on-chain, trustlessly proven

No single party can fake the result. No single party can decrypt early. The reveal is controlled by cryptography, not by trust.

---

## Summary: What Each Mode Uses FHE For

| Mode | Core FHE Operations | What's Sealed | What's Revealed |
|---|---|---|---|
| First-Price | `FHE.gt`, `FHE.max`, `FHE.select` | All bid amounts | Winning bid + winner |
| Vickrey | All of above + nested `FHE.select` for second-highest | All bids | Winning bid + payment amount + winner |
| Dutch | `FHE.lte`, threshold comparison per block | All acceptance thresholds | Winner's threshold at match |
| Reverse | `FHE.lt`, `FHE.min`, `FHE.select` | All ask prices | Lowest ask + winning seller |

In every mode: losing values are never decryptable. Privacy is guaranteed by the FHE type system, not by promises.

---

*For the technical implementation details: [`ARCHITECTURE.md`](ARCHITECTURE.md)*
*For the smart contracts: [`contracts/`](contracts/)*
*For the project overview: [`README.md`](README.md)*
