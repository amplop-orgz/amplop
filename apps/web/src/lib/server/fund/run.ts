// POST /api/fund (07 S07-26): checks, send and counters as one serial step under one advisory lock.
import "server-only";
import { TYPICAL_ACTION_GAS } from "@amplop/shared/constants";
import { sql } from "drizzle-orm";
import { formatEther, type Address, type Hash } from "viem";
import { sendAlert } from "../alerts";
import { chain } from "../chain/chain";
import { ReserveTooLow } from "../chain/types";
import { db } from "../db";
import { apiError } from "../http/errors";
import { log } from "../log";
import { FUND_LIMITS, type FundLimits } from "./config";
import { decideFund, fundAmount, type FundCode } from "./decide";

export type FundResult = { status: "sent"; txHash: Hash } | { status: "not_needed" };

const ALERT_TEXT = {
  fund_cap_reached: (day: string) =>
    `Amplop fee sponsor: daily cap of 50 MON reached on ${day}. Top-ups are stopped until 00:00 UTC.`,
  fund_sponsor_low: (balance: bigint) =>
    `Amplop fee sponsor: balance ${formatEther(balance)} MON is at the 10 MON reserve floor. Top-ups are stopped. Refill now.`,
  fund_sponsor_budget_low: (balance: bigint) =>
    `Amplop fee sponsor: balance ${formatEther(balance)} MON will not cover the rest of today's budget.`,
};

class Refused extends Error {
  constructor(readonly code: FundCode) {
    super(code);
  }
}

export async function runFund(input: {
  address: Address;
  ip: string;
  device: string;
  limits?: FundLimits;
}): Promise<FundResult> {
  const limits = input.limits ?? FUND_LIMITS;
  const c = chain();
  const fees = await c.rpc.estimateFees();
  const unit = TYPICAL_ACTION_GAS * fees.maxFeePerGas;
  const balance = await c.rpc.getBalance(input.address);
  if (fundAmount(balance, unit) === null) {
    log.info("fund", { decision: "not_needed", address: input.address });
    return { status: "not_needed" };
  }
  const after: (() => Promise<void>)[] = [];
  try {
    return await db().transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('amplop:fund'))`);
      const ipBucket = `fund:ip:${input.ip}`;
      const deviceBucket = `fund:device:${input.device}`;
      const [meta] = await tx.execute<{
        today: string;
        ip: number | null;
        device: number | null;
        sent: string | null;
      }>(sql`
        SELECT to_char(current_date, 'YYYY-MM-DD') AS today,
          (SELECT count FROM rate_limits WHERE bucket = ${ipBucket} AND window_start = date_trunc('day', now())) AS ip,
          (SELECT count FROM rate_limits WHERE bucket = ${deviceBucket} AND window_start = date_trunc('day', now())) AS device,
          (SELECT wei_sent::text FROM funding_daily WHERE day = current_date) AS sent`);
      const rows = await tx.execute<{ day: string; count_today: number }>(
        sql`SELECT day::text AS day, count_today FROM funding WHERE address = ${input.address}`,
      );
      const today = meta?.today ?? "";
      const weiSentToday = BigInt(meta?.sent ?? "0");
      const sponsorBalance = await c.rpc.getBalance(c.address("feeSponsor"));
      const decision = decideFund({
        balance,
        unit,
        maxFeePerGas: fees.maxFeePerGas,
        ipCountToday: meta?.ip ?? 0,
        addressRow: rows[0] ? { day: rows[0].day, countToday: rows[0].count_today } : null,
        today,
        deviceNewCountToday: meta?.device ?? 0,
        weiSentToday,
        sponsorBalance,
        limits,
      });
      if (decision.kind === "not_needed") return { status: "not_needed" } as const;
      if (decision.kind === "refuse") {
        if (decision.alert === "fund_cap_reached")
          after.push(() => sendAlert("fund_cap_reached", ALERT_TEXT.fund_cap_reached(today)));
        if (decision.alert === "fund_sponsor_low")
          after.push(() =>
            sendAlert("fund_sponsor_low", ALERT_TEXT.fund_sponsor_low(sponsorBalance)),
          );
        throw new Refused(decision.code);
      }
      let hash: Hash;
      try {
        ({ hash } = await c.send(
          "feeSponsor",
          { to: input.address, value: decision.amount },
          undefined,
          { tx },
        ));
      } catch (e) {
        if (e instanceof ReserveTooLow) {
          after.push(() =>
            sendAlert("fund_sponsor_low", ALERT_TEXT.fund_sponsor_low(sponsorBalance)),
          );
        } else {
          log.warn("fund_send_failed", { error: e });
        }
        throw new Refused("fund_unavailable");
      }
      const amount = decision.amount.toString();
      await tx.execute(sql`
        INSERT INTO funding (address, day, count_today, last_funded_at, total_wei)
        VALUES (${input.address}, current_date, 1, now(), ${amount})
        ON CONFLICT (address) DO UPDATE SET
          count_today = CASE WHEN funding.day = current_date THEN funding.count_today + 1 ELSE 1 END,
          day = current_date, last_funded_at = now(), total_wei = funding.total_wei + ${amount}`);
      await tx.execute(sql`
        INSERT INTO funding_daily (day, wei_sent) VALUES (current_date, ${amount})
        ON CONFLICT (day) DO UPDATE SET wei_sent = funding_daily.wei_sent + ${amount}`);
      const buckets = rows[0] ? [ipBucket] : [ipBucket, deviceBucket];
      for (const b of buckets) {
        await tx.execute(sql`
          INSERT INTO rate_limits (bucket, window_start, count) VALUES (${b}, date_trunc('day', now()), 1)
          ON CONFLICT (bucket, window_start) DO UPDATE SET count = rate_limits.count + 1`);
      }
      if (decision.budgetLow) {
        after.push(() =>
          sendAlert(
            "fund_sponsor_budget_low",
            ALERT_TEXT.fund_sponsor_budget_low(sponsorBalance - decision.amount),
          ),
        );
      }
      log.info("fund", {
        decision: "sent",
        amount: decision.amount,
        txHash: hash,
        address: input.address,
      });
      return { status: "sent", txHash: hash } as const;
    });
  } catch (e) {
    if (e instanceof Refused) {
      log.info("fund", { decision: e.code, address: input.address });
      throw apiError(e.code);
    }
    throw e;
  } finally {
    // S07-29: alerts never delay or change the response.
    for (const a of after) void a();
  }
}
