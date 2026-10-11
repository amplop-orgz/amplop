// The one route wrapper (05 S05-1, S05-2). Every handler under app/api is built with defineRoute.
import "server-only";
import type { ActionName } from "@amplop/shared/auth";
import type { z } from "zod";
import { verifyCron } from "../auth/cron";
import { checkRole, type SignedKind } from "../auth/roles";
import { consumeNonce, verifySignedRequest, type SignedAuth } from "../auth/verify";
import { ChainBusy, ChainUnavailable } from "../chain/types";
import { isDemo } from "../env";
import { randomHex16 } from "../ids";
import { log, withLogContext } from "../log";
import { checkContentType, readBody } from "./body";
import { ApiError, apiError } from "./errors";
import { checkOrigin, ipHash, ipKey } from "./net";
import { rateLimit, type Window } from "./ratelimit";
import { errorResponse } from "./respond";

export type AuthKind = "public" | SignedKind | "midtrans" | "cron" | "demo-or-cron";

export type Bucket = { key: string; limit: number; window?: Window };

export type Ctx<P, Q, B> = {
  req: Request;
  reqId: string;
  ip: string;
  params: P;
  query: Q;
  body: B;
  rawBody: Uint8Array<ArrayBuffer>;
  /** The signed request, for every signed kind (and the demo path of demo-or-cron). */
  auth: SignedAuth | null;
  /** True when demo-or-cron was called with the cron bearer. */
  viaCron: boolean;
};

type AnySchema = z.ZodType;
type Out<S> = S extends z.ZodType<infer T> ? T : Record<string, never>;

export type RouteConfig<
  PS extends AnySchema | undefined,
  QS extends AnySchema | undefined,
  BS extends AnySchema | undefined,
> = {
  method: "GET" | "POST";
  /** The route pattern for logs, never the URL with ids. */
  route: string;
  auth: AuthKind;
  action?: ActionName;
  demo?: boolean;
  params?: PS;
  query?: QS;
  body?: BS;
  account?: (ctx: Ctx<Out<PS>, Out<QS>, Out<BS>>) => bigint | Promise<bigint>;
  extraLimits?: (ctx: Ctx<Out<PS>, Out<QS>, Out<BS>>) => Bucket[];
  /** The Midtrans verifier, supplied by spec 08. */
  midtrans?: (ctx: Ctx<Out<PS>, Out<QS>, Out<BS>>) => Promise<void>;
};

type NextContext = { params: Promise<Record<string, string | string[]>> };

const SIGNED = new Set<AuthKind>([
  "signed:owner",
  "signed:trusted",
  "signed:either",
  "signed:address",
  "signed:trusted-any",
]);

export function defineRoute<
  PS extends AnySchema | undefined = undefined,
  QS extends AnySchema | undefined = undefined,
  BS extends AnySchema | undefined = undefined,
>(
  config: RouteConfig<PS, QS, BS>,
  handler: (ctx: Ctx<Out<PS>, Out<QS>, Out<BS>>) => Promise<Response>,
): (req: Request, next?: NextContext) => Promise<Response> {
  return async (req, next) => {
    const reqId = /^[A-Za-z0-9:_-]{1,128}$/.test(req.headers.get("x-vercel-id") ?? "")
      ? (req.headers.get("x-vercel-id") as string)
      : randomHex16();
    return withLogContext({ reqId, route: config.route }, async () => {
      const started = Date.now();
      const ip = ipKey(req.headers);
      let accountId: bigint | undefined;
      let res: Response;
      try {
        res = await run();
      } catch (e) {
        res = errorResponse(toApiError(e));
      }
      const code = res.status >= 400 ? await errorCode(res) : undefined;
      log.info("request", {
        method: req.method,
        status: res.status,
        ...(code ? { code } : {}),
        durationMs: Date.now() - started,
        ipHash: ipHash(ip),
        ...(accountId === undefined ? {} : { accountId }),
      });
      return res;

      async function run(): Promise<Response> {
        if (req.method !== config.method) throw apiError("not_found");
        // 2. Demo gate, and the cron path of demo-or-cron.
        let kind = config.auth;
        let viaCron = false;
        if (kind === "demo-or-cron") {
          if (req.headers.has("authorization")) {
            verifyCron(req.headers);
            viaCron = true;
            kind = "cron";
          } else if (!isDemo()) {
            throw apiError("not_found");
          } else {
            kind = "signed:owner";
          }
        }
        if (config.demo && !isDemo()) throw apiError("not_found");
        // 3. Origin.
        if (config.method === "POST" && kind !== "midtrans" && kind !== "cron")
          checkOrigin(req.headers);
        // 4. Per-IP limit (cron GETs are exempt).
        if (config.method === "POST") await rateLimit(`ip:${ip}:post`, 60);
        else if (kind !== "cron") await rateLimit(`ip:${ip}:get`, 120);
        // 5. Body.
        let rawBody = new Uint8Array();
        if (config.method === "POST") {
          checkContentType(req);
          rawBody = await readBody(req);
        } else if ((await readBody(req)).byteLength > 0) {
          throw apiError("bad_input");
        }
        // 6. Parse.
        const rawParams = (await next?.params) ?? {};
        const params = parseWith(config.params, rawParams, "not_found");
        const query = parseWith(
          config.query,
          Object.fromEntries(new URL(req.url).searchParams),
          "bad_input",
        );
        let json: unknown = {};
        if (config.method === "POST") {
          try {
            json = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(rawBody));
          } catch {
            throw apiError("bad_json");
          }
        }
        const body =
          config.method === "POST" ? parseWith(config.body, json, "bad_input") : ({} as Out<BS>);
        const ctx: Ctx<Out<PS>, Out<QS>, Out<BS>> = {
          req,
          reqId,
          ip,
          params: params as Out<PS>,
          query: query as Out<QS>,
          body: body as Out<BS>,
          rawBody,
          auth: null,
          viaCron,
        };
        // 7. Authenticate.
        if (SIGNED.has(kind)) {
          if (!config.action) throw new Error("signed route without an action");
          ctx.auth = await verifySignedRequest(req.headers, rawBody, config.action);
          accountId = ctx.auth.accountId;
          // 8. Per-account limit, signed POSTs only.
          if (config.method === "POST" && ctx.auth.accountId !== 0n)
            await rateLimit(`acct:${ctx.auth.accountId.toString()}`, 30);
          // 9. Nonce.
          await consumeNonce(ctx.auth.nonce);
          // 10. Account binding.
          if (kind !== "signed:address" && config.account) {
            const target = await config.account(ctx);
            if (target !== ctx.auth.accountId) throw apiError("wrong_account");
          }
          // 11. Role.
          await checkRole(kind as SignedKind, ctx.auth);
        } else if (kind === "cron" && !viaCron) {
          verifyCron(req.headers);
        } else if (kind === "midtrans") {
          if (!config.midtrans) throw new Error("midtrans route without a verifier");
          await config.midtrans(ctx);
        }
        // 12. Extra buckets.
        for (const b of config.extraLimits?.(ctx) ?? []) await rateLimit(b.key, b.limit, b.window);
        // 13. Handler.
        return handler(ctx);
      }
    });
  };
}

function parseWith(
  schema: AnySchema | undefined,
  value: unknown,
  code: "not_found" | "bad_input",
): unknown {
  if (!schema) {
    if (value && typeof value === "object" && Object.keys(value).length > 0) throw apiError(code);
    return {};
  }
  const r = schema.safeParse(value);
  if (!r.success) throw apiError(code);
  return r.data;
}

/** S05-21: only ApiError text reaches the client; everything else is logged and made generic. */
export function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  if (e instanceof ChainUnavailable) {
    log.warn("chain_unavailable", { error: e.cause ?? e });
    return apiError("chain_unavailable");
  }
  if (e instanceof ChainBusy) {
    log.warn("chain_busy", { error: e });
    return apiError("chain_busy");
  }
  log.error("unhandled", { error: e });
  return apiError("internal");
}

async function errorCode(res: Response): Promise<string | undefined> {
  try {
    const j = (await res.clone().json()) as { error?: { code?: string } };
    return j.error?.code;
  } catch {
    return undefined;
  }
}
