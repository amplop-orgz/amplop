import { DEVICE_HEADER } from "@amplop/shared/auth";
import { zAddress } from "@amplop/shared/schemas";
import { z } from "zod";
import { runFund } from "@/lib/server/fund/run";
import { apiError } from "@/lib/server/http/errors";
import { ok } from "@/lib/server/http/respond";
import { defineRoute } from "@/lib/server/http/route";

export const maxDuration = 30;

export const POST = defineRoute(
  {
    method: "POST",
    route: "/api/fund",
    auth: "signed:address",
    action: "fund",
    body: z.object({ address: zAddress }).strict(),
  },
  async (ctx) => {
    const device = ctx.req.headers.get(DEVICE_HEADER) ?? "";
    if (!/^[0-9a-f]{32}$/.test(device)) throw apiError("bad_device");
    // PRD 15: only the address that signed may be funded.
    if (ctx.body.address !== ctx.auth?.address) throw apiError("address_mismatch");
    return ok(await runFund({ address: ctx.body.address, ip: ctx.ip, device }));
  },
);
