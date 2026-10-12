import { zHex32, zPlainText } from "@amplop/shared/schemas";
import { createHash } from "node:crypto";
import { z } from "zod";
import { sweepAfter } from "@/lib/server/card/after";
import { authorizePurchase } from "@/lib/server/card/authorize";
import { cardAccount } from "@/lib/server/card/cards";
import { ok } from "@/lib/server/http/respond";
import { defineRoute } from "@/lib/server/http/route";

export const maxDuration = 30;

// The fields a real issuer sends (09 S09-9), so a real issuer later is a server change only.
const body = z
  .object({
    cardToken: zHex32,
    amount: z.string().regex(/^[1-9][0-9]{0,11}$/),
    currency: z.enum(["EUR", "USD", "IDR"]),
    merchantName: zPlainText(1, 60),
    merchantCity: zPlainText(1, 40),
    mcc: z.string().regex(/^[0-9]{4}$/),
    idempotencyKey: zHex32,
  })
  .strict();

export const POST = defineRoute(
  {
    method: "POST",
    route: "/api/card/authorize",
    auth: "signed:owner",
    action: "card.authorize",
    body,
    account: (ctx) => cardAccount(ctx.body.cardToken),
    extraLimits: (ctx) => [
      {
        key: `card:${createHash("sha256").update(ctx.body.cardToken).digest("hex").slice(0, 32)}`,
        limit: 10,
      },
    ],
  },
  async (ctx) => {
    const accountId = ctx.auth?.accountId ?? 0n;
    const result = await authorizePurchase({
      accountId,
      amount: ctx.body.amount,
      currency: ctx.body.currency,
      merchantName: ctx.body.merchantName,
      merchantCity: ctx.body.merchantCity,
      mcc: Number(ctx.body.mcc),
      idempotencyKey: ctx.body.idempotencyKey,
    });
    sweepAfter(accountId);
    return ok(result);
  },
);
