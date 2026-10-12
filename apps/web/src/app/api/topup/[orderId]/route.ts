import { zHex32 } from "@amplop/shared/schemas";
import { z } from "zod";
import { ok } from "@/lib/server/http/respond";
import { defineRoute } from "@/lib/server/http/route";
import { orderAccount, pollOrder } from "@/lib/server/topup/orders";

export const maxDuration = 30;

// 08 S08-20, S08-21: each poll also checks Midtrans and retries a due deposit.
export const GET = defineRoute(
  {
    method: "GET",
    route: "/api/topup/[orderId]",
    auth: "signed:trusted",
    action: "topup.read",
    params: z.object({ orderId: zHex32 }).strict(),
    account: (ctx) => orderAccount(ctx.params.orderId, ctx.auth?.accountId ?? 0n),
  },
  async (ctx) => ok(await pollOrder(ctx.params.orderId)),
);
