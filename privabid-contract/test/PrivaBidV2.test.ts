/**
 * PrivaBidV2.test.ts — V2 test suite (encrypted reserve, factory)
 *
 * Run: npm test (requires cofhe-hardhat-plugin mocks aligned with cofhe-contracts 0.1.x)
 * Until then: npm run test:compile
 */

import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { PrivaBidV2, PrivaBidFactoryV2 } from "../typechain-types";
import { mock_expectPlaintext } from "cofhe-hardhat-plugin";

const Mode = { FIRST_PRICE: 0, VICKREY: 1, DUTCH: 2, REVERSE: 3 };
const RESERVE = 1_000n;
const ONE_HOUR = 3600;

async function deployV2(
  mode: number,
  duration = ONE_HOUR,
  useEncryptedReserve = false,
) {
  const [auctioneer, b1, b2, anyone] = await ethers.getSigners();
  const F = await ethers.getContractFactory("PrivaBidV2");
  const c = (await F.deploy(
    mode,
    "Test Item",
    "Test description",
    RESERVE,
    duration,
    10_000n,
    1_000n,
    100n,
    useEncryptedReserve,
  )) as unknown as PrivaBidV2;
  await c.waitForDeployment();
  return { c, auctioneer, b1, b2, anyone };
}

describe("PrivaBidV2", () => {
  describe("Deployment", () => {
    it("sets encrypted reserve flag", async () => {
      const { c } = await deployV2(Mode.FIRST_PRICE, ONE_HOUR, true);
      expect(await c.useEncryptedReserve()).to.equal(true);
    });

    it("factory deploys V2 with encrypted reserve", async () => {
      const [creator] = await ethers.getSigners();
      const FF = await ethers.getContractFactory("PrivaBidFactoryV2");
      const factory = (await FF.deploy()) as unknown as PrivaBidFactoryV2;
      await factory.waitForDeployment();

      const tx = await factory.createAuction(
        Mode.VICKREY,
        "Factory Item",
        "Via factory",
        RESERVE,
        ONE_HOUR,
        0n,
        0n,
        0n,
        true,
      );
      const receipt = await tx.wait();
      expect(receipt).to.not.be.null;

      const auctions = await factory.getAllAuctions();
      expect(auctions.length).to.equal(1);
      expect(auctions[0].useEncryptedReserve).to.equal(true);
      expect(auctions[0].creator).to.equal(creator.address);
    });
  });

  describe("First-price bidding", () => {
    it("tracks highest bid in FHE and reveals winner", async () => {
      const { c, auctioneer, b1, b2 } = await deployV2(Mode.FIRST_PRICE);

      await c.connect(b1).bid(5_000n);
      await c.connect(b2).bid(8_000n);

      expect(await c.totalBids()).to.equal(2);

      await c.connect(auctioneer).closeBidding();

      const bidHandle = await c.getHighestBidHandle();
      const bidderHandle = await c.getHighestBidderHandle();

      await mock_expectPlaintext(bidHandle, 8_000n);
      await mock_expectPlaintext(bidderHandle, b2.address);

      await c.revealWinner({
        bidCtHash: bidHandle,
        bidPlaintext: 8_000n,
        bidSignature: "0x",
        bidderCtHash: bidderHandle,
        bidderPlaintext: b2.address,
        bidderSignature: "0x",
        reserveCheckCtHash: 0n,
        reserveCheckPlaintext: 0n,
        reserveCheckSignature: "0x",
      });

      expect(await c.winnerRevealed()).to.equal(true);
      expect(await c.winningBidder()).to.equal(b2.address);
      expect(await c.winningBid()).to.equal(8_000n);
    });
  });

  describe("Reverse mode", () => {
    it("accepts encrypted asks via submitAsk", async () => {
      const { c, b1, b2 } = await deployV2(Mode.REVERSE);

      await c.connect(b1).submitAsk(50_000n);
      await c.connect(b2).submitAsk(40_000n);

      expect(await c.totalBids()).to.equal(2);
    });
  });

  describe("Lifecycle guards", () => {
    it("rejects bids after close", async () => {
      const { c, auctioneer, b1 } = await deployV2(Mode.FIRST_PRICE);
      await c.connect(b1).bid(5_000n);
      await c.connect(auctioneer).closeBidding();

      await expect(c.connect(b1).bid(6_000n)).to.be.revertedWithCustomError(
        c,
        "AuctionAlreadyClosed",
      );
    });

    it("rejects close after expiry without bids", async () => {
      const { c, auctioneer } = await deployV2(Mode.FIRST_PRICE, 60);
      await time.increase(61);

      await expect(c.connect(auctioneer).closeBidding()).to.be.revertedWithCustomError(
        c,
        "AuctionExpired",
      );
    });
  });
});
