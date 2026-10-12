import { zHex32, zUnits } from "@amplop/shared/schemas";
import { z } from "zod";
import { sweepAfter } from "@/lib/server/card/after";
import { purchaseAccount } from "@/lib/server/card/cards";
import { collectPurchase } from "@/lib/server/card/holds";
import { ok } from "@/lib/server/http/respond";
import { defineRoute } from "@/lib/server/http/route";

export const maxDuration = 30;

// Demo "Collect now" (signed owner, 404 with demo off) or the cron bearer (09 S09-25, 15 S15-13).
export const POST = defineRoute(
  {
    method: "POST",
    route: "/api/card/collect",
    auth: "demo-or-cron",
    action: "card.collect",
    body: z.object({ purchaseId: zHex32, amountUnits: zUnits.optional() }).strict(),
    account: (ctx) => purchaseAccount(ctx.body.purchaseId),
  },
  async (ctx) => {
    const res = await collectPurchase(ctx.body.purchaseId, ctx.body.amountUnits);
    if (ctx.auth) sweepAfter(ctx.auth.accountId);
    return ok(res);
  },
);
