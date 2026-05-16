import { Contract, formatUnits, isAddress } from "ethers";
import { CONTRACTS } from "../config/contracts";
import {
  fetchLatestFactoryAuctions,
  type FactoryAuctionRow,
} from "./factoryAuctions";
import { getReadOnlyRpcProvider } from "./browserProvider";
import { isPrivaBidMultiContract } from "./auctionLoad";
import { REVERSE_ABI } from "./privabidAbis";

export type AuctionStatus = "live" | "closed" | "revealed" | "ended";

export type DashboardAuction = FactoryAuctionRow & {
  status: AuctionStatus;
  bidCount: number;
  timeRemainingSec: number;
  winner: string | null;
  winningAmountUsdc: string | null;
  encryptedReserve?: boolean;
};

const MULTI_STATE_ABI = [
  "function getAuctionState() view returns (uint8,string,uint64,uint256,bool,bool,uint256,uint256,address,uint64,uint64)",
  "function timeRemaining() view returns (uint256)",
  "function useEncryptedReserve() view returns (bool)",
] as const;

function statusFrom(
  closed: boolean,
  revealed: boolean,
  timeRemainingSec: number,
): AuctionStatus {
  if (revealed) return "revealed";
  if (closed) return "closed";
  if (timeRemainingSec <= 0) return "ended";
  return "live";
}

async function enrichMulti(
  row: FactoryAuctionRow,
): Promise<DashboardAuction | null> {
  const rpc = getReadOnlyRpcProvider();
  const c = new Contract(row.address, MULTI_STATE_ABI, rpc);
  try {
    const state = (await c.getAuctionState()) as [
      bigint,
      string,
      bigint,
      bigint,
      boolean,
      boolean,
      bigint,
      bigint,
      string,
      bigint,
      bigint,
    ];
    const timeRemainingSec = Number(await c.timeRemaining());
    let encryptedReserve = false;
    try {
      encryptedReserve = Boolean(await c.useEncryptedReserve());
    } catch {
      /* V1 */
    }

    const closed = state[4];
    const revealed = state[5];
    const winner = state[8];
    const winningBid = state[9];
    const payment = state[10];
    const amount =
      Number(state[0]) === 1 && payment > 0n ? payment : winningBid;

    return {
      ...row,
      status: statusFrom(closed, revealed, timeRemainingSec),
      bidCount: Number(state[6]),
      timeRemainingSec,
      winner:
        revealed && winner && winner !== "0x0000000000000000000000000000000000000000"
          ? winner
          : null,
      winningAmountUsdc:
        revealed && amount > 0n
          ? formatUnits(amount, 6)
          : null,
      encryptedReserve,
    };
  } catch {
    return null;
  }
}

async function enrichReverse(
  row: FactoryAuctionRow,
): Promise<DashboardAuction | null> {
  const rpc = getReadOnlyRpcProvider();
  const c = new Contract(row.address, REVERSE_ABI, rpc);
  try {
    const [
      timeRemainingSec,
      totalAsks,
      closed,
      revealed,
      vendor,
      ask,
    ] = await Promise.all([
      c.timeRemaining(),
      c.totalAsks(),
      c.auctionClosed(),
      c.winnerRevealed(),
      c.winningVendor(),
      c.winningAsk(),
    ]);
    const tr = Number(timeRemainingSec);
    return {
      ...row,
      status: statusFrom(Boolean(closed), Boolean(revealed), tr),
      bidCount: Number(totalAsks),
      timeRemainingSec: tr,
      winner:
        revealed &&
        vendor &&
        vendor !== "0x0000000000000000000000000000000000000000"
          ? String(vendor)
          : null,
      winningAmountUsdc:
        revealed && BigInt(ask) > 0n ? formatUnits(ask, 6) : null,
    };
  } catch {
    return null;
  }
}

export async function enrichFactoryRow(
  row: FactoryAuctionRow,
): Promise<DashboardAuction | null> {
  if (row.mode === "reverse") {
    const multi = await isPrivaBidMultiContract(row.address);
    if (multi) return enrichMulti(row);
    return enrichReverse(row);
  }
  return enrichMulti(row);
}

export async function fetchDashboardAuctions(
  limit = 40,
): Promise<DashboardAuction[]> {
  const v1 = await fetchLatestFactoryAuctions(limit, CONTRACTS.FACTORY.address);
  const v2Addr = CONTRACTS.FACTORY_V2.address;
  const v2 =
    v2Addr && isAddress(v2Addr) && v2Addr !== "0x0000000000000000000000000000000000000000"
      ? await fetchLatestFactoryAuctions(limit, v2Addr)
      : [];

  const seen = new Set<string>();
  const merged: FactoryAuctionRow[] = [];
  for (const row of [...v2, ...v1]) {
    const key = row.address.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(row);
  }

  const enriched = await Promise.all(
    merged.slice(0, limit).map((row) => enrichFactoryRow(row)),
  );
  return enriched.filter((r): r is DashboardAuction => r !== null);
}

export function formatTimeRemaining(sec: number): string {
  if (sec <= 0) return "Ended";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
