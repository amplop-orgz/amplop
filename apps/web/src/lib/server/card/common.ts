// Shared pieces of the card service (spec 09): ids, the purchase lock, contract calls and event decoding.
import "server-only";
import { amplopEnvelopesAbi } from "@amplop/shared/abi";
import { sql } from "drizzle-orm";
import { decodeEventLog, pad, type Hex, type Log } from "viem";
import { chain } from "../chain/chain";
import { db, type Tx } from "../db";

export const ENVELOPES = ["food", "transport", "study", "everyday", "emergency"] as const;
export type EnvelopeName = (typeof ENVELOPES)[number];

export const STATES = ["none", "held", "collected", "released", "refunded"] as const;
export type HoldState = (typeof STATES)[number];

export const HOLD_PERIOD = 7n * 86400n;

/** 01 section 5: the 16 random bytes, left-padded to bytes32. */
export function purchaseIdBytes(purchaseId: string): Hex {
  return pad(`0x${purchaseId}`, { size: 32 });
}

export function contractCall(functionName: string, args: readonly unknown[]) {
  return { address: chain().cfg.contract, abi: amplopEnvelopesAbi, functionName, args };
}

let decimals: number | undefined;

/** AUSD decimals, read once per instance (09 S09-11). */
export async function tokenDecimals(): Promise<number> {
  decimals ??= await chain().read<number>("tokenDecimals");
  return decimals;
}

/** Runs `fn` holding the purchase's advisory lock, or returns null when another request holds it. */
export async function withPurchaseLock<T>(
  purchaseId: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<{ value: T } | null> {
  return db().transaction(async (tx) => {
    const rows = await tx.execute<{ locked: boolean }>(
      sql`SELECT pg_try_advisory_xact_lock(hashtextextended(${`purchase:${purchaseId}`}, 0)) AS locked`,
    );
    if (!rows[0]?.locked) return null;
    return { value: await fn(tx) };
  });
}

export type Decision =
  | {
      result: "approved";
      envelope: number;
      everydayStepIn: boolean;
      amount: bigint;
      shopType: number;
      blockNumber: bigint;
    }
  | {
      result: "declined";
      reason: "blocked" | "not_enough";
      amount: bigint;
      shopType: number;
      blockNumber: bigint;
    };

/** The single PurchaseApproved or PurchaseDeclined of this contract for this purchase among `logs`. */
export function decodeDecision(logs: readonly Log[], idBytes: Hex): Decision | "none" | "many" {
  const found: Decision[] = [];
  for (const l of logs) {
    if (l.address.toLowerCase() !== chain().cfg.contract.toLowerCase()) continue;
    let d;
    try {
      d = decodeEventLog({ abi: amplopEnvelopesAbi, data: l.data, topics: l.topics });
    } catch {
      continue; // another contract's or another event's log
    }
    const a = d.args as Record<string, unknown>;
    if (a.purchaseId !== idBytes) continue;
    const blockNumber = l.blockNumber ?? 0n;
    if (d.eventName === "PurchaseApproved") {
      found.push({
        result: "approved",
        envelope: Number(a.envelope),
        everydayStepIn: Boolean(a.everydayStepIn),
        amount: a.amount as bigint,
        shopType: Number(a.shopType),
        blockNumber,
      });
    } else if (d.eventName === "PurchaseDeclined") {
      found.push({
        result: "declined",
        reason: Number(a.reason) === 1 ? "blocked" : "not_enough",
        amount: a.amount as bigint,
        shopType: Number(a.shopType),
        blockNumber,
      });
    }
  }
  if (found.length === 0) return "none";
  if (found.length > 1) return "many";
  return found[0] as Decision;
}

export type PurchaseInfo = {
  accountId: bigint;
  envelope: number;
  amount: bigint;
  held: bigint;
  collected: bigint;
  refunded: bigint;
  shopType: number;
  createdAt: bigint;
  state: number;
  moved: boolean;
  everydayStepIn: boolean;
};

export function readPurchase(purchaseId: string): Promise<PurchaseInfo> {
  return chain().read<PurchaseInfo>("purchase", [purchaseIdBytes(purchaseId)]);
}

/** Stores a sent hash before broadcast, outside the lock transaction, so a crash keeps it (05 S05-41). */
export function storeHash(purchaseId: string, column: "tx_hash" | "settle_tx") {
  return async (hash: Hex): Promise<void> => {
    if (column === "tx_hash") {
      await db().execute(
        sql`UPDATE purchases SET tx_hash = ${hash}, sent_hashes = array_append(sent_hashes, ${hash}), updated_at = now() WHERE purchase_id = ${purchaseId}`,
      );
    } else {
      await db().execute(
        sql`UPDATE purchases SET settle_tx = ${hash}, updated_at = now() WHERE purchase_id = ${purchaseId}`,
      );
    }
  };
}
