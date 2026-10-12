import { ok } from "@/lib/server/http/respond";
import { defineRoute } from "@/lib/server/http/route";
import { currentReason } from "@/lib/server/reason";

// 12 S12-15: the latest request's link and reason, for another device or after a reload.
export const GET = defineRoute(
  { method: "GET", route: "/api/reason/current", auth: "signed:either", action: "reason.current" },
  async (ctx) => ok(await currentReason(ctx.auth?.accountId ?? 0n)),
);
