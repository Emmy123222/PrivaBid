import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Contract, formatUnits, isAddress } from "ethers";
import { Link, Navigate, useLocation, useParams } from "react-router-dom";
import BidForm from "../components/BidForm";
import CloseAuctionPanel from "../components/CloseAuctionPanel";
import DutchPriceTracker from "../components/DutchPriceTracker";
import NetworkGateBanner from "../components/NetworkGateBanner";
import RevealWinner from "../components/RevealWinner";
import { CONTRACTS } from "../config/contracts";
import { getReadOnlyRpcProvider } from "../lib/browserProvider";
import { DUTCH_ABI, PRIVA_BID_ABI, VICKREY_ABI } from "../lib/privabidAbis";
import type { RouteAuctionMode } from "../types/auction";
import { isRouteAuctionMode } from "../types/auction";

const ZERO = "0x0000000000000000000000000000000000000000";

const ROUTE_TO_CONTRACT_KEY = {
  "first-price": "FIRST_PRICE",
  vickrey: "VICKREY",
  dutch: "DUTCH",
} as const satisfies Record<RouteAuctionMode, keyof typeof CONTRACTS>;

const MODE_BADGE: Record<RouteAuctionMode, string> = {
  "first-price": "First-Price Sealed",
  vickrey: "Vickrey (Second-Price)",
  dutch: "Blind Dutch",
};

type LifecycleStatus = "ACTIVE" | "CLOSED" | "REVEALED";

type FeedRow = {
  id: string;
  wallet: string;
  timestamp: number;
  kind: "bid" | "threshold";
  totalBidsNow?: bigint;
};

type AuctionSnapshot = {
  itemName: string;
  timeRemainingSec: bigint;
  totalBids: bigint;
  status: LifecycleStatus;
  winningBidder: string;
  winningBid: bigint;
  paymentAmount: bigint;
  reservePrice: bigint;
  auctionEndTime: bigint;
  auctionClosed: boolean;
  winnerRevealed: boolean;
};

function truncateAddr(a: string): string {
  if (!a || a.length < 10) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function formatReserveUsdc6(micro: bigint): string {
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

function fheTagsForRoute(
  route: RouteAuctionMode,
  total: bigint,
  matchCount: number,
): string[] {
  const n = Number(total);
  const tags: string[] = [];
  if (route === "first-price") {
    if (n >= 1) tags.push("FHE.asEuint64", "FHE.allowThis", "FHE.gt", "FHE.max");
    if (n >= 2) tags.push("FHE.coalesce (rank)");
    return tags;
  }
  if (route === "vickrey") {
    if (n >= 1) tags.push("FHE.asEuint64", "FHE.allowThis", "FHE.gt", "FHE.max");
    if (n >= 2)
      tags.push("FHE.select", "second-highest path", "FHE.allowThis (handles)");
    return tags;
  }
  /* dutch */
  if (n >= 1) tags.push("FHE.asEuint64(threshold)", "FHE.allowThis");
  if (matchCount >= 1) tags.push("FHE.lte(currentPrice, threshold)");
  if (matchCount >= 2) tags.push("FHE.allowThis(match)");
  return tags;
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

export default function AuctionPage() {
  const { mode: routeMode } = useParams<{ mode: string }>();

  if (!isRouteAuctionMode(routeMode)) {
    return <Navigate to="/home" replace />;
  }

  return <AuctionPageInner routeMode={routeMode} />;
}

function AuctionPageInner({ routeMode }: { routeMode: RouteAuctionMode }) {
  const location = useLocation();
  const contractKey = ROUTE_TO_CONTRACT_KEY[routeMode];
  const meta = CONTRACTS[contractKey];
  const address = meta.address;

  const readProvider = useMemo(() => getReadOnlyRpcProvider(), []);

  const readContract = useMemo(() => {
    if (isZeroAddress(address)) return null;
    const abi =
      routeMode === "first-price"
        ? PRIVA_BID_ABI
        : routeMode === "vickrey"
          ? VICKREY_ABI
          : DUTCH_ABI;
    return new Contract(address, abi, readProvider);
  }, [address, readProvider, routeMode]);

  const [snapshot, setSnapshot] = useState<AuctionSnapshot | null>(null);
  const [auctioneerAddr, setAuctioneerAddr] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feed, setFeed] = useState<FeedRow[]>([]);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [matchEvents, setMatchEvents] = useState(0);

  const fetchState = useCallback(async () => {
    if (!readContract || isZeroAddress(address)) {
      setSnapshot(null);
      setAuctioneerAddr(null);
      return;
    }
    setLoadError(null);
    try {
      if (routeMode === "first-price") {
        const c = readContract as Contract;
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
        const itemName = state[1];
        const reservePrice = state[2];
        const auctionEndTime = state[3];
        const auctionClosed = state[4];
        const winnerRevealed = state[5];
        const totalBids = state[6];
        const winningBidder = state[8];
        const winningBid = state[9];
        const paymentAmount = state[10];
        const timeRemainingSec = (await c.timeRemaining()) as bigint;
        setSnapshot({
          itemName,
          timeRemainingSec,
          totalBids,
          status: deriveStatus(auctionClosed, winnerRevealed),
          winningBidder,
          winningBid,
          paymentAmount,
          reservePrice,
          auctionEndTime,
          auctionClosed,
          winnerRevealed,
        });
        return;
      }

      if (routeMode === "vickrey") {
        const c = readContract as Contract;
        const [
          itemName,
          reservePrice,
          timeRemainingSec,
          totalBids,
          auctionClosed,
          winnerRevealed,
          winningBidder,
          winningBid,
          paymentAmount,
        ] = await Promise.all([
          c.itemName(),
          c.reservePrice(),
          c.timeRemaining(),
          c.totalBids(),
          c.auctionClosed(),
          c.winnerRevealed(),
          c.winningBidder(),
          c.winningBid(),
          c.paymentAmount(),
        ]);
        setSnapshot({
          itemName: itemName as string,
          timeRemainingSec: timeRemainingSec as bigint,
          totalBids: totalBids as bigint,
          status: deriveStatus(
            auctionClosed as boolean,
            winnerRevealed as boolean,
          ),
          winningBidder: winningBidder as string,
          winningBid: winningBid as bigint,
          paymentAmount: paymentAmount as bigint,
          reservePrice: BigInt(reservePrice.toString()),
          auctionEndTime: 0n,
          auctionClosed: auctionClosed as boolean,
          winnerRevealed: winnerRevealed as boolean,
        });
        return;
      }

      /* dutch */
      const c = readContract as Contract;
      const [
        participantCount,
        floorPrice,
        auctionClosed,
        winnerRevealed,
        winningBidder,
        winningBid,
      ] = await Promise.all([
        c.getParticipantCount(),
        c.floorPrice(),
        c.auctionClosed(),
        c.winnerRevealed(),
        c.winningBidder(),
        c.winningBid(),
      ]);
      setSnapshot({
        itemName: "Blind Dutch lot",
        timeRemainingSec: 0n,
        totalBids: participantCount as bigint,
        status: deriveStatus(
          auctionClosed as boolean,
          winnerRevealed as boolean,
        ),
        winningBidder: winningBidder as string,
        winningBid: winningBid as bigint,
        paymentAmount: 0n,
        reservePrice: BigInt(floorPrice.toString()),
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
          const a = (await (readContract as Contract).auctioneer()) as string;
          setAuctioneerAddr(a);
        } catch {
          setAuctioneerAddr(null);
        }
      }
    }
  }, [address, readContract, routeMode]);

  const hydrateFeedFromLogs = useCallback(async () => {
    if (!readContract || isZeroAddress(address)) return;
    try {
      const latest = await readProvider.getBlockNumber();
      const from = latest > 15_000 ? latest - 15_000 : 0;

      if (routeMode === "dutch") {
        const thresholdFilter = readContract.filters.ThresholdSet();
        const thresholdLogs = await readContract.queryFilter(
          thresholdFilter,
          from,
          latest,
        );
        const rows: FeedRow[] = [];
        for (const log of thresholdLogs) {
          const parsed = readContract.interface.parseLog(log);
          if (!parsed || parsed.name !== "ThresholdSet") continue;
          const bidder = parsed.args[0] as string;
          const ts = parsed.args[1] as bigint;
          rows.push({
            id: `${log.transactionHash}-${log.index}`,
            wallet: bidder,
            timestamp: Number(ts),
            kind: "threshold",
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

        const matchFilter = readContract.filters.MatchChecked();
        const matchLogs = await readContract.queryFilter(
          matchFilter,
          from,
          latest,
        );
        setMatchEvents(matchLogs.length);
        return;
      }

      const filter = readContract.filters.BidPlaced();
      const logs = await readContract.queryFilter(filter, from, latest);
      const rows: FeedRow[] = [];
      for (const log of logs) {
        const parsed = readContract.interface.parseLog(log);
        if (!parsed || parsed.name !== "BidPlaced") continue;
        const bidder = parsed.args[0] as string;
        const ts = parsed.args[1] as bigint;
        const totalBidsNow = parsed.args[2] as bigint;
        rows.push({
          id: `${log.transactionHash}-${log.index}`,
          wallet: bidder,
          timestamp: Number(ts),
          kind: "bid",
          totalBidsNow,
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
  }, [address, readContract, readProvider, routeMode]);

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

  const fheTags = useMemo(
    () =>
      snapshot
        ? fheTagsForRoute(routeMode, snapshot.totalBids, matchEvents)
        : [],
    [matchEvents, routeMode, snapshot],
  );

  const canPlaceBid =
    snapshot?.status === "ACTIVE" &&
    (routeMode === "dutch" ? true : snapshot.timeRemainingSec > 0n);

  useEffect(() => {
    if (location.hash !== "#place-your-bid") return;
    if (!canPlaceBid || snapshot?.status !== "ACTIVE") return;
    const id = window.setTimeout(() => {
      document.getElementById("place-your-bid")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 150);
    return () => window.clearTimeout(id);
  }, [canPlaceBid, location.hash, snapshot?.status]);

  const countdownLabel =
    routeMode === "dutch"
      ? "Open until auctioneer closes"
      : snapshot
        ? formatCountdown(snapshot.timeRemainingSec)
        : "—";

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
          {MODE_BADGE[routeMode]}
        </h1>
        <p className="mt-4 font-label text-sm text-amber-200/90">
          No contract is configured for this mode yet. Set the address in{" "}
          <code className="text-neutral-400">src/config/contracts.ts</code>.
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
                  Item
                </p>
                <h1 className="mt-1 font-heading text-2xl font-bold text-white md:text-3xl">
                  {snapshot?.itemName ?? "…"}
                </h1>
              </div>
              <span className="rounded-full border border-[#00FF94]/35 bg-[#00FF94]/10 px-3 py-1 font-label text-[10px] font-semibold uppercase tracking-wider text-[#00FF94]">
                {MODE_BADGE[routeMode]}
              </span>
            </div>

            <dl className="mt-6 grid gap-4 font-label text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-neutral-800/80 bg-priva-bg/80 p-4">
                <dt className="text-[10px] uppercase tracking-wider text-neutral-500">
                  {routeMode === "dutch" ? "Floor price" : "Reserve price"}
                </dt>
                <dd className="mt-1 text-lg text-white">
                  {snapshot
                    ? formatReserveUsdc6(snapshot.reservePrice)
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
                {routeMode !== "dutch" && snapshot && snapshot.timeRemainingSec > 0n && (
                  <dd className="mt-1 text-[10px] text-neutral-600">
                    tick {new Date(nowTick).toLocaleTimeString()}
                  </dd>
                )}
              </div>
              <div className="rounded-xl border border-neutral-800/80 bg-priva-bg/80 p-4">
                <dt className="text-[10px] uppercase tracking-wider text-neutral-500">
                  {routeMode === "dutch" ? "Participants" : "Total bids"}
                </dt>
                <dd className="mt-1 text-lg text-white">
                  {snapshot ? String(snapshot.totalBids) : "…"}
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

            <a
              href={arbiscanUrl(address)}
              target="_blank"
              rel="noreferrer"
              className="mt-6 inline-block font-label text-xs text-[#00FF94] hover:underline"
            >
              Contract on Arbiscan
            </a>
          </section>

          {routeMode === "dutch" && (
            <DutchPriceTracker
              contractAddress={address}
              variant="standalone"
            />
          )}

          {/* 2. Bid activity feed */}
          <section className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-6">
            <h2 className="font-heading text-lg font-semibold text-white">
              {routeMode === "dutch" ? "Threshold activity" : "Bid activity"}
            </h2>
            <p className="mt-1 font-label text-xs text-neutral-500">
              Live via <code className="text-neutral-400">contract.on</code> ·
              amounts stay encrypted on-chain
            </p>
            <ul className="mt-4 divide-y divide-neutral-800/90">
              {feed.length === 0 ? (
                <li className="py-8 text-center font-label text-sm text-neutral-500">
                  No events yet in the recent window.
                </li>
              ) : (
                feed.map((row) => (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-3 font-label text-sm"
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
              Bids and thresholds are submitted here (right column on desktop). On a
              phone, scroll to the bottom of the page to reach this panel.
            </p>

            {snapshot?.status === "ACTIVE" && (
              <div className="mt-4 space-y-3">
                <CloseAuctionPanel
                  contractAddress={address}
                  auctioneer={auctioneerAddr}
                  canClose={snapshot.status === "ACTIVE" && !snapshot.auctionClosed}
                  onClosed={() => {
                    void fetchState();
                    void hydrateFeedFromLogs();
                  }}
                />
                {canPlaceBid ? (
                  <div
                    id="place-your-bid"
                    className="scroll-mt-24 rounded-xl border border-[#00FF94]/20 bg-priva-bg/50 p-4"
                  >
                    <h3 className="font-heading text-sm font-semibold text-white">
                      {routeMode === "dutch"
                        ? "Set your encrypted threshold"
                        : "Place your encrypted bid"}
                    </h3>
                    <p className="mt-1 font-label text-[11px] text-neutral-500">
                      {routeMode === "dutch"
                        ? "Enter your floor price (USDC), then confirm in MetaMask."
                        : "Enter your bid in USDC (minimum 1), then confirm in MetaMask. Your amount stays encrypted on-chain."}
                    </p>
                    <div className="mt-4">
                      <BidForm
                        mode={routeMode}
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
                    {routeMode !== "dutch"
                      ? "Bidding window ended — wait for close."
                      : "Auction closed for new thresholds."}
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
                    mode={routeMode}
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
                  Winner
                </p>
                <p className="mt-2 break-all font-mono text-sm text-white">
                  {isAddress(snapshot.winningBidder)
                    ? snapshot.winningBidder
                    : "—"}
                </p>
                <p className="mt-3 font-label text-[10px] uppercase text-neutral-500">
                  {routeMode === "vickrey" ? "Winning bid / payment (u64)" : "Amount (u64)"}
                </p>
                <p className="mt-1 font-heading text-xl text-[#00FF94]">
                  {String(snapshot.winningBid)}
                  {routeMode === "vickrey" && (
                    <span className="mt-2 block font-label text-xs text-neutral-400">
                      Payment (second price): {String(snapshot.paymentAmount)}
                    </span>
                  )}
                </p>
                <p className="mt-4 font-label text-[11px] text-neutral-500">
                  All losing bids permanently sealed
                </p>
              </div>
            )}

            {!snapshot && !loadError && (
              <p className="mt-4 font-label text-sm text-neutral-500">
                Loading auction…
              </p>
            )}
          </section>

          {/* 4. FHE status */}
          <section className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-5">
            <h2 className="font-heading text-base font-semibold text-white">
              FHE operations
            </h2>
            <p className="mt-1 font-label text-[10px] text-neutral-500">
              Inferred from on-chain activity · updates with bids / matches
            </p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {fheTags.length === 0 ? (
                <li className="font-label text-xs text-neutral-500">
                  Waiting for first encrypted action…
                </li>
              ) : (
                fheTags.map((t) => (
                  <li
                    key={t}
                    className="rounded-md border border-neutral-700 bg-priva-bg px-2 py-1 font-label text-[10px] text-neutral-300"
                  >
                    {t}
                  </li>
                ))
              )}
            </ul>
          </section>
        </div>
      </div>
    </main>
  );
}
