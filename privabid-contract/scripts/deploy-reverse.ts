/**
 * deploy-reverse.ts — PrivaBidReverse Deployment Script
 *
 * Deploys a reverse auction to Arbitrum Sepolia.
 *
 * Usage:
 *   npm run deploy:reverse
 */

import { ethers, network } from "hardhat";
import * as fs   from "fs";
import * as path from "path";

// ─── Configure your reverse auction here ─────────────────────────────────────
const DEPLOY_CONFIG = {
  itemName:        "Web Development Services",
  itemDescription: "Looking for a developer to build a React app with backend API. Sellers compete with lowest price.",
  budgetCeiling:   BigInt(5_000_000_000), // 5000 USDC (6 decimals)
  duration:        86400,                  // 24 hours in seconds
};

async function main() {
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  PrivaBidReverse — Reverse Auction Deployment");
  console.log("  Fhenix Buildathon 2025");
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

  console.log(`\n── Reverse Auction Config ──────────────────────────────────`);
  console.log(`Item:         ${DEPLOY_CONFIG.itemName}`);
  console.log(`Budget:       ${Number(DEPLOY_CONFIG.budgetCeiling) / 1_000_000} USDC`);
  console.log(`Duration:     ${DEPLOY_CONFIG.duration / 3600} hours`);

  console.log(`\n── Deploying ───────────────────────────────────────────`);

  const Factory  = await ethers.getContractFactory("PrivaBidReverse");
  const contract = await Factory.deploy(
    DEPLOY_CONFIG.itemName,
    DEPLOY_CONFIG.itemDescription,
    DEPLOY_CONFIG.budgetCeiling,
    DEPLOY_CONFIG.duration
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
    type: "PrivaBidReverse",
    config: {
      itemName:      DEPLOY_CONFIG.itemName,
      budgetCeiling: DEPLOY_CONFIG.budgetCeiling.toString(),
      duration:      DEPLOY_CONFIG.duration,
    },
  };

  const dir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${networkName}-reverse.json`), JSON.stringify(info, null, 2));
  console.log(`\n✓ Saved to deployments/${networkName}-reverse.json`);

  // ── Links & next steps ────────────────────────────────────────────────────
  console.log(`\n── Arbiscan ────────────────────────────────────────────`);
  console.log(`  Contract: https://sepolia.arbiscan.io/address/${address}`);
  console.log(`  Tx:       https://sepolia.arbiscan.io/tx/${tx?.hash}`);

  console.log(`\n── Verify Contract ─────────────────────────────────────`);
  console.log(`  npx hardhat verify --network arb-sepolia ${address} \\`);
  console.log(`    "${DEPLOY_CONFIG.itemName}" \\`);
  console.log(`    "${DEPLOY_CONFIG.itemDescription}" \\`);
  console.log(`    ${DEPLOY_CONFIG.budgetCeiling} \\`);
  console.log(`    ${DEPLOY_CONFIG.duration}`);

  console.log("\n═══════════════════════════════════════════════════════════\n");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });