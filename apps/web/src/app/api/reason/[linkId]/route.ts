import { z } from "zod";
import { ok } from "@/lib/server/http/respond";
import { defineRoute } from "@/lib/server/http/route";
import { readReason, reasonAccount } from "@/lib/server/reason";

// 12 S12-14: the owner or the current trusted person reads the reason (G12, G14).
export const GET = defineRoute(
  {
    method: "GET",
    route: "/api/reason/[linkId]",
    auth: "signed:either",
    action: "reason.read",
    params: z.object({ linkId: z.string() }).strict(),
    account: (ctx) => reasonAccount(ctx.params.linkId, ctx.auth?.accountId ?? 0n),
  },
  async (ctx) => ok(await readReason(ctx.params.linkId)),
);
