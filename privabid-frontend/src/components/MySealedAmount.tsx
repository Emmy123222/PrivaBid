import { useCallback, useMemo, useState } from "react";
import { Contract, formatUnits } from "ethers";
import { useCofheClient, useCofhePublicClient, useCofheWalletClient } from "@cofhe/react";
import { useAccount } from "wagmi";
import { getReadOnlyRpcProvider } from "../lib/browserProvider";
import {
  decryptSealedAmountForView,
  ensureCofheConnected,
} from "../lib/cofheDecrypt";
import { MY_SEALED_ABI } from "../lib/privabidAbis";

export type MySealedAmountProps = {
  contractAddress: string;
  /** Label for the amount (bid / threshold / ask). */
  amountLabel?: string;
};

function normHandle(h: unknown): bigint {
  if (typeof h === "bigint") return h;
  return BigInt(String(h));
}

export default function MySealedAmount({
  contractAddress,
  amountLabel = "Your sealed amount",
}: MySealedAmountProps) {
  const { isConnected, address: wallet } = useAccount();
  const cofheClient = useCofheClient();
  const publicClient = useCofhePublicClient();
  const walletClient = useCofheWalletClient();

  const [busy, setBusy] = useState(false);
  const [plain, setPlain] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unsupported, setUnsupported] = useState(false);

  const readProvider = useMemo(() => getReadOnlyRpcProvider(), []);

  const viewMine = useCallback(async () => {
    setError(null);
    setPlain(null);
    setUnsupported(false);

    if (!isConnected || !wallet) {
      setError("Connect your wallet first.");
      return;
    }
    if (!publicClient || !walletClient) {
      setError("CoFHE is not ready — connect MetaMask on Arbitrum Sepolia.");
      return;
    }

    setBusy(true);
    try {
      const read = new Contract(contractAddress, MY_SEALED_ABI, readProvider);
      let handle: bigint;
      try {
        handle = normHandle(await read.getMySealedAmountHandle());
      } catch {
        setUnsupported(true);
        setError(
          "This auction contract was deployed before Wave 4. Create a new auction to use “view my sealed amount”.",
        );
        return;
      }
      if (handle === 0n) {
        setError("No sealed amount on-chain for your address yet.");
        return;
      }

      const cofhe = cofheClient as Parameters<typeof ensureCofheConnected>[0] &
        Parameters<typeof decryptSealedAmountForView>[0];
      await ensureCofheConnected(cofhe, publicClient, walletClient);
      const micro = await decryptSealedAmountForView(cofhe, handle);
      const usdc = formatUnits(micro, 6);
      setPlain(usdc);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [
    cofheClient,
    contractAddress,
    isConnected,
    publicClient,
    readProvider,
    wallet,
    walletClient,
  ]);

  if (!isConnected) {
    return (
      <p className="font-label text-[11px] text-neutral-500">
        Connect a wallet to view your own sealed amount (only you can decrypt it).
      </p>
    );
  }

  return (
    <div className="mt-4 rounded-lg border border-neutral-800 bg-priva-bg/40 p-3">
      <p className="font-label text-[10px] uppercase tracking-wider text-neutral-500">
        Private check (CoFHE decryptForView)
      </p>
      <p className="mt-1 font-label text-[11px] text-neutral-400">
        See {amountLabel.toLowerCase()} — not published on-chain. Uses your EIP-712
        permit per Fhenix docs.
      </p>
      {plain !== null && (
        <p className="mt-2 font-heading text-lg text-[#00FF94]">
          {Number(plain).toLocaleString(undefined, { maximumFractionDigits: 6 })}{" "}
          USDC
        </p>
      )}
      {error && (
        <p
          className={`mt-2 font-label text-xs ${
            unsupported ? "text-amber-300/90" : "text-red-400"
          }`}
        >
          {error}
        </p>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => void viewMine()}
        className="mt-3 w-full rounded-lg border border-neutral-600 py-2 font-label text-[11px] font-semibold uppercase tracking-wide text-neutral-200 hover:border-[#00FF94]/40 disabled:opacity-50"
      >
        {busy ? "Decrypting…" : "View my sealed amount"}
      </button>
    </div>
  );
}
