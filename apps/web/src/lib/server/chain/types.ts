// The chain seam (05 S05-44). Feature logic takes a Chain, so unit tests pass a fake RPC.
import "server-only";
import type { Abi, Address, Hex, TransactionReceipt } from "viem";

export type Role = "treasury" | "cardService" | "feeSponsor";

export type ContractTx = {
  address: Address;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
};
export type TransferTx = { to: Address; value: bigint };
export type TxRequest = ContractTx | TransferTx;

export type Fees = { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint };

/** The RPC calls the server makes. The real one wraps a viem public client; tests fake it. */
export interface Rpc {
  readContract(req: ContractTx, opts?: { blockNumber?: bigint }): Promise<unknown>;
  simulate(req: ContractTx, from: Address): Promise<void>;
  estimateGas(req: ContractTx, from: Address): Promise<bigint>;
  estimateFees(): Promise<Fees>;
  getBalance(address: Address): Promise<bigint>;
  getTransactionCount(address: Address): Promise<number>;
  sendRaw(serialized: Hex): Promise<Hex>;
  waitForReceipt(hash: Hex, timeoutMs: number): Promise<TransactionReceipt | null>;
  getReceipt(hash: Hex): Promise<TransactionReceipt | null>;
  finalizedBlockNumber(): Promise<bigint>;
  getBlockNumber(): Promise<bigint>;
}

export type SendResult = {
  hash: Hex;
  receipt: TransactionReceipt | null;
  confirmMs: number | null;
};

export type SendHooks = { beforeBroadcast?(hash: Hex): Promise<void> };

/** A revert, decoded from the contract's custom errors when possible. */
export class ChainRevert extends Error {
  constructor(
    readonly errorName: string,
    readonly args: readonly unknown[] = [],
    readonly hash?: Hex,
  ) {
    super(`reverted: ${errorName}`);
    this.name = "ChainRevert";
  }
}

/** The RPC could not be reached (after the fallback); nothing was sent when thrown before broadcast. */
export class ChainUnavailable extends Error {
  constructor(cause?: unknown) {
    super("chain unavailable", { cause });
    this.name = "ChainUnavailable";
  }
}

export class ChainBusy extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "ChainBusy";
  }
}

export class ReserveTooLow extends Error {
  constructor() {
    super("transfer would leave the wallet under its reserve");
    this.name = "ReserveTooLow";
  }
}
