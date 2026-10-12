// Cards and the owner's purchase list (09 S09-1, 11 S11-27). Shop names leave the server only here.
import "server-only";
import { randomInt } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "../db";
import { apiError } from "../http/errors";
import { randomHex16 } from "../ids";

export async function issueCard(accountId: bigint): Promise<{ cardToken: string; last4: string }> {
  await db()
    .insert(schema.cards)
    .values({
      cardToken: randomHex16(),
      accountId,
      last4: String(randomInt(0, 10_000)).padStart(4, "0"),
    })
    .onConflictDoNothing({ target: schema.cards.accountId });
  const rows = await db().select().from(schema.cards).where(eq(schema.cards.accountId, accountId));
  const card = rows[0];
  if (!card) throw new Error("card row missing");
  return { cardToken: card.cardToken, last4: card.last4 };
}

/** The account a card belongs to (09 S09-10 step 3). */
export async function cardAccount(cardToken: string): Promise<bigint> {
  const rows = await db()
    .select({ a: schema.cards.accountId })
    .from(schema.cards)
    .where(eq(schema.cards.cardToken, cardToken));
  if (!rows[0]) throw apiError("card_not_found");
  return rows[0].a;
}

/** The account a purchase belongs to, or 404: an id that is not yours is not confirmed (05 S05-12). */
export async function purchaseAccount(purchaseId: string): Promise<bigint> {
  const rows = await db()
    .select({ a: schema.purchases.accountId })
    .from(schema.purchases)
    .where(eq(schema.purchases.purchaseId, purchaseId));
  if (!rows[0]) throw apiError("not_found");
  return rows[0].a;
}

export async function listPurchases(accountId: bigint) {
  const rows = await db()
    .select()
    .from(schema.purchases)
    .where(
      and(
        eq(schema.purchases.accountId, accountId),
        inArray(schema.purchases.result, ["approved", "declined"]),
      ),
    )
    .orderBy(desc(schema.purchases.createdAt))
    .limit(500);
  return rows.map((r) => ({
    purchaseId: r.purchaseId,
    merchantName: r.merchantName,
    merchantCity: r.merchantCity,
    currency: r.currency,
    amount: r.amountMinor.toString(),
    result: r.result,
  }));
}
