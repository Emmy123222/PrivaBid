export type RouteAuctionMode = "first-price" | "vickrey" | "dutch";

export function isRouteAuctionMode(
  s: string | undefined,
): s is RouteAuctionMode {
  return s === "first-price" || s === "vickrey" || s === "dutch";
}
