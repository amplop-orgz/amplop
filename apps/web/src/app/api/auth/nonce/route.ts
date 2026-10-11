import { after } from "next/server";
import { cleanup, issueNonce } from "@/lib/server/auth/verify";
import { defineRoute } from "@/lib/server/http/route";
import { ok } from "@/lib/server/http/respond";
import { log } from "@/lib/server/log";

let lastCleanup = 0;

export const GET = defineRoute(
  { method: "GET", route: "/api/auth/nonce", auth: "public" },
  async () => {
    const res = ok(await issueNonce());
    if (Date.now() - lastCleanup > 60_000) {
      lastCleanup = Date.now();
      after(() =>
        cleanup().catch((e: unknown) => {
          log.warn("cleanup_failed", { error: e });
        }),
      );
    }
    return res;
  },
);
