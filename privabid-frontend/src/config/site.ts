/** External links for marketing / landing (edit for your repo & community). */
export const SITE_LINKS = {
  github: "https://github.com/yourusername/privabid",
  arbiscanContract:
    "https://sepolia.arbiscan.io/address/0x83F0D8049730e4AD6b4b4586f322c85CA9D7Ca3a",
  fhenixDocs: "https://docs.fhenix.zone",
  telegram: "https://t.me/Fhenixio",
} as const;

export const GENESIS_DEPLOY = {
  name: "PrivaBid Genesis Auction #001",
  mode: "FIRST_PRICE",
  address: "0x83F0D8049730e4AD6b4b4586f322c85CA9D7Ca3a" as const,
  network: "Arbitrum Sepolia",
  block: 252_760_926,
} as const;
