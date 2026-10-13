// The browser's one public client (06 S06-21): two RPC providers, JSON-RPC batching, no Multicall.
import { amplopEnvelopesAbi } from "@amplop/shared/abi";
import type { Abi } from "viem";

// Widened so a function name can be a plain string; the contract checks the call itself.
const ABI: Abi = amplopEnvelopesAbi;
import { createPublicClient, defineChain, fallback, http, type PublicClient } from "viem";
import { CHAIN_ID, CONTRACT, RPC_URL, RPC_URL_FALLBACK } from "../env";

export const chain = defineChain({
  id: CHAIN_ID,
  name: CHAIN_ID === 10143 ? "Monad Testnet" : "Anvil",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL, RPC_URL_FALLBACK] } },
});

export const transport = fallback(
  [
    http(RPC_URL, { batch: true, retryCount: 0, timeout: 10_000 }),
    http(RPC_URL_FALLBACK, { batch: true, retryCount: 0, timeout: 10_000 }),
  ],
  // Public RPCs drop the odd request under load; viem backs off 150 ms, 300 ms, 600 ms between tries.
  { rank: false, retryCount: 3 },
);

export const publicClient: PublicClient = createPublicClient({ chain, transport });

/** Reads AmplopEnvelopes at `latest`. */
export function read<T>(functionName: string, args: readonly unknown[] = []): Promise<T> {
  return publicClient.readContract({
    address: CONTRACT,
    abi: ABI,
    functionName,
    args,
    blockTag: "latest",
  }) as Promise<T>;
}

export type AccountInfo = {
  owner: `0x${string}`;
  trusted: `0x${string}`;
  split: readonly number[];
  pendingSplit: readonly number[];
  pendingSplitStartsAt: bigint;
  lockOn: boolean;
  everDeposited: boolean;
  requestSeq: bigint;
  skipSeconds: bigint;
};

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
