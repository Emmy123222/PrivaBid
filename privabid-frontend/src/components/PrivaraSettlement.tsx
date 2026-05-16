import { useState } from "react";
import { ReineiraSDK } from "@reineira-os/sdk";
import { createBrowserProvider } from "../lib/browserProvider";
import { getTrustedMetaMaskProvider } from "../lib/metamask";

export type PrivaraSettlementProps = {
  /** Winner or payee address for escrow owner. */
  recipient: string;
  /** USDC amount (human-readable, e.g. "12.50"). */
  amountUsdc: string;
  /** Vickrey: pay second price instead of winning bid. */
  paymentAmountUsdc?: string | null;
  className?: string;
};

export default function PrivaraSettlement({
  recipient,
  amountUsdc,
  paymentAmountUsdc,
  className = "",
}: PrivaraSettlementProps) {
  const [status, setStatus] = useState<
    "idle" | "processing" | "complete" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);

  const settleAmount =
    paymentAmountUsdc != null && paymentAmountUsdc !== ""
      ? paymentAmountUsdc
      : amountUsdc;

  const settle = async () => {
    setStatus("processing");
    setError(null);

    try {
      const mm = await getTrustedMetaMaskProvider();
      if (!mm) throw new Error("Connect MetaMask to settle via Privara");

      const browser = createBrowserProvider(mm);
      const signer = await browser.getSigner();
      const sdk = ReineiraSDK.create({ network: "testnet", signer });
      await sdk.initialize();

      const amount = sdk.usdc(parseFloat(settleAmount));
      const escrow = await sdk.escrow.create({
        amount,
        owner: recipient,
      });
      await escrow.fund(amount, { autoApprove: true });

      setStatus("complete");
    } catch (e: unknown) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Privara settlement failed");
    }
  };

  return (
    <div className={className}>
      <p className="font-label text-[11px] text-neutral-500">
        Confidential settlement via Privara (@reineira-os/sdk) on encrypted
        payment rails.
      </p>

      {status === "idle" && (
        <button
          type="button"
          onClick={() => void settle()}
          className="mt-3 w-full rounded-xl border border-sky-500/50 py-2.5 font-label text-xs font-semibold uppercase tracking-wide text-sky-400 hover:bg-sky-500/10"
        >
          Settle via Privara
        </button>
      )}

      {status === "processing" && (
        <p className="mt-3 font-label text-sm text-sky-400">
          Funding confidential escrow…
        </p>
      )}

      {status === "complete" && (
        <p className="mt-3 font-label text-sm text-emerald-400">
          Payment settled via Privara ✓
        </p>
      )}

      {status === "error" && error && (
        <div className="mt-3">
          <p className="font-label text-sm text-red-400">{error}</p>
          <button
            type="button"
            onClick={() => void settle()}
            className="mt-2 rounded-lg border border-red-500/50 px-3 py-1 font-label text-xs text-red-400 hover:bg-red-500/10"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
