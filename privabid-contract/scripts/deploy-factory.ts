/**
 * deploy-factory.ts — PrivaBidFactory Deployment Script
 *
 * Deploys the factory contract to Arbitrum Sepolia.
 *
 * Usage:
 *   npm run deploy:factory
 */

import { ethers, network } from "hardhat";
import * as fs   from "fs";
import * as path from "path";

async function main() {
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  PrivaBidFactory — Factory Contract Deployment");
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

  console.log(`\n── Deploying Factory ───────────────────────────────────`);

  const Factory  = await ethers.getContractFactory("PrivaBidFactory");
  const contract = await Factory.deploy();

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
    type: "PrivaBidFactory",
  };

  const dir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${networkName}-factory.json`), JSON.stringify(info, null, 2));
  console.log(`\n✓ Saved to deployments/${networkName}-factory.json`);

  // ── Links & next steps ────────────────────────────────────────────────────
  console.log(`\n── Arbiscan ────────────────────────────────────────────`);
  console.log(`  Contract: https://sepolia.arbiscan.io/address/${address}`);
  console.log(`  Tx:       https://sepolia.arbiscan.io/tx/${tx?.hash}`);

  console.log(`\n── Verify Contract ─────────────────────────────────────`);
  console.log(`  npx hardhat verify --network arb-sepolia ${address}`);

  console.log(`\n── Usage Example ───────────────────────────────────────`);
  console.log(`  // Create a first-price auction`);
  console.log(`  await factory.createAuction(`);
  console.log(`    0, // FIRST_PRICE`);
  console.log(`    "My Item",`);
  console.log(`    "Description",`);
  console.log(`    1000000, // 1 USDC reserve`);
  console.log(`    86400,   // 24 hours`);
  console.log(`    0, 0, 0  // Dutch params (ignored)`);
  console.log(`  );`);

  console.log("\n═══════════════════════════════════════════════════════════\n");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });