import { Contract } from "ethers";
import { PRIVA_BID_ABI } from "./privabidAbis";
import { getReadOnlyRpcProvider } from "./browserProvider";

const MULTI_PROBE_ABI = [
  "function getAuctionState() view returns (uint8,string,uint64,uint256,bool,bool,uint256,uint256,address,uint64,uint64)",
] as const;

const MULTI_DUTCH_EXTRA_ABI = [
  "function getCurrentDutchPrice() view returns (uint64)",
  "function dutchStartPrice() view returns (uint64)",
] as const;

export type LoadedAuctionSnapshot = {
  itemName: string;
  timeRemainingSec: bigint;
  totalBids: bigint;
  auctionClosed: boolean;
  winnerRevealed: boolean;
  winningBidder: string;
  winningBid: bigint;
  paymentAmount: bigint;
  reservePrice: bigint;
  auctionEndTime: bigint;
  onChainMode: number;
};

export async function isPrivaBidMultiContract(
  contractAddress: string,
): Promise<boolean> {
  const rpc = getReadOnlyRpcProvider();
  const probe = new Contract(contractAddress, MULTI_PROBE_ABI, rpc);
  try {
    await probe.getAuctionState();
    return true;
  } catch {
    return false;
  }
}

export async function fetchPrivaBidMultiSnapshot(
  contractAddress: string,
): Promise<LoadedAuctionSnapshot> {
  const rpc = getReadOnlyRpcProvider();
  const c = new Contract(
    contractAddress,
    [...PRIVA_BID_ABI, ...MULTI_DUTCH_EXTRA_ABI],
    rpc,
  );

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

  const onChainMode = Number(state[0]);
  const timeRemainingSec = (await c.timeRemaining()) as bigint;

  return {
    onChainMode,
    itemName: state[1],
    reservePrice: state[2],
    auctionEndTime: state[3],
    auctionClosed: state[4],
    winnerRevealed: state[5],
    totalBids: state[6],
    winningBidder: state[8],
    winningBid: state[9],
    paymentAmount: state[10],
    timeRemainingSec,
  };
}
