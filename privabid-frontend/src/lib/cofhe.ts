import { createCofheConfig } from "@cofhe/react";
import { arbSepolia } from "@cofhe/sdk/chains";
import { CHAIN_ID } from "../config/contracts";

if (arbSepolia.id !== CHAIN_ID) {
  throw new Error("Update cofhe.ts: arbSepolia chain id does not match CHAIN_ID");
}

/**
 * CoFHE client config for the browser (Threshold Network + encryption).
 * RPC / wagmi transport is configured in `src/lib/wagmi.ts`; CoFHE URLs come from @cofhe/sdk/chains.
 */
export const cofheConfig = createCofheConfig({
  supportedChains: [arbSepolia],
  react: {
    shareablePermits: true,
  },
});
