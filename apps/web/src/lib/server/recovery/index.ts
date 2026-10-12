// Recovery links (13 S13-24 to S13-26). The server cannot know whose account a new passkey is for,
// so a link is readable by any current trusted person; the contract decides who may approve.
import "server-only";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import type { Address } from "viem";
import { chain } from "../chain/chain";
import { db, schema } from "../db";
import { apiError } from "../http/errors";
import { rateLimit } from "../http/ratelimit";
import { randomHex16 } from "../ids";

const LIFETIME_MS = 7 * 86_400_000;

export async function createRecovery(newOwner: string): Promise<{ linkId: string }> {
  const [own, trusted] = await Promise.all([
    chain().read<bigint>("accountOf", [newOwner as Address]),
    chain().read<bigint>("trustedAccountOf", [newOwner as Address]),
  ]);
  if (own !== 0n || trusted !== 0n) throw apiError("recovery_new_owner_has_account");
  const rows = await db()
    .select({ linkId: schema.recoveries.linkId })
    .from(schema.recoveries)
    .where(
      and(
        eq(schema.recoveries.newOwner, newOwner),
        isNull(schema.recoveries.dismissedAt),
        gt(schema.recoveries.createdAt, new Date(Date.now() - LIFETIME_MS)),
      ),
    )
    .orderBy(desc(schema.recoveries.createdAt))
    .limit(1);
  if (rows[0]) return rows[0];
  await rateLimit(`recovery:${newOwner}`, 3, "day");
  const linkId = randomHex16();
  await db().insert(schema.recoveries).values({ linkId, newOwner });
  return { linkId };
}

async function load(linkId: string) {
  if (!/^[0-9a-f]{32}$/.test(linkId)) throw apiError("recovery_not_found");
  const rows = await db()
    .select()
    .from(schema.recoveries)
    .where(eq(schema.recoveries.linkId, linkId));
  const row = rows[0];
  if (!row) throw apiError("recovery_not_found");
  if (Date.now() - row.createdAt.getTime() > LIFETIME_MS) throw apiError("recovery_expired");
  return row;
}

export async function readRecovery(linkId: string) {
  const row = await load(linkId);
  return {
    newOwner: row.newOwner,
    createdAt: row.createdAt.toISOString(),
    dismissed: row.dismissedAt !== null,
  };
}

export async function dismissRecovery(linkId: string): Promise<{ ok: true }> {
  await load(linkId);
  await db()
    .update(schema.recoveries)
    .set({ dismissedAt: new Date() })
    .where(and(eq(schema.recoveries.linkId, linkId), isNull(schema.recoveries.dismissedAt)));
  return { ok: true };
}
