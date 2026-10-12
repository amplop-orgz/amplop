import { listPurchases } from "@/lib/server/card/cards";
import { ok } from "@/lib/server/http/respond";
import { defineRoute } from "@/lib/server/http/route";

// 11 S11-27: shop names for the account owner only (R27).
export const GET = defineRoute(
  { method: "GET", route: "/api/purchases", auth: "signed:owner", action: "purchases.read" },
  async (ctx) => ok({ items: await listPurchases(ctx.auth?.accountId ?? 0n) }),
);
