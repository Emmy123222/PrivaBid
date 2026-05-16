export type RouteAuctionMode = "first-price" | "vickrey" | "dutch";

export type RevealWinnerMode = RouteAuctionMode | "reverse";

/** PrivaBid.sol `AuctionMode` enum (0–3). */
export function onChainModeToRouteMode(mode: number): RouteAuctionMode {
  if (mode === 1) return "vickrey";
  if (mode === 2) return "dutch";
  return "first-price";
}

export function isRouteAuctionMode(
  s: string | undefined,
): s is RouteAuctionMode {
  return s === "first-price" || s === "vickrey" || s === "dutch";
}
