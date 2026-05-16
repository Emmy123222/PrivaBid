/**
 * Deploy PrivaBidFactoryV2 to Arbitrum Sepolia.
 *
 * Usage:
 *   npm run deploy:factory-v2
 */

import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  PrivaBidFactoryV2 — Wave 4 Factory Deployment");
  console.log("═══════════════════════════════════════════════════════════\n");

  const [deployer] = await ethers.getSigners();
  const deployerAddr = await deployer.getAddress();
  const balance = await ethers.provider.getBalance(deployerAddr);
  const networkName = network.name;
  const chainId = network.config.chainId;

  console.log(`Network:    ${networkName} (chainId: ${chainId})`);
  console.log(`Deployer:   ${deployerAddr}`);
  console.log(`Balance:    ${ethers.formatEther(balance)} ETH`);

  const Factory = await ethers.getContractFactory("PrivaBidFactoryV2");
  const contract = await Factory.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  const tx = contract.deploymentTransaction();
  const receipt = await tx?.wait(1);

  console.log(`\n✓ FactoryV2 deployed: ${address}`);
  console.log(`  Tx: ${tx?.hash}`);

  const info = {
    network: networkName,
    chainId,
    address,
    deployer: deployerAddr,
    txHash: tx?.hash,
    blockNumber: receipt?.blockNumber,
    deployedAt: new Date().toISOString(),
    type: "PrivaBidFactoryV2",
  };

  const dir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, `${networkName}-factory-v2.json`),
    JSON.stringify(info, null, 2),
  );

  console.log(`\n── Frontend (.env) ─────────────────────────────────────`);
  console.log(`  VITE_FACTORY_V2_ADDRESS=${address}`);
  console.log(`\n── Verify ──────────────────────────────────────────────`);
  console.log(`  npx hardhat verify --network arb-sepolia ${address}`);
  console.log("\n═══════════════════════════════════════════════════════════\n");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
