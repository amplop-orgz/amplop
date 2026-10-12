// POST /api/card/authorize (09 S09-11 to S09-18): convert, record once per idempotency key, ask the
// contract, and answer from the receipt. A retry with the same key resumes and never pays twice.
import "server-only";
import { amplopEnvelopesAbi } from "@amplop/shared/abi";
import { shopAmountToUnits, type ShopCurrency } from "@amplop/shared/money";
import { eq, sql } from "drizzle-orm";
import type { Hex, Log } from "viem";
import { sendAlert } from "../alerts";
import { chain } from "../chain/chain";
import { ChainBusy, ChainRevert, ChainUnavailable } from "../chain/types";
import { db, schema, type Tx } from "../db";
import { env } from "../env";
import { ApiError, apiError } from "../http/errors";
import { randomHex16 } from "../ids";
import { log } from "../log";
import {
  contractCall,
  decodeDecision,
  ENVELOPES,
  purchaseIdBytes,
  storeHash,
  tokenDecimals,
  withPurchaseLock,
  type Decision,
  type EnvelopeName,
} from "./common";

export type AuthorizeInput = {
  accountId: bigint;
  amount: string; // minor units of `currency`
  currency: ShopCurrency;
  merchantName: string;
  merchantCity: string;
  mcc: number;
  idempotencyKey: string;
};

export type AuthorizeResult = {
  purchaseId: string;
  result: "approved" | "declined";
  envelope?: EnvelopeName;
  everydayStepIn: boolean;
  reason?: "blocked" | "not_enough";
  amountUnits: string;
  txHash: string;
  confirmMs: number | null;
};

type Row = typeof schema.purchases.$inferSelect;

const NOTHING_CHARGED = "Nothing was charged. Please try again.";
const IN_PROGRESS_WAIT_MS = 12_000;
const RESEND_AFTER_MS = 60_000;

const unavailable = () => new ApiError(502, "chain_unavailable", NOTHING_CHARGED);
const busy = () => new ApiError(502, "chain_busy", NOTHING_CHARGED);

export async function authorizePurchase(input: AuthorizeInput): Promise<AuthorizeResult> {
  const e = env();
  const decimals = await tokenDecimals();
  const units = shopAmountToUnits(input.currency, BigInt(input.amount), decimals, {
    idrPerUsd: e.idrPerUsd,
    usdPerEur: e.usdPerEur,
  });
  if (units === 0n) throw apiError("amount_too_small");
  if (units > 10_000n * 10n ** BigInt(decimals)) throw apiError("amount_too_large");

  const inserted = await db()
    .insert(schema.purchases)
    .values({
      purchaseId: randomHex16(),
      accountId: input.accountId,
      idempotencyKey: input.idempotencyKey,
      merchantName: input.merchantName,
      merchantCity: input.merchantCity,
      currency: input.currency,
      amountMinor: BigInt(input.amount),
      mcc: input.mcc,
      amountUnits: units,
      result: "pending",
    })
    .onConflictDoNothing({ target: schema.purchases.idempotencyKey })
    .returning();
  let row = inserted[0];
  if (!row) {
    row = await byKey(input.idempotencyKey);
    const same =
      row.accountId === input.accountId &&
      row.merchantName === input.merchantName &&
      row.merchantCity === input.merchantCity &&
      row.currency === input.currency &&
      row.amountMinor === BigInt(input.amount) &&
      row.mcc === input.mcc;
    if (!same) throw apiError("idempotency_conflict");
    if (isFinal(row)) return answer(row);
  }
  return work(row.purchaseId);
}

async function byKey(key: string): Promise<Row> {
  const rows = await db()
    .select()
    .from(schema.purchases)
    .where(eq(schema.purchases.idempotencyKey, key));
  if (!rows[0]) throw new Error("purchase row vanished");
  return rows[0];
}

async function byId(id: string, tx: Tx | null = null): Promise<Row> {
  const rows = await (tx ?? db())
    .select()
    .from(schema.purchases)
    .where(eq(schema.purchases.purchaseId, id));
  if (!rows[0]) throw new Error("purchase row vanished");
  return rows[0];
}

function isFinal(r: Row): boolean {
  return r.result === "approved" || r.result === "declined";
}

function answer(r: Row): AuthorizeResult {
  return {
    purchaseId: r.purchaseId,
    result: r.result as "approved" | "declined",
    ...(r.result === "approved" || r.declineReason === "not_enough"
      ? { envelope: ENVELOPES[r.envelope ?? 3] }
      : {}),
    everydayStepIn: r.everydayStepIn,
    ...(r.declineReason ? { reason: r.declineReason as "blocked" | "not_enough" } : {}),
    amountUnits: r.amountUnits.toString(),
    txHash: r.txHash ?? "",
    confirmMs: r.confirmMs,
  };
}

/** Under the purchase lock: resume what was sent, or send. Another holder → wait for its answer. */
async function work(id: string): Promise<AuthorizeResult> {
  const got = await withPurchaseLock(id, async (tx) => {
    const row = await byId(id, tx);
    if (isFinal(row)) return answer(row);
    if (row.sentHashes.length > 0) return resume(row, tx);
    return send(row, tx);
  });
  if (got) return got.value;
  const deadline = Date.now() + IN_PROGRESS_WAIT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 250));
    const row = await byId(id);
    if (isFinal(row)) return answer(row);
  }
  throw apiError("purchase_in_progress");
}

async function send(row: Row, tx: Tx): Promise<AuthorizeResult> {
  const idBytes = purchaseIdBytes(row.purchaseId);
  const sentBefore = row.sentHashes.length;
  let r;
  try {
    r = await chain().send(
      "cardService",
      contractCall("authorize", [row.accountId, idBytes, row.mcc, row.amountUnits]),
      { beforeBroadcast: storeHash(row.purchaseId, "tx_hash") },
      { tx },
    );
  } catch (e) {
    const now = await byId(row.purchaseId);
    if (e instanceof ChainRevert && e.errorName === "PurchaseIdUsed") return resume(now, tx);
    if (now.sentHashes.length > sentBefore && !(e instanceof ChainRevert))
      throw apiError("payment_unconfirmed");
    await markError(row.purchaseId);
    if (e instanceof ChainUnavailable) throw unavailable();
    if (e instanceof ChainBusy) throw busy();
    if (e instanceof ChainRevert) {
      log.error("authorize_reverted", { purchaseId: row.purchaseId, errorName: e.errorName });
      throw apiError("authorize_failed");
    }
    throw e;
  }
  if (!r.receipt) throw apiError("payment_unconfirmed");
  return finish(row, r.receipt.logs, r.hash, r.confirmMs);
}

/** 09 S09-17: an earlier hash may have landed. Never send twice for one purchase id. */
async function resume(row: Row, tx: Tx): Promise<AuthorizeResult> {
  const idBytes = purchaseIdBytes(row.purchaseId);
  const fromReceipts = async () => {
    for (const hash of row.sentHashes) {
      const receipt = await chain().rpc.getReceipt(hash as Hex);
      if (receipt?.status === "success") return finish(row, receipt.logs, hash, row.confirmMs);
    }
    return null;
  };
  try {
    const found = await fromReceipts();
    if (found) return found;
    if (Date.now() - row.updatedAt.getTime() < RESEND_AFTER_MS)
      throw apiError("purchase_in_progress");
    if (!(await chain().read<boolean>("purchaseUsed", [idBytes]))) return await send(row, tx);
    const again = await fromReceipts();
    if (again) return again;
    const head = await chain().rpc.getBlockNumber();
    const logs: Log[] = [];
    for (const eventName of ["PurchaseApproved", "PurchaseDeclined"]) {
      logs.push(
        ...(await chain().rpc.getLogs({
          address: chain().cfg.contract,
          abi: amplopEnvelopesAbi,
          eventName,
          args: { purchaseId: idBytes },
          fromBlock: head > 99n ? head - 99n : 0n,
        })),
      );
    }
    const first = logs[0];
    if (first && decodeDecision(logs, idBytes) !== "none")
      return await finish(row, logs, first.transactionHash ?? "", row.confirmMs);
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if (e instanceof ChainUnavailable) throw apiError("payment_unconfirmed");
    throw e;
  }
  await markError(row.purchaseId);
  void sendAlert(
    "authorize_unmatched",
    "Amplop card service: a used purchase id has no matching event in the last 100 blocks.",
  );
  throw apiError("authorize_failed");
}

async function finish(
  row: Row,
  logs: readonly Log[],
  hash: string,
  confirmMs: number | null,
): Promise<AuthorizeResult> {
  const d = decodeDecision(logs, purchaseIdBytes(row.purchaseId));
  if (d === "none" || d === "many") {
    await markError(row.purchaseId);
    void sendAlert(
      "authorize_failed",
      "Amplop card service: an authorisation receipt had no single matching event.",
    );
    throw apiError("authorize_failed");
  }
  if (d.amount !== row.amountUnits) {
    log.error("authorize_mismatch", { purchaseId: row.purchaseId });
    void sendAlert(
      "authorize_mismatch",
      "Amplop card service: an authorisation event amount differs from the request.",
    );
  }
  const update = await rowUpdate(row, d);
  await db()
    .update(schema.purchases)
    .set({ ...update, txHash: hash, confirmMs, updatedAt: new Date() })
    .where(eq(schema.purchases.purchaseId, row.purchaseId));
  return answer(await byId(row.purchaseId));
}

async function rowUpdate(row: Row, d: Decision) {
  if (d.result === "approved") {
    return {
      result: "approved",
      envelope: d.envelope,
      everydayStepIn: d.everydayStepIn,
      holdState: "held",
    } as const;
  }
  if (d.reason === "blocked") return { result: "declined", declineReason: "blocked" } as const;
  // 09 S09-15: the matched envelope at the receipt's block, else at latest.
  let matched: readonly [number, boolean];
  try {
    matched = await chain().read<readonly [number, boolean]>(
      "shopEnvelope",
      [row.accountId, d.shopType],
      { blockNumber: d.blockNumber },
    );
  } catch {
    matched = await chain().read<readonly [number, boolean]>("shopEnvelope", [
      row.accountId,
      d.shopType,
    ]);
  }
  return { result: "declined", declineReason: "not_enough", envelope: matched[0] } as const;
}

async function markError(id: string): Promise<void> {
  await db().execute(
    sql`UPDATE purchases SET result = 'error', updated_at = now() WHERE purchase_id = ${id} AND result = 'pending'`,
  );
}
