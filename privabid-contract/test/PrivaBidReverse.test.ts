/**
 * PrivaBidReverse.test.ts — Reverse Auction Test Suite (Mock FHE Environment)
 *
 * Run:  npm test
 *       REPORT_GAS=true npm test
 */

import { expect }              from "chai";
import { ethers }              from "hardhat";
import { loadFixture, time }   from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { PrivaBidReverse }     from "../typechain-types";
import { mock_expectPlaintext } from "cofhe-hardhat-plugin";

// ─── Helpers ─────────────────────────────────────────────────────────────────
const BUDGET_CEILING = 100_000n;
const ONE_HOUR       = 3600;
const ONE_MIN        = 60;

async function deployReverseAuction(budgetCeiling = BUDGET_CEILING, duration = ONE_HOUR) {
  const [buyer, seller1, seller2, seller3, anyone] = await ethers.getSigners();
  const F = await ethers.getContractFactory("PrivaBidReverse");
  const c = await F.deploy(
    "Web Development Services",
    "Looking for a developer to build a React app with backend API. Sellers compete with lowest price.",
    budgetCeiling,
    duration
  ) as unknown as PrivaBidReverse;
  await c.waitForDeployment();
  return { c, buyer, seller1, seller2, seller3, anyone };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. DEPLOYMENT
// ─────────────────────────────────────────────────────────────────────────────
describe("1. Deployment", () => {
  it("sets correct buyer address", async () => {
    const { c, buyer } = await deployReverseAuction();
    expect(await c.buyer()).to.equal(buyer.address);
  });

  it("sets correct budget ceiling", async () => {
    const { c } = await deployReverseAuction();
    expect(await c.budgetCeiling()).to.equal(BUDGET_CEILING);
  });

  it("starts open, no winner", async () => {
    const { c } = await deployReverseAuction();
    expect(await c.auctionClosed()).to.equal(false);
    expect(await c.winnerRevealed()).to.equal(false);
    expect(await c.totalAsks()).to.equal(0);
    expect(await c.winningAsk()).to.equal(0);
    expect(await c.winningSeller()).to.equal(ethers.ZeroAddress);
  });

  it("sets correct item name and description", async () => {
    const { c } = await deployReverseAuction();
    expect(await c.itemName()).to.equal("Web Development Services");
    expect(await c.itemDescription()).to.include("React app");
  });

  it("sets correct auction end time", async () => {
    const { c } = await deployReverseAuction();
    const endTime = await c.auctionEndTime();
    const currentTime = await time.latest();
    expect(endTime).to.be.closeTo(currentTime + ONE_HOUR, 10);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. ASK SUBMISSION
// ─────────────────────────────────────────────────────────────────────────────
describe("2. Ask Submission", () => {
  it("accepts valid ask below ceiling", async () => {
    const { c, seller1 } = await deployReverseAuction();
    const tx = await c.connect(seller1).submitAsk(50_000n);
    await expect(tx)
      .to.emit(c, "AskSubmitted");
    expect(await c.hasSubmitted(seller1.address)).to.equal(true);
    expect(await c.totalAsks()).to.equal(1);
  });

  it("accepts ask exactly at ceiling", async () => {
    const { c, seller1 } = await deployReverseAuction();
    await expect(c.connect(seller1).submitAsk(BUDGET_CEILING)).not.to.be.reverted;
  });

  it("rejects ask above ceiling (AboveBudget)", async () => {
    const { c, seller1 } = await deployReverseAuction();
    await expect(c.connect(seller1).submitAsk(BUDGET_CEILING + 1n))
      .to.be.revertedWithCustomError(c, "AboveBudget");
  });

  it("emits AskSubmitted without price in event", async () => {
    const { c, seller1 } = await deployReverseAuction();
    const tx = await c.connect(seller1).submitAsk(75_000n);
    const receipt = await tx.wait();
    const log = receipt?.logs.find((l: any) => c.interface.parseLog(l as any)?.name === "AskSubmitted");
    const parsed = c.interface.parseLog(log as any);
    expect(parsed?.args[0]).to.equal(seller1.address); // only address emitted
    expect(parsed?.args).to.not.include(75_000n);      // price NOT in event
  });

  it("tracks seller participation", async () => {
    const { c, seller1, seller2, seller3 } = await deployReverseAuction();
    await c.connect(seller1).submitAsk(60_000n);
    await c.connect(seller2).submitAsk(45_000n);
    await c.connect(seller3).submitAsk(80_000n);
    
    expect(await c.hasSubmitted(seller1.address)).to.equal(true);
    expect(await c.hasSubmitted(seller2.address)).to.equal(true);
    expect(await c.hasSubmitted(seller3.address)).to.equal(true);
    expect(await c.totalAsks()).to.equal(3);
    
    const sellerList = await c.getSellerList();
    expect(sellerList).to.include(seller1.address);
    expect(sellerList).to.include(seller2.address);
    expect(sellerList).to.include(seller3.address);
  });

  it("prevents duplicate submissions", async () => {
    const { c, seller1 } = await deployReverseAuction();
    await c.connect(seller1).submitAsk(50_000n);
    await expect(c.connect(seller1).submitAsk(40_000n))
      .to.be.revertedWithCustomError(c, "AlreadySubmitted");
  });

  it("rejects ask after auction expires", async () => {
    const { c, seller1 } = await deployReverseAuction(BUDGET_CEILING, ONE_MIN);
    await time.increase(ONE_MIN + 1);
    await expect(c.connect(seller1).submitAsk(50_000n))
      .to.be.revertedWithCustomError(c, "AuctionExpired");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. FHE OPERATIONS
// ─────────────────────────────────────────────────────────────────────────────
describe("3. FHE Operations", () => {
  it("lowestAsk reflects minimum of all asks", async () => {
    const { c, seller1, seller2, seller3, buyer } = await deployReverseAuction();
    
    // Submit asks: 70_000, 40_000, 55_000
    await c.connect(seller1).submitAsk(70_000n);
    await c.connect(seller2).submitAsk(40_000n);  // This should be the lowest
    await c.connect(seller3).submitAsk(55_000n);
    
    // Close auction to allow access to encrypted handles
    await c.connect(buyer).closeBidding();
    
    // Get the encrypted handle and verify it contains the minimum value (40_000)
    const lowestAskHandle = await c.getLowestAskHandle();
    await mock_expectPlaintext(ethers.provider, BigInt(lowestAskHandle), 40_000n);
    
    // For now, just verify the handle exists
    expect(lowestAskHandle).to.not.be.undefined;
  });

  it("lowestSeller is correct vendor", async () => {
    const { c, seller1, seller2, seller3, buyer } = await deployReverseAuction();
    
    // Submit asks: 70_000, 40_000, 55_000
    await c.connect(seller1).submitAsk(70_000n);
    await c.connect(seller2).submitAsk(40_000n);  // seller2 has the lowest
    await c.connect(seller3).submitAsk(55_000n);
    
    // Close auction to allow access to encrypted handles
    await c.connect(buyer).closeBidding();
    
    // Get the encrypted handle and verify it contains seller2's address
    const lowestSellerHandle = await c.getLowestSellerHandle();
    await mock_expectPlaintext(ethers.provider, BigInt(lowestSellerHandle), BigInt(seller2.address));
  });

  it("handles single ask correctly", async () => {
    const { c, seller1, buyer } = await deployReverseAuction();
    
    await c.connect(seller1).submitAsk(60_000n);
    await c.connect(buyer).closeBidding();
    
    const lowestAskHandle = await c.getLowestAskHandle();
    const lowestSellerHandle = await c.getLowestSellerHandle();
    
    await mock_expectPlaintext(ethers.provider, BigInt(lowestAskHandle), 60_000n);
    await mock_expectPlaintext(ethers.provider, BigInt(lowestSellerHandle), BigInt(seller1.address));
  });

  it("updates correctly when better ask comes later", async () => {
    const { c, seller1, seller2, buyer } = await deployReverseAuction();
    
    // First ask is higher
    await c.connect(seller1).submitAsk(80_000n);
    // Second ask is lower (better)
    await c.connect(seller2).submitAsk(30_000n);
    
    await c.connect(buyer).closeBidding();
    
    const lowestAskHandle = await c.getLowestAskHandle();
    const lowestSellerHandle = await c.getLowestSellerHandle();
    
    await mock_expectPlaintext(ethers.provider, BigInt(lowestAskHandle), 30_000n);
    await mock_expectPlaintext(ethers.provider, BigInt(lowestSellerHandle), BigInt(seller2.address));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. ACCESS CONTROL
// ─────────────────────────────────────────────────────────────────────────────
describe("4. Access Control", () => {
  it("only buyer can close bidding", async () => {
    const { c, seller1, anyone } = await deployReverseAuction();
    await c.connect(seller1).submitAsk(50_000n);
    
    await expect(c.connect(seller1).closeBidding())
      .to.be.revertedWithCustomError(c, "OnlyBuyer");
    await expect(c.connect(anyone).closeBidding())
      .to.be.revertedWithCustomError(c, "OnlyBuyer");
  });

  it("buyer can close bidding successfully", async () => {
    const { c, seller1, buyer } = await deployReverseAuction();
    await c.connect(seller1).submitAsk(50_000n);
    
    const tx = await c.connect(buyer).closeBidding();
    await expect(tx)
      .to.emit(c, "AuctionClosed");
    
    expect(await c.auctionClosed()).to.equal(true);
  });

  it("cannot submit ask after close", async () => {
    const { c, seller1, seller2, buyer } = await deployReverseAuction();
    await c.connect(seller1).submitAsk(50_000n);
    await c.connect(buyer).closeBidding();
    
    await expect(c.connect(seller2).submitAsk(40_000n))
      .to.be.revertedWithCustomError(c, "AuctionClosedError");
  });

  it("cannot reveal before close", async () => {
    const { c, seller1 } = await deployReverseAuction();
    await c.connect(seller1).submitAsk(50_000n);
    
    // Try to reveal without closing first
    const dummyHandle = ethers.ZeroHash;
    const dummySignature = "0x";
    
    await expect(c.revealWinner(
      dummyHandle, 50_000n, dummySignature,
      dummyHandle, seller1.address, dummySignature
    )).to.be.revertedWithCustomError(c, "AuctionNotClosed");
  });

  it("rejects access to handles while auction is active", async () => {
    const { c, seller1 } = await deployReverseAuction();
    await c.connect(seller1).submitAsk(50_000n);
    
    await expect(c.getLowestAskHandle())
      .to.be.revertedWithCustomError(c, "AuctionNotClosed");
    await expect(c.getLowestSellerHandle())
      .to.be.revertedWithCustomError(c, "AuctionNotClosed");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. REVEAL
// ─────────────────────────────────────────────────────────────────────────────
describe("5. Reveal", () => {
  it("revealWinner stores correct values after valid proof", async () => {
    const { c, seller1, seller2, buyer } = await deployReverseAuction();
    
    // Submit asks
    await c.connect(seller1).submitAsk(70_000n);
    await c.connect(seller2).submitAsk(45_000n);  // seller2 wins
    
    // Close auction
    await c.connect(buyer).closeBidding();
    
    // Mock the reveal process (in real FHE, these would be actual decryption proofs)
    const dummySignature = "0x1234567890abcdef";
    
    const tx = await c.revealWinner(
      45_000n, dummySignature,
      seller2.address, dummySignature
    );
    await expect(tx)
      .to.emit(c, "WinnerRevealed");
    
    // Verify stored values
    expect(await c.winningAsk()).to.equal(45_000n);
    expect(await c.winningSeller()).to.equal(seller2.address);
    expect(await c.winnerRevealed()).to.equal(true);
  });

  it("can reveal with different values (testing flexibility)", async () => {
    const { c, seller1, buyer } = await deployReverseAuction();
    
    await c.connect(seller1).submitAsk(60_000n);
    await c.connect(buyer).closeBidding();
    
    const dummySignature = "0xabcdef";
    
    await c.revealWinner(
      60_000n, dummySignature,
      seller1.address, dummySignature
    );
    
    expect(await c.winningAsk()).to.equal(60_000n);
    expect(await c.winningSeller()).to.equal(seller1.address);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. VIEW FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────
describe("6. View Functions", () => {
  it("timeRemaining returns correct value", async () => {
    const { c } = await deployReverseAuction(BUDGET_CEILING, ONE_HOUR);
    const remaining = await c.timeRemaining();
    expect(remaining).to.be.closeTo(ONE_HOUR, 10);
  });

  it("timeRemaining returns 0 after expiry", async () => {
    const { c } = await deployReverseAuction(BUDGET_CEILING, ONE_MIN);
    await time.increase(ONE_MIN + 1);
    expect(await c.timeRemaining()).to.equal(0);
  });

  it("getAuctionState returns complete state", async () => {
    const { c, buyer, seller1 } = await deployReverseAuction();
    await c.connect(seller1).submitAsk(50_000n);
    
    const state = await c.getAuctionState();
    expect(state[0]).to.equal(buyer.address);        // buyer
    expect(state[1]).to.equal("Web Development Services"); // itemName
    expect(state[3]).to.equal(BUDGET_CEILING);       // budgetCeiling
    expect(state[5]).to.equal(false);                // auctionClosed
    expect(state[6]).to.equal(false);                // winnerRevealed
    expect(state[7]).to.equal(1);                    // totalAsks
  });

  it("getSellerList returns all participants", async () => {
    const { c, seller1, seller2, seller3 } = await deployReverseAuction();
    
    await c.connect(seller1).submitAsk(60_000n);
    await c.connect(seller2).submitAsk(45_000n);
    await c.connect(seller3).submitAsk(80_000n);
    
    const sellers = await c.getSellerList();
    expect(sellers).to.have.length(3);
    expect(sellers).to.include(seller1.address);
    expect(sellers).to.include(seller2.address);
    expect(sellers).to.include(seller3.address);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. EDGE CASES
// ─────────────────────────────────────────────────────────────────────────────
describe("7. Edge Cases", () => {
  it("handles zero budget ceiling", async () => {
    const F = await ethers.getContractFactory("PrivaBidReverse");
    const c = await F.deploy("Test", "Test desc", 0, ONE_HOUR);
    await c.waitForDeployment();
    expect(await c.budgetCeiling()).to.equal(0);
  });

  it("handles maximum uint64 budget", async () => {
    const maxUint64 = 2n ** 64n - 1n;
    const { c } = await deployReverseAuction(maxUint64);
    expect(await c.budgetCeiling()).to.equal(maxUint64);
  });

  it("auction closes automatically after time expires", async () => {
    const { c, seller1 } = await deployReverseAuction(BUDGET_CEILING, ONE_MIN);
    await c.connect(seller1).submitAsk(50_000n);
    
    // Time passes
    await time.increase(ONE_MIN + 1);
    
    // Should not be able to submit new asks
    const [, seller2] = await ethers.getSigners();
    await expect(c.connect(seller2).submitAsk(40_000n))
      .to.be.revertedWithCustomError(c, "AuctionExpired");
  });
});