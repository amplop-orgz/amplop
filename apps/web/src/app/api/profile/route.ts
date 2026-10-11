import { zAccountId } from "@amplop/shared/schemas";
import { z } from "zod";
import { ok } from "@/lib/server/http/respond";
import { defineRoute } from "@/lib/server/http/route";
import { saveProfile } from "@/lib/server/profile";

export const POST = defineRoute(
  {
    method: "POST",
    route: "/api/profile",
    auth: "signed:owner",
    action: "profile.save",
    body: z.object({ accountId: zAccountId, name: z.string().max(1000) }).strict(),
    account: (ctx) => ctx.body.accountId,
  },
  async (ctx) => {
    await saveProfile(ctx.body.accountId, ctx.body.name);
    return ok({ ok: true });
  },
);
