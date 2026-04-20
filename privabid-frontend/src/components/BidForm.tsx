import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Contract, formatUnits, parseUnits } from "ethers";
import { useAccount, useChainId } from "wagmi";
import { CHAIN_ID } from "../config/contracts";
import {
  createBrowserProvider,
  getReadOnlyRpcProvider,
} from "../lib/browserProvider";
import {
  ensureArbitrumSepoliaInMetaMask,
  getTrustedMetaMaskProvider,
} from "../lib/metamask";

const UINT64_MAX = 18446744073709551615n;

const BIDFORM_READ_ABI = [
  "function reservePrice() view returns (uint64)",
  "function floorPrice() view returns (uint64)",
] as const;

const BIDFORM_WRITE_ABI = [
  "function bid(uint64 amount)",
  "function setThreshold(uint64 threshold)",
] as const;

/** Standalone PrivaBidDutch — preflight before `setThreshold` (avoids opaque L2 estimateGas). */
const DUTCH_PREFLIGHT_ABI = [
  "function auctionClosed() view returns (bool)",
  "function hasThreshold(address bidder) view returns (bool)",
] as const;

export type BidFormMode = "first-price" | "vickrey" | "dutch";

export type BidFormProps = {
  mode: BidFormMode;
  contractAddress: string;
  onBidSuccess: () => void;
};

function isUserRejection(e: unknown): boolean {
  const err = e as {
    code?: string | number;
    message?: string;
    shortMessage?: string;
    info?: { error?: { code?: number } };
  };
  const code = err?.code;
  if (code === "ACTION_REJECTED" || code === 4001) return true;
  if (err?.info?.error?.code === 4001) return true;
  const msg = `${err?.shortMessage ?? ""} ${err?.message ?? ""}`.toLowerCase();
  return (
    msg.includes("user rejected") ||
    msg.includes("user denied") ||
    msg.includes("rejected the request")
  );
}

function isBelowReserveError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return (
    msg.includes("BelowReservePrice") ||
    msg.includes("Below reserve") ||
    msg.includes("below reserve")
  );
}

/** FHE `setThreshold` often breaks wallet `eth_estimateGas` on Arbitrum Sepolia; a cap skips it. */
const DUTCH_SET_THRESHOLD_GAS = 4_000_000n;

function formatBidTxError(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function formatUsdc6(value: bigint): string {
  const s = formatUnits(value, 6);
  const n = Number(s);
  if (!Number.isFinite(n)) return s;
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function reserveViolationMessage(
  reserveMicro: bigint | null,
  mode: BidFormMode,
): string {
  if (mode !== "dutch") {
    return "Minimum bid is 1";
  }
  if (reserveMicro === 1_000_000n) {
    return "Minimum threshold is 1 USDC";
  }
  if (reserveMicro !== null && reserveMicro > 0n) {
    const f = formatUsdc6(reserveMicro);
    return `Threshold must be at least ${f} USDC (floor price).`;
  }
  return "Threshold must meet the floor price.";
}

export default function BidForm({
  mode,
  contractAddress,
  onBidSuccess,
}: BidFormProps) {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const [networkPrompting, setNetworkPrompting] = useState(false);

  const [amountInput, setAmountInput] = useState("");
  const [reserveMicro, setReserveMicro] = useState<bigint | null>(null);
  const [phase, setPhase] = useState<
    "idle" | "working" | "success" | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorTone, setErrorTone] = useState<
    "reject" | "reserve" | "raw" | null
  >(null);
  const [successHint, setSuccessHint] = useState<string | null>(null);

  const readProvider = useMemo(() => getReadOnlyRpcProvider(), []);

  const wrongChain = isConnected && chainId !== CHAIN_ID;

  const [trustedMetaMaskOk, setTrustedMetaMaskOk] = useState<boolean | null>(
    null,
  );
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const p = await getTrustedMetaMaskProvider();
      if (!cancelled) setTrustedMetaMaskOk(p !== null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const metamaskMissing = trustedMetaMaskOk === false;

  const loadReserve = useCallback(async () => {
    if (!contractAddress || contractAddress.length < 10) {
      setReserveMicro(null);
      return;
    }
    try {
      const read = new Contract(
        contractAddress,
        BIDFORM_READ_ABI,
        readProvider,
      ) as Contract;
      const raw =
        mode === "dutch"
          ? await read.floorPrice()
          : await read.reservePrice();
      setReserveMicro(BigInt(raw.toString()));
    } catch {
      setReserveMicro(null);
    }
  }, [contractAddress, mode, readProvider]);

  useEffect(() => {
    startTransition(() => {
      void loadReserve();
    });
  }, [loadReserve]);

  const parseAmountMicro = (raw: string): bigint => {
    const trimmed = raw.trim().replace(/,/g, "");
    if (!trimmed || Number.isNaN(Number(trimmed))) {
      throw new Error("Enter a valid amount.");
    }
    return parseUnits(trimmed, 6);
  };

  const submit = async () => {
    setErrorMessage(null);
    setErrorTone(null);
    setSuccessHint(null);

    if (!isConnected) {
      setPhase("error");
      setErrorTone("raw");
      setErrorMessage("Connect your wallet first");
      return;
    }

    const mm = await getTrustedMetaMaskProvider();
    if (!mm) {
      setPhase("error");
      setErrorTone("raw");
      setErrorMessage("Please install MetaMask to place a bid");
      return;
    }

    let micro: bigint;
    try {
      micro = parseAmountMicro(amountInput);
    } catch (e) {
      setPhase("error");
      setErrorTone("raw");
      setErrorMessage(e instanceof Error ? e.message : "Invalid amount.");
      return;
    }

    if (micro <= 0n) {
      setPhase("error");
      setErrorTone("raw");
      setErrorMessage("Amount must be greater than zero.");
      return;
    }
    if (mode !== "dutch" && micro < 1_000_000n) {
      setPhase("error");
      setErrorTone("reserve");
      setErrorMessage("Minimum bid is 1");
      return;
    }
    if (micro > UINT64_MAX) {
      setPhase("error");
      setErrorTone("raw");
      setErrorMessage("Amount is too large for this contract.");
      return;
    }

    if (reserveMicro !== null && micro < reserveMicro) {
      setPhase("error");
      setErrorTone("reserve");
      setErrorMessage(reserveViolationMessage(reserveMicro, mode));
      return;
    }

    try {
      setNetworkPrompting(true);
      try {
        await ensureArbitrumSepoliaInMetaMask(mm);
      } catch (netErr) {
        setPhase("idle");
        if (isUserRejection(netErr)) {
          setErrorTone("reject");
          setErrorMessage("Transaction cancelled");
        } else {
          setErrorTone("raw");
          setErrorMessage(
            netErr instanceof Error ? netErr.message : String(netErr),
          );
        }
        return;
      } finally {
        setNetworkPrompting(false);
      }

      const browser = createBrowserProvider(mm);
      const signer = await browser.getSigner();
      const me = await signer.getAddress();

      if (mode === "dutch") {
        const pre = new Contract(
          contractAddress,
          DUTCH_PREFLIGHT_ABI,
          readProvider,
        ) as Contract;
        const [closed, already] = await Promise.all([
          pre.auctionClosed() as Promise<boolean>,
          pre.hasThreshold(me) as Promise<boolean>,
        ]);
        if (closed) {
          setPhase("idle");
          setErrorTone("raw");
          setErrorMessage(
            "This auction is already closed — you cannot set a threshold.",
          );
          return;
        }
        if (already) {
          setPhase("idle");
          setErrorTone("raw");
          setErrorMessage(
            "This wallet already sealed a threshold for this Dutch auction. Each address may only set it once.",
          );
          return;
        }
      }

      setPhase("working");

      const contract = new Contract(
        contractAddress,
        BIDFORM_WRITE_ABI,
        signer,
      );

      if (mode === "dutch") {
        const tx = await (contract as Contract).setThreshold(micro, {
          gasLimit: DUTCH_SET_THRESHOLD_GAS,
        });
        await tx.wait();
        setPhase("success");
        setSuccessHint(
          "You will win automatically if price reaches your floor.",
        );
      } else {
        const tx = await (contract as Contract).bid(micro);
        await tx.wait();
        setPhase("success");
        setSuccessHint(
          "Your bid is encrypted.\nNo one can see your amount.",
        );
      }

      setAmountInput("");
      onBidSuccess();
    } catch (e) {
      setPhase("idle");
      if (isUserRejection(e)) {
        setErrorTone("reject");
        setErrorMessage("Transaction cancelled");
        return;
      }
      if (isBelowReserveError(e)) {
        setErrorTone("reserve");
        setErrorMessage(reserveViolationMessage(reserveMicro, mode));
        return;
      }
      setErrorTone("raw");
      setErrorMessage(formatBidTxError(e));
    }
  };

  const isDutch = mode === "dutch";
  const minLabel =
    reserveMicro !== null
      ? `Minimum: ${formatUsdc6(reserveMicro)} USDC`
      : "Minimum: …";

  return (
    <div className="space-y-3">
      {!isConnected && (
        <p className="font-label text-xs text-amber-200/90">
          Connect your wallet first
        </p>
      )}

      {metamaskMissing && (
        <div className="rounded-lg border border-red-500/40 bg-red-950/30 p-3">
          <p className="font-label text-xs text-red-200/95">
            Please install MetaMask to place a bid.{" "}
            <a
              href="https://metamask.io"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-[#00FF94] underline underline-offset-2 hover:text-[#00FF94]/90"
            >
              metamask.io
            </a>
          </p>
        </div>
      )}

      {isConnected && !metamaskMissing && wrongChain && (
        <p className="font-label text-[11px] text-amber-200/85">
          Wrong network — submit will open MetaMask to add or switch to
          Arbitrum Sepolia.
        </p>
      )}

      <label className="block font-label text-[10px] uppercase tracking-wider text-neutral-500">
        {isDutch ? "Your Price Floor (USDC)" : "Your Bid (USDC)"}
      </label>
      <input
        type="text"
        inputMode="decimal"
        value={amountInput}
        onChange={(e) => {
          setAmountInput(e.target.value);
          if (phase === "error" || phase === "success") setPhase("idle");
          setErrorMessage(null);
          setSuccessHint(null);
          setErrorTone(null);
        }}
        disabled={
          phase === "working" ||
          networkPrompting ||
          !isConnected ||
          metamaskMissing ||
          trustedMetaMaskOk !== true
        }
        placeholder="0.00"
        className="w-full rounded-lg border border-neutral-700 bg-priva-bg px-3 py-2 font-label text-sm text-white outline-none ring-[#00FF94]/30 focus:ring-2 disabled:opacity-50"
      />
      <p className="font-label text-[11px] text-neutral-500">{minLabel}</p>

      {isDutch && (
        <p className="font-label text-xs leading-relaxed text-neutral-400">
          Set the lowest price you will accept. You win automatically when
          price reaches your floor.
        </p>
      )}

      {(phase === "working" || networkPrompting) && (
        <p className="font-label text-xs text-[#00FF94]">
          {networkPrompting
            ? "Confirm network in MetaMask…"
            : isDutch
              ? "Encrypting threshold..."
              : "Encrypting bid..."}
        </p>
      )}

      {phase === "success" && (
        <p className="font-label text-xs text-emerald-400">
          {isDutch ? "Threshold sealed ✓" : "Bid sealed on-chain ✓"}
        </p>
      )}

      {successHint && phase === "success" && (
        <p className="whitespace-pre-line font-label text-[11px] leading-relaxed text-neutral-400">
          {successHint}
        </p>
      )}

      {errorMessage && (
        <p
          className={`font-label text-xs ${
            errorTone === "reject" || errorTone === "reserve"
              ? "text-amber-200/90"
              : "text-red-400"
          }`}
        >
          {errorMessage}
        </p>
      )}

      <button
        type="button"
        disabled={
          phase === "working" ||
          networkPrompting ||
          !isConnected ||
          metamaskMissing ||
          trustedMetaMaskOk !== true
        }
        onClick={() => void submit()}
        className="w-full rounded-xl bg-[#00FF94] py-2.5 font-label text-xs font-semibold uppercase tracking-wide text-neutral-950 hover:bg-[#00FF94]/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isDutch ? "Set Encrypted Threshold" : "Submit Encrypted Bid"}
      </button>
    </div>
  );
}
