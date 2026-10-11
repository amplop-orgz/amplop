import { ok } from "@/lib/server/http/respond";
import { defineRoute } from "@/lib/server/http/route";
import { latestInvite } from "@/lib/server/invite";

export const GET = defineRoute(
  { method: "GET", route: "/api/invite/latest", auth: "signed:either", action: "invite.latest" },
  async (ctx) => ok(await latestInvite(ctx.auth?.accountId ?? 0n)),
);
