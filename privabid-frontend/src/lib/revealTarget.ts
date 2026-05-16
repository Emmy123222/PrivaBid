import { Contract, getAddress } from "ethers";
import { CONTRACTS } from "../config/contracts";
import type { RevealWinnerMode } from "../types/auction";
import { getReadOnlyRpcProvider } from "./browserProvider";

export type RevealContractKind =
  | "privabid-multi"
  | "privabid-v2"
  | "standalone-vickrey"
  | "standalone-dutch"
  | "standalone-reverse";

const MULTI_DETECT_ABI = [
  "function getAuctionState() view returns (uint8,string,uint64,uint256,bool,bool,uint256,uint256,address,uint64,uint64)",
] as const;

const V2_PROBE_ABI = ["function useEncryptedReserve() view returns (bool)"] as const;

export type RevealTarget = {
  kind: RevealContractKind;
  /** Set for multi / v2 (0=FIRST, 1=VICKREY, 2=DUTCH, 3=REVERSE). */
  onChainMode?: number;
  useEncryptedReserve?: boolean;
};

export function onChainModeToRevealMode(mode: number): RevealWinnerMode {
  if (mode === 1) return "vickrey";
  if (mode === 2) return "dutch";
  if (mode === 3) return "reverse";
  return "first-price";
}

export async function resolveRevealTarget(
  contractAddress: string,
): Promise<RevealTarget> {
  const addr = getAddress(contractAddress);

  if (addr === getAddress(CONTRACTS.REVERSE.address)) {
    return { kind: "standalone-reverse" };
  }
  if (addr === getAddress(CONTRACTS.VICKREY.address)) {
    return { kind: "standalone-vickrey" };
  }
  if (addr === getAddress(CONTRACTS.DUTCH.address)) {
    return { kind: "standalone-dutch" };
  }

  const rpc = getReadOnlyRpcProvider();
  try {
    const probe = new Contract(addr, MULTI_DETECT_ABI, rpc);
    const state = (await probe.getAuctionState()) as [bigint];
    const onChainMode = Number(state[0]);
    let useEncryptedReserve = false;
    try {
      const v2 = new Contract(addr, V2_PROBE_ABI, rpc);
      useEncryptedReserve = Boolean(await v2.useEncryptedReserve());
      return { kind: "privabid-v2", onChainMode, useEncryptedReserve };
    } catch {
      return { kind: "privabid-multi", onChainMode };
    }
  } catch {
    if (addr === getAddress(CONTRACTS.FIRST_PRICE.address)) {
      return { kind: "privabid-multi", onChainMode: 0 };
    }
    return { kind: "standalone-vickrey" };
  }
}
