/**
 * deployDutch.ts — Deploy standalone PrivaBidDutch to Arbitrum Sepolia.
 *
 * Usage:
 *   pnpm hardhat run scripts/deployDutch.ts --network arb-sepolia
 *
 * Requires .env: PRIVATE_KEY, ARB_SEPOLIA_RPC (loaded via hardhat.config.ts).
 *
 * Note: PrivaBidDutch.sol constructor only takes price params. The display
 * name below is stored in deployments/arb-sepolia.json for your records.
 */

import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const DEPLOY_FILE = "arb-sepolia.json";

const METADATA = {
  itemName: "PrivaBid Dutch Auction #001",
};

const CONFIG = {
  startPrice: 10_000_000n, // 10 USDC (6 decimals)
  floorPrice: 1_000_000n, // 1 USDC
  decrementAmount: 500_000n, // 0.5 USDC per step
  decrementInterval: 100n, // blocks
};

function arbiscanAddressUrl(address: string): string {
  return `https://sepolia.arbiscan.io/address/${address}`;
}

function loadDeployments(dir: string): Record<string, unknown> {
  const fp = path.join(dir, DEPLOY_FILE);
  if (!fs.existsSync(fp)) return {};
  try {
    return JSON.parse(fs.readFileSync(fp, "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function saveDeployments(dir: string, data: Record<string, unknown>): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, DEPLOY_FILE), JSON.stringify(data, null, 2));
}

async function main() {
  if (!process.env.PRIVATE_KEY?.trim()) {
    throw new Error("PRIVATE_KEY is missing — set it in privabid-contract/.env");
  }
  if (!process.env.ARB_SEPOLIA_RPC?.trim()) {
    throw new Error("ARB_SEPOLIA_RPC is missing — set it in privabid-contract/.env");
  }

  const [deployer] = await ethers.getSigners();
  const deployerAddr = await deployer.getAddress();
  const networkName = network.name;
  const chainId = network.config.chainId;

  console.log("\nPrivaBidDutch — deploy");
  console.log(`Network:   ${networkName} (chainId: ${chainId})`);
  console.log(`Deployer:  ${deployerAddr}`);
  console.log(`Label:     ${METADATA.itemName} (stored in JSON only)`);
  console.log(`Start:     ${CONFIG.startPrice} (10 USDC)`);
  console.log(`Floor:     ${CONFIG.floorPrice} (1 USDC)`);
  console.log(`Decrement: ${CONFIG.decrementAmount} every ${CONFIG.decrementInterval} blocks\n`);

  const Factory = await ethers.getContractFactory("PrivaBidDutch");
  const contract = await Factory.deploy(
    CONFIG.startPrice,
    CONFIG.floorPrice,
    CONFIG.decrementAmount,
    CONFIG.decrementInterval
  );
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  const tx = contract.deploymentTransaction();
  const receipt = await tx?.wait(1);

  console.log("Deployed");
  console.log(`  Address: ${address}`);
  console.log(`  Tx:      ${tx?.hash}`);
  console.log(`  Block:   ${receipt?.blockNumber}\n`);
  console.log(`Arbiscan: ${arbiscanAddressUrl(address)}\n`);

  const deploymentsDir = path.join(__dirname, "../deployments");
  const existing = loadDeployments(deploymentsDir);
  const entry = {
    contract: "PrivaBidDutch",
    address,
    deployer: deployerAddr,
    txHash: tx?.hash ?? null,
    blockNumber: receipt?.blockNumber ?? null,
    deployedAt: new Date().toISOString(),
    chainId,
    network: networkName,
    metadata: METADATA,
    config: {
      startPrice: CONFIG.startPrice.toString(),
      floorPrice: CONFIG.floorPrice.toString(),
      decrementAmount: CONFIG.decrementAmount.toString(),
      decrementInterval: CONFIG.decrementInterval.toString(),
    },
  };

  const merged = {
    ...existing,
    PrivaBidDutch: entry,
    lastUpdated: new Date().toISOString(),
  };
  saveDeployments(deploymentsDir, merged);
  console.log(`Saved: deployments/${DEPLOY_FILE}\n`);

  console.log(
    "Verify (constructor: startPrice, floorPrice, decrementAmount, decrementInterval):"
  );
  console.log(
    `  pnpm hardhat verify --network arb-sepolia ${address} ` +
      `${CONFIG.startPrice} ${CONFIG.floorPrice} ${CONFIG.decrementAmount} ${CONFIG.decrementInterval}\n`
  );
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
