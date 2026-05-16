/**
 * Deploy a funded judge demo auction via PrivaBidFactoryV2.
 * Requires FACTORY_V2_ADDRESS in .env or deployments/*-factory-v2.json.
 *
 * Usage:
 *   FACTORY_V2_ADDRESS=0x... npm run deploy:demo
 */

import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const ONE_HOUR = 3600;
const RESERVE_MICRO = 1_000_000n; // 1 USDC

async function main() {
  const networkName = network.name;
  const deploymentsDir = path.join(__dirname, "../deployments");

  let factoryAddr =
    process.env.FACTORY_V2_ADDRESS?.trim() ||
    process.env.VITE_FACTORY_V2_ADDRESS?.trim() ||
    "";

  if (!factoryAddr) {
    const p = path.join(deploymentsDir, `${networkName}-factory-v2.json`);
    if (fs.existsSync(p)) {
      factoryAddr = JSON.parse(fs.readFileSync(p, "utf8")).address;
    }
  }

  if (!factoryAddr) {
    throw new Error(
      "Set FACTORY_V2_ADDRESS or deploy factory first: npm run deploy:factory-v2",
    );
  }

  const [deployer] = await ethers.getSigners();
  console.log(`Deployer: ${await deployer.getAddress()}`);
  console.log(`FactoryV2: ${factoryAddr}`);

  const factory = await ethers.getContractAt(
    "PrivaBidFactoryV2",
    factoryAddr,
  );

  const tx = await factory.createAuction(
    0, // FIRST_PRICE
    "PrivaBid Wave 4 Judge Demo",
    "E2E demo: sealed bids, Threshold reveal, Privara settlement. Funded on Arbitrum Sepolia.",
    RESERVE_MICRO,
    ONE_HOUR,
    0,
    0,
    0,
    true, // encrypted reserve
  );

  const receipt = await tx.wait();
  const iface = factory.interface;
  let auctionAddr = "";

  for (const log of receipt?.logs ?? []) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed?.name === "AuctionDeployed") {
        auctionAddr = String(parsed.args.contractAddress);
        break;
      }
    } catch {
      /* skip */
    }
  }

  if (!auctionAddr) {
    throw new Error("AuctionDeployed event not found");
  }

  console.log(`\n✓ Demo auction: ${auctionAddr}`);
  console.log(`  Tx: ${receipt?.hash}`);
  console.log(`\n── Frontend (.env) ─────────────────────────────────────`);
  console.log(`  VITE_DEMO_AUCTION_ADDRESS=${auctionAddr}`);
  console.log(`\n── Judge URL ───────────────────────────────────────────`);
  console.log(
    `  /auction/first-price?address=${auctionAddr}`,
  );

  const info = {
    network: networkName,
    factory: factoryAddr,
    auction: auctionAddr,
    txHash: receipt?.hash,
    deployedAt: new Date().toISOString(),
    durationSec: ONE_HOUR,
    encryptedReserve: true,
  };

  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }
  fs.writeFileSync(
    path.join(deploymentsDir, `${networkName}-wave4-demo.json`),
    JSON.stringify(info, null, 2),
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
