import { Contract, getAddress, isAddress } from "ethers";
import { CONTRACTS } from "../config/contracts";
import { getReadOnlyRpcProvider } from "./browserProvider";
import type { SavedAuctionMode } from "./myAuctions";
import { auctionHref } from "./myAuctions";

export type FactoryAuctionRow = {
  address: string;
  mode: SavedAuctionMode;
  itemName: string;
  creator: string;
  createdAt: number;
};

const FACTORY_ABI = [
  "function getLatestAuctions(uint256 count) view returns (tuple(address contractAddress,uint8 mode,string itemName,address creator,uint256 createdAt)[])",
  "function getTotalAuctions() view returns (uint256)",
] as const;

const MODE_TO_ROUTE: Record<number, SavedAuctionMode> = {
  0: "first-price",
  1: "vickrey",
  2: "dutch",
  3: "reverse",
};

function parseRow(raw: unknown): FactoryAuctionRow | null {
  const r = raw as {
    contractAddress?: string;
    mode?: bigint | number;
    itemName?: string;
    creator?: string;
    createdAt?: bigint | number;
    0?: string;
    1?: bigint | number;
    2?: string;
    3?: string;
    4?: bigint | number;
  };
  const address = r.contractAddress ?? r[0];
  const modeNum = Number(r.mode ?? r[1] ?? 0);
  const itemName = r.itemName ?? r[2] ?? "";
  const creator = r.creator ?? r[3] ?? "";
  const createdAt = BigInt(r.createdAt ?? r[4] ?? 0);

  if (!address || !isAddress(address)) return null;
  const mode = MODE_TO_ROUTE[modeNum];
  if (!mode) return null;

  return {
    address: getAddress(address),
    mode,
    itemName: String(itemName),
    creator: creator ? getAddress(String(creator)) : "",
    createdAt: Number(createdAt),
  };
}

export function factoryAuctionLink(row: FactoryAuctionRow): string {
  return auctionHref(row.mode, row.address);
}

/** On-chain auctions from a factory (newest first). */
export async function fetchLatestFactoryAuctions(
  limit = 20,
  factoryAddr: string = CONTRACTS.FACTORY.address,
): Promise<FactoryAuctionRow[]> {
  if (!factoryAddr || !isAddress(factoryAddr)) return [];

  const rpc = getReadOnlyRpcProvider();
  const factory = new Contract(factoryAddr, FACTORY_ABI, rpc);
  try {
    const total = await factory.getTotalAuctions();
    if (BigInt(total.toString()) === 0n) return [];
    const raw = (await factory.getLatestAuctions(limit)) as unknown[];
    const rows: FactoryAuctionRow[] = [];
    for (const item of raw) {
      const parsed = parseRow(item);
      if (parsed) rows.push(parsed);
    }
    return rows;
  } catch {
    return [];
  }
}
