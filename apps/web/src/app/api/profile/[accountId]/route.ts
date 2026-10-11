import { zAccountId } from "@amplop/shared/schemas";
import { z } from "zod";
import { apiError } from "@/lib/server/http/errors";
import { ok } from "@/lib/server/http/respond";
import { defineRoute } from "@/lib/server/http/route";
import { readProfile } from "@/lib/server/profile";

export const GET = defineRoute(
  {
    method: "GET",
    route: "/api/profile/[accountId]",
    auth: "signed:either",
    action: "profile.read",
    params: z.object({ accountId: zAccountId }).strict(),
    account: (ctx) => ctx.params.accountId,
  },
  async (ctx) => {
    const name = await readProfile(ctx.params.accountId);
    if (name === null) throw apiError("profile_not_found");
    return ok({ name });
  },
);
