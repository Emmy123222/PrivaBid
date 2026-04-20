import { http, createConfig } from "wagmi";
import { arbitrumSepolia } from "wagmi/chains";
import { metaMask } from "wagmi/connectors";
import { CHAIN_ID, RPC_URL } from "../config/contracts";

if (arbitrumSepolia.id !== CHAIN_ID) {
  throw new Error("wagmi chain must match CHAIN_ID in config/contracts.ts");
}

const dappUrl =
  typeof globalThis !== "undefined" &&
  "location" in globalThis &&
  typeof (globalThis as { location?: { origin?: string } }).location?.origin ===
    "string"
    ? (globalThis as { location: { origin: string } }).location.origin
    : "http://localhost";

/**
 * MetaMask-only wagmi config (no RainbowKit / WalletConnect).
 * CoFHE + viem `publicClient` / `walletClient` still come from this config.
 *
 * `extensionOnly` + `enableAnalytics: false` stops the MetaMask SDK from opening
 * remote “Sender” analytics batches that often throw `Failed to fetch` in dev.
 */
export const wagmiConfig = createConfig({
  chains: [arbitrumSepolia],
  connectors: [
    metaMask({
      dappMetadata: { name: "PrivaBid", url: dappUrl },
      extensionOnly: true,
      enableAnalytics: false,
      useDeeplink: false,
    }),
  ],
  transports: {
    [arbitrumSepolia.id]: http(RPC_URL),
  },
  ssr: false,
});
