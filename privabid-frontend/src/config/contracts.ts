/**
 * Deployed PrivaBid contract addresses (Arbitrum Sepolia).
 * Update VICKREY / DUTCH after standalone deploys.
 */

export const CONTRACTS = {
  FIRST_PRICE: {
    address: "0xCD105F5853abac7a95a1BfaF56d673E32aC1D25C" as const,
    network: "Arbitrum Sepolia",
    chainId: 421614,
  },
  VICKREY: {
    address: "0x471991CDCD48d847ea31a2e87Ba743f41F43c3FD" as const,
    network: "Arbitrum Sepolia",
    chainId: 421614,
  },
  DUTCH: {
    address: "0xab016ADDf7097D77652C712310c7a24F8EAFC913" as const,
    network: "Arbitrum Sepolia",
    chainId: 421614,
  },
  REVERSE: {
    address: "0xFa038951671e0bE59F2acA05Ca52e37bc6081Ffc" as const,
    network: "Arbitrum Sepolia",
    chainId: 421614,
  },
  FACTORY: {
    address: "0x16027C8826BFcef3Ad71C8be56b49eC6BE1e0054" as const,
    network: "Arbitrum Sepolia",
    chainId: 421614,
  },
  /** Wave 4 — PrivaBidFactoryV2 (set VITE_FACTORY_V2_ADDRESS after deploy). */
  FACTORY_V2: {
    address: (import.meta.env.VITE_FACTORY_V2_ADDRESS?.trim() ||
      "0x7ED138dE78f24fEde79eB54F6DddEA38D3db2339") as `0x${string}`,
    network: "Arbitrum Sepolia",
    chainId: 421614,
  },
  /** Judge demo auction (set VITE_DEMO_AUCTION_ADDRESS after deploy:demo). */
  DEMO_AUCTION: {
    address: (import.meta.env.VITE_DEMO_AUCTION_ADDRESS?.trim() ||
      "0xf96F8611Fa57d75398eaa4e410e953586acf6533") as `0x${string}`,
    network: "Arbitrum Sepolia",
    chainId: 421614,
  },
} as const;

/** Prefer V2 factory when deployed. */
export function activeFactoryAddress(): string {
  const v2 = CONTRACTS.FACTORY_V2.address;
  if (v2 && v2 !== "0x0000000000000000000000000000000000000000") return v2;
  return CONTRACTS.FACTORY.address;
}

export const CHAIN_ID = 421614;

/**
 * JSON-RPC for Arbitrum Sepolia reads + wagmi `http()` transport.
 * Override with `VITE_ARB_SEPOLIA_RPC` (e.g. Alchemy) in `.env` — do not commit API keys.
 * Default: PublicNode (generous limits vs small free-tier quotas).
 */
export const RPC_URL =
  import.meta.env.VITE_ARB_SEPOLIA_RPC?.trim() ||
  "https://arbitrum-sepolia-rpc.publicnode.com";
