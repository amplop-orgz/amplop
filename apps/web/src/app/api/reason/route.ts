import { zAccountId } from "@amplop/shared/schemas";
import { z } from "zod";
import { ok } from "@/lib/server/http/respond";
import { defineRoute } from "@/lib/server/http/route";
import { saveReason } from "@/lib/server/reason";

// 12 S12-13: the student saves the reason text after requestEmergency is on chain.
export const POST = defineRoute(
  {
    method: "POST",
    route: "/api/reason",
    auth: "signed:owner",
    action: "reason.save",
    body: z
      .object({
        accountId: zAccountId,
        requestSeq: z.string().regex(/^[1-9][0-9]{0,18}$/),
        reason: z.string(),
      })
      .strict(),
    account: (ctx) => ctx.body.accountId,
  },
  async (ctx) =>
    ok(await saveReason(ctx.body.accountId, BigInt(ctx.body.requestSeq), ctx.body.reason)),
);
