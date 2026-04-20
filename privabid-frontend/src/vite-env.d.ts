/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WALLETCONNECT_PROJECT_ID?: string;
  /** Optional Arbitrum Sepolia HTTPS RPC; if unset, a stable public endpoint is used. */
  readonly VITE_ARB_SEPOLIA_RPC?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
