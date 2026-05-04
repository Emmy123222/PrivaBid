import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { mock_expectPlaintext } from "cofhe-hardhat-plugin";
import { PrivaBidDutch, PrivaBidVickrey } from "../typechain-types";

const ONE_HOUR = 3600;

async function deployVickreyFixture() {
  const [auctioneer, bidder1, bidder2, bidder3] = await ethers.getSigners();
  const Factory = await ethers.getContractFactory("PrivaBidVickrey");
  const contract = await Factory.deploy(
    "Encrypted Asset",
    "Standalone Vickrey auction",
    1_000n,
    ONE_HOUR
  ) as unknown as PrivaBidVickrey;
  await contract.waitForDeployment();

  return { contract, auctioneer, bidder1, bidder2, bidder3 };
}

async function deployDutchFixture() {
  const [auctioneer, bidder1, bidder2] = await ethers.getSigners();
  const Factory = await ethers.getContractFactory("PrivaBidDutch");
  const contract = await Factory.deploy(
    10_000n,
    1_000n,
    1_000n,
    10
  ) as unknown as PrivaBidDutch;
  await contract.waitForDeployment();

  return { contract, auctioneer, bidder1, bidder2 };
}

describe("Standalone PrivaBid contracts (CoFHE mock)", () => {
  describe("PrivaBidVickrey", () => {
    it("deploys and tracks FHE handles after 3000, 7000, 5000 bids", async () => {
      const { contract, auctioneer, bidder1, bidder2, bidder3 } = await loadFixture(deployVickreyFixture);

      await contract.connect(bidder1).bid(3_000n);
      await contract.connect(bidder2).bid(7_000n);
      await contract.connect(bidder3).bid(5_000n);

      await contract.connect(auctioneer).closeBidding();

      const hHigh = await contract.getHighestBidHandle();
      const hSecond = await contract.getSecondHighestBidHandle();
      const hBidder = await contract.getHighestBidderHandle();

      await mock_expectPlaintext(ethers.provider, BigInt(hHigh), 7_000n);
      await mock_expectPlaintext(ethers.provider, BigInt(hSecond), 5_000n);
      await mock_expectPlaintext(ethers.provider, BigInt(hBidder), BigInt(bidder2.address));

      let secondWas7000 = false;
      try {
        await mock_expectPlaintext(ethers.provider, BigInt(hSecond), 7_000n);
        secondWas7000 = true;
      } catch {
        /* expected: second-highest is 5000, not 7000 */
      }
      expect(secondWas7000).to.equal(false);
    });

    it("keeps loser bids unexposed through events and public state", async () => {
      const { contract, auctioneer, bidder1, bidder2, bidder3 } = await loadFixture(deployVickreyFixture);

      const tx = await contract.connect(bidder1).bid(3_000n);
      await contract.connect(bidder2).bid(7_000n);
      await contract.connect(bidder3).bid(5_000n);

      const receipt = await tx.wait();
      const parsedLogs = (receipt?.logs ?? [])
        .map((log) => {
          try {
            return contract.interface.parseLog(log as any);
          } catch {
            return null;
          }
        })
        .filter(Boolean);

      expect(parsedLogs).to.have.length(1);
      expect(parsedLogs[0]?.name).to.equal("BidPlaced");
      expect(parsedLogs[0]?.args).to.not.include(3_000n);

      await contract.connect(auctioneer).closeBidding();

      expect(await contract.winningBid()).to.equal(0n);
      expect(await contract.paymentAmount()).to.equal(0n);
      expect(await contract.winningBidder()).to.equal(ethers.ZeroAddress);
      expect(
        contract.interface.fragments.some(
          (fragment: any) => fragment.type === "function" && fragment.name === "getBidHandle"
        )
      ).to.equal(false);
    });

    it("reverts wrong-mode functions", async () => {
      const { contract, bidder1 } = await loadFixture(deployVickreyFixture);

      await expect(contract.connect(bidder1).setThreshold(6_000n))
        .to.be.revertedWithCustomError(contract, "WrongModeFunction");
      await expect(contract.connect(bidder1).checkAndMatch(bidder1.address))
        .to.be.revertedWithCustomError(contract, "WrongModeFunction");
    });

    it("reverts encrypted handle getters before close", async () => {
      const { contract } = await loadFixture(deployVickreyFixture);

      await expect(contract.getHighestBidHandle())
        .to.be.revertedWithCustomError(contract, "AuctionNotClosed");
      await expect(contract.getSecondHighestBidHandle())
        .to.be.revertedWithCustomError(contract, "AuctionNotClosed");
      await expect(contract.getHighestBidderHandle())
        .to.be.revertedWithCustomError(contract, "AuctionNotClosed");
    });
  });

  describe("PrivaBidDutch", () => {
    it("start10000 / floor 1000 / dec 1000 / interval 10 —5999 then 3999, match flags via FHE", async () => {
      const { contract, bidder1, bidder2 } = await loadFixture(deployDutchFixture);

      await contract.connect(bidder1).setThreshold(6_000n);
      await contract.connect(bidder2).setThreshold(4_000n);

      await ethers.provider.send("hardhat_mine", ["0x28"]);
      expect(await contract.getCurrentPrice()).to.equal(5_999n);

      await contract.checkAndMatch(bidder1.address);
      await contract.checkAndMatch(bidder2.address);

      await mock_expectPlaintext(
        ethers.provider,
        BigInt(await contract.getMatchResultHandle(bidder1.address)),
        1n
      );
      await mock_expectPlaintext(
        ethers.provider,
        BigInt(await contract.getMatchResultHandle(bidder2.address)),
        0n
      );

      await ethers.provider.send("hardhat_mine", ["0x14"]);
      expect(await contract.getCurrentPrice()).to.equal(3_999n);

      await contract.checkAndMatch(bidder2.address);

      await mock_expectPlaintext(
        ethers.provider,
        BigInt(await contract.getMatchResultHandle(bidder2.address)),
        1n
      );
    });

    it("stores encrypted thresholds and rejects wrong-mode bid()", async () => {
      const { contract, auctioneer, bidder1 } = await loadFixture(deployDutchFixture);

      await contract.connect(bidder1).setThreshold(6_000n);
      await contract.connect(auctioneer).closeBidding();

      await mock_expectPlaintext(
        ethers.provider,
        BigInt(await contract.getDutchThresholdHandle(bidder1.address)),
        6_000n
      );

      await expect(contract.connect(bidder1).bid(3_000n))
        .to.be.revertedWithCustomError(contract, "WrongModeFunction");
    });

    it("reverts second setThreshold from same bidder", async () => {
      const { contract, bidder1 } = await loadFixture(deployDutchFixture);
      await contract.connect(bidder1).setThreshold(6_000n);
      await expect(contract.connect(bidder1).setThreshold(5_000n))
        .to.be.revertedWithCustomError(contract, "ThresholdAlreadySet");
    });

    it("reverts checkAndMatch for address with no threshold", async () => {
      const { contract, bidder1, bidder2 } = await loadFixture(deployDutchFixture);
      await contract.connect(bidder1).setThreshold(6_000n);
      await expect(contract.checkAndMatch(bidder2.address))
        .to.be.revertedWithCustomError(contract, "UnknownBidder");
    });
  });
});
