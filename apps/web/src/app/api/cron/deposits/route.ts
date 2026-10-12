import { ok } from "@/lib/server/http/respond";
import { defineRoute } from "@/lib/server/http/route";
import { log } from "@/lib/server/log";
import { runDeposit } from "@/lib/server/topup/deposit";
import { ensureTreasuryFloor } from "@/lib/server/topup/faucet";
import { checkMidtrans, cronWork } from "@/lib/server/topup/orders";

export const maxDuration = 60;

// 08 S08-34: the daily backstop. Polls and the webhook do the work first; nothing depends on this.
export const GET = defineRoute(
  { method: "GET", route: "/api/cron/deposits", auth: "cron" },
  async () => {
    const deadline = Date.now() + 50_000;
    const work = await cronWork(50);
    let retried = 0;
    for (const orderId of work.received) {
      if (Date.now() > deadline) break;
      const r = await runDeposit(orderId, { force: true }).catch((e: unknown) => {
        log.warn("cron_deposit_failed", { orderId, error: e });
        return null;
      });
      if (r === "sent" || r === "retry") retried++;
    }
    for (const o of work.stale) {
      if (Date.now() > deadline) break;
      await checkMidtrans(o);
    }
    await ensureTreasuryFloor().catch((e: unknown) => {
      log.warn("treasury_floor_failed", { error: e });
    });
    log.info("cron_deposits", { retried });
    return ok({ retried });
  },
);
