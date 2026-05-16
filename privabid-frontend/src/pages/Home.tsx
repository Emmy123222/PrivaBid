import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CONTRACTS } from "../config/contracts";
import {
  factoryAuctionLink,
  fetchLatestFactoryAuctions,
  type FactoryAuctionRow,
} from "../lib/factoryAuctions";
import { auctionHref, loadMyAuctions, type SavedAuction } from "../lib/myAuctions";

const MODES: {
  path: string;
  title: string;
  description: string;
  fheTags: string[];
}[] = [
  {
    path: "/auction/first-price",
    title: "First-Price Sealed Bid",
    description:
      "Highest encrypted bid wins at their own bid amount—no one sees amounts until reveal.",
    fheTags: ["FHE.encrypt", "FHE.add", "FHE.gt", "coalesce"],
  },
  {
    path: "/auction/vickrey",
    title: "Vickrey (Second-Price)",
    description:
      "Winner pays the second-highest price: bids stay private while the contract ranks outcomes in FHE.",
    fheTags: ["FHE.select", "FHE.gt", "FHE.sub", "inEuint64"],
  },
  {
    path: "/auction/dutch",
    title: "Blind Dutch Auction",
    description:
      "Price falls on-chain while acceptances are encrypted; first valid match against the threshold wins.",
    fheTags: ["FHE.lte", "FHE.add", "FHE.select", "threshold decrypt"],
  },
  {
    path: "/reverse-auction",
    title: "Reverse Auction (Procurement)",
    description:
      "Buyers seek lowest price from vendors. Encrypted asks compete for procurement contracts with budget ceiling.",
    fheTags: ["FHE.encrypt", "FHE.min", "FHE.lt", "procurement"],
  },
];

function LiveBadge() {
  return (
    <span className="rounded border border-[#00FF94]/40 bg-[#00FF94]/10 px-2 py-0.5 font-label text-[10px] font-semibold uppercase tracking-wider text-[#00FF94]">
      LIVE
    </span>
  );
}

const MODE_LABEL: Record<FactoryAuctionRow["mode"], string> = {
  "first-price": "First-price",
  vickrey: "Vickrey",
  dutch: "Dutch",
  reverse: "Reverse",
};

export default function Home() {
  const navigate = useNavigate();
  const [myAuctions] = useState<SavedAuction[]>(() => loadMyAuctions());
  const [factoryAuctions, setFactoryAuctions] = useState<FactoryAuctionRow[]>(
    [],
  );
  const [factoryLoading, setFactoryLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setFactoryLoading(true);
      const v1 = await fetchLatestFactoryAuctions(24, CONTRACTS.FACTORY.address);
      const v2Addr = CONTRACTS.FACTORY_V2.address;
      const v2 =
        v2Addr &&
        v2Addr !== "0x0000000000000000000000000000000000000000"
          ? await fetchLatestFactoryAuctions(24, v2Addr)
          : [];
      const seen = new Set<string>();
      const rows: FactoryAuctionRow[] = [];
      for (const r of [...v2, ...v1]) {
        const k = r.address.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        rows.push(r);
      }
      if (!cancelled) {
        setFactoryAuctions(rows);
        setFactoryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="bg-priva-bg text-neutral-200">
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-12 md:pb-24 md:pt-16">
        <Link
          to="/"
          className="inline-block font-label text-[11px] font-semibold uppercase tracking-wider text-neutral-500 transition hover:text-[#00FF94]/90"
        >
          ← Landing
        </Link>
        <p className="mt-6 font-label text-xs uppercase tracking-[0.2em] text-[#00FF94]/80">
          Wave 4 · Factory index · decryptForView · Fhenix reveal ACL
        </p>
        <h1 className="mt-3 font-heading text-4xl font-bold leading-tight text-white md:text-5xl">
          Choose your
          <span className="text-[#00FF94]"> auction mode</span>
        </h1>
        <p className="mt-4 max-w-2xl font-label text-sm text-neutral-500 md:text-base">
          All four modes are live on Arbitrum Sepolia. Pick a flow to place bids,
          decrypt outcomes, and verify winners without leaking competing values early.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            to="/dashboard"
            className="rounded-xl border border-[#00FF94]/50 px-4 py-2 font-label text-xs font-semibold uppercase tracking-wide text-[#00FF94] hover:bg-[#00FF94]/10"
          >
            Auction dashboard →
          </Link>
          <Link
            to="/create"
            className="rounded-xl border border-neutral-700 px-4 py-2 font-label text-xs font-semibold uppercase tracking-wide text-neutral-300 hover:border-neutral-500"
          >
            Create auction
          </Link>
        </div>

        <div className="mt-8 max-w-3xl rounded-xl border border-[#00FF94]/25 bg-[#00FF94]/5 p-4">
          <p className="font-label text-[10px] font-bold uppercase tracking-wider text-[#00FF94]/90">
            Live auctions (factory)
          </p>
          {factoryLoading ? (
            <p className="mt-3 font-label text-sm text-neutral-500">Loading…</p>
          ) : factoryAuctions.length === 0 ? (
            <p className="mt-3 font-label text-sm text-neutral-500">
              No factory auctions yet —{" "}
              <Link to="/create" className="text-[#00FF94] hover:underline">
                create one
              </Link>
              .
            </p>
          ) : (
            <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto">
              {factoryAuctions.map((a) => (
                <li key={a.address}>
                  <Link
                    to={factoryAuctionLink(a)}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-800 bg-priva-bg/60 px-3 py-2 font-label text-sm text-neutral-200 hover:border-[#00FF94]/40"
                  >
                    <span className="font-medium text-white">{a.itemName}</span>
                    <span className="text-[10px] uppercase text-neutral-500">
                      {MODE_LABEL[a.mode]}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 font-label text-[11px] text-neutral-500">
            Loaded from PrivaBidFactory on Arbitrum Sepolia — visible on any device.
          </p>
        </div>

        {myAuctions.length > 0 && (
          <div className="mt-8 max-w-3xl rounded-xl border border-sky-500/30 bg-sky-950/30 p-4">
            <p className="font-label text-[10px] font-bold uppercase tracking-wider text-sky-300/90">
              Your auctions
            </p>
            <ul className="mt-3 space-y-2">
              {myAuctions.map((a) => (
                <li key={a.address}>
                  <Link
                    to={auctionHref(a.mode, a.address)}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-800 bg-priva-bg/60 px-3 py-2 font-label text-sm text-neutral-200 hover:border-[#00FF94]/40"
                  >
                    <span className="font-medium text-white">{a.itemName}</span>
                    <span className="text-[10px] uppercase text-neutral-500">
                      {a.mode.replace("-", " ")}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-2 font-label text-[11px] text-neutral-500">
              Saved in this browser after you deploy from Create Auction.
            </p>
          </div>
        )}

        <div className="mt-8 max-w-2xl rounded-xl border border-[#00FF94]/25 bg-[#00FF94]/5 p-4">
          <p className="font-label text-[10px] font-bold uppercase tracking-wider text-[#00FF94]/90">
            How to place your bid
          </p>
          <ol className="mt-3 list-decimal space-y-2 pl-5 font-label text-sm leading-relaxed text-neutral-300">
            <li>
              Choose a mode below and click{" "}
              <strong className="text-white">Enter auction to bid</strong> (jumps to the bid form when the auction is open).
            </li>
            <li>
              Connect <strong className="text-white">MetaMask</strong> (top right), then switch to{" "}
              <strong className="text-white">Arbitrum Sepolia</strong> if prompted.
            </li>
            <li>
              On the auction page, open the right-hand{" "}
              <strong className="text-white">Actions</strong> panel — scroll on small screens — then enter
              your amount and submit (encrypted bid or Dutch threshold).
            </li>
          </ol>
          <div className="mt-4 pt-3 border-t border-[#00FF94]/20">
            <Link
              to="/create"
              className="inline-flex items-center gap-2 font-label text-sm font-semibold text-[#00FF94] hover:text-[#00FF94]/80"
            >
              <span>🏭</span>
              Create your own auction
            </Link>
          </div>
        </div>

        <ul className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {MODES.map(({ path, title, description, fheTags }) => (
            <li key={path}>
              <article className="group flex h-full flex-col rounded-2xl border border-neutral-800 bg-neutral-950/60 p-6 shadow-lg transition-colors duration-200 hover:border-[#00FF94]/70">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-heading text-xl font-semibold text-white md:text-[1.35rem]">
                    {title}
                  </h2>
                  <LiveBadge />
                </div>
                <p className="mt-3 flex-1 font-label text-sm leading-relaxed text-neutral-400">
                  {description}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {fheTags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-md border border-neutral-700/80 bg-neutral-900/80 px-2 py-1 font-label text-[10px] text-neutral-400"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => navigate(`${path}${path === "/reverse-auction" ? "#submit-your-ask" : "#place-your-bid"}`)}
                  className="mt-6 w-full rounded-xl bg-[#00FF94] py-3 font-label text-sm font-semibold uppercase tracking-wide text-neutral-950 transition hover:bg-[#00FF94]/90"
                >
                  {path === "/reverse-auction" ? "Enter auction to submit ask" : "Enter auction to bid"}
                </button>
              </article>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
