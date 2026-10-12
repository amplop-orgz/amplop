import { sweepHolds } from "@/lib/server/card/holds";
import { ok } from "@/lib/server/http/respond";
import { defineRoute } from "@/lib/server/http/route";
import { log } from "@/lib/server/log";

export const maxDuration = 60;

// The daily backstop (05 S05-48, 09 S09-28); the Card screen and every card call sweep on request.
export const GET = defineRoute(
  { method: "GET", route: "/api/cron/collect", auth: "cron" },
  async () => {
    const r = await sweepHolds({ limit: 50, deadlineMs: Date.now() + 50_000 });
    log.info("cron_collect", r);
    return ok({ collected: r.collected });
  },
);
