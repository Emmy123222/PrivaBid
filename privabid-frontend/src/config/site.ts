/** External links for marketing / landing (edit for your repo & community). */
export const SITE_LINKS = {
  github: "https://github.com/privabid/privabid",
  arbiscanContract:
    "https://sepolia.arbiscan.io/address/0xCD105F5853abac7a95a1BfaF56d673E32aC1D25C",
  fhenixDocs: "https://docs.fhenix.zone",
  telegram: "https://t.me/Fhenixio",
} as const;

export const GENESIS_DEPLOY = {
  name: "PrivaBid Genesis Auction #001",
  mode: "FIRST_PRICE",
  address: "0xCD105F5853abac7a95a1BfaF56d673E32aC1D25C" as const,
  network: "Arbitrum Sepolia",
  block: 268_966_129,
} as const;
