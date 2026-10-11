// The real RPC behind the seam (05 S05-38): two providers with fallback, the server's chain definition.
import "server-only";
import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  defineChain,
  fallback,
  http,
  type Address,
  type Hex,
  type PublicClient,
  WaitForTransactionReceiptTimeoutError,
} from "viem";
import { foundry, monadTestnet } from "viem/chains";
import { ChainRevert, ChainUnavailable, type ContractTx, type Rpc } from "./types";

export function serverChain(chainId: number, rpc1: string, rpc2: string) {
  const base = chainId === 10143 ? monadTestnet : chainId === 31337 ? foundry : null;
  if (!base) throw new Error("unsupported chain id");
  return defineChain({ ...base, rpcUrls: { default: { http: [rpc1, rpc2] } } });
}

export function serverTransport(rpc1: string, rpc2: string) {
  return fallback(
    [http(rpc1, { timeout: 5_000, retryCount: 1 }), http(rpc2, { timeout: 5_000, retryCount: 1 })],
    { rank: false, retryCount: 1 },
  );
}

/** Turns a viem revert into ChainRevert, and transport failures into ChainUnavailable. */
export function mapChainError(e: unknown): Error {
  if (e instanceof ChainRevert || e instanceof ChainUnavailable) return e;
  if (e instanceof BaseError) {
    const revert = e.walk((x) => x instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      return new ChainRevert(revert.data?.errorName ?? "unknown", revert.data?.args ?? []);
    }
    const transport = e.walk((x) =>
      ["HttpRequestError", "TimeoutError", "RpcRequestError", "WebSocketRequestError"].includes(
        (x as Error).name,
      ),
    );
    if (transport) return new ChainUnavailable(e);
  }
  return e instanceof Error ? e : new Error(String(e));
}

async function wrap<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (e) {
    throw mapChainError(e);
  }
}

export function viemRpc(client: PublicClient): Rpc {
  return {
    readContract: (req, opts) =>
      wrap(
        client.readContract({
          ...req,
          ...(opts?.blockNumber === undefined
            ? { blockTag: "latest" }
            : { blockNumber: opts.blockNumber }),
        }),
      ),
    simulate: async (req, from) => {
      await wrap(client.simulateContract({ ...req, account: from }));
    },
    estimateGas: (req, from) => wrap(client.estimateContractGas({ ...req, account: from })),
    estimateFees: async () => {
      const f = await wrap(client.estimateFeesPerGas());
      return { maxFeePerGas: f.maxFeePerGas, maxPriorityFeePerGas: f.maxPriorityFeePerGas };
    },
    getBalance: (address: Address) => wrap(client.getBalance({ address, blockTag: "latest" })),
    getTransactionCount: (address: Address) =>
      wrap(client.getTransactionCount({ address, blockTag: "latest" })),
    sendRaw: (serialized: Hex) =>
      wrap(client.sendRawTransaction({ serializedTransaction: serialized })),
    waitForReceipt: async (hash, timeout) => {
      try {
        return await client.waitForTransactionReceipt({ hash, pollingInterval: 250, timeout });
      } catch (e) {
        if (e instanceof WaitForTransactionReceiptTimeoutError) return null;
        throw mapChainError(e);
      }
    },
    getReceipt: async (hash) => {
      try {
        return await client.getTransactionReceipt({ hash });
      } catch (e) {
        if (e instanceof BaseError && e.name === "TransactionReceiptNotFoundError") return null;
        throw mapChainError(e);
      }
    },
    finalizedBlockNumber: async () =>
      (await wrap(client.getBlock({ blockTag: "finalized" }))).number,
    getBlockNumber: () => wrap(client.getBlockNumber({ cacheTime: 0 })),
  };
}

export function createServerRpc(chainId: number, rpc1: string, rpc2: string): Rpc {
  const chain = serverChain(chainId, rpc1, rpc2);
  return viemRpc(createPublicClient({ chain, transport: serverTransport(rpc1, rpc2) }));
}

export type { ContractTx };
