import { zHex32 } from "@amplop/shared/schemas";
import { after } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/server/http/errors";
import { ok } from "@/lib/server/http/respond";
import { defineRoute } from "@/lib/server/http/route";
import { log } from "@/lib/server/log";
import { runDeposit } from "@/lib/server/topup/deposit";
import {
  parseNotification,
  fetchStatus,
  grossRupiah,
  signatureOk,
} from "@/lib/server/topup/midtrans";
import { applyStatus, loadOrder } from "@/lib/server/topup/orders";
import { sendAlert } from "@/lib/server/alerts";

export const maxDuration = 30;

// 08 S08-24 to S08-28. The notification only says "look": the status comes from Midtrans' API.
export const POST = defineRoute(
  {
    method: "POST",
    route: "/api/midtrans/webhook",
    auth: "midtrans",
    body: z.unknown(),
    midtrans: (ctx) => {
      const n = parseNotification(ctx.body);
      if (!signatureOk(n)) {
        log.warn(
          "webhook_bad_signature",
          zHex32.safeParse(n.order_id).success ? { orderId: n.order_id } : {},
        );
        throw apiError("bad_signature");
      }
      return Promise.resolve();
    },
  },
  async (ctx) => {
    const n = parseNotification(ctx.body);
    const order = zHex32.safeParse(n.order_id).success ? await loadOrder(n.order_id) : undefined;
    if (!order) {
      log.info("webhook_unknown_order");
      return ok({ ok: true });
    }
    if (grossRupiah(n.gross_amount) !== order.rupiah) {
      log.error("amount_mismatch", { orderId: order.orderId });
      void sendAlert(
        "amount_mismatch",
        "Amplop: a Midtrans notification amount differs from its order.",
      );
      throw apiError("amount_mismatch");
    }
    let status;
    try {
      status = await fetchStatus(order.orderId);
    } catch (e) {
      log.warn("midtrans_status_failed", { orderId: order.orderId, error: e });
      throw apiError("midtrans_unavailable");
    }
    const applied = await applyStatus(order, status);
    if (applied === "amount_mismatch") throw apiError("amount_mismatch");
    if (applied === "received") {
      after(() =>
        runDeposit(order.orderId, { force: true }).catch((e: unknown) => {
          log.warn("deposit_after_failed", { orderId: order.orderId, error: e });
        }),
      );
    }
    return ok({ ok: true });
  },
);
