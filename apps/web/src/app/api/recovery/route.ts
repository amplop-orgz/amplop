import { zAddress } from "@amplop/shared/schemas";
import { z } from "zod";
import { apiError } from "@/lib/server/http/errors";
import { ok } from "@/lib/server/http/respond";
import { defineRoute } from "@/lib/server/http/route";
import { createRecovery } from "@/lib/server/recovery";

// 13 S13-24: signed by the new passkey itself, with no account yet.
export const POST = defineRoute(
  {
    method: "POST",
    route: "/api/recovery",
    auth: "signed:address",
    action: "recovery.create",
    body: z.object({ newOwner: zAddress }).strict(),
  },
  async (ctx) => {
    if (ctx.body.newOwner !== ctx.auth?.address) throw apiError("address_mismatch");
    if (ctx.auth.accountId !== 0n) throw apiError("bad_input");
    return ok(await createRecovery(ctx.body.newOwner));
  },
);
