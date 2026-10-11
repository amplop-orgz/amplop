// Fixed-window rate limits in Postgres (05 S05-14 to S05-16). Fails closed: a database error is a 500.
import "server-only";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { apiError } from "./errors";

export type Window = "minute" | "hour" | "day";

const SECONDS: Record<Window, number> = { minute: 60, hour: 3600, day: 86400 };

/** Adds one to the bucket and returns the new count. */
export async function bump(bucket: string, window: Window = "minute"): Promise<number> {
  const rows = await db().execute<{ count: number }>(sql`
    INSERT INTO rate_limits (bucket, window_start, count)
    VALUES (${bucket}, date_trunc(${window}, now()), 1)
    ON CONFLICT (bucket, window_start) DO UPDATE SET count = rate_limits.count + 1
    RETURNING count`);
  return rows[0]?.count ?? 0;
}

/** Reads the bucket's count in the current window without adding to it. */
export async function peek(bucket: string, window: Window = "minute"): Promise<number> {
  const rows = await db().execute<{ count: number }>(sql`
    SELECT count FROM rate_limits WHERE bucket = ${bucket} AND window_start = date_trunc(${window}, now())`);
  return rows[0]?.count ?? 0;
}

export function secondsLeft(window: Window, nowMs = Date.now()): number {
  const s = SECONDS[window];
  return Math.max(1, Math.ceil(s - ((nowMs / 1000) % s)));
}

export async function rateLimit(
  bucket: string,
  limit: number,
  window: Window = "minute",
): Promise<void> {
  if ((await bump(bucket, window)) > limit) {
    const e = apiError("rate_limited");
    e.retryAfter = secondsLeft(window);
    throw e;
  }
}
