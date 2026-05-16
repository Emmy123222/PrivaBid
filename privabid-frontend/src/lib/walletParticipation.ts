import { Contract, getAddress, isAddress } from "ethers";
import { CONTRACTS } from "../config/contracts";
import {
  fetchLatestFactoryAuctions,
  factoryAuctionLink,
  type FactoryAuctionRow,
} from "./factoryAuctions";
import { getReadOnlyRpcProvider } from "./browserProvider";

export type ParticipationRole = "bidder" | "seller" | "threshold";

export type WalletParticipation = {
  auction: FactoryAuctionRow;
  role: ParticipationRole;
  href: string;
  lastActivityAt: number;
  txCount: number;
};

const BID_ABI = [
  "event BidPlaced(address indexed bidder, uint256 timestamp, uint256 totalBidsNow)",
] as const;

const THRESHOLD_ABI = [
  "event ThresholdSet(address indexed bidder, uint256 timestamp)",
] as const;

const ASK_ABI = [
  "event AskSubmitted(address indexed seller, uint256 timestamp, uint256 totalAsksNow)",
] as const;

async function scanAuction(
  row: FactoryAuctionRow,
  wallet: string,
): Promise<WalletParticipation | null> {
  const rpc = getReadOnlyRpcProvider();
  const w = getAddress(wallet);
  const fromBlock = 0;
  const toBlock = "latest";

  let role: ParticipationRole = "bidder";
  let logs: { blockNumber: number; timestamp?: bigint }[] = [];

  if (row.mode === "reverse") {
    const c = new Contract(row.address, ASK_ABI, rpc);
    try {
      const asks = await c.queryFilter(
        c.filters.AskSubmitted(w),
        fromBlock,
        toBlock,
      );
      if (asks.length === 0) {
        const multi = new Contract(row.address, BID_ABI, rpc);
        const bids = await multi.queryFilter(
          multi.filters.BidPlaced(w),
          fromBlock,
          toBlock,
        );
        if (bids.length === 0) return null;
        role = "bidder";
        logs = bids.map((l) => ({ blockNumber: l.blockNumber ?? 0 }));
      } else {
        role = "seller";
        logs = asks.map((l) => ({ blockNumber: l.blockNumber ?? 0 }));
      }
    } catch {
      return null;
    }
  } else if (row.mode === "dutch") {
    const c = new Contract(row.address, THRESHOLD_ABI, rpc);
    try {
      const thresholds = await c.queryFilter(
        c.filters.ThresholdSet(w),
        fromBlock,
        toBlock,
      );
      if (thresholds.length === 0) return null;
      role = "threshold";
      logs = thresholds.map((l) => ({ blockNumber: l.blockNumber ?? 0 }));
    } catch {
      return null;
    }
  } else {
    const c = new Contract(row.address, BID_ABI, rpc);
    try {
      const bids = await c.queryFilter(
        c.filters.BidPlaced(w),
        fromBlock,
        toBlock,
      );
      if (bids.length === 0) return null;
      logs = bids.map((l) => ({ blockNumber: l.blockNumber ?? 0 }));
    } catch {
      return null;
    }
  }

  const maxBlock = Math.max(...logs.map((l) => l.blockNumber), 0);

  return {
    auction: row,
    role,
    href: factoryAuctionLink(row),
    lastActivityAt: maxBlock,
    txCount: logs.length,
  };
}

export async function fetchWalletParticipation(
  wallet: string,
  limit = 50,
): Promise<WalletParticipation[]> {
  if (!wallet || !isAddress(wallet)) return [];

  const v1 = await fetchLatestFactoryAuctions(limit, CONTRACTS.FACTORY.address);
  const v2Addr = CONTRACTS.FACTORY_V2.address;
  const v2 =
    v2Addr && isAddress(v2Addr) && v2Addr !== "0x0000000000000000000000000000000000000000"
      ? await fetchLatestFactoryAuctions(limit, v2Addr)
      : [];

  const seen = new Set<string>();
  const rows: FactoryAuctionRow[] = [];
  for (const r of [...v2, ...v1]) {
    const k = r.address.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    rows.push(r);
  }

  const results = await Promise.all(
    rows.map((row) => scanAuction(row, wallet)),
  );

  return results
    .filter((r): r is WalletParticipation => r !== null)
    .sort((a, b) => b.lastActivityAt - a.lastActivityAt);
}

export const ROLE_LABEL: Record<ParticipationRole, string> = {
  bidder: "Bid placed",
  seller: "Ask submitted",
  threshold: "Threshold set",
};
