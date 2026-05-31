import { Contract, type ContractRunner } from "ethers";
import { FACTORY_V2_ABI } from "./abis.js";
import { activeFactoryAddress } from "./addresses.js";
import type { CreateAuctionParams } from "./modes.js";
import { AuctionMode } from "./modes.js";

export type DeployAuctionResult = {
  auctionAddress: string;
  txHash: string;
};

/**
 * Deploy a new PrivaBidV2 auction via Factory V2.
 * Requires a signer connected to Arbitrum Sepolia with testnet ETH.
 */
export async function createAuctionViaFactory(
  runner: ContractRunner,
  params: CreateAuctionParams,
  factoryAddress: string = activeFactoryAddress(),
): Promise<DeployAuctionResult> {
  const factory = new Contract(factoryAddress, FACTORY_V2_ABI, runner);
  const isDutch = params.mode === AuctionMode.DUTCH;

  const tx = await factory.createAuction(
    params.mode,
    params.itemName,
    params.itemDescription,
    params.reservePriceMicro,
    params.durationSec,
    isDutch ? (params.dutchStartPriceMicro ?? 0n) : 0n,
    isDutch ? (params.dutchFloorPriceMicro ?? params.reservePriceMicro) : 0n,
    isDutch ? (params.dutchDecrementBlocks ?? 50n) : 0n,
    params.useEncryptedReserve ?? false,
  );

  const receipt = await tx.wait();
  if (!receipt) throw new Error("Factory transaction not mined");

  const factoryAddr = factoryAddress.toLowerCase();
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== factoryAddr) continue;
    try {
      const parsed = factory.interface.parseLog(log);
      if (parsed?.name === "AuctionDeployed") {
        return {
          auctionAddress: String(parsed.args.contractAddress),
          txHash: receipt.hash,
        };
      }
    } catch {
      /* skip unrelated logs */
    }
  }

  throw new Error("AuctionDeployed event not found in factory receipt");
}

export {
  ADDRESSES,
  CHAIN_ID,
  NETWORK,
  RPC_URL_DEFAULT,
  activeFactoryAddress,
  arbiscanAddressUrl,
  arbiscanTxUrl,
} from "./addresses.js";

export {
  AuctionMode,
  formatUsdcMicro,
  onChainModeToRoute,
  parseUsdcMicro,
  routeModeToOnChain,
  USDC_DECIMALS,
  type CreateAuctionParams,
  type RouteMode,
} from "./modes.js";

export { ALL_ABIS, FACTORY_V2_ABI, PRIVABID_V2_READ_ABI, PRIVABID_V2_REVEAL_ABI, REVERSE_STANDALONE_ABI } from "./abis.js";

/**
 * CoFHE encryption/decryption uses `@cofhe/sdk` + `@cofhe/react` in browser apps.
 * After `closeBidding()`, call Threshold Network decrypt via CofheClient, then
 * `revealWinner` / `revealVickreyWinner` / `revealDutchWinner` with proofs.
 *
 * See docs/INTEGRATION.md in the repo root for the full flow.
 */
export const COFHE_INTEGRATION_NOTE =
  "Use @cofhe/sdk CofheClient.decryptForTx(handle) after closeBidding(); publish proofs on-chain via reveal* functions.";
