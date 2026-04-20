import { useCallback, useState } from "react";
import { useAccount, useChainId } from "wagmi";
import { CHAIN_ID } from "../config/contracts";
import {
  ensureArbitrumSepoliaInMetaMask,
  getTrustedMetaMaskProvider,
} from "../lib/metamask";

export default function NetworkGateBanner() {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const switchToArbSepolia = useCallback(async () => {
    setErr(null);
    const mm = await getTrustedMetaMaskProvider();
    if (!mm) {
      setErr("MetaMask is required to switch networks.");
      return;
    }
    setBusy(true);
    try {
      await ensureArbitrumSepoliaInMetaMask(mm);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  if (!isConnected || chainId === CHAIN_ID) return null;

  return (
    <div className="mb-6 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
      <p className="font-label text-sm font-semibold text-amber-100/95">
        Please switch to Arbitrum Sepolia
      </p>
      <p className="mt-1 font-label text-xs text-amber-200/70">
        PrivaBid contracts are on chain {CHAIN_ID}. Your wallet reports {chainId}.
      </p>
      {err && (
        <p className="mt-2 font-label text-xs text-red-400">{err}</p>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => void switchToArbSepolia()}
        className="mt-3 rounded-lg bg-amber-600 px-4 py-2 font-label text-xs font-semibold text-white hover:bg-amber-500 disabled:opacity-50"
      >
        {busy ? "Opening MetaMask…" : "Add / switch in MetaMask"}
      </button>
    </div>
  );
}
