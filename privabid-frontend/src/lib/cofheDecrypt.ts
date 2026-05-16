import { FheTypes } from "@cofhe/sdk";

export async function ensureCofheConnected(
  client: {
    connected: boolean;
    connect: (a: unknown, b: unknown) => Promise<unknown>;
  },
  publicClient: unknown,
  walletClient: unknown,
): Promise<void> {
  if (!client.connected) {
    await client.connect(publicClient, walletClient);
  }
  if (!client.connected) {
    throw new Error("CoFHE could not connect — use Arbitrum Sepolia in MetaMask.");
  }
}

export async function decryptSealedAmountForView(
  client: {
    permits: { getOrCreateSelfPermit: () => Promise<unknown> };
    decryptForView: (
      handle: bigint,
      utype: (typeof FheTypes)[keyof typeof FheTypes],
    ) => { execute: () => Promise<unknown> };
  },
  handle: bigint,
): Promise<bigint> {
  await client.permits.getOrCreateSelfPermit();
  const result = await client
    .decryptForView(handle, FheTypes.Uint64)
    .execute();
  if (typeof result === "bigint") return result;
  if (result && typeof result === "object" && "decryptedValue" in result) {
    const v = (result as { decryptedValue?: bigint }).decryptedValue;
    return BigInt(v ?? 0);
  }
  return BigInt(String(result));
}
