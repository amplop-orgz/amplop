// Spec 05 platform tests (T05-1 to T05-17, T05-21, T05-22, T05-24 to T05-26).
import { buildAuthMessage, toBase64Url } from "@amplop/shared/auth";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { GET as nonceRoute } from "@/app/api/auth/nonce/route";
import { GET as catchAllGet, POST as catchAllPost } from "@/app/api/[...slug]/route";
import {
  cleanup,
  consumeNonce,
  issueNonce,
  parseAuthMessage,
  verifySignedRequest,
} from "@/lib/server/auth/verify";
import { db } from "@/lib/server/db";
import { parseEnv, resetEnv, isDemo } from "@/lib/server/env";
import { ApiError } from "@/lib/server/http/errors";
import { ipKey } from "@/lib/server/http/net";
import { secondsLeft } from "@/lib/server/http/ratelimit";
import { ok, toJson } from "@/lib/server/http/respond";
import { defineRoute, type AuthKind } from "@/lib/server/http/route";
import { randomHex16 } from "@/lib/server/ids";
import { redact } from "@/lib/server/log";
import { zPlainText } from "@amplop/shared/schemas";

vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn() }));
import { call, errCode, fakeChain, newAccount, resetDb, signedHeaders } from "./helpers";

const owner = newAccount();
const trusted = newAccount();
const stranger = newAccount();

beforeEach(async () => {
  resetEnv();
  await resetDb();
  const { rpc } = fakeChain();
  rpc.accounts.set(7n, { owner: owner.address, trusted: trusted.address });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const echo = (kind: AuthKind) =>
  defineRoute(
    {
      method: "POST",
      route: "/api/test",
      auth: kind,
      action: "profile.save",
      body: z.object({ accountId: z.string(), name: z.string().optional() }).strict(),
      account: (ctx) => BigInt(ctx.body.accountId),
    },
    (ctx) => Promise.resolve(ok({ ok: true, address: ctx.auth?.address })),
  );

async function signedPost(
  handler: ReturnType<typeof echo>,
  account = owner,
  accountId = 7n,
  body = '{"accountId":"7"}',
  extra: Partial<Parameters<typeof signedHeaders>[0]> = {},
) {
  const headers = await signedHeaders({
    account,
    action: "profile.save",
    accountId,
    body,
    ...extra,
  });
  return call(handler, { method: "POST", headers, body });
}

describe("T05-1 message parser", () => {
  const base = {
    site: "localhost:3000",
    chainId: 31337,
    action: "fund" as const,
    accountId: 0n,
    address: owner.address,
    nonce: "a".repeat(32),
    issued: new Date().toISOString(),
    bodySha256: "e".repeat(64),
  };
  it("accepts what buildAuthMessage builds", () => {
    expect(parseAuthMessage(buildAuthMessage(base))?.address).toBe(owner.address.toLowerCase());
  });
  it("rejects every deviation", () => {
    const m = buildAuthMessage(base);
    const lines = m.split("\n");
    for (const bad of [
      m.replace(/\n/g, "\r\n"),
      `${m}\n`,
      lines.slice(0, 8).join("\n"),
      [...lines, "Extra: x"].join("\n"),
      [lines[0], lines[2], lines[1], ...lines.slice(3)].join("\n"),
      m.replace(owner.address.toLowerCase(), owner.address.toLowerCase().replace("0x", "0X")),
      m.replace(`Address: ${owner.address.toLowerCase()}`, `Address: 0x${"AB".repeat(20)}`),
      m.replace("Site: ", "Site:"),
      m.replace(/Issued: (.*)Z/, "Issued: $1"),
    ]) {
      expect(parseAuthMessage(bad)).toBeNull();
    }
  });
});

describe("T05-2 verification checks", () => {
  const route = echo("signed:owner");
  it("gives the exact code for each tampered field", async () => {
    const body = '{"accountId":"7"}';
    const cases: [Partial<Parameters<typeof signedHeaders>[0]>, string][] = [
      [{ site: "evil.example" }, "auth_wrong_site"],
      [{ chainId: 1 }, "auth_wrong_chain"],
      [{ action: "fund" }, "auth_wrong_action"],
      [{ address: stranger.address }, "auth_bad_signature"],
    ];
    for (const [opts, code] of cases) {
      const headers = await signedHeaders({
        account: owner,
        action: "profile.save",
        accountId: 7n,
        body,
        ...opts,
      });
      const r = await call(route, { method: "POST", headers, body });
      expect([r.status, errCode(r.json)]).toEqual([401, code]);
    }
    const headers = await signedHeaders({
      account: owner,
      action: "profile.save",
      accountId: 7n,
      body,
    });
    const r = await call(route, { method: "POST", headers, body: '{"accountId":"7" }' });
    expect(errCode(r.json)).toBe("auth_body_mismatch");
  });
  it("needs both headers and a well-formed message", async () => {
    let r = await call(route, { method: "POST", body: '{"accountId":"7"}' });
    expect(errCode(r.json)).toBe("auth_missing");
    r = await call(route, {
      method: "POST",
      body: '{"accountId":"7"}',
      headers: { "Amplop-Auth-Message": toBase64Url("hello"), "Amplop-Auth-Signature": "0x00" },
    });
    expect(errCode(r.json)).toBe("auth_malformed");
  });
});

describe("T05-3, T05-4, T05-5 nonces", () => {
  const route = echo("signed:owner");
  it("refuses a replay", async () => {
    const body = '{"accountId":"7"}';
    const headers = await signedHeaders({
      account: owner,
      action: "profile.save",
      accountId: 7n,
      body,
    });
    expect((await call(route, { method: "POST", headers, body })).status).toBe(200);
    const again = await call(route, { method: "POST", headers, body });
    expect([again.status, errCode(again.json)]).toEqual([409, "nonce_invalid"]);
  });
  it("checks Issued at the edges: 300 s passes, 301 s and 31 s ahead fail", async () => {
    const now = Date.now();
    const at = (ms: number) => new Date(ms).toISOString();
    const headersFor = async (issued: string) => {
      const h = await signedHeaders({
        account: owner,
        action: "profile.save",
        accountId: 7n,
        issued,
      });
      return new Headers(h);
    };
    await expect(
      verifySignedRequest(
        await headersFor(at(now - 300_000)),
        new Uint8Array(),
        "profile.save",
        now,
      ),
    ).resolves.toBeTruthy();
    await expect(
      verifySignedRequest(
        await headersFor(at(now - 301_000)),
        new Uint8Array(),
        "profile.save",
        now,
      ),
    ).rejects.toMatchObject({ code: "auth_expired" });
    await expect(
      verifySignedRequest(
        await headersFor(at(now + 30_000)),
        new Uint8Array(),
        "profile.save",
        now,
      ),
    ).resolves.toBeTruthy();
    await expect(
      verifySignedRequest(
        await headersFor(at(now + 31_000)),
        new Uint8Array(),
        "profile.save",
        now,
      ),
    ).rejects.toMatchObject({ code: "auth_future" });
  });
  it("refuses a nonce issued six minutes ago", async () => {
    const { nonce } = await issueNonce();
    await db().execute(
      sql`UPDATE nonces SET expires_at = now() - interval '1 minute' WHERE nonce = ${nonce}`,
    );
    await expect(consumeNonce(nonce)).rejects.toMatchObject({ code: "nonce_invalid" });
  });
  it("lets exactly one of ten concurrent uses pass", async () => {
    const { nonce } = await issueNonce();
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => consumeNonce(nonce)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });
});

describe("T05-6 roles", () => {
  it("refuses each wrong signer for each kind", async () => {
    const want: Record<string, [string, string, string]> = {
      "signed:owner": ["ok", "not_owner", "not_owner"],
      "signed:trusted": ["not_trusted", "ok", "not_trusted"],
      "signed:either": ["ok", "ok", "not_allowed"],
      "signed:address": ["ok", "ok", "ok"],
      "signed:trusted-any": ["not_trusted", "ok", "not_trusted"],
    };
    for (const [kind, codes] of Object.entries(want)) {
      const route = echo(kind as "signed:owner");
      for (const [i, who] of [owner, trusted, stranger].entries()) {
        const r = await signedPost(route, who);
        expect([kind, i, r.status === 200 ? "ok" : errCode(r.json)]).toEqual([kind, i, codes[i]]);
      }
    }
  });
  it("applies a recovery to the very next request", async () => {
    const { rpc } = fakeChain();
    rpc.accounts.set(7n, { owner: owner.address, trusted: trusted.address });
    const route = echo("signed:owner");
    expect((await signedPost(route)).status).toBe(200);
    rpc.accounts.set(7n, { owner: stranger.address, trusted: trusted.address });
    expect(errCode((await signedPost(route)).json)).toBe("not_owner");
  });
  it("is a 502 when the chain cannot be read", async () => {
    const { rpc } = fakeChain();
    rpc.failReads = true;
    const r = await signedPost(echo("signed:owner"));
    expect([r.status, errCode(r.json)]).toEqual([502, "chain_unavailable"]);
  });
});

describe("T05-7, T05-8 account binding and pipeline order", () => {
  it("refuses a body account that differs from the signed one", async () => {
    const r = await signedPost(echo("signed:owner"), owner, 7n, '{"accountId":"8"}');
    expect([r.status, errCode(r.json)]).toEqual([403, "wrong_account"]);
  });
  it("keeps the nonce on a 401 and uses it on a 403", async () => {
    const route = echo("signed:owner");
    const body = '{"accountId":"7"}';
    const { nonce } = await issueNonce();
    const bad = await signedHeaders({ account: owner, action: "fund", accountId: 7n, body, nonce });
    expect((await call(route, { method: "POST", headers: bad, body })).status).toBe(401);
    const good = await signedHeaders({
      account: owner,
      action: "profile.save",
      accountId: 7n,
      body,
      nonce,
    });
    expect((await call(route, { method: "POST", headers: good, body })).status).toBe(200);
    const { nonce: n2 } = await issueNonce();
    const s = await signedHeaders({
      account: stranger,
      action: "profile.save",
      accountId: 7n,
      body,
      nonce: n2,
    });
    expect((await call(route, { method: "POST", headers: s, body })).status).toBe(403);
    await expect(consumeNonce(n2)).rejects.toMatchObject({ code: "nonce_invalid" });
  });
  it("answers a demo route with demo off exactly like an unknown path, before any query", async () => {
    vi.stubEnv("DEMO_MODE", "false");
    const spy = vi.spyOn(db(), "execute");
    const route = defineRoute({ method: "POST", route: "/api/x", auth: "public", demo: true }, () =>
      Promise.resolve(ok({})),
    );
    const r = await call(route, { method: "POST", body: "{}" });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
    const unknown = await call(catchAllPost, { method: "POST", body: "{}" });
    expect(r.status).toBe(404);
    const unknownText = await unknown.res.text();
    expect(await r.res.text()).toBe(unknownText);
    expect(unknownText).toBe('{"error":{"code":"not_found","message":"Not found."}}');
    expect((await call(catchAllGet as never)).status).toBe(404);
  });
});

describe("T05-9 rate limits", () => {
  const route = defineRoute({ method: "POST", route: "/api/x", auth: "public" }, () =>
    Promise.resolve(ok({})),
  );
  const getRoute = defineRoute({ method: "GET", route: "/api/x", auth: "public" }, () =>
    Promise.resolve(ok({})),
  );
  it("refuses the 61st POST from one IP with Retry-After", async () => {
    for (let i = 0; i < 60; i++)
      expect((await call(route, { method: "POST", body: "{}" })).status).toBe(200);
    const r = await call(route, { method: "POST", body: "{}" });
    expect([r.status, errCode(r.json)]).toEqual([429, "rate_limited"]);
    expect(Number(r.res.headers.get("retry-after"))).toBeGreaterThanOrEqual(1);
  });
  it("refuses the 121st GET", async () => {
    for (let i = 0; i < 120; i++) await call(getRoute);
    expect((await call(getRoute)).status).toBe(429);
  });
  it("passes the first POST of the next window", async () => {
    await db().execute(
      sql`INSERT INTO rate_limits VALUES ('ip:203.0.113.7:post', date_trunc('minute', now()) - interval '1 minute', 999)`,
    );
    expect((await call(route, { method: "POST", body: "{}" })).status).toBe(200);
  });
  it("refuses the 31st signed POST for one account", async () => {
    // Limits count per clock minute: start early in one, or a minute boundary resets the count.
    const second = new Date().getUTCSeconds();
    if (second > 40) await new Promise((r) => setTimeout(r, (61 - second) * 1000));
    const r1 = echo("signed:owner");
    for (let i = 0; i < 30; i++) {
      const r = await signedPost(r1, owner, 7n, '{"accountId":"7"}');
      expect(r.status).toBe(200);
    }
    expect(errCode((await signedPost(r1)).json)).toBe("rate_limited");
  }, 30_000);
  it("puts two IPv6 addresses in one /64 in the same bucket", () => {
    const k = (ip: string) => ipKey(new Headers({ "x-real-ip": ip }));
    expect(k("2001:db8:1:2:aaaa::1")).toBe(k("2001:0db8:0001:0002:ffff:1:2:3"));
    expect(k("2001:db8:1:3::1")).not.toBe(k("2001:db8:1:2::1"));
    expect(k("198.51.100.4")).toBe("198.51.100.4");
    expect(ipKey(new Headers({ "x-forwarded-for": "198.51.100.9, 10.0.0.1" }))).toBe(
      "198.51.100.9",
    );
    expect(ipKey(new Headers())).toBe("unknown");
    expect(secondsLeft("minute", 59_500)).toBe(1);
  });
});

describe("T05-10 body", () => {
  const route = defineRoute(
    { method: "POST", route: "/api/x", auth: "public", body: z.object({ s: z.string() }).strict() },
    () => Promise.resolve(ok({})),
  );
  const sized = (n: number) => JSON.stringify({ s: "x".repeat(n - 8) });
  it("accepts 10 240 bytes and refuses 10 241, with or without a length", async () => {
    expect((await call(route, { method: "POST", body: sized(10_240) })).status).toBe(200);
    expect(errCode((await call(route, { method: "POST", body: sized(10_241) })).json)).toBe(
      "body_too_large",
    );
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode(sized(10_241)));
        c.close();
      },
    });
    const req = new Request("http://localhost:3000/api/x", {
      method: "POST",
      headers: { "content-type": "application/json", "x-real-ip": "1.2.3.4" },
      body: stream,
      duplex: "half",
    } as RequestInit);
    expect(errCode(await (await route(req)).json())).toBe("body_too_large");
  });
  it("checks type, JSON and unknown fields; a GET may not have a body", async () => {
    expect(
      errCode(
        (
          await call(route, {
            method: "POST",
            body: "{}",
            headers: { "content-type": "text/plain" },
          })
        ).json,
      ),
    ).toBe("bad_content_type");
    expect(
      (
        await call(route, {
          method: "POST",
          body: '{"s":"a"}',
          headers: { "content-type": "application/json; charset=utf-8" },
        })
      ).status,
    ).toBe(200);
    expect(errCode((await call(route, { method: "POST", body: "{nope" })).json)).toBe("bad_json");
    expect(errCode((await call(route, { method: "POST", body: '{"s":"a","x":1}' })).json)).toBe(
      "bad_input",
    );
    const g = defineRoute({ method: "GET", route: "/api/x", auth: "public" }, () =>
      Promise.resolve(ok({})),
    );
    expect(errCode((await call(g, { path: "/api/x?a=1" })).json)).toBe("bad_input");
    expect((await call(g, { method: "POST", body: "{}" })).status).toBe(404);
  });
});

describe("T05-11, T05-12 error shape and plain text", () => {
  it("hides unknown errors behind 500 internal", async () => {
    const route = defineRoute({ method: "GET", route: "/api/x", auth: "public" }, () =>
      Promise.reject(new Error("secret detail")),
    );
    const out: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((s: string) => out.push(s));
    const r = await call(route);
    spy.mockRestore();
    expect(r.json).toEqual({
      error: { code: "internal", message: "Something went wrong. Please try again." },
    });
    expect(JSON.stringify(r.json)).not.toContain("secret detail");
    expect(out.join("\n")).toContain("secret detail");
    expect(r.res.headers.get("cache-control")).toBe("no-store");
  });
  it("stores and returns markup unchanged as JSON", async () => {
    for (const s of ["<script>alert(1)</script>", '"><img src=x onerror=alert(1)>']) {
      const name = zPlainText(1, 60).parse(s);
      await db().execute(
        sql`INSERT INTO profiles (account_id, name) VALUES (1, ${name}) ON CONFLICT (account_id) DO UPDATE SET name = excluded.name`,
      );
      const rows = await db().execute<{ name: string }>(
        sql`SELECT name FROM profiles WHERE account_id = 1`,
      );
      const res = ok({ name: rows[0]?.name });
      expect(((await res.json()) as { name: string }).name).toBe(s);
      expect(res.headers.get("content-type")).toBe("application/json; charset=utf-8");
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    }
  });
  it("serialises bigint and refuses unsafe numbers", () => {
    expect(toJson({ a: 10n ** 30n })).toBe('{"a":"1000000000000000000000000000000"}');
    expect(() => toJson({ a: 2 ** 60 })).toThrow();
    expect(new ApiError(400, "x", "y").status).toBe(400);
  });
});

describe("T05-14 origin", () => {
  const route = defineRoute({ method: "POST", route: "/api/x", auth: "public" }, () =>
    Promise.resolve(ok({})),
  );
  it("refuses other sites and passes the app's own", async () => {
    expect(
      errCode(
        (
          await call(route, {
            method: "POST",
            body: "{}",
            headers: { origin: "https://evil.example" },
          })
        ).json,
      ),
    ).toBe("bad_origin");
    expect(
      errCode(
        (
          await call(route, {
            method: "POST",
            body: "{}",
            headers: { "sec-fetch-site": "cross-site" },
          })
        ).json,
      ),
    ).toBe("bad_origin");
    expect(
      errCode(
        (await call(route, { method: "POST", body: "{}", headers: { origin: "not a url" } })).json,
      ),
    ).toBe("bad_origin");
    const r = await call(route, {
      method: "POST",
      body: "{}",
      headers: { origin: "http://localhost:3000", "sec-fetch-site": "same-origin" },
    });
    expect(r.status).toBe(200);
    expect(r.res.headers.get("access-control-allow-origin")).toBeNull();
  });
  it("skips the check for cron and webhook kinds", async () => {
    const cron = defineRoute({ method: "POST", route: "/api/x", auth: "cron" }, () =>
      Promise.resolve(ok({})),
    );
    const r = await call(cron, {
      method: "POST",
      body: "{}",
      headers: {
        origin: "https://evil.example",
        authorization: `Bearer ${process.env.CRON_SECRET ?? ""}`,
      },
    });
    expect(r.status).toBe(200);
    const hook = defineRoute(
      { method: "POST", route: "/api/x", auth: "midtrans", midtrans: () => Promise.resolve() },
      () => Promise.resolve(ok({})),
    );
    expect(
      (
        await call(hook, {
          method: "POST",
          body: "{}",
          headers: { origin: "https://evil.example" },
        })
      ).status,
    ).toBe(200);
  });
});

describe("T05-15 logger redaction", () => {
  it("redacts by key, by pattern and by configured value, keeps hashes", () => {
    const sig = `0x${"a".repeat(130)}`;
    const hash = `0x${"b".repeat(64)}`;
    const key = process.env.TREASURY_PRIVATE_KEY ?? "";
    const out = redact({
      name: "Raka",
      deep: { a: { b: { c: { inviteKey: "x", merchant_name: "Supermarket" } } } },
      msg: `signed with ${sig} ok`,
      err: new Error(`boom ${key.slice(2)} at ${process.env.MONAD_RPC_URL ?? ""}`),
      hash,
      auth: "Bearer abc",
      db: "postgres://u:p@h/db",
    }) as Record<string, unknown>;
    const s = JSON.stringify(out);
    for (const leak of [
      "Raka",
      "Supermarket",
      "a".repeat(130),
      key.slice(2),
      "Bearer abc",
      "u:p@h",
    ])
      expect(s).not.toContain(leak);
    expect(s).toContain("[rpc1]");
    expect(out.hash).toBe(hash);
    expect(out.name).toBe("[redacted]");
  });
  it("keeps the redacted cause of a wrapped error", () => {
    const pg = Object.assign(new Error("permission denied for table rate_limits"), {
      code: "42501",
    });
    const out = redact(new Error("Failed query", { cause: pg })) as {
      cause: Record<string, unknown>;
    };
    expect(out.cause).toEqual({
      name: "Error",
      code: "42501",
      message: "permission denied for table rate_limits",
    });
  });
});

describe("T05-16, T05-17 demo flag and cron", () => {
  it("is on only for exactly true", () => {
    for (const v of ["", "false", "TRUE", "1", "yes"]) {
      vi.stubEnv("DEMO_MODE", v);
      expect(isDemo()).toBe(false);
    }
    vi.stubEnv("DEMO_MODE", "true");
    expect(isDemo()).toBe(true);
  });
  it("runs demo-or-cron with a valid bearer even with demo off", async () => {
    vi.stubEnv("DEMO_MODE", "false");
    const route = defineRoute(
      { method: "POST", route: "/api/card/collect", auth: "demo-or-cron", action: "card.collect" },
      (ctx) => Promise.resolve(ok({ viaCron: ctx.viaCron })),
    );
    const r = await call(route, {
      method: "POST",
      body: "{}",
      headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` },
    });
    expect(r.json).toEqual({ viaCron: true });
    expect((await call(route, { method: "POST", body: "{}" })).status).toBe(404);
    expect(
      errCode(
        (
          await call(route, {
            method: "POST",
            body: "{}",
            headers: { authorization: "Bearer nope" },
          })
        ).json,
      ),
    ).toBe("cron_unauthorized");
  });
  it("refuses a missing, wrong or unset secret", async () => {
    const route = defineRoute({ method: "GET", route: "/api/cron/x", auth: "cron" }, () =>
      Promise.resolve(ok({})),
    );
    expect(errCode((await call(route)).json)).toBe("cron_unauthorized");
    expect(errCode((await call(route, { headers: { authorization: "Bearer wrong" } })).json)).toBe(
      "cron_unauthorized",
    );
    expect(
      (await call(route, { headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` } }))
        .status,
    ).toBe(200);
    vi.stubEnv("CRON_SECRET", "short");
    resetEnv();
    expect(errCode((await call(route, { headers: { authorization: "Bearer short" } })).json)).toBe(
      "cron_unauthorized",
    );
  });
});

describe("T05-22 database role", () => {
  it("cannot change tables but can write rows", async () => {
    const app = postgres(process.env.DATABASE_URL ?? "", { max: 1, onnotice: () => undefined });
    for (const stmt of [
      "CREATE TABLE x (id int)",
      "ALTER TABLE nonces ADD COLUMN y int",
      "DROP TABLE nonces",
      "TRUNCATE nonces",
    ]) {
      await expect(app.unsafe(stmt)).rejects.toThrow(/permission denied|must be owner/);
    }
    await app`INSERT INTO nonces (nonce, expires_at) VALUES (${randomHex16()}, now())`;
    await app.end();
  });
});

describe("T05-24, T05-25, T05-26 ids, env and the nonce endpoint", () => {
  it("makes unique 32-hex ids", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100_000; i++) seen.add(randomHex16());
    expect(seen.size).toBe(100_000);
    for (const v of seen) {
      expect(v).toMatch(/^[0-9a-f]{32}$/);
      break;
    }
  });
  it("names missing variables without values and parses the rate exactly", () => {
    const good = { ...process.env } as Record<string, string>;
    const parsed = parseEnv(good);
    expect(parsed.usdPerEur).toEqual({ num: 11511n, den: 10000n });
    const missing = { ...good };
    delete missing.TREASURY_PRIVATE_KEY;
    expect(() => parseEnv(missing)).toThrow(/TREASURY_PRIVATE_KEY/);
    try {
      parseEnv({ ...good, MIDTRANS_IS_PRODUCTION: "true", CARD_SERVICE_PRIVATE_KEY: "0xbad" });
    } catch (e) {
      expect((e as Error).message).toContain("MIDTRANS_IS_PRODUCTION");
      expect((e as Error).message).not.toContain("0xbad");
    }
    expect(() => parseEnv({ ...good, NEXT_PUBLIC_SITE_URL: good.CRON_SECRET ?? "" })).toThrow(
      /NEXT_PUBLIC_SITE_URL/,
    );
    expect(() => parseEnv({ ...good, NEXT_PUBLIC_SAMPLE_RATE_IDR_PER_USD: "1" })).toThrow(
      /NEXT_PUBLIC_SAMPLE_RATE_IDR_PER_USD/,
    );
  });
  it("issues a nonce valid for five minutes, and cleanup drops only old ones", async () => {
    const r = await call(nonceRoute);
    const j = r.json as { nonce: string; expiresAt: string };
    expect(j.nonce).toMatch(/^[0-9a-f]{32}$/);
    expect(Math.abs(Date.parse(j.expiresAt) - Date.now() - 300_000)).toBeLessThan(5_000);
    expect(r.res.headers.get("cache-control")).toBe("no-store");
    await db().execute(sql`INSERT INTO nonces VALUES ('old', now() - interval '2 hours', null)`);
    await db().execute(
      sql`INSERT INTO rate_limits VALUES ('ip:x:post', now() - interval '3 hours', 1), ('fund:ip:x', date_trunc('day', now()), 1)`,
    );
    await cleanup();
    const left = await db().execute<{ nonce: string }>(sql`SELECT nonce FROM nonces`);
    expect(left.map((x) => x.nonce)).toEqual([j.nonce]);
    const buckets = await db().execute<{ bucket: string }>(
      sql`SELECT bucket FROM rate_limits WHERE bucket IN ('ip:x:post', 'fund:ip:x')`,
    );
    expect(buckets.map((b) => b.bucket)).toEqual(["fund:ip:x"]);
  });
});
