import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "cofhe-hardhat-plugin";
import * as dotenv from "dotenv";

dotenv.config();

const PRIVATE_KEY      = process.env.PRIVATE_KEY      || "0x" + "0".repeat(64);
const ARB_SEPOLIA_RPC  = process.env.ARB_SEPOLIA_RPC  || "https://sepolia-rollup.arbitrum.io/rpc";
const ETH_SEPOLIA_RPC  = process.env.ETH_SEPOLIA_RPC  || "https://rpc.sepolia.org";
const ARBISCAN_API_KEY = process.env.ARBISCAN_API_KEY || "";

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.25",
        settings: {
          optimizer: { enabled: true, runs: 200 },
          evmVersion: "cancun", 
        },
      },
      {
        version: "0.8.19",
        settings: {
          optimizer: { enabled: true, runs: 200 },
          evmVersion: "paris", 
        },
      }
    ]
  },

  networks: {
    hardhat: {
      blockGasLimit: 300_000_000,
    },
    "arb-sepolia": {
      url:          ARB_SEPOLIA_RPC,
      accounts:     [PRIVATE_KEY],
      chainId:      421614,
      gasMultiplier: 1.3, // FHE ops need extra gas headroom
    },
    "eth-sepolia": {
      url:          ETH_SEPOLIA_RPC,
      accounts:     [PRIVATE_KEY],
      chainId:      11155111,
      gasMultiplier: 1.3,
    },
  },

  paths: {
    sources:   "./contracts",
    tests:     "./test",
    cache:     "./cache",
    artifacts: "./artifacts",
  },

  etherscan: {
    apiKey: { arbitrumSepolia: ARBISCAN_API_KEY },
    customChains: [{
      network: "arbitrumSepolia",
      chainId: 421614,
      urls: {
        apiURL:     "https://api-sepolia.arbiscan.io/api",
        browserURL: "https://sepolia.arbiscan.io/",
      },
    }],
  },

  gasReporter: {
    enabled:  process.env.REPORT_GAS === "true",
    currency: "USD",
  },

  typechain: {
    outDir: "typechain-types",
    target: "ethers-v6",
  },
};

export default config;
