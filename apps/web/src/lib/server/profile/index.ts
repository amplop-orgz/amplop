// Profile names (07 S07-31 to S07-33): personal data, kept off the chain and out of logs.
import "server-only";
import { normalizeName } from "@amplop/shared/names";
import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import { apiError } from "../http/errors";

export async function saveProfile(accountId: bigint, raw: string): Promise<void> {
  const n = normalizeName(raw);
  if (!n.ok) throw apiError("name_invalid");
  await db()
    .insert(schema.profiles)
    .values({ accountId, name: n.value })
    .onConflictDoUpdate({
      target: schema.profiles.accountId,
      set: { name: n.value, updatedAt: new Date() },
    });
}

export async function readProfile(accountId: bigint): Promise<string | null> {
  const rows = await db()
    .select({ name: schema.profiles.name })
    .from(schema.profiles)
    .where(eq(schema.profiles.accountId, accountId));
  return rows[0]?.name ?? null;
}
