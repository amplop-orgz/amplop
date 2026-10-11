// Invites (10 S10-8 to S10-11). The server stores only the invite key's address, never the key.
import "server-only";
import { normalizeName } from "@amplop/shared/names";
import { and, desc, eq } from "drizzle-orm";
import { chain } from "../chain/chain";
import { db, schema } from "../db";
import { apiError } from "../http/errors";
import { randomHex16 } from "../ids";
import { readProfile } from "../profile";

export type InviteState = "open" | "used" | "expired" | "replaced";
export type ChainInvite = { inviteKey: string; expiresAt: bigint; used: boolean };

/** S10-10 step 5, in this order: replaced, used, expired, open. Expiry reads the account clock. */
export function inviteState(rowKey: string, onChain: ChainInvite, clock: bigint): InviteState {
  if (onChain.inviteKey.toLowerCase() !== rowKey.toLowerCase()) return "replaced";
  if (onChain.used) return "used";
  if (clock >= onChain.expiresAt) return "expired";
  return "open";
}

async function chainInvite(accountId: bigint): Promise<ChainInvite> {
  const [inviteKey, expiresAt, used] = await chain().read<readonly [string, bigint, boolean]>(
    "inviteOf",
    [accountId],
  );
  return { inviteKey, expiresAt, used };
}

async function stateOf(accountId: bigint, rowKey: string): Promise<InviteState> {
  const [onChain, clock] = await Promise.all([
    chainInvite(accountId),
    chain().read<bigint>("clock", [accountId]),
  ]);
  return inviteState(rowKey, onChain, clock);
}

export async function createInvite(
  accountId: bigint,
  inviteKey: string,
  trustedName: string,
): Promise<string> {
  const name = normalizeName(trustedName);
  if (!name.ok) throw apiError("name_invalid");
  const onChain = await chainInvite(accountId);
  if (onChain.inviteKey.toLowerCase() !== inviteKey) throw apiError("invite_not_on_chain");
  if (onChain.used) throw apiError("invite_used");
  const existing = await db()
    .select({ inviteId: schema.invites.inviteId })
    .from(schema.invites)
    .where(and(eq(schema.invites.accountId, accountId), eq(schema.invites.inviteKey, inviteKey)));
  if (existing[0]) return existing[0].inviteId;
  const inviteId = randomHex16();
  await db()
    .insert(schema.invites)
    .values({ inviteId, accountId, inviteKey, trustedName: name.value });
  return inviteId;
}

export async function readInvite(inviteId: string) {
  const rows = await db()
    .select()
    .from(schema.invites)
    .where(eq(schema.invites.inviteId, inviteId));
  const row = rows[0];
  if (!row) throw apiError("invite_not_found");
  const [studentName, state] = await Promise.all([
    readProfile(row.accountId),
    stateOf(row.accountId, row.inviteKey),
  ]);
  return {
    accountId: row.accountId.toString(),
    studentName: studentName ?? "",
    trustedName: row.trustedName,
    inviteKey: row.inviteKey,
    state,
  };
}

export async function latestInvite(accountId: bigint) {
  const rows = await db()
    .select()
    .from(schema.invites)
    .where(eq(schema.invites.accountId, accountId))
    .orderBy(desc(schema.invites.createdAt))
    .limit(1);
  const row = rows[0];
  if (!row) throw apiError("invite_not_found");
  return {
    inviteId: row.inviteId,
    trustedName: row.trustedName,
    state: await stateOf(accountId, row.inviteKey),
  };
}
