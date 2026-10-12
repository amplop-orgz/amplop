import { z } from "zod";
import { ok } from "@/lib/server/http/respond";
import { defineRoute } from "@/lib/server/http/route";
import { readRecovery } from "@/lib/server/recovery";

// 13 S13-25: any current trusted person (signed:trusted for the message's Account) may read it.
export const GET = defineRoute(
  {
    method: "GET",
    route: "/api/recovery/[linkId]",
    auth: "signed:trusted",
    action: "recovery.read",
    params: z.object({ linkId: z.string() }).strict(),
  },
  async (ctx) => ok(await readRecovery(ctx.params.linkId)),
);
