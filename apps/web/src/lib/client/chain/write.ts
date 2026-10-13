// Every user transaction goes through sendUserTx (06 S06-23 to S06-27).
"use client";
import { amplopEnvelopesAbi } from "@amplop/shared/abi";
import type { Abi } from "viem";

// Widened so a function name can be a plain string; the contract checks the call itself.
const ABI: Abi = amplopEnvelopesAbi;
import { GAS_FLOOR, TYPICAL_ACTION_GAS, type WriteFunction } from "@amplop/shared/constants";
import {
  BaseError,
  ContractFunctionRevertedError,
  createWalletClient,
  type Hash,
  type TransactionReceipt,
  WaitForTransactionReceiptTimeoutError,
} from "viem";
import { currentSession, refreshRole } from "../account";
import { api, ApiError } from "../api";
import { CONTRACT, EXPLORER_TX_URL } from "../env";
import { announceWrite, invalidateAll } from "../query";
import { writeItem } from "../storage";
import { chain, publicClient, transport } from "./client";

export type TxStatus =
  "preparing" | "funding" | "signing" | "sending" | "confirming" | "slow" | "done" | "failed";
export type Call = { functionName: WriteFunction; args: readonly unknown[] };

/** A decoded contract custom error: nothing was sent, or the receipt reverted for this reason. */
export class ChainError extends Error {
  constructor(
    readonly errorName: string,
    readonly reverted = false,
  ) {
    super(errorName);
    this.name = "ChainError";
  }
}

/** The account could not be funded; `code` is the API's code (07 S07-24) or "offline". */
export class NotFunded extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "NotFunded";
  }
}

export class TxTimeout extends Error {
  constructor(readonly hash: Hash) {
    super("receipt timeout");
    this.name = "TxTimeout";
  }
}

export function gasLimitFor(estimate: bigint, functionName: WriteFunction): bigint {
  const withMargin = estimate + estimate / 5n;
  const floor = GAS_FLOOR[functionName];
  return withMargin > floor ? withMargin : floor;
}

export function proofUrl(hash: string): string {
  return `${EXPLORER_TX_URL}${hash}`;
}

function decode(e: unknown): ChainError | null {
  if (!(e instanceof BaseError)) return null;
  const r = e.walk((x) => x instanceof ContractFunctionRevertedError);
  return r instanceof ContractFunctionRevertedError
    ? new ChainError(r.data?.errorName ?? "unknown")
    : null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Monad lets a low-balance account send one transaction every 3 blocks (MONSKILLS reserve-balance). */
async function waitBlocksAfter(block: bigint, n = 3n): Promise<void> {
  for (let i = 0; i < 120; i++) {
    if ((await publicClient.getBlockNumber({ cacheTime: 0 })) >= block + n) return;
    await sleep(250);
  }
}

const lastBlock = new Map<string, bigint>();
const funding = new Map<string, Promise<void>>();

/** S06-24. Single flight per address: a second caller waits for the first. */
export function ensureFunded(address: `0x${string}`, neededWei = 0n): Promise<void> {
  const running = funding.get(address);
  if (running) return running;
  const p = fund(address, neededWei).finally(() => funding.delete(address));
  funding.set(address, p);
  return p;
}

async function fund(address: `0x${string}`, neededWei: bigint): Promise<void> {
  const [balance, fees] = await Promise.all([
    publicClient.getBalance({ address, blockTag: "latest" }),
    publicClient.estimateFeesPerGas(),
  ]);
  const unit = TYPICAL_ACTION_GAS * fees.maxFeePerGas;
  if (balance >= 3n * unit && balance >= neededWei) return;
  let res: { status: "sent" | "not_needed"; txHash?: Hash } | undefined;
  for (const wait of [0, 1_000, 3_000, 9_000]) {
    if (wait) await sleep(wait);
    try {
      res = await api.post(
        "/api/fund",
        { address: address.toLowerCase() },
        { auth: { action: "fund" }, device: true },
      );
      break;
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      if (e.status !== 502 && e.status !== 0 && e.status !== 500) throw new NotFunded(e.code);
      if (wait === 9_000)
        throw new NotFunded(e.code === "offline" ? "offline" : "fund_unavailable");
    }
  }
  if (res?.status === "sent" && res.txHash) {
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: res.txHash,
      timeout: 60_000,
    });
    await waitBlocksAfter(receipt.blockNumber);
  }
}

/** S06-23 step 1: one write at a time per account, across tabs. */
async function withTxLock<T>(address: string, fn: () => Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && "locks" in navigator) {
    return navigator.locks.request(`amplop-tx-${address}`, fn);
  }
  const prev = tabLock;
  let release!: () => void;
  tabLock = new Promise((r) => (release = r));
  await prev;
  try {
    return await fn();
  } finally {
    release();
  }
}
let tabLock: Promise<void> = Promise.resolve();

export async function sendUserTx(
  call: Call,
  opts: { onStatus?: (s: TxStatus) => void } = {},
): Promise<{ hash: Hash; receipt: TransactionReceipt; proofUrl: string }> {
  const session = currentSession();
  if (!session) throw new Error("not signed in");
  const status = opts.onStatus ?? (() => undefined);
  const request = {
    address: CONTRACT,
    abi: ABI,
    functionName: call.functionName,
    args: call.args,
  } as const;
  try {
    return await withTxLock(session.address, async () => {
      status("preparing");
      try {
        await publicClient.simulateContract({ ...request, account: session.account });
      } catch (e) {
        throw decode(e) ?? e;
      }
      // prepare: false sends a plain estimate. With fee fields, some providers (dRPC) price the whole
      // gas cap and answer "insufficient balance" for a freshly funded account.
      const estimate = await publicClient.estimateContractGas({
        ...request,
        account: session.account,
        prepare: false,
      });
      const gas = gasLimitFor(estimate, call.functionName);
      const fees = await publicClient.estimateFeesPerGas();
      status("funding");
      await ensureFunded(session.address, gas * fees.maxFeePerGas);
      const last = lastBlock.get(session.address);
      if (last !== undefined) await waitBlocksAfter(last);
      status("signing");
      const wallet = createWalletClient({ account: session.account, chain, transport });
      const write = () =>
        wallet.writeContract({
          ...request,
          gas,
          maxFeePerGas: fees.maxFeePerGas,
          maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
        });
      let hash: Hash;
      try {
        status("sending");
        hash = await write();
      } catch (e) {
        if (!/nonce too low/i.test(e instanceof Error ? e.message : "")) throw e;
        hash = await write(); // S06-36: retried once without telling the user
      }
      writeItem(
        "session",
        "amplop.lastTx",
        JSON.stringify({ hash, functionName: call.functionName, at: Date.now() }),
      );
      status("confirming");
      const receipt = await waitReceipt(hash, () => {
        status("slow");
      });
      lastBlock.set(session.address, receipt.blockNumber);
      if (receipt.status === "reverted") {
        let reason = "unknown";
        try {
          await publicClient.simulateContract({ ...request, account: session.account });
        } catch (e) {
          reason = decode(e)?.errorName ?? "unknown";
        }
        throw new ChainError(reason, true);
      }
      announceWrite(hash);
      invalidateAll();
      await refreshRole().catch(() => undefined);
      status("done");
      return { hash, receipt, proofUrl: proofUrl(hash) };
    });
  } catch (e) {
    status("failed");
    throw e;
  }
}

/** 30 s, then "taking longer" while polling for up to 2 minutes. */
async function waitReceipt(hash: Hash, onSlow: () => void): Promise<TransactionReceipt> {
  try {
    return await publicClient.waitForTransactionReceipt({ hash, timeout: 30_000 });
  } catch (e) {
    if (!(e instanceof WaitForTransactionReceiptTimeoutError)) throw e;
  }
  onSlow();
  try {
    return await publicClient.waitForTransactionReceipt({ hash, timeout: 90_000 });
  } catch (e) {
    if (e instanceof WaitForTransactionReceiptTimeoutError) throw new TxTimeout(hash);
    throw e;
  }
}

/** S06-44: after a reload, check the last sent hash before offering to send again. */
export async function lastTxReceipt(hash: Hash): Promise<TransactionReceipt | null> {
  try {
    return await publicClient.getTransactionReceipt({ hash });
  } catch {
    return null;
  }
}
