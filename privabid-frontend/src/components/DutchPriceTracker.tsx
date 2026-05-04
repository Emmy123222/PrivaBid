import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Contract, formatUnits } from "ethers";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import {
  createBrowserProvider,
  getReadOnlyRpcProvider,
} from "../lib/browserProvider";
import { getTrustedMetaMaskProvider } from "../lib/metamask";

const STANDALONE_ABI = [
  "function getCurrentPrice() view returns (uint64)",
  "function startPrice() view returns (uint64)",
  "function floorPrice() view returns (uint64)",
  "function decrementInterval() view returns (uint256)",
  "function startBlock() view returns (uint256)",
  "event WinnerRevealed(address indexed winner, uint64 amount, uint256 timestamp)",
] as const;

/** PrivaBid.sol in DUTCH mode — uses getCurrentDutchPrice + dutch* getters. */
const MULTIMODE_ABI = [
  "function getCurrentDutchPrice() view returns (uint64)",
  "function dutchStartPrice() view returns (uint64)",
  "function dutchFloorPrice() view returns (uint64)",
  "function dutchDecrement() view returns (uint256)",
  "function dutchStartBlock() view returns (uint256)",
  "event WinnerRevealed(address indexed winner, uint64 amount, uint256 timestamp)",
] as const;

/** Rough L2 block time hint for Arbitrum-class chains (display only). */
const EST_BLOCK_TIME_SEC = 2;

export type DutchPriceTrackerProps = {
  contractAddress: string;
  /** `standalone` = PrivaBidDutch (`getCurrentPrice`). `multimode` = PrivaBid DUTCH (`getCurrentDutchPrice`). */
  variant?: "standalone" | "multimode";
};

type ChartPoint = { block: number; priceUsdc: number };

function isZeroAddr(a: string): boolean {
  return !a || a.toLowerCase() === "0x0000000000000000000000000000000000000000";
}

function toNum(v: unknown): bigint {
  if (typeof v === "bigint") return v;
  return BigInt(String(v));
}

function blocksUntilNextDrop(
  currentBlock: bigint,
  startBlock: bigint,
  interval: bigint,
): bigint {
  if (interval <= 0n) return 0n;
  const elapsed = currentBlock - startBlock;
  const steps = elapsed / interval;
  const nextBoundary = startBlock + (steps + 1n) * interval;
  return nextBoundary - currentBlock;
}

function truncateAddr(a: string): string {
  if (!a || a.length < 10) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function formatUsdcLabel(micro: bigint): string {
  const s = formatUnits(micro, 6);
  const n = Number(s);
  if (!Number.isFinite(n)) return s;
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function DutchPriceTracker({
  contractAddress,
  variant = "standalone",
}: DutchPriceTrackerProps) {
  const readProvider = useMemo(() => getReadOnlyRpcProvider(), []);
  const abi = variant === "multimode" ? MULTIMODE_ABI : STANDALONE_ABI;

  const [startMicro, setStartMicro] = useState<bigint | null>(null);
  const [floorMicro, setFloorMicro] = useState<bigint | null>(null);
  const [intervalBlocks, setIntervalBlocks] = useState<bigint | null>(null);
  const [currentMicro, setCurrentMicro] = useState<bigint | null>(null);
  const [headBlock, setHeadBlock] = useState<bigint | null>(null);
  const [blocksToDrop, setBlocksToDrop] = useState<bigint | null>(null);
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [winnerHighlight, setWinnerHighlight] = useState(false);
  const [winner, setWinner] = useState<{ address: string; amount: string } | null>(null);

  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const readContract = useMemo(() => {
    if (isZeroAddr(contractAddress)) return null;
    return new Contract(contractAddress, abi, readProvider) as Contract;
  }, [abi, contractAddress, readProvider]);

  const pollTick = useCallback(async () => {
    if (!readContract) return;
    try {
      let sp: unknown;
      let fl: unknown;
      let dec: unknown;
      let sb: unknown;
      let price: unknown;

      if (variant === "multimode") {
        [sp, fl, dec, sb, price] = await Promise.all([
          readContract.dutchStartPrice(),
          readContract.dutchFloorPrice(),
          readContract.dutchDecrement(),
          readContract.dutchStartBlock(),
          readContract.getCurrentDutchPrice(),
        ]);
      } else {
        [sp, fl, dec, sb, price] = await Promise.all([
          readContract.startPrice(),
          readContract.floorPrice(),
          readContract.decrementInterval(),
          readContract.startBlock(),
          readContract.getCurrentPrice(),
        ]);
      }

      const bn = await readProvider.getBlockNumber();
      const block = BigInt(bn);
      const spB = toNum(sp);
      const flB = toNum(fl);
      const decB = toNum(dec);
      const sbB = toNum(sb);
      const priceB = toNum(price);

      startTransition(() => {
        setStartMicro(spB);
        setFloorMicro(flB);
        setIntervalBlocks(decB);
        setCurrentMicro(priceB);
        setHeadBlock(block);
        setBlocksToDrop(blocksUntilNextDrop(block, sbB, decB));
        setChartData((prev) => {
          const priceUsdc = Number(formatUnits(priceB, 6));
          const b = Number(block);
          const next =
            prev.length > 0 && prev[prev.length - 1]?.block === b
              ? [...prev.slice(0, -1), { block: b, priceUsdc }]
              : [...prev, { block: b, priceUsdc }];
          return next.slice(-20);
        });
      });
    } catch {
      /* ignore */
    }
  }, [readContract, readProvider, variant]);

  useEffect(() => {
    if (!readContract) return;
    startTransition(() => {
      void pollTick();
    });
    const id = window.setInterval(() => {
      startTransition(() => {
        void pollTick();
      });
    }, 5_000);
    return () => window.clearInterval(id);
  }, [pollTick, readContract]);

  useEffect(() => {
    if (isZeroAddr(contractAddress)) return;

    let live: Contract | null = null;
    let cancelled = false;

    void (async () => {
      try {
        const mm = await getTrustedMetaMaskProvider();
        if (!mm || cancelled) return;
        const browser = createBrowserProvider(mm);
        live = new Contract(contractAddress, abi, browser);
        if (cancelled || !live) return;
        live.on("WinnerRevealed", (winnerAddr: string, amount: bigint) => {
          if (highlightTimer.current) clearTimeout(highlightTimer.current);
          startTransition(() => {
            setWinnerHighlight(true);
            setWinner({ 
              address: winnerAddr, 
              amount: formatUnits(amount, 6) 
            });
          });
          highlightTimer.current = setTimeout(() => {
            startTransition(() => setWinnerHighlight(false));
            highlightTimer.current = null;
          }, 12_000);
        });
      } catch {
        /* no wallet — chart still polls via HTTP */
      }
    })();

    return () => {
      cancelled = true;
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
      live?.removeAllListeners("WinnerRevealed");
    };
  }, [abi, contractAddress]);

  if (isZeroAddr(contractAddress)) return null;

  const currentLabel =
    currentMicro !== null ? formatUsdcLabel(currentMicro) : "—";
  const startLabel = startMicro !== null ? formatUsdcLabel(startMicro) : "—";
  const floorLabel = floorMicro !== null ? formatUsdcLabel(floorMicro) : "—";

  const blocksLeft =
    blocksToDrop !== null ? Number(blocksToDrop) : null;
  const estSeconds =
    blocksLeft !== null ? Math.max(0, blocksLeft * EST_BLOCK_TIME_SEC) : null;

  return (
    <section
      className={`rounded-2xl border bg-neutral-950/90 p-5 transition-shadow duration-300 ${
        winnerHighlight
          ? "border-[#00FF94] shadow-[0_0_28px_rgba(0,255,148,0.22)] ring-2 ring-[#00FF94]/60"
          : "border-neutral-800"
      }`}
    >
      <h2 className="font-heading text-base font-semibold text-white">
        Dutch price ladder
      </h2>
      <p className="mt-1 font-label text-[10px] text-neutral-500">
        {variant === "multimode"
          ? "On-chain: getCurrentDutchPrice()"
          : "On-chain: getCurrentPrice()"}{" "}
        · every 5s
      </p>

      {/* PRICE DISPLAY */}
      <p className="mt-4 font-heading text-3xl font-bold tracking-tight text-[#00FF94] md:text-4xl">
        Current Price: {currentLabel}
      </p>

      {/* THREE STAT CARDS */}
      <dl className="mt-6 grid gap-3 font-label text-sm sm:grid-cols-3">
        <div className="rounded-xl border border-neutral-800 bg-priva-bg/80 px-3 py-3">
          <dt className="text-[10px] uppercase tracking-wider text-neutral-500">
            Start price
          </dt>
          <dd className="mt-1 text-lg text-white">{startLabel}</dd>
        </div>
        <div className="rounded-xl border border-neutral-800 bg-priva-bg/80 px-3 py-3">
          <dt className="text-[10px] uppercase tracking-wider text-neutral-500">
            Current price
          </dt>
          <dd className="mt-1 text-lg text-[#00FF94]">{currentLabel}</dd>
        </div>
        <div className="rounded-xl border border-neutral-800 bg-priva-bg/80 px-3 py-3">
          <dt className="text-[10px] uppercase tracking-wider text-neutral-500">
            Floor price
          </dt>
          <dd className="mt-1 text-lg text-white">{floorLabel}</dd>
        </div>
      </dl>

      {/* BLOCKS UNTIL NEXT DROP */}
      <div className="mt-4 rounded-xl border border-neutral-800 bg-[#0a0a0a] px-3 py-2 font-label text-xs text-neutral-400">
        {blocksLeft !== null && intervalBlocks !== null && headBlock !== null ? (
          <>
            <span className="text-neutral-300">Next price drop in:</span>{" "}
            <span className="text-white">
              {blocksLeft} block{blocksLeft === 1 ? "" : "s"}
            </span>
            {estSeconds !== null && (
              <>
                {" "}
                <span className="text-neutral-500">
                  (~{estSeconds}s est. @ {EST_BLOCK_TIME_SEC}s/block)
                </span>
              </>
            )}
            <span className="mt-1 block text-[10px] text-neutral-600">
              Head block {String(headBlock)} · interval {String(intervalBlocks)}{" "}
              blocks
            </span>
          </>
        ) : (
          "Loading schedule…"
        )}
      </div>

      {/* WINNER DETECTION BANNER */}
      {winner && (
        <div className="mt-3 rounded-xl border border-[#00FF94]/30 bg-[#00FF94]/5 p-3">
          <p className="font-label text-sm font-semibold text-[#00FF94]">
            🏆 Auction matched! Winner: {truncateAddr(winner.address)}
          </p>
          <p className="mt-1 font-label text-xs text-neutral-300">
            Amount: {Number(winner.amount).toLocaleString(undefined, {
              maximumFractionDigits: 2,
            })} USDC
          </p>
        </div>
      )}

      {/* DESCENDING PRICE CHART */}
      <div className="mt-6 h-56 w-full rounded-xl border border-neutral-800 bg-[#0a0a0a] p-2">
        {chartData.length === 0 ? (
          <div className="flex h-full items-center justify-center font-label text-xs text-neutral-600">
            Collecting price points…
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 8, right: 12, left: 0, bottom: 8 }}
            >
              <XAxis
                dataKey="block"
                stroke="#525252"
                tick={{ fill: "#a3a3a3", fontSize: 10 }}
                tickLine={{ stroke: "#404040" }}
                label={{
                  value: "Block",
                  position: "insideBottom",
                  offset: -4,
                  fill: "#737373",
                  fontSize: 10,
                }}
              />
              <YAxis
                stroke="#525252"
                tick={{ fill: "#a3a3a3", fontSize: 10 }}
                tickLine={{ stroke: "#404040" }}
                tickFormatter={(v) =>
                  typeof v === "number" ? v.toFixed(2) : String(v)
                }
                label={{
                  value: "USDC",
                  angle: -90,
                  position: "insideLeft",
                  fill: "#737373",
                  fontSize: 10,
                }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0a0a0a",
                  border: "1px solid #404040",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                labelStyle={{ color: "#a3a3a3" }}
              />
              <Line
                type="monotone"
                dataKey="priceUsdc"
                stroke="#00FF94"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
