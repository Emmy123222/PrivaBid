/**
 * Threshold decrypt + `publishDecryptResult` flow.
 * @cofhe/sdk v0.4 exposes `CofheClient` via `@cofhe/react` (`useCofheClient`) — there is no
 * `createClient(signer)` export; we call `client.connect(publicClient, walletClient)` then
 * `client.decryptForTx(handle).withoutPermit().execute()` like the SDK types describe.
 */
import { useMemo, useState } from "react";
import { Contract, formatUnits } from "ethers";
import { getAddress, isAddress as isAddressViem } from "viem";
import {
  useCofheClient,
  useCofheConnection,
  useCofhePublicClient,
  useCofheWalletClient,
} from "@cofhe/react";
import { ReineiraSDK } from "@reineira-os/sdk";
import { createBrowserProvider, getReadOnlyRpcProvider } from "../lib/browserProvider";
import { getTrustedMetaMaskProvider } from "../lib/metamask";
import {
  DUTCH_REVEAL_ABI,
  FIRST_PRICE_REVEAL_ABI,
  VICKREY_REVEAL_ABI,
} from "../lib/privabidAbis";

const ZERO = "0x0000000000000000000000000000000000000000";
const UINT64_MASK = (1n << 64n) - 1n;

export type RevealWinnerMode = "first-price" | "vickrey" | "dutch" | "reverse";

export type RevealWinnerProps = {
  mode: RevealWinnerMode;
  contractAddress: string;
  /** Optional: refresh parent auction state after a successful reveal. */
  onRevealSuccess?: () => void;
};

const STEPS = [
  {
    n: 1,
    title: "Request Threshold Network decryption",
    subtitle: "Off-chain",
  },
  {
    n: 2,
    title: "Verify cryptographic proof",
    subtitle: "Off-chain",
  },
  {
    n: 3,
    title: "Publish winner on-chain",
    subtitle: "On-chain tx",
  },
] as const;

function isZeroAddr(a: string): boolean {
  return !a || a.toLowerCase() === ZERO;
}

function truncateAddr(a: string): string {
  if (!a || a.length < 10) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function toUint64(n: bigint): bigint {
  return n & UINT64_MASK;
}

function bigintToAddress(value: bigint): `0x${string}` {
  const masked = value & ((1n << 160n) - 1n);
  const hex = `0x${masked.toString(16).padStart(40, "0")}` as `0x${string}`;
  return getAddress(hex);
}

function normHandle(h: unknown): bigint {
  if (typeof h === "bigint") return h;
  if (typeof h === "number") return BigInt(h);
  return BigInt(String(h));
}

function isUserRejection(e: unknown): boolean {
  const err = e as {
    code?: string | number;
    message?: string;
    shortMessage?: string;
    info?: { error?: { code?: number } };
  };
  if (err?.code === "ACTION_REJECTED" || err?.code === 4001) return true;
  if (err?.info?.error?.code === 4001) return true;
  const msg = `${err?.shortMessage ?? ""} ${err?.message ?? ""}`.toLowerCase();
  return (
    msg.includes("user rejected") ||
    msg.includes("user denied") ||
    msg.includes("rejected the request")
  );
}

export default function RevealWinner({
  mode,
  contractAddress,
  onRevealSuccess,
}: RevealWinnerProps) {
  const cofheClient = useCofheClient();
  const { connected } = useCofheConnection();
  const publicClient = useCofhePublicClient();
  const walletClient = useCofheWalletClient();

  const [activeStep, setActiveStep] = useState<0 | 1 | 2 | 3>(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const [dutchWinner, setDutchWinner] = useState("");
  const [winnerAddr, setWinnerAddr] = useState<string | null>(null);
  const [winningBidUsdc, setWinningBidUsdc] = useState<string | null>(null);
  const [paymentUsdc, setPaymentUsdc] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<"idle" | "processing" | "complete" | "error">("idle");
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const readProvider = useMemo(() => getReadOnlyRpcProvider(), []);

  const processPayment = async () => {
    if (!winnerAddr || !winningBidUsdc) return;
    
    setPaymentStatus("processing");
    setPaymentError(null);
    
    try {
      const mm = await getTrustedMetaMaskProvider();
      if (!mm) {
        throw new Error("MetaMask not available");
      }
      
      const browser = createBrowserProvider(mm);
      const signer = await browser.getSigner();
      const sdk = ReineiraSDK.create({ 
        network: "testnet", 
        signer 
      });
      
      // Initialize the SDK
      await sdk.initialize();
      
      // Convert USDC amount to proper format (6 decimals)
      const amount = sdk.usdc(parseFloat(winningBidUsdc));
      
      // Create escrow for the winner
      const escrow = await sdk.escrow.create({
        amount: amount,
        owner: winnerAddr,
      });
      
      // Fund the escrow
      await escrow.fund(amount, { autoApprove: true });
      
      setPaymentStatus("complete");
    } catch (e: any) {
      setPaymentStatus("error");
      setPaymentError(e?.message || "Payment failed");
    }
  };

  const reveal = async () => {
    setError(null);
    setDone(false);
    setWinnerAddr(null);
    setWinningBidUsdc(null);
    setPaymentUsdc(null);
    setPaymentStatus("idle");
    setPaymentError(null);

    if (isZeroAddr(contractAddress)) {
      setError("No contract configured.");
      return;
    }

    const mm = await getTrustedMetaMaskProvider();
    if (!mm) {
      setError("Connect MetaMask to reveal the winner.");
      return;
    }

    if (!publicClient || !walletClient) {
      setError("CoFHE wallet client not ready. Connect your wallet first.");
      return;
    }

    setBusy(true);
    try {
      if (!cofheClient.connected) {
        await cofheClient.connect(
          publicClient as Parameters<typeof cofheClient.connect>[0],
          walletClient as Parameters<typeof cofheClient.connect>[1],
        );
      }

      const read = new Contract(
        contractAddress,
        mode === "first-price"
          ? FIRST_PRICE_REVEAL_ABI
          : mode === "vickrey"
            ? VICKREY_REVEAL_ABI
            : mode === "reverse"
              ? FIRST_PRICE_REVEAL_ABI // PrivaBidReverse uses same ABI pattern as first-price
              : DUTCH_REVEAL_ABI,
        readProvider,
      ) as Contract;

      const browser = createBrowserProvider(mm);
      const signer = await browser.getSigner();
      const write = new Contract(
        contractAddress,
        mode === "first-price"
          ? FIRST_PRICE_REVEAL_ABI
          : mode === "vickrey"
            ? VICKREY_REVEAL_ABI
            : mode === "reverse"
              ? FIRST_PRICE_REVEAL_ABI // PrivaBidReverse uses same ABI pattern as first-price
              : DUTCH_REVEAL_ABI,
        signer,
      ) as Contract;

      /* ─── STEP 1: read handles ─── */
      setActiveStep(1);

      if (mode === "dutch") {
        const w = dutchWinner.trim();
        if (!isAddressViem(w as `0x${string}`)) {
          throw new Error("Enter a valid winner Ethereum address for Dutch reveal.");
        }
        const winner = getAddress(w as `0x${string}`);
        const thresholdHandle = normHandle(
          await read.getDutchThresholdHandle(winner),
        );

        /* STEP 2 */
        setActiveStep(2);
        const thresholdResult = await cofheClient
          .decryptForTx(thresholdHandle)
          .withoutPermit()
          .execute();

        /* STEP 3 */
        setActiveStep(3);
        const tx = await write.revealWinner(
          winner,
          thresholdResult.ctHash,
          toUint64(thresholdResult.decryptedValue),
          thresholdResult.signature,
        );
        await tx.wait();

        setWinnerAddr(winner);
        setWinningBidUsdc(
          formatUnits(toUint64(thresholdResult.decryptedValue), 6),
        );
        setDone(true);
        onRevealSuccess?.();
        setActiveStep(0);
        return;
      }

      const bidHandle = normHandle(
        mode === "reverse" 
          ? await read.getLowestAskHandle()
          : await read.getHighestBidHandle()
      );
      const bidderHandle = normHandle(
        mode === "reverse"
          ? await read.getLowestSellerHandle()
          : await read.getHighestBidderHandle()
      );
      const secondHandle =
        mode === "vickrey"
          ? normHandle(await read.getSecondHighestBidHandle())
          : null;

      /* STEP 2 */
      setActiveStep(2);
      const bidResult = await cofheClient
        .decryptForTx(bidHandle)
        .withoutPermit()
        .execute();

      const bidderResult = await cofheClient
        .decryptForTx(bidderHandle)
        .withoutPermit()
        .execute();

      let secondResult: {
        ctHash: bigint | string;
        decryptedValue: bigint;
        signature: `0x${string}`;
      } | null = null;
      if (mode === "vickrey" && secondHandle !== null) {
        secondResult = await cofheClient
          .decryptForTx(secondHandle)
          .withoutPermit()
          .execute();
      }

      const bidPlain = toUint64(bidResult.decryptedValue);
      const bidderPlainAddr = bigintToAddress(bidderResult.decryptedValue);

      /* STEP 3 */
      setActiveStep(3);

      if (mode === "vickrey" && secondResult) {
        const secondPlain = toUint64(secondResult.decryptedValue);
        const tx = await write.revealWinner(
          bidResult.ctHash,
          bidPlain,
          bidResult.signature,
          secondResult.ctHash,
          secondPlain,
          secondResult.signature,
          bidderResult.ctHash,
          bidderPlainAddr,
          bidderResult.signature,
        );
        await tx.wait();
        setWinnerAddr(bidderPlainAddr);
        setWinningBidUsdc(formatUnits(bidPlain, 6));
        setPaymentUsdc(formatUnits(secondPlain, 6));
      } else {
        const tx = await write.revealWinner(
          bidResult.ctHash,
          bidPlain,
          bidResult.signature,
          bidderResult.ctHash,
          bidderPlainAddr,
          bidderResult.signature,
        );
        await tx.wait();
        setWinnerAddr(bidderPlainAddr);
        setWinningBidUsdc(formatUnits(bidPlain, 6));
      }

      setDone(true);
      onRevealSuccess?.();
      setActiveStep(0);
    } catch (e) {
      setActiveStep(0);
      if (isUserRejection(e)) {
        setError("Transaction cancelled");
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setBusy(false);
    }
  };

  if (isZeroAddr(contractAddress)) {
    return null;
  }

  return (
    <div className="space-y-4">
      <ol className="space-y-3">
        {STEPS.map((s) => {
          const reached = done || (activeStep > 0 && s.n <= activeStep);
          const current = activeStep === s.n;
          return (
            <li
              key={s.n}
              className={`flex gap-3 rounded-lg border px-3 py-2 font-label text-xs ${
                current
                  ? "border-[#00FF94]/50 bg-[#00FF94]/5"
                  : reached
                    ? "border-emerald-900/40 bg-emerald-950/20 text-emerald-200/90"
                    : "border-neutral-800 text-neutral-500"
              }`}
            >
              <span
                className={`flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                  reached
                    ? "bg-[#00FF94] text-neutral-950"
                    : "bg-neutral-800 text-neutral-400"
                }`}
              >
                {s.n}
              </span>
              <div>
                <p className="font-semibold text-neutral-200">{s.title}</p>
                <p className="text-[10px] uppercase tracking-wider text-neutral-500">
                  {s.subtitle}
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      {!connected && (
        <p className="font-label text-[11px] text-amber-200/90">
          Connect your wallet so CoFHE can run Threshold decryption with your
          account.
        </p>
      )}

      {mode === "dutch" && (
        <div>
          <label className="block font-label text-[10px] uppercase tracking-wider text-neutral-500">
            Winner address (auctioneer)
          </label>
          <input
            type="text"
            value={dutchWinner}
            onChange={(e) => setDutchWinner(e.target.value)}
            disabled={busy}
            placeholder="0x…"
            className="mt-1 w-full rounded-lg border border-neutral-700 bg-priva-bg px-3 py-2 font-mono text-xs text-white outline-none ring-[#00FF94]/30 focus:ring-2 disabled:opacity-50"
          />
        </div>
      )}

      {error && (
        <p className="font-label text-xs text-red-400">{error}</p>
      )}

      {busy && activeStep >= 1 && activeStep <= 2 && (
        <p className="font-label text-xs text-[#00FF94]/90" aria-live="polite">
          Requesting Threshold Network decryption…
        </p>
      )}

      <button
        type="button"
        disabled={busy}
        onClick={() => void reveal()}
        className="w-full rounded-xl border border-[#00FF94]/50 py-2.5 font-label text-xs font-semibold uppercase tracking-wide text-[#00FF94] hover:bg-[#00FF94]/10 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Working…" : "Reveal Winner"}
      </button>

      {done && winnerAddr && winningBidUsdc && (
        <div className="rounded-xl border border-[#00FF94]/30 bg-[#00FF94]/5 p-4">
          <p className="font-heading text-sm text-white">
            🏆 {mode === "reverse" ? "Winning Vendor" : "Winner"}:{" "}
            <span className="font-mono text-[#00FF94]">
              {truncateAddr(winnerAddr)}
            </span>
          </p>
          <p className="mt-2 font-label text-sm text-neutral-200">
            {mode === "reverse" ? "Winning Ask" : "Winning Bid"}:{" "}
            <span className="text-[#00FF94]">
              {Number(winningBidUsdc).toLocaleString(undefined, {
                maximumFractionDigits: 2,
              })}{" "}
              USDC
            </span>
          </p>
          {mode === "vickrey" && paymentUsdc !== null && (
            <p className="mt-1 font-label text-sm text-neutral-300">
              Payment Amount:{" "}
              <span className="text-sky-300">
                {Number(paymentUsdc).toLocaleString(undefined, {
                  maximumFractionDigits: 2,
                })}{" "}
                USDC
              </span>
            </p>
          )}
          <p className="mt-3 font-label text-[11px] text-neutral-500">
            {mode === "reverse" 
              ? "All competing asks permanently sealed" 
              : "All losing bids permanently sealed"}
          </p>
          
          {paymentStatus === "idle" && (
            <button
              type="button"
              onClick={() => void processPayment()}
              className="mt-4 w-full rounded-xl border border-sky-500/50 py-2.5 font-label text-xs font-semibold uppercase tracking-wide text-sky-400 hover:bg-sky-500/10"
            >
              Process Payment via Reineira
            </button>
          )}
          
          {paymentStatus === "processing" && (
            <div className="mt-4 rounded-lg border border-sky-500/20 bg-sky-500/5 p-3">
              <p className="font-label text-sm text-sky-400">
                Processing confidential payment...
              </p>
            </div>
          )}
          
          {paymentStatus === "complete" && (
            <div className="mt-4 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
              <p className="font-label text-sm text-emerald-400">
                Payment complete ✓ — settled via Reineira
              </p>
            </div>
          )}
          
          {paymentStatus === "error" && paymentError && (
            <div className="mt-4 rounded-lg border border-red-500/20 bg-red-500/5 p-3">
              <p className="font-label text-sm text-red-400">
                Payment failed: {paymentError}
              </p>
              <button
                type="button"
                onClick={() => void processPayment()}
                className="mt-2 rounded-lg border border-red-500/50 px-3 py-1 font-label text-xs text-red-400 hover:bg-red-500/10"
              >
                Retry Payment
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
