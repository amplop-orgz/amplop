// The one deposit path (08 S08-30 to S08-32), shared by the webhook, Simulate, polls and cron.
// The order lock, stored hashes and the contract's single-use paymentId keep it to one deposit.
import "server-only";
import { amplopEnvelopesAbi } from "@amplop/shared/abi";
import { eq, sql } from "drizzle-orm";
import { after } from "next/server";
import { erc20Abi, maxUint256, type Hex, type TransactionReceipt } from "viem";
import { sendAlert } from "../alerts";
import { chain, waitFinalized } from "../chain/chain";
import { ChainBusy, ChainRevert, ChainUnavailable } from "../chain/types";
import { db, schema, type Tx } from "../db";
import { log } from "../log";
import { ensureTreasuryFloor, treasuryRead } from "./faucet";

type Order = typeof schema.orders.$inferSelect;

export type DepositOutcome =
  "busy" | "skipped" | "not_due" | "in_flight" | "sent" | "retry" | "treasury_low";

const IN_FLIGHT_MS = 60_000;
const STUCK_AT = 5;

/** S08-31: 5 s doubling to 10 minutes, never giving up. */
export function backoffMs(attempt: number): number {
  return Math.min(5_000 * 2 ** (attempt - 1), 600_000);
}

/** Runs after the response, never failing it (S08-33). */
export function floorAfter(): void {
  after(() =>
    ensureTreasuryFloor().catch((e: unknown) => {
      log.warn("treasury_floor_failed", { error: e });
    }),
  );
}

export async function runDeposit(
  orderId: string,
  opts: { force?: boolean } = {},
): Promise<DepositOutcome> {
  return db().transaction(async (tx) => {
    const locked = await tx.execute<{ locked: boolean }>(
      sql`SELECT pg_try_advisory_xact_lock(hashtextextended(${`order:${orderId}`}, 0)) AS locked`,
    );
    if (!locked[0]?.locked) return "busy";
    const o = await load(orderId, tx);
    if (o?.status !== "received") return "skipped";
    if (!opts.force && o.nextAttemptAt && o.nextAttemptAt.getTime() > Date.now()) return "not_due";
    try {
      const earlier = await resolveEarlier(o, tx);
      if (earlier) return earlier;
      if (await chain().read<boolean>("paymentUsed", [o.paymentId])) {
        log.error("deposit_unmatched", { orderId });
        void sendAlert(
          "deposit_unmatched",
          "Amplop: a used paymentId has no stored deposit hash. The order was marked sent.",
        );
        await tx
          .update(schema.orders)
          .set({ status: "sent", updatedAt: new Date() })
          .where(eq(schema.orders.orderId, orderId));
        return "sent";
      }
      const treasury = chain().address("treasury");
      if ((await treasuryRead<bigint>("balanceOf", [treasury])) < o.dollarsUnits) {
        await failed(tx, o, "treasury_low");
        floorAfter();
        return "treasury_low";
      }
      if (
        (await treasuryRead<bigint>("allowance", [treasury, chain().cfg.contract])) < o.dollarsUnits
      ) {
        await chain().send(
          "treasury",
          {
            address: chain().cfg.token,
            abi: erc20Abi,
            functionName: "approve",
            args: [chain().cfg.contract, maxUint256],
          },
          undefined,
          { tx },
        );
      }
      const r = await chain().send(
        "treasury",
        {
          address: chain().cfg.contract,
          abi: amplopEnvelopesAbi,
          functionName: "deposit",
          args: [o.accountId, o.dollarsUnits, o.paymentId],
        },
        { beforeBroadcast: storeHash(orderId) },
        { finalized: true, tx },
      );
      if (!r.receipt) {
        await failed(tx, o, "unconfirmed", 5_000);
        return "retry";
      }
      if (!hasDeposit(r.receipt, o.paymentId)) throw new Error("receipt without Deposited");
      await sent(tx, o, r.hash, r.confirmMs, o.attempts + 1);
      floorAfter();
      return "sent";
    } catch (e) {
      if (e instanceof ChainRevert && e.errorName === "PaymentAlreadyUsed") {
        const again = await resolveEarlier((await load(orderId, tx)) ?? o, tx, true);
        if (again) return again;
      }
      const code =
        e instanceof ChainRevert
          ? `revert:${e.errorName}`
          : e instanceof ChainUnavailable
            ? "chain_unavailable"
            : e instanceof ChainBusy
              ? "chain_busy"
              : "error";
      if (code === "error") log.error("deposit_error", { orderId, error: e });
      await failed(tx, o, code);
      return "retry";
    }
  });
}

async function load(orderId: string, tx: Tx): Promise<Order | undefined> {
  const rows = await tx.select().from(schema.orders).where(eq(schema.orders.orderId, orderId));
  return rows[0];
}

/** Stored before broadcast on its own connection, so a crash keeps the hash (05 S05-41). */
function storeHash(orderId: string) {
  return async (hash: Hex): Promise<void> => {
    await db().execute(
      sql`UPDATE orders SET deposit_tx = ${hash}, sent_hashes = array_append(sent_hashes, ${hash}), updated_at = now() WHERE order_id = ${orderId}`,
    );
  };
}

function hasDeposit(receipt: TransactionReceipt, paymentId: string): boolean {
  if (receipt.status !== "success") return false;
  try {
    chain().findEvent(receipt, "Deposited", { paymentId });
    return true;
  } catch {
    return false;
  }
}

/**
 * S08-30 step 4: an earlier hash may have landed. Never send again while the newest one may still
 * land (`ignoreInFlight` after the contract has said the id is used).
 */
async function resolveEarlier(
  o: Order,
  tx: Tx,
  ignoreInFlight = false,
): Promise<DepositOutcome | null> {
  for (const hash of o.sentHashes) {
    const receipt = await chain().rpc.getReceipt(hash as Hex);
    if (receipt && hasDeposit(receipt, o.paymentId)) {
      const final = await waitFinalized(chain().rpc, receipt);
      if (!hasDeposit(final, o.paymentId)) continue;
      await sent(tx, o, hash, o.confirmMs, o.attempts);
      return "sent";
    }
  }
  const newest = o.sentHashes.at(-1);
  if (
    !ignoreInFlight &&
    newest &&
    !(await chain().rpc.getReceipt(newest as Hex)) &&
    Date.now() - o.updatedAt.getTime() < IN_FLIGHT_MS
  )
    return "in_flight";
  return null;
}

async function sent(
  tx: Tx,
  o: Order,
  hash: string,
  confirmMs: number | null,
  attempts: number,
): Promise<void> {
  await tx
    .update(schema.orders)
    .set({
      status: "sent",
      depositTx: hash,
      confirmMs,
      attempts,
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.orders.orderId, o.orderId));
  log.info("deposit_sent", { orderId: o.orderId, accountId: o.accountId, txHash: hash, attempts });
}

async function failed(tx: Tx, o: Order, error: string, waitMs?: number): Promise<void> {
  const attempts = o.attempts + 1;
  await tx
    .update(schema.orders)
    .set({
      attempts,
      lastError: error,
      nextAttemptAt: new Date(Date.now() + (waitMs ?? backoffMs(attempts))),
      updatedAt: new Date(),
    })
    .where(eq(schema.orders.orderId, o.orderId));
  log.warn("deposit_attempt_failed", { orderId: o.orderId, attempts, error });
  if (attempts === STUCK_AT)
    void sendAlert("deposit_stuck", "Amplop: a paid top-up has failed to deposit 5 times.");
}
