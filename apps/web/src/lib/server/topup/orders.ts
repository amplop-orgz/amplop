// Orders (08 S08-14 to S08-29): create, read with poll-driven work, the guarded state moves, the
// Midtrans status mapping and Simulate. Every move is one guarded UPDATE (S08-22).
import "server-only";
import { rupiahToUnits } from "@amplop/shared/money";
import { and, asc, eq, inArray, lt, sql } from "drizzle-orm";
import { keccak256, toBytes } from "viem";
import { sendAlert } from "../alerts";
import { tokenDecimals } from "../card/common";
import { db, schema } from "../db";
import { env } from "../env";
import { apiError } from "../http/errors";
import { randomHex16 } from "../ids";
import { log } from "../log";
import { runDeposit } from "./deposit";
import { charge, fetchStatus, grossRupiah, type MidtransStatus } from "./midtrans";

export type Order = typeof schema.orders.$inferSelect;
type Status = "waiting" | "received" | "sent" | "expired" | "failed";

const MIN_RUPIAH = 100_000n;
const MAX_RUPIAH = 50_000_000n;
const ORDERS_PER_DAY = 10;
const RECHECK_MS = 10_000;

export function paymentIdFor(orderId: string): `0x${string}` {
  return keccak256(toBytes(`midtrans:${orderId}`));
}

export async function loadOrder(orderId: string): Promise<Order | undefined> {
  const rows = await db().select().from(schema.orders).where(eq(schema.orders.orderId, orderId));
  return rows[0];
}

/** The account resolver for the order routes: another account's order is a 404 (05 S05-12). */
export async function orderAccount(orderId: string, signer: bigint): Promise<bigint> {
  const o = await loadOrder(orderId);
  if (!o || o.accountId !== signer) throw apiError("not_found");
  return o.accountId;
}

/** S08-20's response shape. */
export function orderJson(o: Order) {
  return {
    orderId: o.orderId,
    status: o.status,
    rupiah: o.rupiah,
    dollars: o.dollarsUnits,
    vaNumber: o.vaNumber,
    bank: o.bank,
    expiresAt: o.expiresAt?.toISOString() ?? null,
    ...(o.depositTx && o.status === "sent" ? { depositTx: o.depositTx } : {}),
    lastCheckedAt: o.lastCheckedAt?.toISOString() ?? null,
    ...(o.confirmMs === null ? {} : { confirmMs: o.confirmMs }),
  };
}

/** S08-15 to S08-18. The row exists before the charge, so an early notification finds it. */
export async function createOrder(accountId: bigint, rupiah: bigint) {
  if (rupiah < MIN_RUPIAH || rupiah > MAX_RUPIAH) throw apiError("amount_out_of_range");
  const recent = await db().execute<{ n: number }>(
    sql`SELECT count(*)::int AS n FROM orders WHERE account_id = ${accountId} AND created_at > now() - interval '24 hours'`,
  );
  if ((recent[0]?.n ?? 0) >= ORDERS_PER_DAY) throw apiError("too_many_orders");
  const rate = env().idrPerUsd;
  const dollarsUnits = rupiahToUnits(rupiah, await tokenDecimals(), rate);
  const orderId = randomHex16();
  await db()
    .insert(schema.orders)
    .values({
      orderId,
      accountId,
      rupiah,
      dollarsUnits,
      rateIdrPerUsd: Number(rate),
      status: "waiting",
      paymentId: paymentIdFor(orderId),
      attempts: 0,
      lastCheckedAt: new Date(),
    });
  let c;
  try {
    c = await charge(orderId, rupiah);
  } catch (e) {
    const lastError = e instanceof Error ? e.message : "charge_failed:unknown";
    await db()
      .update(schema.orders)
      .set({ status: "failed", lastError, updatedAt: new Date() })
      .where(eq(schema.orders.orderId, orderId));
    log.warn("charge_failed", { orderId, accountId, error: lastError });
    throw apiError("midtrans_unavailable");
  }
  await db()
    .update(schema.orders)
    .set({ vaNumber: c.vaNumber, bank: c.bank, expiresAt: c.expiresAt, updatedAt: new Date() })
    .where(eq(schema.orders.orderId, orderId));
  log.info("order_created", { orderId, accountId });
  return {
    orderId,
    vaNumber: c.vaNumber,
    bank: c.bank,
    expiresAt: c.expiresAt.toISOString(),
    rupiah,
    dollars: dollarsUnits,
    rate: Number(rate),
  };
}

/** One guarded move (S08-22). Zero rows means another request moved it first. */
async function move(orderId: string, from: Status[], to: Status): Promise<boolean> {
  const rows = await db()
    .update(schema.orders)
    .set({
      status: to,
      updatedAt: new Date(),
      lastCheckedAt: new Date(),
      ...(to === "received" ? { nextAttemptAt: new Date() } : {}),
    })
    .where(and(eq(schema.orders.orderId, orderId), inArray(schema.orders.status, from)))
    .returning({ orderId: schema.orders.orderId });
  if (rows.length) log.info("order_moved", { orderId, status: to });
  return rows.length > 0;
}

export type Applied = "received" | "changed" | "unchanged" | "amount_mismatch";

/** S08-28, after the status answer's id and amount are checked against the order (S08-26 step 4). */
export async function applyStatus(o: Order, st: MidtransStatus): Promise<Applied> {
  await db()
    .update(schema.orders)
    .set({ lastCheckedAt: new Date() })
    .where(eq(schema.orders.orderId, o.orderId));
  if (st.order_id !== o.orderId || grossRupiah(st.gross_amount) !== o.rupiah) {
    log.error("amount_mismatch", { orderId: o.orderId });
    void sendAlert("amount_mismatch", "Amplop: a Midtrans status amount differs from its order.");
    return "amount_mismatch";
  }
  const status = st.transaction_status;
  if (status === "settlement") {
    if (st.payment_type !== "bank_transfer") {
      log.warn("unexpected_payment_type", { orderId: o.orderId });
      return "unchanged";
    }
    return (await move(o.orderId, ["waiting", "expired", "failed"], "received"))
      ? "received"
      : "unchanged";
  }
  if (status === "expire")
    return (await move(o.orderId, ["waiting"], "expired")) ? "changed" : "unchanged";
  if (status === "cancel" || status === "deny" || status === "failure")
    return (await move(o.orderId, ["waiting"], "failed")) ? "changed" : "unchanged";
  if (status !== "pending")
    log.info(status === "capture" ? "capture_ignored" : "status_ignored", { orderId: o.orderId });
  return "unchanged";
}

/** Fetch and apply; a Midtrans failure leaves the order and its check time as they were. */
export async function checkMidtrans(o: Order): Promise<Applied | null> {
  let st;
  try {
    st = await fetchStatus(o.orderId);
  } catch (e) {
    log.warn("midtrans_status_failed", { orderId: o.orderId, error: e });
    return null;
  }
  return applyStatus(o, st);
}

/** S08-21: polls drive the work, then the row is read again. */
export async function pollOrder(orderId: string) {
  let o = await loadOrder(orderId);
  if (!o) throw apiError("not_found");
  const now = Date.now();
  if (
    o.status === "waiting" &&
    (!o.lastCheckedAt ||
      now - o.lastCheckedAt.getTime() > RECHECK_MS ||
      (o.expiresAt !== null && now > o.expiresAt.getTime()))
  ) {
    await checkMidtrans(o);
    o = (await loadOrder(orderId)) ?? o;
  }
  if (o.status === "received" && (!o.nextAttemptAt || o.nextAttemptAt.getTime() <= Date.now())) {
    await runDeposit(orderId);
    o = (await loadOrder(orderId)) ?? o;
  }
  return orderJson(o);
}

/** S08-29: never calls Midtrans. */
export async function simulateOrder(orderId: string) {
  const o = await loadOrder(orderId);
  if (!o) throw apiError("not_found");
  if (o.status === "expired" || o.status === "failed") throw apiError("order_closed");
  if (o.status === "waiting" && !(await move(orderId, ["waiting"], "received"))) {
    const now = await loadOrder(orderId);
    if (now?.status === "expired" || now?.status === "failed") throw apiError("order_closed");
  }
  await runDeposit(orderId, { force: true });
  const done = await loadOrder(orderId);
  if (!done) throw apiError("not_found");
  return orderJson(done);
}

/** S08-34's work lists, oldest first. */
export async function cronWork(limit: number) {
  const received = await db()
    .select({ orderId: schema.orders.orderId })
    .from(schema.orders)
    .where(eq(schema.orders.status, "received"))
    .orderBy(asc(schema.orders.updatedAt))
    .limit(limit);
  const stale = await db()
    .select()
    .from(schema.orders)
    .where(
      and(
        eq(schema.orders.status, "waiting"),
        lt(schema.orders.lastCheckedAt, new Date(Date.now() - 10 * 60_000)),
      ),
    )
    .orderBy(asc(schema.orders.lastCheckedAt))
    .limit(Math.max(0, limit - received.length));
  return { received: received.map((r) => r.orderId), stale };
}
