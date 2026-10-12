// Holds (09 S09-25 to S09-29): collect, the collect policy, the sweep and refunds.
import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { chain } from "../chain/chain";
import { db, schema, type Tx } from "../db";
import { apiError } from "../http/errors";
import { log } from "../log";
import {
  contractCall,
  HOLD_PERIOD,
  purchaseIdBytes,
  readPurchase,
  STATES,
  storeHash,
  withPurchaseLock,
  type HoldState,
} from "./common";

const HELD = 1;
const COLLECTED = 2;
const DAY_MS = 86_400_000;

export type HoldAction = "release" | "collect" | "none";

/**
 * 09 S09-26, filling a PRD gap: a shop collects 24 real hours after the purchase; a hold whose 7-day
 * window has passed on the account clock is released instead (R13). Release wins.
 */
export function holdAction(
  p: { createdAtReal: Date; createdAtClock: bigint; accountClock: bigint },
  now: Date,
): HoldAction {
  if (p.accountClock >= p.createdAtClock + HOLD_PERIOD) return "release";
  if (now.getTime() - p.createdAtReal.getTime() >= DAY_MS) return "collect";
  return "none";
}

async function setHoldState(purchaseId: string, state: HoldState): Promise<void> {
  if (state === "none") return;
  await db()
    .update(schema.purchases)
    .set({ holdState: state, updatedAt: new Date() })
    .where(eq(schema.purchases.purchaseId, purchaseId));
}

async function settleTx(purchaseId: string): Promise<string | null> {
  const rows = await db()
    .select({ s: schema.purchases.settleTx })
    .from(schema.purchases)
    .where(eq(schema.purchases.purchaseId, purchaseId));
  return rows[0]?.s ?? null;
}

async function release(purchaseId: string, tx: Tx): Promise<void> {
  const r = await chain().send(
    "cardService",
    contractCall("releaseHold", [purchaseIdBytes(purchaseId)]),
    { beforeBroadcast: storeHash(purchaseId, "settle_tx") },
    { tx },
  );
  if (r.receipt) await setHoldState(purchaseId, "released");
}

async function collect(purchaseId: string, amount: bigint, tx: Tx): Promise<string | null> {
  const r = await chain().send(
    "cardService",
    contractCall("collect", [purchaseIdBytes(purchaseId), amount]),
    { beforeBroadcast: storeHash(purchaseId, "settle_tx") },
    { tx },
  );
  if (!r.receipt) return null;
  await setHoldState(purchaseId, "collected");
  return r.hash;
}

/** POST /api/card/collect (09 S09-25). */
export async function collectPurchase(
  purchaseId: string,
  amountUnits?: bigint,
): Promise<{ state: "collected"; txHash: string }> {
  const got = await withPurchaseLock(purchaseId, async (tx) => {
    const p = await readPurchase(purchaseId);
    if (p.state === COLLECTED)
      return { state: "collected" as const, txHash: (await settleTx(purchaseId)) ?? "" };
    if (p.state !== HELD) {
      await setHoldState(purchaseId, STATES[p.state] ?? "none");
      throw apiError("not_held");
    }
    const clock = await chain().read<bigint>("clock", [p.accountId]);
    if (clock >= p.createdAt + HOLD_PERIOD) {
      await release(purchaseId, tx);
      throw apiError("not_held");
    }
    const amount = amountUnits ?? p.held;
    if (amount > p.held) throw apiError("amount_above_hold");
    if (amount === 0n) throw apiError("bad_input");
    const hash = await collect(purchaseId, amount, tx);
    if (!hash) throw apiError("payment_unconfirmed");
    return { state: "collected" as const, txHash: hash };
  });
  if (!got) throw apiError("purchase_in_progress");
  return got.value;
}

/** 09 S09-27: request-driven sweep, with cron as the daily backstop. Returns what it sent. */
export async function sweepHolds(opts: {
  accountId?: bigint;
  limit: number;
  deadlineMs?: number;
}): Promise<{ collected: number; released: number }> {
  const rows = await db()
    .select({ purchaseId: schema.purchases.purchaseId, createdAt: schema.purchases.createdAt })
    .from(schema.purchases)
    .where(
      and(
        eq(schema.purchases.result, "approved"),
        eq(schema.purchases.holdState, "held"),
        opts.accountId === undefined ? undefined : eq(schema.purchases.accountId, opts.accountId),
      ),
    )
    .orderBy(asc(schema.purchases.createdAt))
    .limit(opts.limit);
  const done = { collected: 0, released: 0 };
  for (const row of rows) {
    if (opts.deadlineMs !== undefined && Date.now() > opts.deadlineMs) break;
    try {
      await withPurchaseLock(row.purchaseId, async (tx) => {
        const p = await readPurchase(row.purchaseId);
        if (p.state !== HELD) {
          await setHoldState(row.purchaseId, STATES[p.state] ?? "none");
          return;
        }
        const clock = await chain().read<bigint>("clock", [p.accountId]);
        const action = holdAction(
          { createdAtReal: row.createdAt, createdAtClock: p.createdAt, accountClock: clock },
          new Date(),
        );
        if (action === "release") {
          await release(row.purchaseId, tx);
          done.released++;
        } else if (action === "collect") {
          await collect(row.purchaseId, p.held, tx);
          done.collected++;
        }
      });
    } catch (e) {
      log.warn("sweep_item_failed", { purchaseId: row.purchaseId, error: e });
    }
  }
  return done;
}

/** 09 S09-29: server function only (no route); the card:refund CLI wraps it. */
export async function refundPurchase(purchaseId: string, amountUnits?: bigint): Promise<string> {
  const got = await withPurchaseLock(purchaseId, async (tx) => {
    const p = await readPurchase(purchaseId);
    if (p.state !== COLLECTED) throw new Error("not_collected");
    const amount = amountUnits ?? p.collected - p.refunded;
    const r = await chain().send(
      "cardService",
      contractCall("refund", [purchaseIdBytes(purchaseId), amount]),
      { beforeBroadcast: storeHash(purchaseId, "settle_tx") },
      { tx },
    );
    await setHoldState(purchaseId, "refunded");
    return r.hash;
  });
  if (!got) throw new Error("purchase is locked by another request");
  return got.value;
}

export async function holdCount(accountId: bigint): Promise<number> {
  const rows = await db().execute<{ n: number }>(
    sql`SELECT count(*)::int AS n FROM purchases WHERE account_id = ${accountId} AND hold_state = 'held'`,
  );
  return rows[0]?.n ?? 0;
}
