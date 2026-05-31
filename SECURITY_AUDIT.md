# PrivaBid — FHE ACL Security Audit (Self-Assessment)

**Scope:** PrivaBid smart contracts (`PrivaBid.sol`, `PrivaBidV2.sol`, standalone mode contracts, factories)  
**Network:** Arbitrum Sepolia testnet only (no mainnet deployment)  
**Date:** Wave 5 — May 2026  
**Auditor type:** Self-assessment for buildathon submission (not a third-party audit)

---

## 1. Threat model

| Actor | Capability | Goal |
|-------|------------|------|
| Bidder / seller | Submit encrypted values, decrypt own sealed amount | Win fairly without leaking strategy |
| Auctioneer / buyer | Close auction, trigger reveal | Settle at correct winner |
| Observer | Read all public state + events | Infer winner timing, not bid amounts |
| MEV bot | Frontrun txs | **Blocked** — bid amounts are ciphertext |
| Malicious auctioneer | Close early, censor reveal | Disrupt sale (cannot read losing bids) |

**Out of scope (testnet):** On-chain USDC escrow/deposits — bids are not collateralized on-chain in current deployment.

---

## 2. ACL primitives (Fhenix CoFHE)

Every FHE handle has an **Access Control List**. Only listed addresses/contracts may use a handle in subsequent ops or decryption.

| Call | When | Purpose |
|------|------|---------|
| `FHE.allowThis(handle)` | After every FHE op creating/updating a handle | Contract retains compute access |
| `FHE.allowSender(handle)` | On user-submitted encrypted input | Participant can `decryptForView` own bid |
| `FHE.allowPublic(handle)` | **Only in `closeBidding()`** on winner-related handles | Threshold Network may decrypt at reveal |

**Critical invariant:** Losing bid handles never receive `allowPublic()`. They cannot be decrypted by anyone, including the auctioneer.

---

## 3. Per-mode ACL checklist

### First-price (`bid`)

- [x] Incoming bid encrypted via `FHE.asEuint64`
- [x] `allowThis` + `allowSender` on participant's sealed amount
- [x] `highestBid` / `highestBidder` updated via `FHE.gt`, `FHE.max`, `FHE.select`
- [x] `allowThis` re-granted after each update
- [x] On close: `allowPublic` only on `highestBid` + `highestBidder`

### Vickrey (`bid`)

- [x] Same as first-price plus `secondHighestBid` tracking
- [x] Nested `FHE.select` updates second-highest without plaintext branch
- [x] On close: `allowPublic` on top two bids + winner address

### Dutch (`setThreshold`)

- [x] Per-bidder threshold in `dutchThresholds[addr]` with `allowSender`
- [x] No global price comparison on-chain until reveal (multi-mode V2)
- [x] On close/reveal: `allowPublic` only on **winner's** threshold handle

### Reverse (`submitAsk`)

- [x] `FHE.lt` + `FHE.min` for lowest ask
- [x] `lowestAsk` / `lowestSeller` never exposed during auction
- [x] On close: `allowPublic` on winning ask + seller only

### Encrypted reserve (V2)

- [x] `encryptedReserve` sealed at deploy when `useEncryptedReserve=true`
- [x] `reserveCheckUint` computed in FHE at close (`FHE.gte(highestBid, encryptedReserve)`)
- [x] Reveal requires reserve-check proof; reverts with `ReserveNotMet` if false

---

## 4. Findings & mitigations

| ID | Severity | Finding | Mitigation / status |
|----|----------|---------|---------------------|
| F-01 | Info | Auctioneer can close before `auctionEndTime` | By design — early close allowed; document in UI |
| F-02 | Low | Public `reservePrice` is a UI hint when encrypted reserve enabled | Document; encrypted check enforced at reveal |
| F-03 | Low | No on-chain bid deposits (Wave 2 stretch) | Testnet honor system; Privara escrow optional post-reveal |
| F-04 | Info | `cofhe-hardhat-plugin` mocks lag `@fhenixprotocol/cofhe-contracts@0.1.x` | Compile verified; manual testnet QA (see `docs/TESTING.md`) |
| F-05 | Info | Dutch V2 price drops 1 μUSDC per N blocks (not USDC-step standalone model) | Documented in factory UI + SDK |

**No critical or high issues identified** in ACL design for the stated threat model.

---

## 5. Recommendations before mainnet (future)

1. Third-party audit focused on FHE ACL + reveal proof validation  
2. On-chain USDC deposits with refund path for losers  
3. Timelock or minimum duration before `closeBidding`  
4. Formal verification of Vickrey second-price invariant in FHE  
5. Bug bounty after mainnet CoFHE availability  

---

## 6. Verification performed

- [x] Manual ACL trace across all four modes in `PrivaBidV2.sol`
- [x] Standalone contracts mirror close/reveal ACL pattern
- [x] Frontend reveal flow uses correct handle getters per contract kind
- [x] `npm run compile` succeeds on `@fhenixprotocol/cofhe-contracts@0.1.3`
- [x] Live testnet demos on Arbitrum Sepolia (addresses in `docs/DEPLOYED_ADDRESSES.md`)

---

*This document satisfies Wave 5 “security audit of FHE access control model” as a structured self-assessment. It does not replace a professional audit for production mainnet.*
##