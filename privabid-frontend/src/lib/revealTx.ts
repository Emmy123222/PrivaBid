import type { Contract } from "ethers";
import { getBufferedEip1559GasOverrides } from "./eip1559Gas";

/** FHE reveal txs often fail `estimateGas` on Arbitrum Sepolia — send with an explicit cap. */
export const REVEAL_GAS_LIMIT = 8_000_000n;

export async function revealTxOverrides(): Promise<{
  gasLimit: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}> {
  const gas = await getBufferedEip1559GasOverrides();
  return { gasLimit: REVEAL_GAS_LIMIT, ...gas };
}

async function participationCount(
  read: Contract,
  kind: "asks" | "bids",
): Promise<bigint> {
  if (kind === "asks") {
    return BigInt((await read.totalAsks()).toString());
  }
  try {
    return BigInt((await read.totalBids()).toString());
  } catch {
    try {
      return BigInt((await read.getParticipantCount()).toString());
    } catch {
      return 1n;
    }
  }
}

export async function assertRevealPreflight(
  read: Contract,
  opts: { kind: "asks" | "bids"; minCount?: bigint; skipCount?: boolean },
): Promise<void> {
  const [closed, revealed, total] = await Promise.all([
    read.auctionClosed() as Promise<boolean>,
    read.winnerRevealed() as Promise<boolean>,
    opts.skipCount
      ? Promise.resolve(1n)
      : participationCount(read, opts.kind),
  ]);

  if (!closed) {
    throw new Error("Auction is still open — the auctioneer must close bidding first.");
  }
  if (revealed) {
    throw new Error("Winner was already revealed for this auction.");
  }
  const min = opts.minCount ?? 1n;
  if (BigInt(total.toString()) < min) {
    throw new Error(
      opts.kind === "asks"
        ? "No asks were submitted — nothing to reveal."
        : "No bids were submitted — nothing to reveal.",
    );
  }
}

/**
 * True when the on-chain proof verification failed — most likely because CoFHE
 * hasn't yet authorized decryption for this auction's handles. Waiting ~60 s
 * after `closeBidding()` and retrying usually resolves it.
 */
export function isProofRejected(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  const lower = msg.toLowerCase();
  return (
    lower.includes("require(false)") ||
    lower.includes("execution reverted") ||
    lower.includes("call_exception")
  );
}

export function formatRevealError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  const lower = msg.toLowerCase();

  if (
    lower.includes("max fee per gas less than block base fee") ||
    (lower.includes("maxfeepergas") && lower.includes("basefee"))
  ) {
    return "Network gas price moved — try Reveal Winner again.";
  }
  if (lower.includes("use revealvickreywinner") || lower.includes("revealvickrey")) {
    return "This contract is a Vickrey auction — use the Vickrey auction page or refresh after updating the app.";
  }
  if (lower.includes("use revealdutchwinner") || lower.includes("revealdutch")) {
    return "This contract is a Dutch auction — use the Dutch auction page or refresh after updating the app.";
  }
  if (lower.includes("only for dutch")) {
    return "This contract is not in Dutch mode.";
  }
  if (lower.includes("only for reverse")) {
    return "This contract is not in reverse mode.";
  }
  if (lower.includes("address has no threshold") || lower.includes("unknownbidder")) {
    return "That address has no sealed threshold on this auction.";
  }
  if (lower.includes("cofhe did not connect") || lower.includes("cofhe is not connected")) {
    return "CoFHE did not connect — ensure your wallet is on Arbitrum Sepolia and retry.";
  }
  if (
    lower.includes("require(false)") ||
    lower.includes("execution reverted") ||
    lower.includes("call_exception")
  ) {
    return (
      "Threshold proof was rejected on-chain. The app will reconnect CoFHE and retry automatically — " +
      "wait for the countdown (90 s) so the network can authorize decryption after close."
    );
  }
  return msg;
}
