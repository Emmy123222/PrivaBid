/** Matches `PrivaBidV2.AuctionMode` / factory `uint8 mode`. */
export enum AuctionMode {
  FIRST_PRICE = 0,
  VICKREY = 1,
  DUTCH = 2,
  REVERSE = 3,
}

export type RouteMode =
  | "first-price"
  | "vickrey"
  | "dutch"
  | "reverse";

export function routeModeToOnChain(mode: RouteMode): AuctionMode {
  switch (mode) {
    case "vickrey":
      return AuctionMode.VICKREY;
    case "dutch":
      return AuctionMode.DUTCH;
    case "reverse":
      return AuctionMode.REVERSE;
    default:
      return AuctionMode.FIRST_PRICE;
  }
}

export function onChainModeToRoute(mode: number): RouteMode {
  if (mode === AuctionMode.VICKREY) return "vickrey";
  if (mode === AuctionMode.DUTCH) return "dutch";
  if (mode === AuctionMode.REVERSE) return "reverse";
  return "first-price";
}

export const USDC_DECIMALS = 6;

/** Human USDC string → micro-USDC bigint (6 decimals). */
export function parseUsdcMicro(amount: string | number): bigint {
  const n = typeof amount === "string" ? parseFloat(amount.replace(/,/g, "")) : amount;
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`Invalid USDC amount: ${amount}`);
  }
  return BigInt(Math.round(n * 10 ** USDC_DECIMALS));
}

/** micro-USDC → human-readable string. */
export function formatUsdcMicro(micro: bigint, maxFractionDigits = 6): string {
  const whole = micro / 1_000_000n;
  const frac = micro % 1_000_000n;
  const fracStr = frac.toString().padStart(6, "0").replace(/0+$/, "");
  if (!fracStr) return whole.toString();
  const trimmed = fracStr.slice(0, maxFractionDigits);
  return `${whole}.${trimmed}`;
}

export type CreateAuctionParams = {
  mode: AuctionMode;
  itemName: string;
  itemDescription: string;
  /** micro-USDC: reserve (first/vickrey), floor (dutch), ceiling (reverse) */
  reservePriceMicro: bigint;
  durationSec: bigint;
  dutchStartPriceMicro?: bigint;
  dutchFloorPriceMicro?: bigint;
  /** V2: blocks between 1 μUSDC price drops */
  dutchDecrementBlocks?: bigint;
  useEncryptedReserve?: boolean;
};
