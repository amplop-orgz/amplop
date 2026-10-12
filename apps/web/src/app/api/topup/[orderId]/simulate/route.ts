import { zHex32 } from "@amplop/shared/schemas";
import { z } from "zod";
import { ok } from "@/lib/server/http/respond";
import { defineRoute } from "@/lib/server/http/route";
import { orderAccount, simulateOrder } from "@/lib/server/topup/orders";

export const maxDuration = 30;

// 08 S08-29: test mode only (404 with DEMO_MODE off, before anything else).
export const POST = defineRoute(
  {
    method: "POST",
    route: "/api/topup/[orderId]/simulate",
    auth: "signed:trusted",
    action: "topup.simulate",
    demo: true,
    params: z.object({ orderId: zHex32 }).strict(),
    body: z.object({}).strict(),
    account: (ctx) => orderAccount(ctx.params.orderId, ctx.auth?.accountId ?? 0n),
  },
  async (ctx) => ok(await simulateOrder(ctx.params.orderId)),
);
