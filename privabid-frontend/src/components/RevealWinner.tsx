/**
 * Threshold decrypt + `publishDecryptResult` flow.
 * @cofhe/sdk v0.4 exposes `CofheClient` via `@cofhe/react` (`useCofheClient`) — there is no
 * `createClient(signer)` export; we call `client.connect(publicClient, walletClient)` then
 * `client.decryptForTx(handle).withoutPermit().execute()` like the SDK types describe.
 */
import { useEffect, useMemo, useState } from "react";
import { Contract, formatUnits } from "ethers";
import { getAddress, isAddress as isAddressViem } from "viem";
import {
  useCofheClient,
  useCofheConnection,
  useCofhePublicClient,
  useCofheWalletClient,
} from "@cofhe/react";
import { createBrowserProvider, getReadOnlyRpcProvider } from "../lib/browserProvider";
import { getTrustedMetaMaskProvider } from "../lib/metamask";
import PrivaraSettlement from "./PrivaraSettlement";
import {
  DUTCH_REVEAL_ABI,
  PRIVA_BID_MULTI_REVEAL_ABI,
  PRIVA_BID_V2_REVEAL_ABI,
  REVERSE_STANDALONE_REVEAL_ABI,
  VICKREY_REVEAL_ABI,
} from "../lib/privabidAbis";
import {
  onChainModeToRevealMode,
  resolveRevealTarget,
  type RevealContractKind,
} from "../lib/revealTarget";
import {
  assertRevealPreflight,
  formatRevealError,
  isProofRejected,
  revealTxOverrides,
} from "../lib/revealTx";
import type { RevealWinnerMode } from "../types/auction";

export type { RevealWinnerMode };

const ZERO = "0x0000000000000000000000000000000000000000";
const UINT64_MASK = (1n << 64n) - 1n;

export type RevealWinnerProps = {
  mode: RevealWinnerMode;
  contractAddress: string;
  /**
   * Unix-ms timestamp of when `closeBidding()` confirmed in this session.
   * If provided and < 60 s ago, the component pre-emptively counts down
   * before enabling the Reveal button (CoFHE needs time to authorize).
   */
  closedAt?: number | null;
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

function readAbiForKind(kind: RevealContractKind): readonly string[] {
  switch (kind) {
    case "privabid-v2":
      return PRIVA_BID_V2_REVEAL_ABI;
    case "privabid-multi":
      return PRIVA_BID_MULTI_REVEAL_ABI;
    case "standalone-vickrey":
      return VICKREY_REVEAL_ABI;
    case "standalone-dutch":
      return DUTCH_REVEAL_ABI;
    case "standalone-reverse":
      return REVERSE_STANDALONE_REVEAL_ABI;
  }
}

type CofheClientLike = ReturnType<typeof useCofheClient>;

type DecryptResult = {
  ctHash: bigint | string;
  decryptedValue: bigint;
  signature: `0x${string}`;
};

async function decryptHandle(
  client: CofheClientLike,
  handle: bigint,
  usePermit: boolean,
): Promise<DecryptResult> {
  const req = client.decryptForTx(handle);
  const chain = usePermit ? req.withPermit() : req.withoutPermit();
  return chain.execute() as Promise<DecryptResult>;
}

async function decryptWithFallback(
  client: CofheClientLike,
  handle: bigint,
  preferPermit: boolean,
): Promise<DecryptResult> {
  try {
    return await decryptHandle(client, handle, preferPermit);
  } catch {
    return decryptHandle(client, handle, !preferPermit);
  }
}

function effectiveRevealMode(
  urlMode: RevealWinnerMode,
  target: Awaited<ReturnType<typeof resolveRevealTarget>>,
): RevealWinnerMode {
  if (
    (target.kind === "privabid-multi" || target.kind === "privabid-v2") &&
    target.onChainMode !== undefined
  ) {
    return onChainModeToRevealMode(target.onChainMode);
  }
  if (target.kind === "standalone-reverse") return "reverse";
  if (target.kind === "standalone-dutch") return "dutch";
  if (target.kind === "standalone-vickrey") return "vickrey";
  return urlMode;
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

/** CoFHE needs time to pick up the closed-state ACL update on Arbitrum Sepolia. */
const PROOF_RETRY_DELAY_SEC = 90;

export default function RevealWinner({
  mode,
  contractAddress,
  closedAt,
  onRevealSuccess,
}: RevealWinnerProps) {
  const cofheClient = useCofheClient();
  const { connected } = useCofheConnection();
  const publicClient = useCofhePublicClient();
  const walletClient = useCofheWalletClient();

  const [activeStep, setActiveStep] = useState<0 | 1 | 2 | 3>(0);
  const [busy, setBusy] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  /** Seconds remaining before Reveal is re-enabled after a proof rejection. */
  const [retryIn, setRetryIn] = useState(0);

  // Pre-emptive delay: if the auction closed in this session, schedule the
  // countdown to start asynchronously so the setState is inside a callback.
  useEffect(() => {
    if (closedAt == null) return;
    const elapsed = Math.floor((Date.now() - closedAt) / 1000);
    const remaining = Math.max(0, PROOF_RETRY_DELAY_SEC - elapsed);
    if (remaining <= 0) return;
    const id = window.setTimeout(() => setRetryIn(remaining), 0);
    return () => window.clearTimeout(id);
  }, [closedAt]);

  // Countdown tick — re-runs each second while retryIn > 0.
  useEffect(() => {
    if (retryIn <= 0) return;
    const id = window.setInterval(
      () => setRetryIn((n) => Math.max(0, n - 1)),
      1000,
    );
    return () => window.clearInterval(id);
  }, [retryIn]);

  const [dutchWinner, setDutchWinner] = useState("");
  const [winnerAddr, setWinnerAddr] = useState<string | null>(null);
  const [winningBidUsdc, setWinningBidUsdc] = useState<string | null>(null);
  const [paymentUsdc, setPaymentUsdc] = useState<string | null>(null);
  const readProvider = useMemo(() => getReadOnlyRpcProvider(), []);

  const reveal = async () => {
    setError(null);
    setDone(false);
    setConnecting(false);
    setRetryIn(0);
    setWinnerAddr(null);
    setWinningBidUsdc(null);
    setPaymentUsdc(null);

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
      // Always reconnect — a session opened before closeBidding() won't have
      // the updated ACL that CoFHE sets after the auction closes.
      setConnecting(true);
      await cofheClient.connect(
        publicClient as Parameters<typeof cofheClient.connect>[0],
        walletClient as Parameters<typeof cofheClient.connect>[1],
      );
      setConnecting(false);
      if (!cofheClient.connected) {
        throw new Error(
          "CoFHE did not connect — ensure your wallet is on Arbitrum Sepolia and try again.",
        );
      }

      const target = await resolveRevealTarget(contractAddress);
      const revealMode = effectiveRevealMode(mode, target);
      const abi = readAbiForKind(target.kind);

      const read = new Contract(contractAddress, abi, readProvider) as Contract;
      const browser = createBrowserProvider(mm);
      const signer = await browser.getSigner();
      const write = new Contract(contractAddress, abi, signer) as Contract;
      const txOpts = await revealTxOverrides();

      await assertRevealPreflight(read, {
        kind: revealMode === "reverse" ? "asks" : "bids",
        skipCount: revealMode === "dutch",
      });

      /* ─── STEP 1: read handles ─── */
      setActiveStep(1);

      if (revealMode === "dutch") {
        const w = dutchWinner.trim();
        if (!isAddressViem(w as `0x${string}`)) {
          throw new Error("Enter a valid winner Ethereum address for Dutch reveal.");
        }
        const winner = getAddress(w as `0x${string}`);
        const hasThr = (await read.hasThreshold(winner)) as boolean;
        if (!hasThr) {
          throw new Error("That address has no sealed threshold on this auction.");
        }
        const thresholdHandle = normHandle(
          await read.getDutchThresholdHandle(winner),
        );

        try {
          const authTx = await write.authorizeDutchWinnerReveal(winner, txOpts);
          await authTx.wait();
          await cofheClient.connect(
            publicClient as Parameters<typeof cofheClient.connect>[0],
            walletClient as Parameters<typeof cofheClient.connect>[1],
          );
          await new Promise((r) => setTimeout(r, 4000));
        } catch {
          /* Older contracts without authorizeDutchWinnerReveal — try permit decrypt */
        }

        setActiveStep(2);
        const thresholdResult = await decryptWithFallback(
          cofheClient,
          thresholdHandle,
          false,
        );

        setActiveStep(3);
        const thresholdPlain = toUint64(thresholdResult.decryptedValue);

        if (target.kind === "privabid-multi" || target.kind === "privabid-v2") {
          const tx = await write.revealDutchWinner(
            winner,
            thresholdHandle,
            thresholdPlain,
            thresholdResult.signature,
            txOpts,
          );
          await tx.wait();
        } else {
          const tx = await write.revealWinner(
            winner,
            thresholdHandle,
            thresholdPlain,
            thresholdResult.signature,
            txOpts,
          );
          await tx.wait();
        }

        setWinnerAddr(winner);
        setWinningBidUsdc(formatUnits(thresholdPlain, 6));
        setDone(true);
        onRevealSuccess?.();
        setActiveStep(0);
        return;
      }

      const isReverse = revealMode === "reverse";
      const valueHandle = normHandle(
        isReverse
          ? await read.getLowestAskHandle()
          : await read.getHighestBidHandle(),
      );
      const partyHandle = normHandle(
        isReverse
          ? await read.getLowestSellerHandle()
          : await read.getHighestBidderHandle(),
      );
      const secondHandle =
        revealMode === "vickrey"
          ? normHandle(await read.getSecondHighestBidHandle())
          : null;

      setActiveStep(2);
      const preferPermit = false; // dutch is handled above via early return
      const valueResult = await decryptWithFallback(
        cofheClient,
        valueHandle,
        preferPermit,
      );

      const partyResult = await decryptWithFallback(
        cofheClient,
        partyHandle,
        preferPermit,
      );

      let secondResult: DecryptResult | null = null;
      if (revealMode === "vickrey" && secondHandle !== null) {
        secondResult = await decryptWithFallback(
          cofheClient,
          secondHandle,
          false,
        );
      }

      const valuePlain = toUint64(valueResult.decryptedValue);
      const partyPlainAddr = bigintToAddress(partyResult.decryptedValue);

      let reserveHandle = 0n;
      let reservePlain = 0n;
      let reserveSig = "0x" as `0x${string}`;

      if (target.kind === "privabid-v2" && target.useEncryptedReserve) {
        const rh = normHandle(await read.getReserveMetHandle());
        const reserveResult = await decryptWithFallback(
          cofheClient,
          rh,
          false,
        );
        reservePlain = toUint64(reserveResult.decryptedValue);
        if (reservePlain !== 1n) {
          throw new Error(
            "Sealed reserve not met — winning bid does not satisfy the encrypted floor.",
          );
        }
        reserveHandle = rh;
        reserveSig = reserveResult.signature;
      }

      setActiveStep(3);

      if (target.kind === "standalone-reverse") {
        const tx = await write.revealWinner(
          valuePlain,
          valueResult.signature,
          partyPlainAddr,
          partyResult.signature,
          txOpts,
        );
        await tx.wait();
        setWinnerAddr(partyPlainAddr);
        setWinningBidUsdc(formatUnits(valuePlain, 6));
      } else if (revealMode === "vickrey" && secondResult) {
        const secondPlain = toUint64(secondResult.decryptedValue);

        if (target.kind === "privabid-v2") {
          const tx = await write.revealVickreyWinner(
            {
              bidCtHash: valueHandle,
              bidPlaintext: valuePlain,
              bidSignature: valueResult.signature,
              secondBidCtHash: secondHandle,
              secondBidPlaintext: secondPlain,
              secondBidSignature: secondResult.signature,
              bidderCtHash: partyHandle,
              bidderPlaintext: partyPlainAddr,
              bidderSignature: partyResult.signature,
              reserveCheckCtHash: reserveHandle,
              reserveCheckPlaintext: reservePlain,
              reserveCheckSignature: reserveSig,
            },
            txOpts,
          );
          await tx.wait();
        } else if (target.kind === "privabid-multi") {
          const tx = await write.revealVickreyWinner(
            valueHandle,
            valuePlain,
            valueResult.signature,
            secondHandle,
            secondPlain,
            secondResult.signature,
            partyHandle,
            partyPlainAddr,
            partyResult.signature,
            txOpts,
          );
          await tx.wait();
        } else {
          const tx = await write.revealWinner(
            valueHandle,
            valuePlain,
            valueResult.signature,
            secondHandle,
            secondPlain,
            secondResult.signature,
            partyHandle,
            partyPlainAddr,
            partyResult.signature,
            txOpts,
          );
          await tx.wait();
        }
        setWinnerAddr(partyPlainAddr);
        setWinningBidUsdc(formatUnits(valuePlain, 6));
        setPaymentUsdc(formatUnits(secondPlain, 6));
      } else if (target.kind === "privabid-v2") {
        const tx = await write.revealWinner(
          {
            bidCtHash: valueHandle,
            bidPlaintext: valuePlain,
            bidSignature: valueResult.signature,
            bidderCtHash: partyHandle,
            bidderPlaintext: partyPlainAddr,
            bidderSignature: partyResult.signature,
            reserveCheckCtHash: reserveHandle,
            reserveCheckPlaintext: reservePlain,
            reserveCheckSignature: reserveSig,
          },
          txOpts,
        );
        await tx.wait();
        setWinnerAddr(partyPlainAddr);
        setWinningBidUsdc(formatUnits(valuePlain, 6));
      } else {
        const tx = await write.revealWinner(
          valueHandle,
          valuePlain,
          valueResult.signature,
          partyHandle,
          partyPlainAddr,
          partyResult.signature,
          txOpts,
        );
        await tx.wait();
        setWinnerAddr(partyPlainAddr);
        setWinningBidUsdc(formatUnits(valuePlain, 6));
      }

      setDone(true);
      onRevealSuccess?.();
      setActiveStep(0);
    } catch (e) {
      setActiveStep(0);
      setConnecting(false);
      if (isUserRejection(e)) {
        setError("Transaction cancelled");
      } else {
        setError(formatRevealError(e));
        if (isProofRejected(e)) {
          setRetryIn(PROOF_RETRY_DELAY_SEC);
        }
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

      {retryIn > 0 && (
        <p className="font-label text-[11px] text-amber-200/90" aria-live="polite">
          CoFHE is authorizing decryption — retry in {retryIn}s…
        </p>
      )}

      {connecting && (
        <p className="font-label text-xs text-[#00FF94]/90" aria-live="polite">
          Connecting to CoFHE on Arbitrum Sepolia…
        </p>
      )}

      {busy && !connecting && activeStep >= 1 && activeStep <= 2 && (
        <p className="font-label text-xs text-[#00FF94]/90" aria-live="polite">
          Requesting Threshold Network decryption…
        </p>
      )}

      <button
        type="button"
        disabled={busy || retryIn > 0}
        onClick={() => void reveal()}
        className="w-full rounded-xl border border-[#00FF94]/50 py-2.5 font-label text-xs font-semibold uppercase tracking-wide text-[#00FF94] hover:bg-[#00FF94]/10 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Working…" : retryIn > 0 ? `Retry in ${retryIn}s` : "Reveal Winner"}
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

          <PrivaraSettlement
            className="mt-4"
            recipient={winnerAddr}
            amountUsdc={winningBidUsdc}
            paymentAmountUsdc={paymentUsdc}
          />
        </div>
      )}
    </div>
  );
}
