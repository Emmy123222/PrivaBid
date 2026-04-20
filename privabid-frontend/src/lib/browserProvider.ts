import { BrowserProvider, JsonRpcProvider, Network } from "ethers";
import { CHAIN_ID, RPC_URL } from "../config/contracts";

/** Fixed network avoids flaky `eth_blockNumber` / chain detection with injected wallets + EIP-6963. */
const ARBITRUM_SEPOLIA = new Network("arbitrum-sepolia", CHAIN_ID);

const STATIC_RPC_OPTS = {
  staticNetwork: true,
  /** Stops background `eth_blockNumber` polling (major source of coalesce errors). */
  polling: false as const,
};

/** One shared HTTP provider for the whole app — avoids duplicate connections and rate spikes. */
let sharedReadProvider: JsonRpcProvider | null = null;

export function getReadOnlyRpcProvider(): JsonRpcProvider {
  if (sharedReadProvider === null) {
    sharedReadProvider = new JsonRpcProvider(
      RPC_URL,
      ARBITRUM_SEPOLIA,
      STATIC_RPC_OPTS,
    );
  }
  return sharedReadProvider;
}

/**
 * Injected wallets often return odd shapes for `eth_blockNumber`, which makes ethers v6
 * throw "could not coalesce error … reading 'message'". `JsonRpcSigner.sendTransaction`
 * and `TransactionResponse.wait` always call `provider.getBlockNumber()` first — so we
 * never ask the wallet for the block number; the HTTP RPC handles it.
 */
class WalletProviderWithoutWalletBlockNumber extends BrowserProvider {
  override async getBlockNumber(): Promise<number> {
    return getReadOnlyRpcProvider().getBlockNumber();
  }
}

export function createBrowserProvider(ethereum: object) {
  return new WalletProviderWithoutWalletBlockNumber(
    ethereum as never,
    ARBITRUM_SEPOLIA,
    STATIC_RPC_OPTS,
  );
}
