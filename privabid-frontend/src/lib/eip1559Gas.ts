import { getReadOnlyRpcProvider } from "./browserProvider";

/** Headroom so a rising base fee between estimate and `eth_sendTransaction` does not fail. */
const MAX_FEE_BUFFER_NUM = 150n;
const MAX_FEE_BUFFER_DEN = 100n;
const PRIORITY_BUFFER_NUM = 120n;
const PRIORITY_BUFFER_DEN = 100n;
const MIN_PRIORITY_FEE = 100_000n;

export type Eip1559GasOverrides = {
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
};

/**
 * Fresh fees from the public RPC (not the wallet). MetaMask often submits
 * `maxFeePerGas` barely under `baseFeePerGas` on Arbitrum Sepolia.
 */
export async function getBufferedEip1559GasOverrides(): Promise<Eip1559GasOverrides> {
  const rpc = getReadOnlyRpcProvider();
  const [feeData, block] = await Promise.all([
    rpc.getFeeData(),
    rpc.getBlock("latest"),
  ]);

  const baseFee = block?.baseFeePerGas ?? 0n;

  let maxPriorityFeePerGas =
    feeData.maxPriorityFeePerGas ?? MIN_PRIORITY_FEE;
  if (maxPriorityFeePerGas < MIN_PRIORITY_FEE) {
    maxPriorityFeePerGas = MIN_PRIORITY_FEE;
  }

  let maxFeePerGas = feeData.maxFeePerGas ?? 0n;
  if (maxFeePerGas <= 0n) {
    maxFeePerGas = feeData.gasPrice ?? 0n;
  }
  if (maxFeePerGas <= 0n && baseFee > 0n) {
    maxFeePerGas = baseFee * 2n + maxPriorityFeePerGas;
  }

  const minMaxFee = baseFee + maxPriorityFeePerGas;
  if (maxFeePerGas < minMaxFee) {
    maxFeePerGas = minMaxFee;
  }

  maxFeePerGas =
    (maxFeePerGas * MAX_FEE_BUFFER_NUM) / MAX_FEE_BUFFER_DEN;
  maxPriorityFeePerGas =
    (maxPriorityFeePerGas * PRIORITY_BUFFER_NUM) / PRIORITY_BUFFER_DEN;

  if (maxFeePerGas < baseFee + maxPriorityFeePerGas) {
    maxFeePerGas = baseFee * 2n + maxPriorityFeePerGas;
  }

  return { maxFeePerGas, maxPriorityFeePerGas };
}

export function isMaxFeeBelowBaseFeeError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return (
    msg.includes("max fee per gas less than block base fee") ||
    msg.includes("maxFeePerGas") && msg.includes("baseFee")
  );
}
