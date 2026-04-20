import { useState } from "react";
import { Contract } from "ethers";
import {
  createBrowserProvider,
  getReadOnlyRpcProvider,
} from "../lib/browserProvider";
import { useAccount } from "wagmi";
import {
  ensureArbitrumSepoliaInMetaMask,
  getTrustedMetaMaskProvider,
} from "../lib/metamask";

/** Read + write: preflight reads avoid opaque `estimateGas` / missing revert data on L2. */
const CLOSE_ABI = [
  "function closeBidding() external",
  "function auctioneer() view returns (address)",
  "function auctionClosed() view returns (bool)",
] as const;

function formatCloseError(e: unknown): string {
  if (e instanceof Error) {
    const m = e.message;
    if (
      m.includes("missing revert data") ||
      m.includes('action="estimateGas"') ||
      m.includes("CALL_EXCEPTION")
    ) {
      return `${m}\n\nHint: closeBidding() only succeeds for the on-chain auctioneer (the wallet that deployed this auction), and only while the auction is still open. If you just switched accounts, try again after the page reflects the correct wallet.`;
    }
    return m;
  }
  return String(e);
}

export type CloseAuctionPanelProps = {
  contractAddress: string;
  auctioneer: string | null;
  /** Auction still open for bids / thresholds */
  canClose: boolean;
  onClosed: () => void;
};

export default function CloseAuctionPanel({
  contractAddress,
  auctioneer,
  canClose,
  onClosed,
}: CloseAuctionPanelProps) {
  const { address, isConnected } = useAccount();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!auctioneer || !canClose) return null;
  if (!isConnected || !address) return null;
  if (address.toLowerCase() !== auctioneer.toLowerCase()) return null;

  const runClose = async () => {
    setError(null);
    const mm = await getTrustedMetaMaskProvider();
    if (!mm) {
      setError("Please install MetaMask to close the auction.");
      return;
    }
    setBusy(true);
    try {
      await ensureArbitrumSepoliaInMetaMask(mm);
      const browser = createBrowserProvider(mm);
      const signer = await browser.getSigner();
      const me = (await signer.getAddress()).toLowerCase();
      const read = new Contract(
        contractAddress,
        CLOSE_ABI,
        getReadOnlyRpcProvider(),
      ) as Contract;
      const [onChainAuctioneer, closed] = await Promise.all([
        read.auctioneer() as Promise<string>,
        read.auctionClosed() as Promise<boolean>,
      ]);
      if (closed) {
        setError("This auction is already closed.");
        return;
      }
      if (onChainAuctioneer.toLowerCase() !== me) {
        setError(
          `Only the auctioneer can close. On-chain auctioneer is ${onChainAuctioneer}; connected wallet is ${me}.`,
        );
        return;
      }
      const c = new Contract(contractAddress, CLOSE_ABI, signer) as Contract;
      const tx = await c.closeBidding();
      await tx.wait();
      onClosed();
    } catch (e: unknown) {
      const err = e as { code?: string | number; message?: string };
      if (err?.code === "ACTION_REJECTED" || err?.code === 4001) {
        setError("Transaction cancelled");
      } else {
        setError(formatCloseError(e));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-amber-500/35 bg-amber-500/5 p-4">
      <p className="font-label text-[10px] font-bold uppercase tracking-wider text-amber-200/90">
        Auctioneer
      </p>
      <p className="mt-2 font-label text-xs text-neutral-300">
        Close the auction to allow Threshold decryption and winner reveal.
      </p>

      {error && (
        <p className="mt-2 font-label text-xs text-red-400">{error}</p>
      )}

      <button
        type="button"
        disabled={busy}
        onClick={() => void runClose()}
        className="mt-4 w-full rounded-xl border border-amber-400/60 py-2.5 font-label text-xs font-semibold uppercase tracking-wide text-amber-100 hover:bg-amber-500/15 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? "Closing…" : "Close Auction"}
      </button>
    </div>
  );
}
