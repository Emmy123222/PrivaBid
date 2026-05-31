import { Contract } from "ethers";
import { PRIVA_BID_ABI } from "./privabidAbis";
import { getReadOnlyRpcProvider } from "./browserProvider";
import { isPrivaBidMultiContract } from "./auctionLoad";

const STANDALONE_REVERSE_ABI = [
  "function itemName() view returns (string)",
  "function budgetCeiling() view returns (uint64)",
  "function timeRemaining() view returns (uint256)",
  "function totalAsks() view returns (uint256)",
  "function auctionClosed() view returns (bool)",
  "function winnerRevealed() view returns (bool)",
  "function winningSeller() view returns (address)",
  "function winningAsk() view returns (uint64)",
  "function buyer() view returns (address)",
  "event AskSubmitted(address indexed seller, uint256 timestamp, uint256 totalAsksNow)",
] as const;

export type ReverseAuctionSnapshot = {
  itemName: string;
  budgetCeiling: bigint;
  timeRemainingSec: bigint;
  totalAsks: bigint;
  auctionClosed: boolean;
  winnerRevealed: boolean;
  /** Standalone: winningSeller. Multi-mode V2: winningBidder. */
  winningParty: string;
  winningAsk: bigint;
  /** Wallet allowed to call closeBidding(). */
  closerAddress: string;
  isMultiMode: boolean;
};

export type ReverseContractKind = "standalone" | "multi";

export async function detectReverseContractKind(
  contractAddress: string,
): Promise<ReverseContractKind> {
  if (await isPrivaBidMultiContract(contractAddress)) return "multi";
  return "standalone";
}

export async function fetchReverseAuctionSnapshot(
  contractAddress: string,
): Promise<ReverseAuctionSnapshot> {
  const rpc = getReadOnlyRpcProvider();
  const kind = await detectReverseContractKind(contractAddress);

  if (kind === "multi") {
    const c = new Contract(contractAddress, PRIVA_BID_ABI, rpc);
    const state = (await c.getAuctionState()) as unknown as [
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
    const timeRemainingSec = (await c.timeRemaining()) as bigint;
    const closerAddress = (await c.auctioneer()) as string;

    return {
      isMultiMode: true,
      itemName: state[1],
      budgetCeiling: state[2],
      timeRemainingSec,
      totalAsks: state[6],
      auctionClosed: state[4],
      winnerRevealed: state[5],
      winningParty: state[8],
      winningAsk: state[9],
      closerAddress,
    };
  }

  const c = new Contract(contractAddress, STANDALONE_REVERSE_ABI, rpc);
  const [
    itemName,
    budgetCeiling,
    timeRemainingSec,
    totalAsks,
    auctionClosed,
    winnerRevealed,
    winningSeller,
    winningAsk,
    buyer,
  ] = await Promise.all([
    c.itemName(),
    c.budgetCeiling(),
    c.timeRemaining(),
    c.totalAsks(),
    c.auctionClosed(),
    c.winnerRevealed(),
    c.winningSeller(),
    c.winningAsk(),
    c.buyer(),
  ]);

  return {
    isMultiMode: false,
    itemName: itemName as string,
    budgetCeiling: BigInt(budgetCeiling.toString()),
    timeRemainingSec: timeRemainingSec as bigint,
    totalAsks: totalAsks as bigint,
    auctionClosed: auctionClosed as boolean,
    winnerRevealed: winnerRevealed as boolean,
    winningParty: winningSeller as string,
    winningAsk: winningAsk as bigint,
    closerAddress: buyer as string,
  };
}

export function reverseReadAbi(isMultiMode: boolean): readonly string[] {
  if (isMultiMode) {
    return [
      ...PRIVA_BID_ABI,
      "event AskSubmitted(address indexed seller, uint256 timestamp, uint256 totalAsksNow)",
    ];
  }
  return STANDALONE_REVERSE_ABI;
}
