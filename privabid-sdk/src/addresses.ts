/** Arbitrum Sepolia (chainId 421614) — testnet deployments. No mainnet addresses. */
export const CHAIN_ID = 421614 as const;

export const NETWORK = "Arbitrum Sepolia" as const;

export const RPC_URL_DEFAULT =
  "https://arbitrum-sepolia-rpc.publicnode.com" as const;

export const ADDRESSES = {
  FIRST_PRICE: "0xCD105F5853abac7a95a1BfaF56d673E32aC1D25C",
  VICKREY: "0x471991CDCD48d847ea31a2e87Ba743f41F43c3FD",
  DUTCH: "0xab016ADDf7097D77652C712310c7a24F8EAFC913",
  REVERSE: "0xFa038951671e0bE59F2acA05Ca52e37bc6081Ffc",
  FACTORY_V1: "0x16027C8826BFcef3Ad71C8be56b49eC6BE1e0054",
  FACTORY_V2: "0x7ED138dE78f24fEde79eB54F6DddEA38D3db2339",
  DEMO_AUCTION: "0xf96F8611Fa57d75398eaa4e410e953586acf6533",
} as const;

export type DeployedAddressKey = keyof typeof ADDRESSES;

export function activeFactoryAddress(): string {
  return ADDRESSES.FACTORY_V2;
}

export function arbiscanAddressUrl(address: string): string {
  return `https://sepolia.arbiscan.io/address/${address}`;
}

export function arbiscanTxUrl(txHash: string): string {
  return `https://sepolia.arbiscan.io/tx/${txHash}`;
}
