// Server chain access (05 S05-38 to S05-43): reads, the start-up checks and the one send function.
import "server-only";
import { amplopEnvelopesAbi } from "@amplop/shared/abi";
import { GAS_FLOOR } from "@amplop/shared/constants";
import { sql } from "drizzle-orm";
import {
  decodeEventLog,
  encodeFunctionData,
  type Address,
  type Hex,
  type LocalAccount,
  type TransactionReceipt,
  keccak256,
  parseGwei,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sendAlert } from "../alerts";
import { db, type Tx } from "../db";
import { env, isDemo } from "../env";
import { log } from "../log";
import { DAILY_BUDGET_WEI, RESERVE_WEI } from "./reserve";
import { createServerRpc } from "./rpc";
import {
  ChainBusy,
  ChainRevert,
  ChainUnavailable,
  ReserveTooLow,
  type ContractTx,
  type Role,
  type Rpc,
  type SendHooks,
  type SendResult,
  type TxRequest,
} from "./types";

export const MAX_FEE_PER_GAS = parseGwei("1000");
const TRANSFER_GAS = 21_000n;
const RECEIPT_TIMEOUT_MS = 10_000;
const NONCE_ROW_FRESH_MS = 30_000;

export type ChainConfig = {
  rpc: Rpc;
  chainId: number;
  contract: Address;
  token: Address;
  settlement: Address;
  accounts: Record<Role, LocalAccount>;
  demo: boolean;
};

const ROLE_GETTER = { treasury: "treasury", cardService: "cardService" } as const;

export class Chain {
  private ready: Promise<boolean> | undefined;

  constructor(readonly cfg: ChainConfig) {}

  get rpc(): Rpc {
    return this.cfg.rpc;
  }

  address(role: Role): Address {
    return this.cfg.accounts[role].address;
  }

  /** Reads AmplopEnvelopes at `latest` (or a given block). */
  async read<T>(
    functionName: string,
    args: readonly unknown[] = [],
    opts?: { blockNumber?: bigint },
  ): Promise<T> {
    return (await this.cfg.rpc.readContract(
      { address: this.cfg.contract, abi: amplopEnvelopesAbi, functionName, args },
      opts,
    )) as T;
  }

  /** S05-39 and S05-32, once per instance: keys and addresses must match the contract. */
  checkReady(): Promise<boolean> {
    this.ready ??= this.runChecks();
    return this.ready;
  }

  private async runChecks(): Promise<boolean> {
    const [treasury, cardService, settlement, token, demo] = await Promise.all([
      this.read<Address>("treasury"),
      this.read<Address>("cardService"),
      this.read<Address>("settlement"),
      this.read<Address>("token"),
      this.read<boolean>("demoMode"),
    ]);
    const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
    const wrong: string[] = [];
    for (const role of ["treasury", "cardService"] as const) {
      if (!same(this.address(role), role === ROLE_GETTER.treasury ? treasury : cardService))
        wrong.push(role);
    }
    if (!same(this.cfg.settlement, settlement)) wrong.push("SETTLEMENT_ADDRESS");
    if (!same(this.cfg.token, token)) wrong.push("NEXT_PUBLIC_AUSD_ADDRESS");
    const keys = new Set(Object.values(this.cfg.accounts).map((a) => a.address.toLowerCase()));
    if (keys.size !== 3) log.warn("keys_not_distinct");
    if (demo !== this.cfg.demo) {
      log.error("demo_mismatch", { contract: demo, server: this.cfg.demo });
      await sendAlert(
        "demo_mismatch",
        "Amplop: DEMO_MODE on the server differs from the contract's demoMode.",
      );
    }
    if (wrong.length) {
      log.error("chain_misconfigured", { names: wrong });
      await sendAlert(
        "chain_misconfigured",
        `Amplop: server keys or addresses differ from the contract: ${wrong.join(", ")}.`,
      );
      return false;
    }
    return true;
  }

  /**
   * The one send function (S05-41). Serialises sends per key across instances with a Postgres
   * advisory lock held until the receipt, so the next send sees the new nonce. A caller already in a
   * transaction passes it as `opts.tx`, so one request never needs two pooled connections.
   */
  async send(
    role: Role,
    request: TxRequest,
    hooks?: SendHooks,
    opts?: { finalized?: boolean; tx?: Tx },
  ): Promise<SendResult> {
    const ready = await this.checkReady().catch((e: unknown) => {
      this.ready = undefined; // a failed read is retried on the next send
      throw e;
    });
    if (!ready) throw new Error("chain misconfigured");
    const account = this.cfg.accounts[role];
    const rpc = this.cfg.rpc;
    try {
      const inTx = <T>(fn: (tx: Tx) => Promise<T>): Promise<T> =>
        opts?.tx ? fn(opts.tx) : db().transaction(fn);
      return await inTx(async (tx) => {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtextextended(${"signer:" + account.address.toLowerCase()}, 0))`,
        );
        const isCall = "functionName" in request;
        let gas = TRANSFER_GAS;
        if (isCall) {
          await rpc.simulate(request, account.address);
          gas = gasLimit(await rpc.estimateGas(request, account.address), request.functionName);
        }
        const fees = await rpc.estimateFees();
        if (fees.maxFeePerGas > MAX_FEE_PER_GAS) throw new ChainBusy("fee above cap");
        await this.checkReserve(
          role,
          account.address,
          isCall ? 0n : request.value,
          gas * fees.maxFeePerGas,
        );

        const rows = await tx.execute<{ next_nonce: string; age_ms: string }>(
          sql`SELECT next_nonce, extract(epoch from now() - updated_at) * 1000 AS age_ms FROM signer_nonces WHERE address = ${account.address.toLowerCase()}`,
        );
        const row = rows[0];
        const pickNonce = async () => {
          const chainNext = BigInt(await rpc.getTransactionCount(account.address));
          if (row && BigInt(row.next_nonce) > chainNext && Number(row.age_ms) < NONCE_ROW_FRESH_MS)
            return BigInt(row.next_nonce);
          return chainNext;
        };
        const sign = async (nonce: bigint) => {
          const serialized = await account.signTransaction({
            type: "eip1559",
            chainId: this.cfg.chainId,
            nonce: Number(nonce),
            gas,
            maxFeePerGas: fees.maxFeePerGas,
            maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
            ...(isCall
              ? { to: request.address, data: encodeFunctionData(request), value: 0n }
              : { to: request.to, value: request.value }),
          });
          return { serialized, hash: keccak256(serialized) };
        };

        let nonce = await pickNonce();
        let signed = await sign(nonce);
        await hooks?.beforeBroadcast?.(signed.hash);
        let sentAt = Date.now();
        try {
          await broadcast(rpc, signed.serialized);
        } catch (e) {
          if (!(e instanceof NonceTooLow)) throw e;
          nonce = BigInt(await rpc.getTransactionCount(account.address));
          signed = await sign(nonce);
          await hooks?.beforeBroadcast?.(signed.hash);
          sentAt = Date.now();
          await broadcast(rpc, signed.serialized);
        }
        await tx.execute(sql`
          INSERT INTO signer_nonces (address, next_nonce, updated_at)
          VALUES (${account.address.toLowerCase()}, ${(nonce + 1n).toString()}, now())
          ON CONFLICT (address) DO UPDATE SET next_nonce = excluded.next_nonce, updated_at = now()`);

        let receipt = await rpc.waitForReceipt(signed.hash, RECEIPT_TIMEOUT_MS);
        const confirmMs = receipt ? Date.now() - sentAt : null;
        if (receipt && opts?.finalized) receipt = await waitFinalized(rpc, receipt);
        if (receipt?.status === "reverted") throw new ChainRevert("unknown", [], signed.hash);
        return { hash: signed.hash, receipt, confirmMs };
      });
    } catch (e) {
      if (isLockTimeout(e)) throw new ChainBusy("key lock timeout");
      throw e;
    }
  }

  private async checkReserve(
    role: Role,
    address: Address,
    value: bigint,
    maxGasCost: bigint,
  ): Promise<void> {
    const balance = await this.cfg.rpc.getBalance(address);
    if (value > 0n && balance - value - maxGasCost < RESERVE_WEI) throw new ReserveTooLow();
    if (balance < RESERVE_WEI + DAILY_BUDGET_WEI[role]) {
      // Not awaited: the alert's own query must not wait for this send's connection.
      void sendAlert(
        `reserve_low:${role}`,
        `Amplop ${role} wallet is below its reserve plus one day's budget. Refill it.`,
      );
    }
  }

  /** S05-43: the single matching AmplopEnvelopes log in a receipt. */
  findEvent(receipt: TransactionReceipt, eventName: string, match: Record<string, unknown> = {}) {
    const found = [];
    for (const l of receipt.logs) {
      if (l.address.toLowerCase() !== this.cfg.contract.toLowerCase()) continue;
      try {
        const d = decodeEventLog({ abi: amplopEnvelopesAbi, data: l.data, topics: l.topics });
        if (d.eventName !== eventName) continue;
        const args = d.args as Record<string, unknown>;
        if (Object.entries(match).every(([k, v]) => args[k] === v)) found.push(d);
      } catch {
        continue; // not one of this contract's events
      }
    }
    if (found.length !== 1)
      throw new Error(`expected one ${eventName} log, found ${String(found.length)}`);
    return found[0] as NonNullable<(typeof found)[0]>;
  }
}

export function gasLimit(estimate: bigint, functionName: string): bigint {
  const withMargin = (estimate * 12n + 9n) / 10n;
  const floor = (GAS_FLOOR as Record<string, bigint>)[functionName] ?? 0n;
  return withMargin > floor ? withMargin : floor;
}

class NonceTooLow extends Error {}

async function broadcast(rpc: Rpc, serialized: Hex): Promise<void> {
  try {
    await rpc.sendRaw(serialized);
  } catch (e) {
    const text = errorText(e);
    if (/already known/i.test(text)) return;
    if (/nonce too low/i.test(text)) throw new NonceTooLow();
    throw e instanceof ChainUnavailable ? e : new ChainUnavailable(e);
  }
}

function errorText(e: unknown): string {
  let s = "";
  for (let x: unknown = e; x instanceof Error; x = x.cause)
    s += ` ${x.message} ${(x as { details?: string }).details ?? ""}`;
  return s;
}

async function waitFinalized(rpc: Rpc, receipt: TransactionReceipt): Promise<TransactionReceipt> {
  const deadline = Date.now() + RECEIPT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if ((await rpc.finalizedBlockNumber()) >= receipt.blockNumber) {
      const again = await rpc.getReceipt(receipt.transactionHash);
      if (again?.blockHash === receipt.blockHash) return again;
      throw new ChainUnavailable(new Error("receipt changed before finality"));
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new ChainUnavailable(new Error("finality wait timed out"));
}

function isLockTimeout(e: unknown): boolean {
  for (let x: unknown = e; x instanceof Error; x = x.cause) {
    if ((x as { code?: unknown }).code === "55P03") return true;
  }
  return false;
}

let shared: Chain | undefined;

/** The instance's chain, built lazily from env (S05-38). */
export function chain(): Chain {
  if (!shared) {
    const e = env();
    shared = new Chain({
      rpc: createServerRpc(e.chainId, e.MONAD_RPC_URL, e.MONAD_RPC_URL_FALLBACK),
      chainId: e.chainId,
      contract: e.NEXT_PUBLIC_CONTRACT_ADDRESS,
      token: e.NEXT_PUBLIC_AUSD_ADDRESS,
      settlement: e.SETTLEMENT_ADDRESS,
      accounts: {
        treasury: privateKeyToAccount(e.TREASURY_PRIVATE_KEY as Hex),
        cardService: privateKeyToAccount(e.CARD_SERVICE_PRIVATE_KEY as Hex),
        feeSponsor: privateKeyToAccount(e.FEE_SPONSOR_PRIVATE_KEY as Hex),
      },
      demo: isDemo(),
    });
  }
  return shared;
}

/** Tests only. */
export function setChain(c: Chain | undefined): void {
  shared = c;
}

export type { ContractTx };
