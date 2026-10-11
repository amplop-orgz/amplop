import { z } from "zod";
import { apiError } from "@/lib/server/http/errors";
import { ok } from "@/lib/server/http/respond";
import { defineRoute } from "@/lib/server/http/route";
import { readInvite } from "@/lib/server/invite";

// Public: the id is a random 128-bit value (01 section 4). A malformed id is the same 404.
export const GET = defineRoute(
  {
    method: "GET",
    route: "/api/invite/[inviteId]",
    auth: "public",
    params: z.object({ inviteId: z.string() }).strict(),
  },
  async (ctx) => {
    if (!/^[0-9a-f]{32}$/.test(ctx.params.inviteId)) throw apiError("invite_not_found");
    return ok(await readInvite(ctx.params.inviteId));
  },
);
