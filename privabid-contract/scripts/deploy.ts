/**
 * deploy.ts — PrivaBid Deployment Script
 *
 * Deploys one PrivaBid auction to Arbitrum Sepolia.
 * Change DEPLOY_CONFIG below to deploy any auction mode.
 *
 * Usage:
 *   pnpm hardhat run scripts/deploy.ts --network arb-sepolia
 *
 * After deploy:
 *   Copy the printed contract address to your submission.
 *   View on Arbiscan: https://sepolia.arbiscan.io/address/<ADDRESS>
 */

import { ethers, network } from "hardhat";
import * as fs   from "fs";
import * as path from "path";

// ─── Auction Mode Enum (must match contract) ─────────────────────────────────
const AuctionMode = { FIRST_PRICE: 0, VICKREY: 1, DUTCH: 2, REVERSE: 3 };

// ─── Configure your auction here ─────────────────────────────────────────────
const DEPLOY_CONFIG = {
  mode:            AuctionMode.FIRST_PRICE,  // change to VICKREY, DUTCH, or REVERSE
  itemName:        "PrivaBid Genesis Auction #001",
  itemDescription: "First live auction on PrivaBid — sealed bids, FHE encrypted, Arbitrum Sepolia.",
  reservePrice:    BigInt(1_000_000),        // 1 USDC (6 decimals)
  duration:        86400,                    // 24 hours in seconds

  // Dutch mode only (ignored for other modes):
  dutchStartPrice: BigInt(10_000_000),       // 10 USDC starting price
  dutchFloorPrice: BigInt(1_000_000),        // 1 USDC floor price
  dutchDecrement:  100,                      // price drops every 100 blocks
};
// ─────────────────────────────────────────────────────────────────────────────

const MODE_NAMES: Record<number, string> = {
  0: "FIRST_PRICE",
  1: "VICKREY",
  2: "DUTCH",
  3: "REVERSE",
};

async function main() {
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  PrivaBid — Multi-Mode FHE Auction Platform");
  console.log("  Deployment Script");
  console.log("═══════════════════════════════════════════════════════════\n");

  const [deployer]   = await ethers.getSigners();
  const deployerAddr = await deployer.getAddress();
  const balance      = await ethers.provider.getBalance(deployerAddr);
  const networkName  = network.name;
  const chainId      = network.config.chainId;

  console.log(`Network:    ${networkName} (chainId: ${chainId})`);
  console.log(`Deployer:   ${deployerAddr}`);
  console.log(`Balance:    ${ethers.formatEther(balance)} ETH`);

  if (balance < ethers.parseEther("0.01")) {
    console.warn("\n⚠  Balance low. Get testnet ETH:");
    console.warn("   https://faucet.triangleplatform.com/arbitrum/sepolia\n");
  }

  const modeName = MODE_NAMES[DEPLOY_CONFIG.mode];
  console.log(`\n── Auction Config ──────────────────────────────────────`);
  console.log(`Mode:         ${modeName}`);
  console.log(`Item:         ${DEPLOY_CONFIG.itemName}`);
  console.log(`Reserve:      ${Number(DEPLOY_CONFIG.reservePrice) / 1_000_000} USDC`);
  console.log(`Duration:     ${DEPLOY_CONFIG.duration / 3600} hours`);
  if (DEPLOY_CONFIG.mode === AuctionMode.DUTCH) {
    console.log(`Dutch Start:  ${Number(DEPLOY_CONFIG.dutchStartPrice) / 1_000_000} USDC`);
    console.log(`Dutch Floor:  ${Number(DEPLOY_CONFIG.dutchFloorPrice) / 1_000_000} USDC`);
    console.log(`Decrement:    every ${DEPLOY_CONFIG.dutchDecrement} blocks`);
  }

  console.log(`\n── Deploying ───────────────────────────────────────────`);

  const Factory  = await ethers.getContractFactory("PrivaBid");
  const contract = await Factory.deploy(
    DEPLOY_CONFIG.mode,
    DEPLOY_CONFIG.itemName,
    DEPLOY_CONFIG.itemDescription,
    DEPLOY_CONFIG.reservePrice,
    DEPLOY_CONFIG.duration,
    DEPLOY_CONFIG.dutchStartPrice,
    DEPLOY_CONFIG.dutchFloorPrice,
    DEPLOY_CONFIG.dutchDecrement,
  );

  await contract.waitForDeployment();

  const address = await contract.getAddress();
  const tx      = contract.deploymentTransaction();
  const receipt = await tx?.wait(1);

  console.log(`\n✓ Deployed successfully!`);
  console.log(`  Contract:  ${address}`);
  console.log(`  Tx Hash:   ${tx?.hash}`);
  console.log(`  Block:     ${receipt?.blockNumber}`);
  console.log(`  Gas Used:  ${receipt?.gasUsed?.toString()}`);

  // ── Save deployment info ──────────────────────────────────────────────────
  const info = {
    network: networkName, chainId, address,
    deployer: deployerAddr, txHash: tx?.hash,
    blockNumber: receipt?.blockNumber,
    deployedAt: new Date().toISOString(),
    mode: modeName,
    config: {
      itemName:     DEPLOY_CONFIG.itemName,
      reservePrice: DEPLOY_CONFIG.reservePrice.toString(),
      duration:     DEPLOY_CONFIG.duration,
    },
  };

  const dir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${networkName}.json`), JSON.stringify(info, null, 2));
  console.log(`\n✓ Saved to deployments/${networkName}.json`);

  // ── Links & next steps ────────────────────────────────────────────────────
  console.log(`\n── Arbiscan ────────────────────────────────────────────`);
  console.log(`  Contract: https://sepolia.arbiscan.io/address/${address}`);
  console.log(`  Tx:       https://sepolia.arbiscan.io/tx/${tx?.hash}`);

  console.log(`\n── Verify Contract ─────────────────────────────────────`);
  console.log(`  pnpm hardhat verify --network arb-sepolia ${address} \\`);
  console.log(`    ${DEPLOY_CONFIG.mode} \\`);
  console.log(`    "${DEPLOY_CONFIG.itemName}" \\`);
  console.log(`    "${DEPLOY_CONFIG.itemDescription}" \\`);
  console.log(`    ${DEPLOY_CONFIG.reservePrice} \\`);
  console.log(`    ${DEPLOY_CONFIG.duration} \\`);
  console.log(`    ${DEPLOY_CONFIG.dutchStartPrice} \\`);
  console.log(`    ${DEPLOY_CONFIG.dutchFloorPrice} \\`);
  console.log(`    ${DEPLOY_CONFIG.dutchDecrement}`);

  console.log("\n═══════════════════════════════════════════════════════════\n");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
