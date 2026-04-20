import { CHAIN_ID } from "../config/contracts";

/** Arbitrum Sepolia — `421614` */
const ARB_SEPOLIA_CHAIN_ID_HEX = `0x${CHAIN_ID.toString(16)}` as const;

const EIP6963_ANNOUNCE_PROVIDER = "eip6963:announceProvider";
const EIP6963_REQUEST_PROVIDER = "eip6963:requestProvider";
/** Registered `rdns` for MetaMask (EIP-6963). */
const METAMASK_RDNS = "io.metamask";

export type Eip1193 = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  isMetaMask?: boolean;
  providers?: Eip1193[];
};

type Eip6963AnnounceDetail = {
  info: { uuid: string; name: string; icon: string; rdns: string };
  provider: Eip1193;
};

/**
 * MetaMask announces itself with `rdns: io.metamask`. This avoids Vite pre-bundle
 * issues from `@metamask/detect-provider` and avoids wallets that only spoof `isMetaMask`.
 */
function collectMetaMaskVia6963(timeoutMs: number): Promise<Eip1193 | null> {
  return new Promise((resolve) => {
    const found: Eip1193[] = [];
    const onAnnounce = (event: Event) => {
      const { detail } = event as CustomEvent<Eip6963AnnounceDetail>;
      if (!detail?.info?.rdns || !detail.provider) return;
      if (
        detail.info.rdns === METAMASK_RDNS &&
        typeof detail.provider.request === "function"
      ) {
        found.push(detail.provider);
      }
    };
    window.addEventListener(EIP6963_ANNOUNCE_PROVIDER, onAnnounce);
    window.dispatchEvent(new Event(EIP6963_REQUEST_PROVIDER));
    window.setTimeout(() => {
      window.removeEventListener(EIP6963_ANNOUNCE_PROVIDER, onAnnounce);
      resolve(found[0] ?? null);
    }, timeoutMs);
  });
}

/** MetaMask’s in-page provider historically exposes `_metamask` (not a public API). */
function isLikelyRealMetaMaskInpage(p: unknown): p is Eip1193 {
  if (!p || typeof (p as Eip1193).request !== "function") return false;
  const o = p as { isMetaMask?: boolean; _metamask?: unknown };
  return Boolean(o.isMetaMask && o._metamask != null && typeof o._metamask === "object");
}

/**
 * Resolve the MetaMask EIP-1193 provider: EIP-6963 first, then `_metamask` heuristic on `providers`.
 */
export async function getTrustedMetaMaskProvider(): Promise<Eip1193 | null> {
  if (typeof window === "undefined") return null;

  try {
    const from6963 = await collectMetaMaskVia6963(600);
    if (from6963) return from6963;
  } catch {
    /* ignore */
  }

  const eth = window.ethereum as
    | (Eip1193 & { providers?: Eip1193[] })
    | undefined;
  if (!eth?.request) return null;

  if (Array.isArray(eth.providers)) {
    const mm = eth.providers.find((p) => isLikelyRealMetaMaskInpage(p));
    if (mm) return mm;
  }

  if (isLikelyRealMetaMaskInpage(eth)) return eth;

  return null;
}

const ADD_ARB_SEPOLIA_PARAMS = [
  {
    chainId: ARB_SEPOLIA_CHAIN_ID_HEX,
    chainName: "Arbitrum Sepolia",
    rpcUrls: ["https://sepolia-rollup.arbitrum.io/rpc"],
    nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
    blockExplorerUrls: ["https://sepolia.arbiscan.io"],
  },
] as const;

/**
 * Prompt MetaMask to use Arbitrum Sepolia: switch if known, else add chain (then user is on the network).
 */
export async function ensureArbitrumSepoliaInMetaMask(
  ethereum: Eip1193,
): Promise<void> {
  const current = (await ethereum.request({
    method: "eth_chainId",
  })) as string;
  if (
    typeof current === "string" &&
    current.toLowerCase() === ARB_SEPOLIA_CHAIN_ID_HEX
  ) {
    return;
  }

  try {
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: ARB_SEPOLIA_CHAIN_ID_HEX }],
    });
  } catch (e: unknown) {
    const code = (e as { code?: number }).code;
    if (code === 4902) {
      await ethereum.request({
        method: "wallet_addEthereumChain",
        params: [...ADD_ARB_SEPOLIA_PARAMS],
      });
      return;
    }
    throw e;
  }

  const after = (await ethereum.request({
    method: "eth_chainId",
  })) as string;
  if (
    typeof after !== "string" ||
    after.toLowerCase() !== ARB_SEPOLIA_CHAIN_ID_HEX
  ) {
    throw new Error("Please switch to Arbitrum Sepolia in MetaMask.");
  }
}
