import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { GENESIS_DEPLOY, SITE_LINKS } from "../config/site";
import { useRevealOnScroll } from "../hooks/useRevealOnScroll";

const COUNTDOWN_TARGET = new Date("2026-12-31T23:59:59Z");

function pad2(n: number) {
  return n.toString().padStart(2, "0");
}

function computeCountdownParts(target: Date) {
  const ms = Math.max(0, target.getTime() - Date.now());
  const sec = Math.floor(ms / 1000);
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return { d, h, m, s, ended: ms === 0 };
}

function useCountdown(target: Date) {
  const [parts, setParts] = useState(() => ({
    d: 0,
    h: 0,
    m: 0,
    s: 0,
    ended: false,
  }));

  useEffect(() => {
    const tick = () => setParts(computeCountdownParts(target));
    const id = window.setInterval(tick, 1000);
    const boot = window.setTimeout(tick, 0);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(boot);
    };
  }, [target]);

  return parts;
}

function Reveal({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const { ref, visible } = useRevealOnScroll<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out motion-reduce:transition-none ${
        visible
          ? "translate-y-0 opacity-100"
          : "translate-y-10 opacity-0 motion-reduce:translate-y-0 motion-reduce:opacity-100"
      } ${className}`}
    >
      {children}
    </div>
  );
}

function LogoMark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#1a1a1a] bg-[#0f0f0f]">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden
        >
          <path
            d="M7 11V7a5 5 0 0 1 10 0v4"
            stroke="#00FF94"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <rect
            x="5"
            y="11"
            width="14"
            height="11"
            rx="2"
            stroke="#f0f0f0"
            strokeWidth="2"
          />
          <circle cx="12" cy="16" r="1.5" fill="#00FF94" />
        </svg>
      </span>
      <span className="font-heading text-lg font-extrabold tracking-tight text-white">
        PrivaBid
      </span>
    </span>
  );
}

function GithubIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

function IconRobot() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="4"
        y="8"
        width="16"
        height="12"
        rx="2"
        stroke="#f87171"
        strokeWidth="1.5"
      />
      <circle cx="9" cy="13" r="1.2" fill="#f87171" />
      <circle cx="15" cy="13" r="1.2" fill="#f87171" />
      <path
        d="M12 3v3M8 5h8"
        stroke="#f87171"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path d="M7 20h10" stroke="#f87171" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconCrosshair() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="7" stroke="#fb923c" strokeWidth="1.5" />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="#fb923c" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="12" cy="12" r="1.5" fill="#fb923c" />
    </svg>
  );
}

function IconBuilding() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 21h16M6 21V8l6-3v16M12 21V5l6 3v16"
        stroke="#f87171"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M8 12h1M8 16h1M15 12h1M15 16h1" stroke="#f87171" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

const FHE_STEPS = [
  { text: "bid(5000) submitted" },
  { text: "FHE.asEuint64 → encrypted 🔒" },
  { text: "FHE.gt / FHE.max → comparison in ciphertext" },
  { text: "Winner revealed via Threshold Network ✓" },
] as const;

const AUCTION_MODE_CARDS = [
  {
    title: "First-Price Sealed Bid",
    badge: "live" as const,
    body: "Highest bid wins, pays own amount. Bids encrypted from submission to reveal.",
    ops: "FHE.gt · FHE.max · FHE.select",
  },
  {
    title: "Vickrey (Second-Price)",
    badge: "live" as const,
    body: "Highest bid wins but pays the second-highest amount. Provably fair. Impossible to game.",
    ops: "FHE.gt · nested FHE.select · dual reveal",
  },
  {
    title: "Blind Dutch Auction",
    badge: "live" as const,
    body: "Price descends. Bidders set encrypted floors. Winner matched automatically. Novel primitive.",
    ops: "FHE.lte · encrypted threshold · auto-match",
  },
  {
    title: "Reverse / Procurement",
    badge: "wave3" as const,
    body: "Sellers submit encrypted asks. Buyer picks the lowest. Built for institutional procurement.",
    ops: "FHE.lt · FHE.min · FHE.select",
  },
] as const;

const TIMELINE_STEPS = [
  {
    n: 1,
    title: "Deploy",
    desc: "Auctioneer deploys with item, reserve price, duration",
  },
  {
    n: 2,
    title: "Bid",
    desc: "Bidders submit amounts. Encrypted immediately on-chain.",
  },
  {
    n: 3,
    title: "Close",
    desc: "Auctioneer closes. FHE.allowPublic() authorizes reveal.",
  },
  {
    n: 4,
    title: "Decrypt",
    desc: "Threshold Network decrypts winner off-chain with MPC proof.",
  },
  {
    n: 5,
    title: "Reveal",
    desc: "FHE.publishDecryptResult() verifies proof on-chain. Winner stored.",
  },
] as const;

function ModeBadge({ kind }: { kind: "live" | "wave3" }) {
  if (kind === "live") {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded border border-[#00FF94]/45 bg-[#00FF94]/10 px-2.5 py-1 font-label text-[10px] font-bold uppercase tracking-wider text-[#00FF94]"
        style={{ animation: "live-pulse 2.2s ease-in-out infinite" }}
      >
        LIVE
        <span className="h-1.5 w-1.5 rounded-full bg-[#00FF94]" aria-hidden />
      </span>
    );
  }
  return (
    <span className="rounded border border-[#cba6f7]/45 bg-[#cba6f7]/10 px-2.5 py-1 font-label text-[10px] font-bold uppercase tracking-wider text-[#cba6f7]">
      WAVE 3
    </span>
  );
}

function FheFlowColumn() {
  const { ref, visible } = useRevealOnScroll<HTMLDivElement>(0.12, "0px 0px -32px 0px");

  return (
    <div ref={ref} className="relative space-y-0">
      {FHE_STEPS.map((step, i) => (
        <div key={step.text} className="relative flex flex-col items-center">
          <div
            className={`w-full max-w-md rounded-lg border border-[#1a1a1a] border-l-[3px] border-l-[#00FF94] bg-[#0f0f0f] px-4 py-3 font-label text-xs leading-relaxed text-[#f0f0f0]/90 transition-all duration-700 ease-out motion-reduce:transition-none ${
              visible
                ? "translate-y-0 opacity-100"
                : "translate-y-8 opacity-0 motion-reduce:translate-y-0 motion-reduce:opacity-100"
            }`}
            style={{ transitionDelay: visible ? `${i * 140}ms` : "0ms" }}
          >
            {step.text}
          </div>
          {i < FHE_STEPS.length - 1 && (
            <div
              className={`my-1 text-[#00FF94]/50 transition-opacity duration-500 ${
                visible ? "opacity-100" : "opacity-0 motion-reduce:opacity-100"
              }`}
              style={{ transitionDelay: visible ? `${i * 140 + 80}ms` : "0ms" }}
              aria-hidden
            >
              ↓
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function Landing() {
  const navigate = useNavigate();
  const cd = useCountdown(COUNTDOWN_TARGET);
  const addr = GENESIS_DEPLOY.address;
  const shortAddr = `${addr.slice(0, 11)}…${addr.slice(-4)}`;

  return (
    <div className="min-h-dvh bg-[#0a0a0a] text-[#f0f0f0] antialiased">
      {/* ——— HERO ——— */}
      <section className="relative flex min-h-dvh flex-col overflow-hidden bg-[#0a0a0a]">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.45]"
          style={{
            backgroundImage:
              "radial-gradient(circle at center, rgba(255,255,255,0.07) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-gradient-to-r from-transparent via-[#00FF94]/25 to-transparent blur-[1px]"
          aria-hidden
        />

        <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 pt-6 md:pt-8">
          <LogoMark />
          <div className="flex items-center gap-3 md:gap-4">
            <Link
              to="/home"
              className="rounded-lg border-2 border-[#00FF94] bg-transparent px-4 py-2.5 font-label text-xs font-bold uppercase tracking-wider text-[#00FF94] transition hover:bg-[#00FF94]/10 md:px-5"
            >
              Launch App
            </Link>
            <a
              href={SITE_LINKS.github}
              target="_blank"
              rel="noreferrer noopener"
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#1a1a1a] text-neutral-400 transition hover:border-[#00FF94]/40 hover:text-[#00FF94]"
              aria-label="PrivaBid on GitHub"
            >
              <GithubIcon />
            </a>
          </div>
        </header>

        <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 pb-16 pt-10 text-center md:pb-20">
          <p className="font-label text-[10px] font-bold uppercase tracking-[0.25em] text-[#00FF94]/90 md:text-xs">
            Built on Fhenix FHE · Arbitrum Sepolia · Wave 2 live
          </p>
          <h1 className="mt-5 max-w-4xl font-heading text-4xl font-extrabold leading-[1.05] tracking-tight text-white md:text-6xl md:leading-[1.02]">
            Auctions Where No One
            <br />
            Can See Your Bid
          </h1>
          <p className="mx-auto mt-6 max-w-xl font-label text-sm leading-relaxed text-[#666666] md:text-base">
            Front-runners can&apos;t front-run what they can&apos;t see. Fully encrypted on-chain
            auctions powered by FHE.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              to="/home"
              className="inline-flex items-center gap-2 rounded-lg bg-[#00FF94] px-6 py-3.5 font-label text-sm font-bold uppercase tracking-wide text-[#0a0a0a] transition hover:bg-[#00FF94]/90"
            >
              Launch App
              <span aria-hidden>→</span>
            </Link>
            <a
              href={SITE_LINKS.arbiscanContract}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-2 rounded-lg border border-[#1a1a1a] bg-[#0f0f0f] px-6 py-3.5 font-label text-sm font-semibold text-[#f0f0f0] transition hover:border-[#00FF94]/35"
            >
              View on Arbiscan
              <span className="text-xs opacity-80" aria-hidden>
                ↗
              </span>
            </a>
          </div>

          <div className="mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 font-label text-[11px] uppercase tracking-wider text-[#666666] md:text-xs">
            <span>4 Auction Modes</span>
            <span className="hidden text-[#1a1a1a] sm:inline" aria-hidden>
              |
            </span>
            <span>Live on Arbitrum</span>
            <span className="hidden text-[#1a1a1a] sm:inline" aria-hidden>
              |
            </span>
            <span>FHE Encrypted</span>
          </div>

          <div
            className="mt-10 rounded-xl border border-[#1a1a1a] bg-[#0f0f0f]/80 px-6 py-4 backdrop-blur-sm"
            aria-live="polite"
          >
            <p className="font-label text-[10px] font-bold uppercase tracking-widest text-[#666666]">
              {cd.ended ? "Countdown complete" : "Next milestone"}
            </p>
            <div className="mt-2 flex justify-center gap-4 font-heading text-2xl font-extrabold tabular-nums text-white md:gap-6 md:text-3xl">
              <div>
                <span className="text-[#00FF94]">{pad2(cd.d)}</span>
                <span className="ml-1 font-label text-[10px] font-bold text-[#666666]">D</span>
              </div>
              <span className="text-[#1a1a1a]">:</span>
              <div>
                <span className="text-[#00FF94]">{pad2(cd.h)}</span>
                <span className="ml-1 font-label text-[10px] font-bold text-[#666666]">H</span>
              </div>
              <span className="text-[#1a1a1a]">:</span>
              <div>
                <span className="text-[#00FF94]">{pad2(cd.m)}</span>
                <span className="ml-1 font-label text-[10px] font-bold text-[#666666]">M</span>
              </div>
              <span className="text-[#1a1a1a]">:</span>
              <div>
                <span className="text-[#00FF94]">{pad2(cd.s)}</span>
                <span className="ml-1 font-label text-[10px] font-bold text-[#666666]">S</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ——— THE PROBLEM ——— */}
      <section className="border-t border-[#1a1a1a] bg-[#0f0f0f] py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-4">
          <Reveal>
            <p className="font-label text-xs font-bold uppercase tracking-[0.2em] text-[#00FF94]">
              THE PROBLEM
            </p>
            <h2 className="mt-3 font-heading text-3xl font-extrabold text-white md:text-4xl">
              On-Chain Auctions Are Broken
            </h2>
          </Reveal>

          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {[
              {
                icon: <IconRobot />,
                title: "MEV / Front-Running",
                body: "Bots see your bid in the mempool and outbid you in the same block. Every time.",
                stat: "$500M+ lost annually",
              },
              {
                icon: <IconCrosshair />,
                title: "Bid Sniping",
                body: "Everyone sees the current highest bid. Rational bidders snipe at the last second.",
                stat: "True price discovery — impossible",
              },
              {
                icon: <IconBuilding />,
                title: "Institutions Can't Participate",
                body: "Compliance requires sealed bids. Transparent chains make that legally impossible.",
                stat: "Trillions in procurement locked out",
              },
            ].map((card) => (
              <Reveal key={card.title}>
                <article className="group flex h-full flex-col rounded-2xl border border-[#1a1a1a] bg-[#0a0a0a]/40 p-6 transition-shadow duration-300 hover:shadow-[0_0_40px_-8px_rgba(248,113,113,0.25)]">
                  <div className="mb-4">{card.icon}</div>
                  <h3 className="font-heading text-lg font-bold text-white">{card.title}</h3>
                  <p className="mt-3 flex-1 font-sans text-sm leading-relaxed text-[#666666]">
                    {card.body}
                  </p>
                  <p className="mt-4 border-t border-[#1a1a1a] pt-4 font-label text-[11px] font-bold uppercase tracking-wide text-red-300/90">
                    {card.stat}
                  </p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ——— THE SOLUTION ——— */}
      <section className="border-t border-[#1a1a1a] bg-[#0a0a0a] py-20 md:py-28">
        <div className="mx-auto grid max-w-6xl gap-14 px-4 lg:grid-cols-2 lg:items-start lg:gap-16">
          <Reveal>
            <p className="font-label text-xs font-bold uppercase tracking-[0.2em] text-[#00FF94]">
              THE SOLUTION
            </p>
            <h2 className="mt-3 font-heading text-3xl font-extrabold text-white md:text-4xl">
              Privacy Built Into the Architecture
            </h2>
            <p className="mt-6 font-sans text-sm leading-relaxed text-[#666666] md:text-base">
              PrivaBid uses Fhenix Fully Homomorphic Encryption. Bids are encrypted the moment they
              arrive on-chain. The contract compares ciphertexts — never plaintext. Only the winner
              is ever revealed. Losing bids are permanently sealed forever.
            </p>
            <ul className="mt-8 space-y-3 font-label text-sm font-semibold text-[#f0f0f0]">
              <li className="flex gap-2">
                <span className="text-[#00FF94]">✓</span> No commit-reveal hacks
              </li>
              <li className="flex gap-2">
                <span className="text-[#00FF94]">✓</span> No trusted operator
              </li>
              <li className="flex gap-2">
                <span className="text-[#00FF94]">✓</span> Math enforces it, not rules
              </li>
            </ul>
          </Reveal>

          <FheFlowColumn />
        </div>
      </section>

      {/* ——— AUCTION MODES ——— */}
      <section className="border-t border-[#1a1a1a] bg-[#0f0f0f] py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-4">
          <Reveal>
            <p className="font-label text-xs font-bold uppercase tracking-[0.2em] text-[#00FF94]">
              AUCTION MODES
            </p>
            <h2 className="mt-3 font-heading text-3xl font-extrabold text-white md:text-4xl">
              Four Ways to Auction. All Encrypted.
            </h2>
          </Reveal>

          <div className="mt-14 grid gap-6 sm:grid-cols-2">
            {AUCTION_MODE_CARDS.map((card) => (
              <Reveal key={card.title}>
                <button
                  type="button"
                  onClick={() => navigate("/home")}
                  className="group flex h-full w-full flex-col rounded-2xl border border-[#1a1a1a] bg-[#0a0a0a]/50 p-6 text-left transition duration-300 hover:border-[#00FF94]/45 hover:shadow-[0_0_36px_-10px_rgba(0,255,148,0.35)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-heading text-lg font-bold text-white md:text-xl">
                      {card.title}
                    </h3>
                    <ModeBadge kind={card.badge} />
                  </div>
                  <p className="mt-4 flex-1 font-sans text-sm leading-relaxed text-[#666666]">
                    {card.body}
                  </p>
                  <p className="mt-4 font-label text-[11px] text-[#89b4fa]/90">{card.ops}</p>
                  <span className="mt-5 font-label text-xs font-bold uppercase tracking-wider text-[#00FF94]/80 opacity-0 transition group-hover:opacity-100">
                    Open app →
                  </span>
                </button>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ——— LIVE ON-CHAIN ——— */}
      <section className="border-t border-[#1a1a1a] bg-[#0a0a0a] py-20 md:py-24">
        <div className="mx-auto max-w-xl px-4 text-center">
          <Reveal>
            <h2 className="font-heading text-2xl font-extrabold text-white md:text-3xl">
              Live on Arbitrum Sepolia
            </h2>
            <div className="mt-10 rounded-2xl border border-[#1a1a1a] bg-[#0f0f0f] p-6 text-left shadow-[0_0_0_1px_rgba(0,255,148,0.04)]">
              <p className="font-heading text-lg font-bold text-white">{GENESIS_DEPLOY.name}</p>
              <p className="mt-2 font-label text-xs font-bold uppercase tracking-wider text-[#666666]">
                Mode: <span className="text-[#00FF94]">{GENESIS_DEPLOY.mode}</span>
              </p>
              <p className="mt-3 font-label text-sm text-[#f0f0f0]/90">{shortAddr}</p>
              <a
                href={SITE_LINKS.arbiscanContract}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-5 inline-flex items-center gap-2 rounded-lg border border-[#00FF94]/40 px-4 py-2.5 font-label text-xs font-bold uppercase tracking-wide text-[#00FF94] transition hover:bg-[#00FF94]/10"
              >
                View on Arbiscan ↗
              </a>
            </div>
            <p className="mt-6 font-label text-[11px] uppercase tracking-wider text-[#666666]">
              Deployed · {GENESIS_DEPLOY.network} · Block {GENESIS_DEPLOY.block.toLocaleString()}
            </p>
          </Reveal>
        </div>
      </section>

      {/* ——— HOW IT WORKS ——— */}
      <section className="border-t border-[#1a1a1a] bg-[#0f0f0f] py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-4">
          <Reveal className="text-center">
            <h2 className="font-heading text-3xl font-extrabold text-white md:text-4xl">
              How It Works
            </h2>
          </Reveal>

          <div className="relative mt-16 hidden lg:block">
            <div
              className="absolute left-[10%] right-[10%] top-[22px] border-t-2 border-dashed border-[#00FF94]/35"
              aria-hidden
            />
            <div className="relative grid grid-cols-5 gap-4">
              {TIMELINE_STEPS.map((step) => (
                <Reveal key={step.n}>
                  <div className="flex flex-col items-center text-center">
                    <div className="relative z-[1] flex h-11 w-11 items-center justify-center rounded-full border-2 border-[#00FF94] bg-[#0f0f0f] font-heading text-sm font-extrabold text-[#00FF94]">
                      {step.n}
                    </div>
                    <h3 className="mt-6 font-heading text-sm font-bold text-white">{step.title}</h3>
                    <p className="mt-2 font-sans text-xs leading-relaxed text-[#666666]">
                      {step.desc}
                    </p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>

          <div className="relative mt-12 space-y-0 pl-2 lg:hidden">
            <div
              className="absolute bottom-4 left-[21px] top-4 w-0 border-l-2 border-dashed border-[#00FF94]/35"
              aria-hidden
            />
            <div className="space-y-10">
              {TIMELINE_STEPS.map((step) => (
                <Reveal key={step.n}>
                  <div className="relative flex gap-5">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-[#00FF94] bg-[#0f0f0f] font-heading text-sm font-extrabold text-[#00FF94]">
                      {step.n}
                    </div>
                    <div>
                      <h3 className="font-heading text-base font-bold text-white">{step.title}</h3>
                      <p className="mt-2 font-sans text-sm leading-relaxed text-[#666666]">
                        {step.desc}
                      </p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ——— FOOTER ——— */}
      <footer className="border-t border-[#1a1a1a] bg-[#080808] py-12">
        <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 md:flex-row md:items-center md:justify-between md:gap-6">
          <div className="flex flex-col gap-3">
            <LogoMark />
            <p className="font-label text-[11px] text-[#666666]">
              Built for Fhenix Buildathon 2025
            </p>
          </div>

          <nav className="flex flex-wrap justify-center gap-x-6 gap-y-2 font-label text-xs font-semibold text-[#666666]">
            <a href={SITE_LINKS.github} target="_blank" rel="noreferrer noopener" className="hover:text-[#00FF94]">
              GitHub
            </a>
            <span className="text-[#1a1a1a]" aria-hidden>
              ·
            </span>
            <a
              href={SITE_LINKS.arbiscanContract}
              target="_blank"
              rel="noreferrer noopener"
              className="hover:text-[#00FF94]"
            >
              Arbiscan
            </a>
            <span className="text-[#1a1a1a]" aria-hidden>
              ·
            </span>
            <a href={SITE_LINKS.fhenixDocs} target="_blank" rel="noreferrer noopener" className="hover:text-[#00FF94]">
              Fhenix Docs
            </a>
            <span className="text-[#1a1a1a]" aria-hidden>
              ·
            </span>
            <a href={SITE_LINKS.telegram} target="_blank" rel="noreferrer noopener" className="hover:text-[#00FF94]">
              Telegram
            </a>
          </nav>

          <div className="flex justify-center md:justify-end">
            <span className="rounded-full border border-[#1a1a1a] bg-[#0f0f0f] px-4 py-2 font-label text-[10px] font-bold uppercase tracking-wider text-[#666666]">
              Built on Fhenix FHE
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
