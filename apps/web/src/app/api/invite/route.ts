import { zAccountId, zAddress } from "@amplop/shared/schemas";
import { z } from "zod";
import { ok } from "@/lib/server/http/respond";
import { defineRoute } from "@/lib/server/http/route";
import { createInvite } from "@/lib/server/invite";

export const POST = defineRoute(
  {
    method: "POST",
    route: "/api/invite",
    auth: "signed:owner",
    action: "invite.create",
    body: z
      .object({ accountId: zAccountId, inviteKey: zAddress, trustedName: z.string().max(1000) })
      .strict(),
    account: (ctx) => ctx.body.accountId,
  },
  async (ctx) =>
    ok({
      inviteId: await createInvite(ctx.body.accountId, ctx.body.inviteKey, ctx.body.trustedName),
    }),
);
