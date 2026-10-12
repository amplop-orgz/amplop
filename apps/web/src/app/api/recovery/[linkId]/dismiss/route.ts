import { z } from "zod";
import { ok } from "@/lib/server/http/respond";
import { defineRoute } from "@/lib/server/http/route";
import { dismissRecovery } from "@/lib/server/recovery";

// 13 S13-26: "This was not <Name>". Idempotent.
export const POST = defineRoute(
  {
    method: "POST",
    route: "/api/recovery/[linkId]/dismiss",
    auth: "signed:trusted",
    action: "recovery.dismiss",
    params: z.object({ linkId: z.string() }).strict(),
    body: z.object({}).strict(),
  },
  async (ctx) => ok(await dismissRecovery(ctx.params.linkId)),
);
