// Cron authentication (05 S05-47): Bearer CRON_SECRET, compared in constant time.
import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { env } from "../env";
import { apiError } from "../http/errors";
import { log } from "../log";

const digest = (s: string) => createHash("sha256").update(s).digest();

export function verifyCron(headers: Headers): void {
  const secret = env().cronSecret;
  if (secret === null) {
    log.error("cron_secret_missing");
    throw apiError("cron_unauthorized");
  }
  const got = headers.get("authorization") ?? "";
  if (!timingSafeEqual(digest(got), digest(`Bearer ${secret}`)))
    throw apiError("cron_unauthorized");
}
