/**
 * Deployed PrivaBid contract addresses (Arbitrum Sepolia).
 * Update VICKREY / DUTCH after standalone deploys.
 */

export const CONTRACTS = {
  FIRST_PRICE: {
    address: "0x83F0D8049730e4AD6b4b4586f322c85CA9D7Ca3a" as const,
    network: "Arbitrum Sepolia",
    chainId: 421614,
  },
  VICKREY: {
    address: "0x471991CDCD48d847ea31a2e87Ba743f41F43c3FD" as const,
    network: "Arbitrum Sepolia",
    chainId: 421614,
  },
  DUTCH: {
    address: "0xd34b656D608699136404B193F20f8282a3B22028" as const,
    network: "Arbitrum Sepolia",
    chainId: 421614,
  },
} as const;

export const CHAIN_ID = 421614;

/**
 * JSON-RPC for Arbitrum Sepolia reads + wagmi `http()` transport.
 * Override with `VITE_ARB_SEPOLIA_RPC` (e.g. Alchemy) in `.env` — do not commit API keys.
 * Default: PublicNode (generous limits vs small free-tier quotas).
 */
export const RPC_URL =
  import.meta.env.VITE_ARB_SEPOLIA_RPC?.trim() ||
  "https://arbitrum-sepolia-rpc.publicnode.com";
