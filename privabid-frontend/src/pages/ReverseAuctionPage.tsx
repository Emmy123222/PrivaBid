import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Contract, formatUnits, isAddress } from "ethers";
import { Link, useLocation } from "react-router-dom";
import BidForm from "../components/BidForm";
import CloseAuctionPanel from "../components/CloseAuctionPanel";
import NetworkGateBanner from "../components/NetworkGateBanner";
import RevealWinner from "../components/RevealWinner";
import { getReadOnlyRpcProvider } from "../lib/browserProvider";
import { FIRST_PRICE_REVEAL_ABI } from "../lib/privabidAbis";

const ZERO = "0x0000000000000000000000000000000000000000";

// Use the deployed PrivaBidReverse contract address
const REVERSE_CONTRACT_ADDRESS = "0x291DD038A12eD7eaaB383751cA4841e6D1B3434b";

type LifecycleStatus = "ACTIVE" | "CLOSED" | "REVEALED";

type FeedRow = {
  id: string;
  wallet: string;
  timestamp: number;
  kind: "ask";
  totalAsksNow?: bigint;
};

type AuctionSnapshot = {
  itemName: string;
  timeRemainingSec: bigint;
  totalAsks: bigint;
  status: LifecycleStatus;
  winningVendor: string;
  winningAsk: bigint;
  budgetCeiling: bigint;
  auctionEndTime: bigint;
  auctionClosed: boolean;
  winnerRevealed: boolean;
};

function truncateAddr(a: string): string {
  if (!a || a.length < 10) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function formatBudgetUsdc6(micro: bigint): string {
  if (micro <= 0n) return "—";
  const n = Number(formatUnits(micro, 6));
  if (!Number.isFinite(n)) return `${micro} (μUSDC)`;
  return `${n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  })} USDC`;
}

function formatCountdown(sec: bigint): string {
  if (sec <= 0n) return "0s";
  const s = Number(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}h ${m}m ${r}s`;
  if (m > 0) return `${m}m ${r}s`;
  return `${r}s`;
}

function deriveStatus(closed: boolean, revealed: boolean): LifecycleStatus {
  if (revealed) return "REVEALED";
  if (closed) return "CLOSED";
  return "ACTIVE";
}

function statusBadgeClass(s: LifecycleStatus): string {
  if (s === "ACTIVE")
    return "border-emerald-500/50 bg-emerald-500/10 text-emerald-400";
  if (s === "CLOSED") return "border-amber-500/50 bg-amber-500/10 text-amber-300";
  return "border-sky-500/50 bg-sky-500/10 text-sky-300";
}

function arbiscanUrl(address: string): string {
  return `https://sepolia.arbiscan.io/address/${address}`;
}

function isZeroAddress(a: string): boolean {
  if (!a) return true;
  return a.toLowerCase() === ZERO;
}

export default function ReverseAuctionPage() {
  const location = useLocation();
  const address = REVERSE_CONTRACT_ADDRESS;

  const readProvider = useMemo(() => getReadOnlyRpcProvider(), []);

  const readContract = useMemo(() => {
    if (isZeroAddress(address)) return null;
    return new Contract(address, FIRST_PRICE_REVEAL_ABI, readProvider);
  }, [address, readProvider]);

  const [snapshot, setSnapshot] = useState<AuctionSnapshot | null>(null);
  const [buyerAddr, setBuyerAddr] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feed, setFeed] = useState<FeedRow[]>([]);
  const [nowTick, setNowTick] = useState(() => Date.now());

  const fetchState = useCallback(async () => {
    if (!readContract || isZeroAddress(address)) {
      setSnapshot(null);
      setBuyerAddr(null);
      return;
    }
    setLoadError(null);
    try {
      const c = readContract as Contract;
      const [
        itemName,
        budgetCeiling,
        timeRemainingSec,
        totalAsks,
        auctionClosed,
        winnerRevealed,
        winningVendor,
        winningAsk,
      ] = await Promise.all([
        c.itemName(),
        c.budgetCeiling(),
        c.timeRemaining(),
        c.totalAsks(),
        c.auctionClosed(),
        c.winnerRevealed(),
        c.winningVendor(),
        c.winningAsk(),
      ]);
      
      setSnapshot({
        itemName: itemName as string,
        timeRemainingSec: timeRemainingSec as bigint,
        totalAsks: totalAsks as bigint,
        status: deriveStatus(
          auctionClosed as boolean,
          winnerRevealed as boolean,
        ),
        winningVendor: winningVendor as string,
        winningAsk: winningAsk as bigint,
        budgetCeiling: BigInt(budgetCeiling.toString()),
        auctionEndTime: 0n,
        auctionClosed: auctionClosed as boolean,
        winnerRevealed: winnerRevealed as boolean,
      });
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load auction");
      setSnapshot(null);
    } finally {
      if (readContract && !isZeroAddress(address)) {
        try {
          const buyer = (await (readContract as Contract).buyer()) as string;
          setBuyerAddr(buyer);
        } catch {
          setBuyerAddr(null);
        }
      }
    }
  }, [address, readContract]);

  const hydrateFeedFromLogs = useCallback(async () => {
    if (!readContract || isZeroAddress(address)) return;
    try {
      const latest = await readProvider.getBlockNumber();
      const from = latest > 15_000 ? latest - 15_000 : 0;

      const filter = readContract.filters.AskSubmitted();
      const logs = await readContract.queryFilter(filter, from, latest);
      const rows: FeedRow[] = [];
      for (const log of logs) {
        const parsed = readContract.interface.parseLog(log);
        if (!parsed || parsed.name !== "AskSubmitted") continue;
        const vendor = parsed.args[0] as string;
        const ts = parsed.args[1] as bigint;
        const totalAsksNow = parsed.args[2] as bigint;
        rows.push({
          id: `${log.transactionHash}-${log.index}`,
          wallet: vendor,
          timestamp: Number(ts),
          kind: "ask",
          totalAsksNow,
        });
      }
      setFeed((prev) => {
        const seen = new Set(prev.map((r) => r.id));
        const merged = [...prev];
        for (const r of rows) {
          if (!seen.has(r.id)) merged.push(r);
        }
        return merged.sort((a, b) => b.timestamp - a.timestamp);
      });
    } catch {
      /* ignore log hydration errors */
    }
  }, [address, readContract, readProvider]);

  useEffect(() => {
    startTransition(() => {
      void fetchState();
      void hydrateFeedFromLogs();
    });
    const id = window.setInterval(() => {
      startTransition(() => {
        void fetchState();
        void hydrateFeedFromLogs();
      });
    }, 15_000);
    return () => window.clearInterval(id);
  }, [fetchState, hydrateFeedFromLogs]);

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const canSubmitAsk =
    snapshot?.status === "ACTIVE" && snapshot.timeRemainingSec > 0n;

  useEffect(() => {
    if (location.hash !== "#submit-your-ask") return;
    if (!canSubmitAsk || snapshot?.status !== "ACTIVE") return;
    const id = window.setTimeout(() => {
      document.getElementById("submit-your-ask")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 150);
    return () => window.clearTimeout(id);
  }, [canSubmitAsk, location.hash, snapshot?.status]);

  const countdownLabel = snapshot ? formatCountdown(snapshot.timeRemainingSec) : "—";

  if (isZeroAddress(address)) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-10">
        <Link
          to="/home"
          className="font-label text-xs uppercase tracking-wider text-[#00FF94]/90 hover:text-[#00FF94]"
        >
          ← Back to modes
        </Link>
        <h1 className="mt-6 font-heading text-2xl font-bold text-white">
          Reverse Auction (Procurement)
        </h1>
        <p className="mt-4 font-label text-sm text-amber-200/90">
          No contract is configured for this mode yet.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Link
        to="/home"
        className="font-label text-xs uppercase tracking-wider text-[#00FF94]/90 hover:text-[#00FF94]"
      >
        ← Back to modes
      </Link>

      {loadError && (
        <p className="mt-4 font-label text-sm text-red-400">{loadError}</p>
      )}

      <NetworkGateBanner />

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="space-y-8">
          {/* 1. Auction header */}
          <section className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="font-label text-[10px] uppercase tracking-[0.2em] text-neutral-500">
                  Procurement Item
                </p>
                <h1 className="mt-1 font-heading text-2xl font-bold text-white md:text-3xl">
                  {snapshot?.itemName ?? "…"}
                </h1>
              </div>
              <span className="rounded-full border border-[#00FF94]/35 bg-[#00FF94]/10 px-3 py-1 font-label text-[10px] font-semibold uppercase tracking-wider text-[#00FF94]">
                Reverse Auction
              </span>
            </div>

            <dl className="mt-6 grid gap-4 font-label text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-neutral-800/80 bg-priva-bg/80 p-4">
                <dt className="text-[10px] uppercase tracking-wider text-neutral-500">
                  Budget ceiling
                </dt>
                <dd className="mt-1 text-lg text-white">
                  {snapshot
                    ? formatBudgetUsdc6(snapshot.budgetCeiling)
                    : "…"}
                </dd>
              </div>
              <div className="rounded-xl border border-neutral-800/80 bg-priva-bg/80 p-4">
                <dt className="text-[10px] uppercase tracking-wider text-neutral-500">
                  Time remaining
                </dt>
                <dd className="mt-1 text-lg text-[#00FF94]">
                  {snapshot ? countdownLabel : "…"}
                </dd>
                {snapshot && snapshot.timeRemainingSec > 0n && (
                  <dd className="mt-1 text-[10px] text-neutral-600">
                    tick {new Date(nowTick).toLocaleTimeString()}
                  </dd>
                )}
              </div>
              <div className="rounded-xl border border-neutral-800/80 bg-priva-bg/80 p-4">
                <dt className="text-[10px] uppercase tracking-wider text-neutral-500">
                  Vendors
                </dt>
                <dd className="mt-1 text-lg text-white">
                  {snapshot ? String(snapshot.totalAsks) : "…"}
                </dd>
              </div>
              <div className="rounded-xl border border-neutral-800/80 bg-priva-bg/80 p-4">
                <dt className="text-[10px] uppercase tracking-wider text-neutral-500">
                  Status
                </dt>
                <dd className="mt-2">
                  {snapshot ? (
                    <span
                      className={`inline-block rounded-lg border px-3 py-1 font-label text-xs font-semibold uppercase tracking-wide ${statusBadgeClass(snapshot.status)}`}
                    >
                      {snapshot.status}
                    </span>
                  ) : (
                    "…"
                  )}
                </dd>
              </div>
            </dl>

            <div className="mt-6 rounded-xl border border-neutral-800/80 bg-priva-bg/80 p-4">
              <p className="font-label text-[10px] uppercase tracking-wider text-neutral-500">
                Current Lowest Ask
              </p>
              <p className="mt-1 text-lg text-[#00FF94]">🔒 Encrypted</p>
              <p className="mt-1 font-label text-[11px] text-neutral-500">
                No vendor can see competing asks
              </p>
            </div>

            <a
              href={arbiscanUrl(address)}
              target="_blank"
              rel="noreferrer"
              className="mt-6 inline-block font-label text-xs text-[#00FF94] hover:underline"
            >
              Contract on Arbiscan
            </a>
          </section>

          {/* 2. Ask activity feed */}
          <section className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-6">
            <h2 className="font-heading text-lg font-semibold text-white">
              Ask activity
            </h2>
            <p className="mt-1 font-label text-xs text-neutral-500">
              Live via <code className="text-neutral-400">contract.on</code> ·
              amounts stay encrypted on-chain
            </p>
            
            <div className="mt-4 grid grid-cols-3 gap-4 border-b border-neutral-800 pb-2 font-label text-[10px] uppercase tracking-wider text-neutral-500">
              <div>Vendor</div>
              <div>Time</div>
              <div>Ask Price</div>
            </div>
            
            <ul className="divide-y divide-neutral-800/90">
              {feed.length === 0 ? (
                <li className="py-8 text-center font-label text-sm text-neutral-500">
                  No asks submitted yet.
                </li>
              ) : (
                feed.map((row) => (
                  <li
                    key={row.id}
                    className="grid grid-cols-3 gap-4 py-3 font-label text-sm"
                  >
                    <span className="text-neutral-300">
                      {truncateAddr(row.wallet)}
                    </span>
                    <span className="text-neutral-500">
                      {new Date(row.timestamp * 1000).toLocaleString()}
                    </span>
                    <span className="text-[#00FF94]/90">🔒 Encrypted</span>
                  </li>
                ))
              )}
            </ul>
          </section>
        </div>

        <div className="space-y-6">
          {/* 3. Action panel */}
          <section className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-5">
            <h2 className="font-heading text-base font-semibold text-white">
              Actions
            </h2>
            <p className="mt-1 font-label text-[11px] leading-relaxed text-neutral-500">
              Submit your encrypted ask here. Only the buyer can see the winning ask after reveal.
            </p>

            {snapshot?.status === "ACTIVE" && (
              <div className="mt-4 space-y-3">
                <CloseAuctionPanel
                  contractAddress={address}
                  auctioneer={buyerAddr}
                  canClose={snapshot.status === "ACTIVE" && !snapshot.auctionClosed}
                  onClosed={() => {
                    void fetchState();
                    void hydrateFeedFromLogs();
                  }}
                />
                {canSubmitAsk ? (
                  <div
                    id="submit-your-ask"
                    className="scroll-mt-24 rounded-xl border border-[#00FF94]/20 bg-priva-bg/50 p-4"
                  >
                    <h3 className="font-heading text-sm font-semibold text-white">
                      Submit Your Ask
                    </h3>
                    <p className="mt-1 font-label text-[11px] text-neutral-500">
                      Submit the lowest price you will accept. No vendor can see competing asks.
                    </p>
                    <div className="mt-4">
                      <BidForm
                        mode="reverse"
                        contractAddress={address}
                        onBidSuccess={() => {
                          void fetchState();
                          void hydrateFeedFromLogs();
                        }}
                      />
                    </div>
                  </div>
                ) : (
                  <p className="font-label text-[10px] text-amber-400/90">
                    Ask submission window ended — wait for close.
                  </p>
                )}
              </div>
            )}

            {snapshot?.status === "CLOSED" && (
              <div className="mt-4">
                <p className="font-label text-xs text-neutral-400">
                  Auction closed. Run Threshold decryption, then publish the
                  winner on-chain.
                </p>
                <div className="mt-4">
                  <RevealWinner
                    mode="reverse"
                    contractAddress={address}
                    onRevealSuccess={() => {
                      void fetchState();
                      void hydrateFeedFromLogs();
                    }}
                  />
                </div>
              </div>
            )}

            {snapshot?.status === "REVEALED" && (
              <div className="mt-4 rounded-xl border border-[#00FF94]/25 bg-[#00FF94]/5 p-4">
                <p className="font-label text-[10px] uppercase tracking-wider text-[#00FF94]">
                  🏆 Winning Vendor
                </p>
                <p className="mt-2 break-all font-mono text-sm text-white">
                  {isAddress(snapshot.winningVendor)
                    ? snapshot.winningVendor
                    : "—"}
                </p>
                <p className="mt-3 font-label text-[10px] uppercase text-neutral-500">
                  Winning Ask (u64)
                </p>
                <p className="mt-1 font-heading text-xl text-[#00FF94]">
                  {String(snapshot.winningAsk)}
                </p>
                <p className="mt-4 font-label text-[11px] text-neutral-500">
                  All competing asks permanently sealed
                </p>
              </div>
            )}

            {!snapshot && !loadError && (
              <p className="mt-4 font-label text-sm text-neutral-500">
                Loading auction…
              </p>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}