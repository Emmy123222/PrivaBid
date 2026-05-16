import { getAddress, isAddress } from "ethers";

export type SavedAuctionMode = "first-price" | "vickrey" | "dutch" | "reverse";

export type SavedAuction = {
  address: string;
  mode: SavedAuctionMode;
  itemName: string;
  createdAt: number;
};

const STORAGE_KEY = "privabid.myAuctions";

export function saveMyAuction(auction: SavedAuction): void {
  const list = loadMyAuctions().filter(
    (a) => getAddress(a.address) !== getAddress(auction.address),
  );
  list.unshift({
    ...auction,
    address: getAddress(auction.address),
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 25)));
}

export function loadMyAuctions(): SavedAuction[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedAuction[];
    return parsed.filter(
      (a) => isAddress(a.address) && typeof a.itemName === "string",
    );
  } catch {
    return [];
  }
}

export function auctionHref(mode: SavedAuctionMode, address: string): string {
  const q = `?address=${encodeURIComponent(getAddress(address))}`;
  if (mode === "reverse") return `/reverse-auction${q}`;
  return `/auction/${mode}${q}`;
}
