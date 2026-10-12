import { zAccountId } from "@amplop/shared/schemas";
import { z } from "zod";
import { sweepAfter } from "@/lib/server/card/after";
import { issueCard } from "@/lib/server/card/cards";
import { ok } from "@/lib/server/http/respond";
import { defineRoute } from "@/lib/server/http/route";

export const maxDuration = 30;

export const POST = defineRoute(
  {
    method: "POST",
    route: "/api/card/issue",
    auth: "signed:owner",
    action: "card.issue",
    body: z.object({ accountId: zAccountId }).strict(),
    account: (ctx) => ctx.body.accountId,
  },
  async (ctx) => {
    const card = await issueCard(ctx.body.accountId);
    sweepAfter(ctx.body.accountId);
    return ok(card);
  },
);
