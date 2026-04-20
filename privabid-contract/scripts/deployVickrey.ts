/**
 * deployVickrey.ts — Deploy standalone PrivaBidVickrey to Arbitrum Sepolia.
 *
 * Usage:
 *   pnpm hardhat run scripts/deployVickrey.ts --network arb-sepolia
 *
 * Requires .env: PRIVATE_KEY, ARB_SEPOLIA_RPC (loaded via hardhat.config.ts).
 */

import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const DEPLOY_FILE = "arb-sepolia.json";

const CONFIG = {
  itemName: "PrivaBid Vickrey Auction #001",
  itemDescription:
    "Standalone FHE Vickrey auction — second-price sealed bids on Arbitrum Sepolia.",
  reservePrice: 1_000_000n, // 1 USDC (6 decimals)
  duration: 86400, // 24 hours
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

  console.log("\nPrivaBidVickrey — deploy");
  console.log(`Network:   ${networkName} (chainId: ${chainId})`);
  console.log(`Deployer:  ${deployerAddr}`);
  console.log(`Item:      ${CONFIG.itemName}`);
  console.log(`Reserve:   ${CONFIG.reservePrice} (1 USDC)`);
  console.log(`Duration:  ${CONFIG.duration}s (24h)\n`);

  const Factory = await ethers.getContractFactory("PrivaBidVickrey");
  const contract = await Factory.deploy(
    CONFIG.itemName,
    CONFIG.itemDescription,
    CONFIG.reservePrice,
    CONFIG.duration
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
    contract: "PrivaBidVickrey",
    address,
    deployer: deployerAddr,
    txHash: tx?.hash ?? null,
    blockNumber: receipt?.blockNumber ?? null,
    deployedAt: new Date().toISOString(),
    chainId,
    network: networkName,
    config: {
      itemName: CONFIG.itemName,
      itemDescription: CONFIG.itemDescription,
      reservePrice: CONFIG.reservePrice.toString(),
      duration: CONFIG.duration,
    },
  };

  const merged = {
    ...existing,
    PrivaBidVickrey: entry,
    lastUpdated: new Date().toISOString(),
  };
  saveDeployments(deploymentsDir, merged);
  console.log(`Saved: deployments/${DEPLOY_FILE}\n`);

  console.log("Verify (constructor: itemName, itemDescription, reservePrice, duration):");
  console.log(
    `  pnpm hardhat verify --network arb-sepolia ${address} ` +
      `${JSON.stringify(CONFIG.itemName)} ${JSON.stringify(CONFIG.itemDescription)} ` +
      `${CONFIG.reservePrice} ${CONFIG.duration}\n`
  );
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
