import { zAccountId } from "@amplop/shared/schemas";
import { z } from "zod";
import { ok } from "@/lib/server/http/respond";
import { defineRoute } from "@/lib/server/http/route";
import { createOrder } from "@/lib/server/topup/orders";

export const maxDuration = 30;

// 08 S08-14 to S08-18: the trusted person starts a rupiah payment for the account.
export const POST = defineRoute(
  {
    method: "POST",
    route: "/api/topup",
    auth: "signed:trusted",
    action: "topup.create",
    body: z
      .object({ accountId: zAccountId, rupiah: z.string().regex(/^[1-9][0-9]{0,10}$/) })
      .strict(),
    account: (ctx) => ctx.body.accountId,
  },
  async (ctx) => ok(await createOrder(ctx.body.accountId, BigInt(ctx.body.rupiah))),
);
