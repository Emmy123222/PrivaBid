import { useEffect, useState } from "react";
import { useAccount, useChainId, useConnect, useDisconnect } from "wagmi";
import { CHAIN_ID } from "../config/contracts";
import { getTrustedMetaMaskProvider } from "../lib/metamask";

function truncateAddr(a: string): string {
  if (!a || a.length < 10) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export default function WalletConnect() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connect, connectors, error, isPending, reset } = useConnect();
  const { disconnect } = useDisconnect();

  const metaMaskConnector = connectors[0];
  const [trustedMm, setTrustedMm] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const p = await getTrustedMetaMaskProvider();
      if (!cancelled) setTrustedMm(p !== null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  const hasExtension = trustedMm === true;

  if (!isConnected) {
    return (
      <div className="flex flex-col items-end gap-2 text-right">
        {error && (
          <p className="max-w-[220px] font-label text-[11px] text-red-400">
            {error.message}
          </p>
        )}
        {trustedMm === null ? (
          <p className="font-label text-[11px] text-neutral-500">Checking MetaMask…</p>
        ) : !hasExtension ? (
          <p className="max-w-[260px] font-label text-xs text-amber-200/90">
            Please install{" "}
            <a
              href="https://metamask.io"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-[#00FF94] underline underline-offset-2"
            >
              MetaMask
            </a>{" "}
            to connect.
          </p>
        ) : (
          <button
            type="button"
            disabled={isPending || !metaMaskConnector}
            onClick={() => {
              reset();
              connect({ connector: metaMaskConnector });
            }}
            className="rounded-xl border border-[#00FF94]/50 bg-[#00FF94]/10 px-4 py-2 font-label text-xs font-semibold uppercase tracking-wide text-[#00FF94] hover:bg-[#00FF94]/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Connecting…" : "Connect MetaMask"}
          </button>
        )}
      </div>
    );
  }

  const wrong = chainId !== CHAIN_ID;

  return (
    <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center sm:gap-3">
      <div className="text-right font-label text-[11px] leading-tight text-neutral-400">
        <p className="font-mono text-neutral-200">
          {truncateAddr(address ?? "")}
        </p>
        <p className={wrong ? "text-amber-300" : "text-neutral-500"}>
          {wrong ? `Wrong network (${chainId})` : `Arbitrum Sepolia · ${CHAIN_ID}`}
        </p>
      </div>
      <button
        type="button"
        onClick={() => disconnect()}
        className="shrink-0 rounded-lg border border-neutral-600 px-3 py-1.5 font-label text-[11px] font-semibold uppercase tracking-wide text-neutral-300 hover:border-neutral-500 hover:text-white"
      >
        Disconnect
      </button>
    </div>
  );
}
