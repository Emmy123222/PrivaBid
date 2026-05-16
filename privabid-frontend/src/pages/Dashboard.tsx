import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import NetworkGateBanner from "../components/NetworkGateBanner";
import { CONTRACTS } from "../config/contracts";
import {
  fetchDashboardAuctions,
  formatTimeRemaining,
  type DashboardAuction,
} from "../lib/auctionDashboard";
import { factoryAuctionLink } from "../lib/factoryAuctions";
import {
  fetchWalletParticipation,
  ROLE_LABEL,
  type WalletParticipation,
} from "../lib/walletParticipation";
import { getTrustedMetaMaskProvider } from "../lib/metamask";
import { createBrowserProvider } from "../lib/browserProvider";

const MODE_LABEL: Record<DashboardAuction["mode"], string> = {
  "first-price": "First-price",
  vickrey: "Vickrey",
  dutch: "Dutch",
  reverse: "Reverse",
};

const STATUS_STYLE: Record<DashboardAuction["status"], string> = {
  live: "text-[#00FF94] border-[#00FF94]/40 bg-[#00FF94]/10",
  closed: "text-amber-300 border-amber-500/40 bg-amber-500/10",
  revealed: "text-sky-300 border-sky-500/40 bg-sky-500/10",
  ended: "text-neutral-400 border-neutral-600 bg-neutral-800/50",
};

function truncate(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export default function Dashboard() {
  const [auctions, setAuctions] = useState<DashboardAuction[]>([]);
  const [participation, setParticipation] = useState<WalletParticipation[]>([]);
  const [loading, setLoading] = useState(true);
  const [wallet, setWallet] = useState<string | null>(null);
  const [tab, setTab] = useState<"all" | "mine">("all");

  const demoAddr = CONTRACTS.DEMO_AUCTION.address;
  const hasDemo =
    demoAddr &&
    demoAddr !== "0x0000000000000000000000000000000000000000";

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const rows = await fetchDashboardAuctions(48);
      if (!cancelled) {
        setAuctions(rows);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const mm = await getTrustedMetaMaskProvider();
      if (!mm) {
        setWallet(null);
        setParticipation([]);
        return;
      }
      const browser = createBrowserProvider(mm);
      const signer = await browser.getSigner();
      const addr = await signer.getAddress();
      setWallet(addr);
      const rows = await fetchWalletParticipation(addr, 60);
      if (!cancelled) setParticipation(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Link
        to="/home"
        className="font-label text-xs uppercase tracking-wider text-[#00FF94]/90 hover:text-[#00FF94]"
      >
        ← Home
      </Link>

      <NetworkGateBanner />

      <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold text-white md:text-3xl">
            Auction dashboard
          </h1>
          <p className="mt-2 font-label text-sm text-neutral-400">
            Wave 4 — all factory auctions with live status, bids, time left, and
            winners. Privara settlement after reveal.
          </p>
        </div>

        {hasDemo && (
          <Link
            to={`/auction/first-price?address=${encodeURIComponent(demoAddr)}`}
            className="rounded-xl border border-[#00FF94]/50 px-4 py-2 font-label text-xs font-semibold uppercase tracking-wide text-[#00FF94] hover:bg-[#00FF94]/10"
          >
            Judge demo auction →
          </Link>
        )}
      </div>

      <div className="mt-6 flex gap-2">
        <button
          type="button"
          onClick={() => setTab("all")}
          className={`rounded-lg px-4 py-2 font-label text-xs uppercase tracking-wide ${
            tab === "all"
              ? "bg-[#00FF94]/15 text-[#00FF94] border border-[#00FF94]/40"
              : "border border-neutral-700 text-neutral-400"
          }`}
        >
          All auctions
        </button>
        <button
          type="button"
          onClick={() => setTab("mine")}
          className={`rounded-lg px-4 py-2 font-label text-xs uppercase tracking-wide ${
            tab === "mine"
              ? "bg-[#00FF94]/15 text-[#00FF94] border border-[#00FF94]/40"
              : "border border-neutral-700 text-neutral-400"
          }`}
        >
          My participation
        </button>
      </div>

      {tab === "all" && (
        <section className="mt-8 overflow-x-auto rounded-2xl border border-neutral-800">
          <table className="w-full min-w-[720px] text-left font-label text-sm">
            <thead className="border-b border-neutral-800 bg-neutral-950/80 text-[10px] uppercase tracking-wider text-neutral-500">
              <tr>
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3">Mode</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Bids</th>
                <th className="px-4 py-3">Time left</th>
                <th className="px-4 py-3">Winner</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-neutral-500">
                    Loading on-chain auctions…
                  </td>
                </tr>
              )}
              {!loading && auctions.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-neutral-500">
                    No factory auctions yet.{" "}
                    <Link to="/create" className="text-[#00FF94]">
                      Create one
                    </Link>
                  </td>
                </tr>
              )}
              {!loading &&
                auctions.map((a) => (
                  <tr
                    key={a.address}
                    className="border-b border-neutral-800/80 hover:bg-neutral-900/40"
                  >
                    <td className="px-4 py-3 text-white">
                      {a.itemName || truncate(a.address)}
                      {a.encryptedReserve && (
                        <span className="ml-2 text-[10px] text-amber-400/90">
                          sealed reserve
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-neutral-300">
                      {MODE_LABEL[a.mode]}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded border px-2 py-0.5 text-[10px] uppercase ${STATUS_STYLE[a.status]}`}
                      >
                        {a.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-neutral-300">
                      {a.bidCount}
                    </td>
                    <td className="px-4 py-3 text-neutral-300">
                      {formatTimeRemaining(a.timeRemainingSec)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-neutral-400">
                      {a.winner ? truncate(a.winner) : "—"}
                      {a.winningAmountUsdc && (
                        <span className="ml-1 text-[#00FF94]">
                          {Number(a.winningAmountUsdc).toLocaleString()} USDC
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        to={factoryAuctionLink(a)}
                        className="text-[#00FF94] hover:underline"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      )}

      {tab === "mine" && (
        <section className="mt-8 space-y-3">
          {!wallet && (
            <p className="font-label text-sm text-amber-200/90">
              Connect MetaMask to see auctions you have joined across all four
              modes.
            </p>
          )}
          {wallet && participation.length === 0 && !loading && (
            <p className="font-label text-sm text-neutral-500">
              No participation found in recent factory auctions.
            </p>
          )}
          {participation.map((p) => (
            <Link
              key={p.auction.address}
              to={p.href}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-800 bg-neutral-950/60 px-4 py-3 no-underline hover:border-[#00FF94]/30"
            >
              <div>
                <p className="font-heading text-sm text-white">
                  {p.auction.itemName || truncate(p.auction.address)}
                </p>
                <p className="mt-1 font-label text-xs text-neutral-500">
                  {MODE_LABEL[p.auction.mode]} · {ROLE_LABEL[p.role]} ·{" "}
                  {p.txCount} tx{p.txCount === 1 ? "" : "s"}
                </p>
              </div>
              <span className="font-mono text-xs text-[#00FF94]">Open →</span>
            </Link>
          ))}
        </section>
      )}
    </main>
  );
}
