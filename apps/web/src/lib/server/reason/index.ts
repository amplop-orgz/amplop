// Emergency reasons (12 S12-13 to S12-16). The text is stored only when its keccak256 equals the
// on-chain reasonHash, so it can never be swapped later. Never logged.
import "server-only";
import { and, eq } from "drizzle-orm";
import { keccak256, toBytes } from "viem";
import { chain } from "../chain/chain";
import { db, schema } from "../db";
import { apiError } from "../http/errors";
import { randomHex16 } from "../ids";

type EmergencyInfo = { status: number; requestSeq: bigint; reasonHash: `0x${string}` };

/** 1 to 280 code points and not only white space; exactly what was received is hashed. */
export function reasonValid(reason: string): boolean {
  const n = Array.from(reason).length;
  return n >= 1 && n <= 280 && reason.trim().length > 0;
}

export async function saveReason(
  accountId: bigint,
  requestSeq: bigint,
  reason: string,
): Promise<{ linkId: string }> {
  if (!reasonValid(reason)) throw apiError("reason_invalid");
  const em = await chain().read<EmergencyInfo>("emergency", [accountId]);
  if (em.status === 0 || em.requestSeq < requestSeq) throw apiError("request_not_found");
  if (em.requestSeq > requestSeq) throw apiError("request_not_current");
  if (keccak256(toBytes(reason)) !== em.reasonHash) throw apiError("reason_mismatch");
  await db()
    .insert(schema.reasons)
    .values({ linkId: randomHex16(), accountId, requestSeq, text: reason })
    .onConflictDoNothing({ target: [schema.reasons.accountId, schema.reasons.requestSeq] });
  const row = await byRequest(accountId, requestSeq);
  if (!row) throw new Error("reason row missing");
  return { linkId: row.linkId };
}

async function byRequest(accountId: bigint, requestSeq: bigint) {
  const rows = await db()
    .select()
    .from(schema.reasons)
    .where(and(eq(schema.reasons.accountId, accountId), eq(schema.reasons.requestSeq, requestSeq)));
  return rows[0];
}

/** The account resolver for GET /api/reason/[linkId]: a malformed, unknown or other account's id is 404. */
export async function reasonAccount(linkId: string, signer: bigint): Promise<bigint> {
  if (!/^[0-9a-f]{32}$/.test(linkId)) throw apiError("reason_not_found");
  const rows = await db().select().from(schema.reasons).where(eq(schema.reasons.linkId, linkId));
  const row = rows[0];
  if (!row || row.accountId !== signer) throw apiError("reason_not_found");
  return row.accountId;
}

export async function readReason(linkId: string) {
  const rows = await db().select().from(schema.reasons).where(eq(schema.reasons.linkId, linkId));
  const row = rows[0];
  if (!row) throw apiError("reason_not_found");
  return { accountId: row.accountId, requestSeq: row.requestSeq, reason: row.text };
}

/** S12-15: the row of the account's latest request. */
export async function currentReason(accountId: bigint) {
  const em = await chain().read<EmergencyInfo>("emergency", [accountId]);
  const row = em.requestSeq > 0n ? await byRequest(accountId, em.requestSeq) : undefined;
  if (!row) throw apiError("reason_not_found");
  return { linkId: row.linkId, requestSeq: row.requestSeq, reason: row.text };
}
