// Sweeps an account's holds after the response is sent (09 S09-27), never delaying or failing it.
import "server-only";
import { after } from "next/server";
import { log } from "../log";
import { sweepHolds } from "./holds";

export function sweepAfter(accountId: bigint): void {
  after(() =>
    sweepHolds({ accountId, limit: 20 }).then(
      (r) => {
        if (r.collected || r.released) log.info("sweep", { accountId, ...r });
      },
      (e: unknown) => {
        log.warn("sweep_failed", { accountId, error: e });
      },
    ),
  );
}
