/**
 * PrivaBid.test.ts — Full Test Suite (Mock FHE Environment)
 *
 * Run:  pnpm test
 *       REPORT_GAS=true pnpm test
 */

import { expect }              from "chai";
import { ethers }              from "hardhat";
import { loadFixture, time }   from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { anyValue }            from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { PrivaBid }            from "../typechain-types";
import { mock_expectPlaintext } from "cofhe-hardhat-plugin";

// ─── Enums ───────────────────────────────────────────────────────────────────
const Mode = { FIRST_PRICE: 0, VICKREY: 1, DUTCH: 2, REVERSE: 3 };

// ─── Helpers ─────────────────────────────────────────────────────────────────
const RESERVE     = 1_000n;
const ONE_HOUR    = 3600;
const ONE_MIN     = 60;

async function deployMode(mode: number, duration = ONE_HOUR) {
  const [auctioneer, b1, b2, b3, anyone] = await ethers.getSigners();
  const F = await ethers.getContractFactory("PrivaBid");
  const c = await F.deploy(
    mode, "Test Item", "Test description", RESERVE, duration,
    10_000n, 1_000n, 100   // dutch params (ignored for other modes)
  ) as unknown as PrivaBid;
  await c.waitForDeployment();
  return { c, auctioneer, b1, b2, b3, anyone };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. DEPLOYMENT
// ─────────────────────────────────────────────────────────────────────────────
describe("1. Deployment", () => {
  it("sets correct auctioneer", async () => {
    const { c, auctioneer } = await deployMode(Mode.FIRST_PRICE);
    expect(await c.auctioneer()).to.equal(auctioneer.address);
  });

  it("sets correct mode — FIRST_PRICE", async () => {
    const { c } = await deployMode(Mode.FIRST_PRICE);
    expect(await c.mode()).to.equal(Mode.FIRST_PRICE);
  });

  it("sets correct mode — VICKREY", async () => {
    const { c } = await deployMode(Mode.VICKREY);
    expect(await c.mode()).to.equal(Mode.VICKREY);
  });

  it("sets correct mode — DUTCH", async () => {
    const { c } = await deployMode(Mode.DUTCH);
    expect(await c.mode()).to.equal(Mode.DUTCH);
  });

  it("sets correct mode — REVERSE", async () => {
    const { c } = await deployMode(Mode.REVERSE);
    expect(await c.mode()).to.equal(Mode.REVERSE);
  });

  it("starts open, no winner", async () => {
    const { c } = await deployMode(Mode.FIRST_PRICE);
    expect(await c.auctionClosed()).to.equal(false);
    expect(await c.winnerRevealed()).to.equal(false);
    expect(await c.totalBids()).to.equal(0);
  });

  it("reverts on empty item name", async () => {
    const F = await ethers.getContractFactory("PrivaBid");
    await expect(F.deploy(0, "", "desc", RESERVE, ONE_HOUR, 0n, 0n, 0))
      .to.be.revertedWithCustomError({ interface: F.interface }, "EmptyItemName");
  });

  it("reverts on zero reserve price", async () => {
    const F = await ethers.getContractFactory("PrivaBid");
    await expect(F.deploy(0, "Item", "desc", 0n, ONE_HOUR, 0n, 0n, 0))
      .to.be.revertedWithCustomError({ interface: F.interface }, "ZeroReservePrice");
  });

  it("reverts on zero duration", async () => {
    const F = await ethers.getContractFactory("PrivaBid");
    await expect(F.deploy(0, "Item", "desc", RESERVE, 0, 0n, 0n, 0))
      .to.be.revertedWithCustomError({ interface: F.interface }, "ZeroDuration");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. FIRST_PRICE BIDDING
// ─────────────────────────────────────────────────────────────────────────────
describe("2. First-Price Bidding", () => {
  it("accepts a valid bid and tracks participation", async () => {
    const { c, b1 } = await deployMode(Mode.FIRST_PRICE);
    await expect(c.connect(b1).bid(5_000n))
      .to.emit(c, "BidPlaced")
      .withArgs(b1.address, anyValue, 1);
    expect(await c.hasBid(b1.address)).to.equal(true);
    expect(await c.totalBids()).to.equal(1);
  });

  it("rejects bid below reserve", async () => {
    const { c, b1 } = await deployMode(Mode.FIRST_PRICE);
    await expect(c.connect(b1).bid(RESERVE - 1n))
      .to.be.revertedWithCustomError(c, "BelowReservePrice");
  });

  it("accepts bid exactly at reserve", async () => {
    const { c, b1 } = await deployMode(Mode.FIRST_PRICE);
    await expect(c.connect(b1).bid(RESERVE)).not.to.be.reverted;
  });

  it("tracks multiple unique bidders", async () => {
    const { c, b1, b2, b3 } = await deployMode(Mode.FIRST_PRICE);
    await c.connect(b1).bid(3_000n);
    await c.connect(b2).bid(5_000n);
    await c.connect(b3).bid(4_000n);
    expect(await c.getParticipantCount()).to.equal(3);
  });

  it("does NOT emit bid amount (privacy)", async () => {
    const { c, b1 } = await deployMode(Mode.FIRST_PRICE);
    const tx      = await c.connect(b1).bid(99_999n);
    const receipt = await tx.wait();
    const log     = receipt?.logs.find(l => c.interface.parseLog(l as any)?.name === "BidPlaced");
    const parsed  = c.interface.parseLog(log as any);
    expect(parsed?.args[0]).to.equal(b1.address); // only address emitted
    expect(parsed?.args).to.not.include(99_999n);  // amount NOT in event
  });

  it("FHE: highestBid reflects highest of multiple bids", async () => {
    const { c, b1, b2, b3, auctioneer } = await deployMode(Mode.FIRST_PRICE);
    await c.connect(b1).bid(3_000n);
    await c.connect(b2).bid(7_000n);
    await c.connect(b3).bid(5_000n);
    await c.connect(auctioneer).closeBidding();
    const handle = await c.getHighestBidHandle();
    await mock_expectPlaintext(ethers.provider, BigInt(handle), 7_000n);
  });

  it("FHE: highestBidder is encrypted and correct", async () => {
    const { c, b1, b2, auctioneer } = await deployMode(Mode.FIRST_PRICE);
    await c.connect(b1).bid(3_000n);
    await c.connect(b2).bid(9_000n);
    await c.connect(auctioneer).closeBidding();
    const handle = await c.getHighestBidderHandle();
    await mock_expectPlaintext(ethers.provider, BigInt(handle), BigInt(b2.address));
  });

  it("rejects getHighestBidHandle while auction is active", async () => {
    const { c } = await deployMode(Mode.FIRST_PRICE);
    await expect(c.getHighestBidHandle())
      .to.be.revertedWithCustomError(c, "AuctionNotClosed");
  });

  it("rejects bid after auction closed", async () => {
    const { c, b1, auctioneer } = await deployMode(Mode.FIRST_PRICE);
    await c.connect(auctioneer).closeBidding();
    await expect(c.connect(b1).bid(5_000n))
      .to.be.revertedWithCustomError(c, "AuctionAlreadyClosed");
  });

  it("rejects bid after auction expires", async () => {
    const { c, b1 } = await deployMode(Mode.FIRST_PRICE, ONE_MIN);
    await time.increase(ONE_MIN + 1);
    await expect(c.connect(b1).bid(5_000n))
      .to.be.revertedWithCustomError(c, "AuctionExpired");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. VICKREY BIDDING
// ─────────────────────────────────────────────────────────────────────────────
describe("3. Vickrey Bidding", () => {
  it("FHE: tracks highest bid correctly", async () => {
    const { c, b1, b2, b3, auctioneer } = await deployMode(Mode.VICKREY);
    await c.connect(b1).bid(3_000n);
    await c.connect(b2).bid(7_000n);
    await c.connect(b3).bid(5_000n);
    await c.connect(auctioneer).closeBidding();
    const handle = await c.getHighestBidHandle();
    await mock_expectPlaintext(ethers.provider, BigInt(handle), 7_000n);
  });

  it("FHE: second-highest bid is correct — bidder wins but pays second amount", async () => {
    const { c, b1, b2, b3, auctioneer } = await deployMode(Mode.VICKREY);
    await c.connect(b1).bid(3_000n);
    await c.connect(b2).bid(7_000n);
    await c.connect(b3).bid(5_000n);
    await c.connect(auctioneer).closeBidding();

    // Second highest should be 5000 (b3), not 7000 (b2 won)
    const sh = await c.getSecondHighestBidHandle();
    await mock_expectPlaintext(ethers.provider, BigInt(sh), 5_000n);
  });

  it("FHE: second-highest updates correctly across multiple bids", async () => {
    const { c, b1, b2, b3, auctioneer } = await deployMode(Mode.VICKREY);
    await c.connect(b1).bid(2_000n);
    await c.connect(b2).bid(9_000n);
    await c.connect(b3).bid(6_000n);
    await c.connect(auctioneer).closeBidding();

    // highest = 9000, second = 6000
    const h  = await c.getHighestBidHandle();
    const sh = await c.getSecondHighestBidHandle();
    await mock_expectPlaintext(ethers.provider, BigInt(h),  9_000n);
    await mock_expectPlaintext(ethers.provider, BigInt(sh), 6_000n);
  });

  it("getSecondHighestBidHandle reverts for non-VICKREY mode", async () => {
    const { c, auctioneer } = await deployMode(Mode.FIRST_PRICE);
    await c.connect(auctioneer).closeBidding();
    await expect(c.getSecondHighestBidHandle()).to.be.reverted;
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. DUTCH AUCTION
// ─────────────────────────────────────────────────────────────────────────────
describe("4. Dutch Auction", () => {
  it("accepts a valid threshold", async () => {
    const { c, b1 } = await deployMode(Mode.DUTCH);
    await expect(c.connect(b1).setThreshold(5_000n))
      .to.emit(c, "ThresholdSet")
      .withArgs(b1.address, anyValue);
    expect(await c.hasThreshold(b1.address)).to.equal(true);
  });

  it("rejects duplicate threshold from same address", async () => {
    const { c, b1 } = await deployMode(Mode.DUTCH);
    await c.connect(b1).setThreshold(5_000n);
    await expect(c.connect(b1).setThreshold(6_000n))
      .to.be.revertedWithCustomError(c, "ThresholdAlreadySet");
  });

  it("rejects threshold below floor price", async () => {
    const { c, b1 } = await deployMode(Mode.DUTCH);
    // floor = 1_000n, so anything below should fail
    await expect(c.connect(b1).setThreshold(500n))
      .to.be.revertedWithCustomError(c, "BelowReservePrice");
  });

  it("getCurrentDutchPrice decreases over blocks", async () => {
    const { c } = await deployMode(Mode.DUTCH);
    const price1 = await c.getCurrentDutchPrice();
    // Mine some blocks
    await ethers.provider.send("hardhat_mine", ["0x64"]); // 100 blocks
    const price2 = await c.getCurrentDutchPrice();
    expect(price2).to.be.lessThanOrEqual(price1);
  });

  it("FHE: Dutch threshold is encrypted and stored", async () => {
    const { c, b1, auctioneer } = await deployMode(Mode.DUTCH);
    await c.connect(b1).setThreshold(5_000n);
    await c.connect(auctioneer).closeBidding();
    const handle = await c.getDutchThresholdHandle(b1.address);
    await mock_expectPlaintext(ethers.provider, BigInt(handle), 5_000n);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. REVERSE AUCTION
// ─────────────────────────────────────────────────────────────────────────────
describe("5. Reverse Auction", () => {
  it("accepts a valid ask", async () => {
    const { c, b1 } = await deployMode(Mode.REVERSE);
    // reservePrice = 1_000n = budget ceiling in REVERSE mode
    // Need a ceiling high enough — redeploy with higher ceiling
    const F = await ethers.getContractFactory("PrivaBid");
    const rc = await F.deploy(Mode.REVERSE, "Service", "desc", 100_000n, ONE_HOUR, 0n, 0n, 0) as unknown as PrivaBid;
    await rc.waitForDeployment();
    await expect(rc.connect(b1).submitAsk(50_000n))
      .to.emit(rc, "AskSubmitted");
  });

  it("rejects ask above ceiling price", async () => {
    const { c, b1 } = await deployMode(Mode.REVERSE);
    // RESERVE = 1_000n = ceiling for reverse
    await expect(c.connect(b1).submitAsk(2_000n))
      .to.be.revertedWithCustomError(c, "AboveCeilingPrice");
  });

  it("FHE: lowestAsk tracks the minimum ask correctly", async () => {
    const [auctioneer, b1, b2, b3] = await ethers.getSigners();
    const F  = await ethers.getContractFactory("PrivaBid");
    const rc = await F.deploy(Mode.REVERSE, "Procurement", "desc", 100_000n, ONE_HOUR, 0n, 0n, 0) as unknown as PrivaBid;
    await rc.waitForDeployment();

    await rc.connect(b1).submitAsk(70_000n);
    await rc.connect(b2).submitAsk(40_000n); // lowest
    await rc.connect(b3).submitAsk(55_000n);

    await rc.connect(auctioneer).closeBidding();
    const handle = await rc.getLowestAskHandle();
    await mock_expectPlaintext(ethers.provider, BigInt(handle), 40_000n);
  });

  it("FHE: lowestSeller is the correct vendor", async () => {
    const [auctioneer, b1, b2] = await ethers.getSigners();
    const F  = await ethers.getContractFactory("PrivaBid");
    const rc = await F.deploy(Mode.REVERSE, "Procurement", "desc", 100_000n, ONE_HOUR, 0n, 0n, 0) as unknown as PrivaBid;
    await rc.waitForDeployment();

    await rc.connect(b1).submitAsk(80_000n);
    await rc.connect(b2).submitAsk(30_000n); // winner
    await rc.connect(auctioneer).closeBidding();

    const handle = await rc.getLowestSellerHandle();
    await mock_expectPlaintext(ethers.provider, BigInt(handle), BigInt(b2.address));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. ACCESS CONTROL
// ─────────────────────────────────────────────────────────────────────────────
describe("6. Access Control", () => {
  it("rejects closeBidding from non-auctioneer", async () => {
    const { c, b1 } = await deployMode(Mode.FIRST_PRICE);
    await expect(c.connect(b1).closeBidding())
      .to.be.revertedWithCustomError(c, "NotAuctioneer");
  });

  it("rejects double closeBidding", async () => {
    const { c, auctioneer } = await deployMode(Mode.FIRST_PRICE);
    await c.connect(auctioneer).closeBidding();
    await expect(c.connect(auctioneer).closeBidding())
      .to.be.revertedWithCustomError(c, "AuctionAlreadyClosed");
  });

  it("rejects revealWinner before close", async () => {
    const { c } = await deployMode(Mode.FIRST_PRICE);
    await expect(c.revealWinner(
      "0x", 0n, "0x", "0x", ethers.ZeroAddress, "0x"
    )).to.be.revertedWithCustomError(c, "AuctionNotClosed");
  });

  it("rejects VICKREY reveal with wrong function", async () => {
    const { c, b1, auctioneer } = await deployMode(Mode.VICKREY);
    await c.connect(b1).bid(5_000n);
    await c.connect(auctioneer).closeBidding();
    await expect(c.revealWinner(
      "0x", 0n, "0x", "0x", ethers.ZeroAddress, "0x"
    )).to.be.reverted;
  });

  it("rejects bid() in REVERSE mode — must use submitAsk()", async () => {
    const { c, b1 } = await deployMode(Mode.REVERSE);
    await expect(c.connect(b1).bid(5_000n)).to.be.reverted;
  });

  it("rejects submitAsk() in FIRST_PRICE mode — must use bid()", async () => {
    const { c, b1 } = await deployMode(Mode.FIRST_PRICE);
    await expect(c.connect(b1).submitAsk(500n)).to.be.reverted;
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. VIEW FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────
describe("7. View Functions", () => {
  it("timeRemaining decreases over time", async () => {
    const { c } = await deployMode(Mode.FIRST_PRICE, ONE_HOUR);
    const t1 = await c.timeRemaining();
    await time.increase(600);
    const t2 = await c.timeRemaining();
    expect(t2).to.be.lessThan(t1);
  });

  it("timeRemaining returns 0 after expiry", async () => {
    const { c } = await deployMode(Mode.FIRST_PRICE, ONE_MIN);
    await time.increase(ONE_MIN + 10);
    expect(await c.timeRemaining()).to.equal(0n);
  });

  it("getAuctionState returns full state", async () => {
    const { c } = await deployMode(Mode.VICKREY);
    const state = await c.getAuctionState();
    expect(state._mode).to.equal(Mode.VICKREY);
    expect(state._itemName).to.equal("Test Item");
    expect(state._auctionClosed).to.equal(false);
    expect(state._winnerRevealed).to.equal(false);
  });

  it("getParticipantCount tracks unique participants", async () => {
    const { c, b1, b2 } = await deployMode(Mode.FIRST_PRICE);
    await c.connect(b1).bid(3_000n);
    await c.connect(b1).bid(4_000n); // same bidder, second bid
    await c.connect(b2).bid(5_000n);
    expect(await c.getParticipantCount()).to.equal(2); // unique only
    expect(await c.totalBids()).to.equal(3);           // all bids counted
  });
});
