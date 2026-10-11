# 05. Server platform

Status: Ready · PRD sources: 6 (server, three keys, reserve balance, MONSKILLS), 7 (fee limits), 8 (proving who is asking), 12 (demo switch), 14 (server tests), 15 (code quality, threats, gates, security tests), 17 (second RPC provider) · Depends on: 01, 02

## Goal

Give every API route the same safe base: one request pipeline (body limit, strict parsing, rate limits, signed requests, role checks, demo gate, error shape), security headers with a nonce-based CSP, the Postgres schema and roles, viem clients for the three server keys that never collide on nonces, structured logs that never leak secrets or private text, cron authentication, and the browser-bundle secret scan. Feature specs (07 to 13) only write handlers on top of this.

## In scope

- `GET /api/auth/nonce` and the signed-request verifier (01 §4).
- The route wrapper used by every handler under `apps/web/src/app/api/`.
- Rate limits in Postgres; 10 KB body limit; zod strict parsing; error shape and status codes.
- Security headers, CSP with per-request nonces in `proxy.ts` (Next.js 16 name for middleware), CORS and origin checks.
- `DEMO_MODE` handling for demo routes.
- Drizzle schema for every table in 01 §5, migrations, database roles.
- Chain layer: public client with fallback transport, three wallet clients, per-key nonce management, gas limits, receipts, reserve-balance checks, alerts.
- Structured JSON logging with redaction.
- Cron authentication and the "cron is a backstop" rule.
- Bundle-scan script and its patterns (spec 02 runs it in CI).
- Platform rows of the PRD 15 threat table, and the platform-level PRD 15 security tests.

## Out of scope

- Feature handlers and their business rules (07 to 13).
- The Midtrans signature check itself (08). This spec only gives it a place in the pipeline (`midtrans` auth kind).
- CI workflow files, lint config, pre-commit hooks (02). This spec states what they must enforce for the server.
- Rendering of names, reasons and shop names as plain text (06). This spec covers the server side: store and return them unchanged as JSON.
- Contract behaviour (03) and deploy (04).

## Requirements

### A. Route pipeline

**S05-1. One wrapper for every route.** Every route handler under `apps/web/src/app/api/` is built with `defineRoute(config, handler)` from `apps/web/src/lib/server/http/route.ts`. No handler reads the request body, headers or `process.env` directly. Config fields:

| Field                     | Type                                                                                                                                    | Meaning                                                                                                                                                      |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `method`                  | `"GET" \| "POST"`                                                                                                                       |                                                                                                                                                              |
| `auth`                    | `public \| signed:owner \| signed:trusted \| signed:either \| signed:address \| signed:trusted-any \| midtrans \| cron \| demo-or-cron` | 01 §4 kinds. `signed:trusted-any` is 01's "signed:trusted (any account)". `demo-or-cron` is 01's "demo (signed:owner) or cron" for `POST /api/card/collect`. |
| `action`                  | action name from 01 §4                                                                                                                  | Required for every `signed:*` kind.                                                                                                                          |
| `demo`                    | `boolean`                                                                                                                               | `true` for 01's `demo` routes.                                                                                                                               |
| `params`, `query`, `body` | strict zod objects                                                                                                                      | Missing means "must be empty".                                                                                                                               |
| `account`                 | `(ctx) => bigint \| Promise<bigint>`                                                                                                    | Resolves the account the request acts on (from the body, or from a stored row such as an order or card). May throw `notFound()`.                             |
| `extraLimits`             | `(ctx) => Bucket[]`                                                                                                                     | Extra rate-limit buckets, run after the role check (for example the per-card bucket in 09).                                                                  |
| `maxDuration`             | seconds                                                                                                                                 | Exported as the route's `maxDuration`. 30 for routes that send transactions, 60 for cron, default otherwise.                                                 |

**S05-2. Pipeline order.** The wrapper runs these steps in this order and stops at the first failure. Nothing later runs after a failure.

| #   | Step                                                                                                                              | Fails with                                                             |
| --- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 1   | Give the request an id: the `x-vercel-id` header, else 16 random hex characters. Start the log context.                           |                                                                        |
| 2   | Demo gate (S05-30). For `demo: true` when demo mode is off.                                                                       | 404 `not_found`                                                        |
| 3   | Origin check (S05-27), POST only, all kinds except `midtrans` and `cron`.                                                         | 403 `bad_origin`                                                       |
| 4   | Per-IP rate limit (S05-14).                                                                                                       | 429 `rate_limited`                                                     |
| 5   | Read the body with the 10 KB cap and check `Content-Type` (S05-18).                                                               | 400 `body_too_large`, `bad_content_type`                               |
| 6   | Parse path params, query and JSON body with the strict zod schemas (S05-19). A path id with the wrong format is a 404, not a 400. | 400 `bad_json`, `bad_input`; 404 `not_found`                           |
| 7   | Authenticate by kind: signed request (S05-6 to S05-9), Midtrans verifier supplied by 08, or cron bearer (S05-47).                 | 401 (codes in S05-8)                                                   |
| 8   | Per-account rate limit, signed POST only (S05-14).                                                                                | 429 `rate_limited`                                                     |
| 9   | Consume the nonce, signed kinds only (S05-10).                                                                                    | 409 `nonce_invalid`                                                    |
| 10  | Resolve the target account with `account(ctx)` and compare it with the message's `Account` (S05-12).                              | 404 `not_found`, 403 `wrong_account`                                   |
| 11  | Role check on the contract (S05-11).                                                                                              | 403 `not_owner`, `not_trusted`, `not_allowed`; 502 `chain_unavailable` |
| 12  | `extraLimits` buckets.                                                                                                            | 429 `rate_limited`                                                     |
| 13  | Run the handler.                                                                                                                  | handler errors                                                         |
| 14  | Write the response (S05-21) and one access log line (S05-45).                                                                     |                                                                        |

A request that fails at step 7 does not use up its nonce. A request that fails at step 10, 11 or 12 has already used its nonce, as 01 §4 requires ("marks the nonce used before doing any work").

**S05-3. Thin handlers.** A handler parses nothing itself. It calls one function in `lib/server/<job>/` and returns `ok(json)` or throws `ApiError`. Logic lives in pure functions that unit tests cover (PRD 15 "Structure").

**S05-4. Catch-all 404.** `app/api/[...slug]/route.ts` answers every unknown `/api` path and method with 404 and the exact body `{"error":{"code":"not_found","message":"Not found."}}`. Demo routes that are switched off return byte-for-byte the same response.

**S05-5. Server-only modules.** Every file under `lib/server/` imports `server-only`, so importing it from a client component fails the build. Environment variables are read only in `lib/server/env.ts` (S05-49).

### B. Signed requests and nonces

**S05-6. Nonce endpoint.** `GET /api/auth/nonce`, auth `public`. It inserts a row into `nonces` with `nonce = randomHex16()` (S05-51) and `expires_at = now() + 5 minutes`, `used_at = null`, and returns `200 {"nonce": "<32 hex>", "expiresAt": "<ISO 8601 UTC>"}` with `Cache-Control: no-store`. It is limited by the per-IP GET bucket (S05-14). Nonces are not bound to an address when issued; the signature binds them.

**S05-7. Message format, parsed exactly.** The verifier decodes `Amplop-Auth-Message` (base64url, RFC 4648 §5, padding optional, at most 1 024 characters encoded) to UTF-8 and parses it strictly:

- Exactly 9 lines joined by a single `\n`. No `\r`, no trailing newline, no extra spaces.
- Line 1 is `Amplop request`. Lines 2 to 9 are `Key: value` with exactly one space after the colon, in this order:

| Line | Key       | Value format                                                                                   |
| ---- | --------- | ---------------------------------------------------------------------------------------------- |
| 2    | `Site`    | host, optionally with port: `^[a-z0-9.-]+(:[0-9]{1,5})?$`                                      |
| 3    | `Chain`   | `^[0-9]{1,10}$`                                                                                |
| 4    | `Action`  | an action name from 01 §4                                                                      |
| 5    | `Account` | `^(0\|[1-9][0-9]{0,17})$`                                                                      |
| 6    | `Address` | `^0x[0-9a-f]{40}$` (lowercase only)                                                            |
| 7    | `Nonce`   | `^[0-9a-f]{32}$`                                                                               |
| 8    | `Issued`  | `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$` (what `Date.prototype.toISOString()` gives) |
| 9    | `Body`    | `^[0-9a-f]{64}$`                                                                               |

`Amplop-Auth-Signature` must match `^0x[0-9a-fA-F]{130}$`.

**S05-8. Verification checks, in order.** All return 401 with the code shown. The message is always "Your request could not be checked. Please try again."

| #   | Check                                                                                                                         | Code                 |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| 1   | Both headers present                                                                                                          | `auth_missing`       |
| 2   | Message and signature match S05-7                                                                                             | `auth_malformed`     |
| 3   | `Site` is in the allowed host list (S05-28)                                                                                   | `auth_wrong_site`    |
| 4   | `Chain` equals `NEXT_PUBLIC_CHAIN_ID`                                                                                         | `auth_wrong_chain`   |
| 5   | `Action` equals the route's `action`                                                                                          | `auth_wrong_action`  |
| 6   | `now − Issued ≤ 300 s`                                                                                                        | `auth_expired`       |
| 7   | `Issued − now ≤ 30 s` (allowed clock skew into the future)                                                                    | `auth_future`        |
| 8   | `Body` equals the lowercase hex SHA-256 of the exact raw body bytes; for GET, of the empty string (`e3b0c442…b855`)           | `auth_body_mismatch` |
| 9   | viem `recoverMessageAddress({ message, signature })` (EIP-191 `personal_sign`, plain `ecrecover`) lowercased equals `Address` | `auth_bad_signature` |

Do not use viem's `verifyMessage` on a public client: it would call the chain for ERC-1271. If day-one checks show Mera returns a smart account, replace check 9 with an ERC-1271 call in this one function and nowhere else (01 §4).

**S05-9. Clock.** The server compares against its own UTC clock (`Date.now()`), never the account clock. `Issued` exactly 300 s old passes; 301 s fails. 30 s in the future passes; 31 s fails.

**S05-10. Single use, atomically.** After step 8 of S05-2, the nonce is consumed with one statement:

```sql
UPDATE nonces SET used_at = now()
WHERE nonce = $1 AND used_at IS NULL AND expires_at > now()
RETURNING nonce
```

Zero rows means unknown, expired or already used: 409 `nonce_invalid`, message "This request was already used or has expired. Please try again." Two concurrent requests with the same nonce: exactly one passes. Used nonces are kept until cleanup (S05-17), so a replay inside the 5-minute window is always refused.

**S05-11. Role check on the contract.** Read with `blockTag: "latest"` on every request. Never cache a role: a recovery or a trusted-person change must apply to the very next request (E22, I4, J6).

| Kind                 | Read                        | Passes when                                                         | Else              |
| -------------------- | --------------------------- | ------------------------------------------------------------------- | ----------------- |
| `signed:owner`       | `accountInfo(Account)`      | `owner == Address` and `Account ≠ 0`                                | 403 `not_owner`   |
| `signed:trusted`     | `accountInfo(Account)`      | `trusted == Address` and `trusted ≠ 0x0`                            | 403 `not_trusted` |
| `signed:either`      | `accountInfo(Account)`      | owner or trusted                                                    | 403 `not_allowed` |
| `signed:trusted-any` | `trustedAccountOf(Address)` | result `≠ 0` and equals `Account`                                   | 403 `not_trusted` |
| `signed:address`     | none                        | always (only proves control of `Address`; `Account` is not checked) |                   |

A failed or timed-out read is 502 `chain_unavailable`, never a pass. Messages: `not_owner` "Only the account owner can do this.", `not_trusted` "Only the trusted person can do this.", `not_allowed` "You can't see this account."

**S05-12. Account binding.** For every `signed:*` kind except `signed:address`, the wrapper calls `account(ctx)` and compares the result with `Account`. Mismatch is 403 `wrong_account` ("This request is for a different account."). If the resource does not exist, or belongs to an account other than `Account`, the resolver throws 404 `not_found` where 01 says the id must not be confirmed (orders, reasons, recovery links). Each feature spec states which it uses.

**S05-13. Helper for the client.** `packages/shared/src/auth.ts` exports `buildAuthMessage(fields)` and `sha256Hex(bytes)` so the browser builds exactly the bytes the server parses. A unit test signs a message built by this helper and verifies it with the server verifier.

### C. Rate limits

**S05-14. Buckets.** Fixed one-minute windows stored in `rate_limits`.

| Bucket key                                 | Limit per minute | Applies to                                            | Step |
| ------------------------------------------ | ---------------- | ----------------------------------------------------- | ---- |
| `ip:<ipKey>:post`                          | 60               | every POST under `/api`, the webhook included (01 §4) | 4    |
| `ip:<ipKey>:get`                           | 120              | every GET under `/api` except cron routes             | 4    |
| `acct:<accountId>`                         | 30               | every signed POST whose `Account ≠ 0` (01 §4)         | 8    |
| `card:<first 32 hex of sha256(cardToken)>` | 10               | `card/authorize` (registered by 09 via `extraLimits`) | 12   |
| `fund:*`                                   | spec 07          | `fund`                                                | 07   |

The per-account limit counts POSTs only, because the PRD 15 threat row is about "every POST" and status polling (08) is GET.

**S05-15. IP key.** The client IP is the `x-real-ip` header (Vercel sets it and overwrites client values), else the first entry of `x-forwarded-for`, else `"unknown"`. IPv4 is used as is. IPv6 is cut to its first four groups (the /64). The raw IP is never logged; logs carry `ipHash` = first 12 hex of `sha256(ipKey)`.

**S05-16. Counting.** One statement per bucket:

```sql
INSERT INTO rate_limits (bucket, window_start, count)
VALUES ($1, date_trunc('minute', now()), 1)
ON CONFLICT (bucket, window_start) DO UPDATE SET count = rate_limits.count + 1
RETURNING count
```

`count > limit` is 429 `rate_limited`, message "Too many requests. Please wait a moment.", with `Retry-After` set to the whole seconds left in the window (at least 1). If the database is unreachable the request fails with 500 (fail closed).

**S05-17. Cleanup without cron.** At most once a minute per server instance (an in-memory timestamp), the nonce endpoint runs, after answering, through `after()`:

```sql
DELETE FROM nonces WHERE nonce IN (SELECT nonce FROM nonces WHERE expires_at < now() - interval '1 hour' LIMIT 500);
DELETE FROM rate_limits WHERE (bucket, window_start) IN (SELECT bucket, window_start FROM rate_limits WHERE window_start < now() - interval '2 hours' LIMIT 500);
```

### D. Body, parsing, errors

**S05-18. Body limit and type.** If `Content-Length` is above 10 240, return 400 `body_too_large` without reading. Otherwise read the stream and abort as soon as 10 241 bytes have arrived (covers chunked bodies with no length). A POST must send `Content-Type: application/json` (an optional `; charset=utf-8` is allowed), else 400 `bad_content_type`. A GET with a non-empty body is 400 `bad_input`. Status 400 is used, not 413, because 01 §4 lists the allowed statuses.

**S05-19. Strict zod parsing.** Every params, query and body schema is a `z.object({...}).strict()`. Unknown fields are 400 `bad_input` ("Some details in the request are not valid."). Invalid JSON is 400 `bad_json`. Shared primitives live in `packages/shared/src/schemas.ts`, so the client validates with the same rules:

| Name                   | Rule                                                                                                                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `zHex32`               | `^[0-9a-f]{32}$` (every random id in 01 §5)                                                                                                                                                                                          |
| `zAccountId`           | JSON string `^[1-9][0-9]{0,17}$`, parsed to `bigint` (01 §9)                                                                                                                                                                         |
| `zAddress`             | `^0x[0-9a-f]{40}$`, lowercase                                                                                                                                                                                                        |
| `zUnits`               | JSON string `^(0\|[1-9][0-9]{0,77})$`, parsed to `bigint`                                                                                                                                                                            |
| `zPlainText(min, max)` | string; trimmed; NFC-normalised; length counted in Unicode code points after trimming; rejects C0 and C1 control characters and the bidi controls U+202A–U+202E and U+2066–U+2069. It does not escape or strip `<`, `>`, `"` or `&`. |

**S05-20. Error shape.** Every error response is exactly `{"error":{"code":"<snake_case>","message":"<plain sentence>"}}` with no other keys, `Content-Type: application/json; charset=utf-8`, `Cache-Control: no-store`. Codes are registered in `lib/server/http/errors.ts`; each feature spec adds its own there. Status codes are only those in 01 §4: 400, 401, 403, 404, 409, 429, 502, 500.

**S05-21. Unknown errors.** Anything not an `ApiError` becomes 500 `internal`, "Something went wrong. Please try again." viem transport errors (`HttpRequestError`, `TimeoutError`, `RpcRequestError` after the fallback is used up) become 502 `chain_unavailable`, "We could not reach the network. Please try again." The response never contains a stack trace, an SQL message, an RPC URL or an upstream error text. The full detail goes to the log only, after redaction (S05-46). No empty `catch` anywhere (PRD 15).

**S05-22. Success responses.** `ok(json, status = 200)` sets `Content-Type: application/json; charset=utf-8` and `Cache-Control: no-store`. Token amounts are decimal strings; `bigint` values are serialised by a JSON replacer that turns them into strings and throws on JavaScript numbers above `Number.MAX_SAFE_INTEGER`.

**S05-23. Plain text in, plain text out.** The server stores user text (names, reasons, shop names) exactly as `zPlainText` returns it and returns it unchanged inside JSON. It never HTML-escapes, strips or interprets it; escaping is the renderer's job (06). JSON responses always carry `X-Content-Type-Options: nosniff`, so a browser never sniffs them as HTML.

### E. Security headers, CSP and CORS

**S05-24. Static headers.** `next.config.ts` sets, through `headers()` on source `/:path*`, for every response:

| Header                         | Value                                                                                                                                                                                                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Strict-Transport-Security`    | `max-age=63072000; includeSubDomains`                                                                                                                                                                                                                                    |
| `X-Content-Type-Options`       | `nosniff`                                                                                                                                                                                                                                                                |
| `Referrer-Policy`              | `no-referrer`                                                                                                                                                                                                                                                            |
| `X-Frame-Options`              | `DENY`                                                                                                                                                                                                                                                                   |
| `Cross-Origin-Opener-Policy`   | `same-origin`                                                                                                                                                                                                                                                            |
| `Cross-Origin-Resource-Policy` | `same-origin`                                                                                                                                                                                                                                                            |
| `Permissions-Policy`           | `publickey-credentials-create=(self), publickey-credentials-get=(self), camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), hid=(), bluetooth=(), midi=(), display-capture=(), accelerometer=(), gyroscope=(), magnetometer=(), browsing-topics=()` |

Also `poweredByHeader: false` and `productionBrowserSourceMaps: false`. `clipboard-write` is left at the browser default (same origin) because the Copy buttons on boards 0.1, 0.4 and 1.3 need it. If day-one checks show Mera runs WebAuthn in a frame on another origin, add that origin to both `publickey-credentials-*` lists and to `frame-src`, and record it under Decisions.

**S05-25. CSP with nonces.** `apps/web/src/proxy.ts` (Next.js 16's name for middleware) runs on document requests. Its matcher excludes `/api`, `/_next/static`, `/_next/image`, `/favicon.ico`, `/icons/`, `/manifest.webmanifest`, `/sw.js` and prefetch requests (`next-router-prefetch` header or `purpose: prefetch`). For each request it:

1. Makes `nonce = base64(crypto.getRandomValues(16 bytes))`.
2. Builds the policy with `buildCsp(nonce, env)` from `lib/server/security/csp.ts`:

```
default-src 'self';
script-src 'self' 'nonce-{N}' 'strict-dynamic';
style-src-elem 'self' 'nonce-{N}';
style-src-attr 'unsafe-inline';
img-src 'self' data: blob:;
font-src 'self';
connect-src 'self' {origin of NEXT_PUBLIC_MONAD_RPC_URL} {origin of NEXT_PUBLIC_MONAD_RPC_URL_FALLBACK} {origin of NEXT_PUBLIC_INDEXER_URL} {MERA_CONNECT_ORIGINS};
worker-src 'self';
manifest-src 'self';
frame-src 'none';
frame-ancestors 'none';
object-src 'none';
base-uri 'none';
form-action 'self';
upgrade-insecure-requests
```

3. Sets the policy on the request headers (`Content-Security-Policy`) and `x-nonce: <nonce>`, so Next.js adds the nonce to its own scripts, and sets the same `Content-Security-Policy` on the response.

`MERA_CONNECT_ORIGINS` is a constant array in `csp.ts`, empty unless the day-one check shows Mera calls its own servers. `'unsafe-eval'` is added to `script-src` only when `NODE_ENV === "development"`; a production build never contains it. There is no `'unsafe-inline'` for scripts in any mode.

**S05-26. Nonce use in the app.** The root layout reads `(await headers()).get("x-nonce")` and passes it to every `next/script` and to any library that injects a `<style>` element. This makes every page dynamically rendered, which is accepted (Decisions). `dangerouslySetInnerHTML` is forbidden: spec 02's ESLint config sets `react/no-danger` to error. Inline `style` attributes (React `style={}`) are allowed by `style-src-attr`; injected `<style>` or `<script>` elements without the nonce are blocked.

**S05-27. Origin check and CORS.** No API response ever sends `Access-Control-Allow-*` headers, so cross-origin reads are blocked by the browser. In addition, for POST routes (except `midtrans` and `cron` kinds):

- If `Sec-Fetch-Site` is present and is `cross-site` or `same-site`: 403 `bad_origin`.
- If `Origin` is present and its host is not in the allowed host list: 403 `bad_origin`.

Message: "This request must come from the Amplop app."

**S05-28. Allowed host list.** One function, `allowedHosts()`, used by both S05-8 check 3 and S05-27: the comma-separated `SITE_HOSTS` (01 §7), plus on Vercel whichever of `VERCEL_PROJECT_PRODUCTION_URL`, `VERCEL_BRANCH_URL` and `VERCEL_URL` are set (Vercel system variables, hosts without scheme). When `NODE_ENV !== "production"`, `localhost:3000` and `127.0.0.1:3000` are added. Hosts compare lowercase and exactly, port included.

**S05-29. API caching.** Every `/api` response has `Cache-Control: no-store`. No route handler uses `force-static` or `revalidate`.

### F. Demo mode

**S05-30. One flag, read on the server.** `isDemo()` in `lib/server/env.ts` returns `process.env.DEMO_MODE === "true"`, exactly. Any other value (unset, `"TRUE"`, `"1"`, `"yes"`) is off. `NEXT_PUBLIC_DEMO_MODE` only shows or hides buttons; the server never reads it for a decision (PRD 15: "Hiding a button is never the control").

**S05-31. Demo routes return 404 when off.** Routes with `demo: true` (`POST /api/topup/[orderId]/simulate`) and the signed path of `demo-or-cron` (`POST /api/card/collect`) return the S05-4 404 at step 2, before any rate-limit row, database read or chain call. For `demo-or-cron`: if an `Authorization` header is present and passes S05-47, the cron path runs in any mode; otherwise, with demo mode off, 404; with demo mode on, it is handled as `signed:owner` with action `card.collect`.

**S05-32. Demo consistency check.** The first time the chain layer starts in a server instance, it reads the contract's `demoMode()` getter. If it differs from `isDemo()`, log `demo_mismatch` at level `error` and send an alert (S05-40). The server does not change behaviour: the contract still refuses `skipDays` on its own.

### G. Database

**S05-33. Driver and ORM.** Drizzle ORM with the `postgres` (postgres.js) driver. One client per server instance, created lazily: `postgres(DATABASE_URL, { max: 5, prepare: false, idle_timeout: 20, connect_timeout: 10, ssl: "require" (except when the host is localhost) })`. `prepare: false` keeps it working behind transaction-mode poolers (Neon, PgBouncer). Every connection sets `statement_timeout = 10s` and `lock_timeout = 10s`. Default host: Neon free tier through the Vercel Marketplace; any Postgres 16 works.

**S05-34. Schema.** `apps/web/src/lib/server/db/schema.ts` defines every table of 01 §5 with these exact names and types. `bigint` columns use Drizzle `mode: "bigint"`. Status columns are `text` with a `CHECK` constraint (not Postgres enums, so later values need no type migration).

| Table           | Columns and types                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Keys and indexes                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `nonces`        | `nonce text`, `expires_at timestamptz not null`, `used_at timestamptz null`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | pk `nonce`; index `expires_at`                                                                                     |
| `rate_limits`   | `bucket text`, `window_start timestamptz`, `count integer not null`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | pk (`bucket`, `window_start`); index `window_start`                                                                |
| `profiles`      | `account_id bigint`, `name text not null`, `updated_at timestamptz not null default now()`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | pk `account_id`                                                                                                    |
| `cards`         | `card_token text`, `account_id bigint not null`, `last4 text not null` (check `^[0-9]{4}$`), `created_at timestamptz not null default now()`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | pk `card_token`; unique `account_id`                                                                               |
| `orders`        | `order_id text`, `account_id bigint not null`, `rupiah bigint not null`, `dollars_units bigint not null`, `rate_idr_per_usd integer not null`, `status text not null` (check in `waiting, received, sent, expired, failed`), `va_number text null`, `bank text null`, `expires_at timestamptz null`, `payment_id text not null` (check `^0x[0-9a-f]{64}$`), `deposit_tx text null`, `attempts integer not null default 0`, `next_attempt_at timestamptz null`, `last_error text null`, `last_checked_at timestamptz null`, `sent_hashes text[] not null default '{}'`, `confirm_ms integer null`, `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`                                                                                                                             | pk `order_id`; unique `payment_id`; index (`status`, `updated_at`); index (`account_id`, `created_at`)             |
| `purchases`     | `purchase_id text`, `account_id bigint not null`, `idempotency_key text not null`, `merchant_name text not null`, `merchant_city text not null`, `currency text not null` (check in `EUR, USD, IDR`), `amount_minor bigint not null`, `mcc integer not null` (check 0 to 9999), `amount_units bigint not null`, `result text not null` (check in `pending, approved, declined, error`), `envelope smallint null`, `everyday_step_in boolean not null default false`, `decline_reason text null` (check in `blocked, not_enough`), `hold_state text null` (check in `held, collected, released, refunded`), `tx_hash text null`, `settle_tx text null`, `sent_hashes text[] not null default '{}'`, `confirm_ms integer null`, `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()` | pk `purchase_id`; unique `idempotency_key`; index (`account_id`, `created_at`); index (`hold_state`, `created_at`) |
| `invites`       | `invite_id text`, `account_id bigint not null`, `invite_key text not null`, `trusted_name text not null`, `created_at timestamptz not null default now()`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | pk `invite_id`; index `account_id`                                                                                 |
| `reasons`       | `link_id text`, `account_id bigint not null`, `request_seq bigint not null`, `text text not null`, `created_at timestamptz not null default now()`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | pk `link_id`; unique (`account_id`, `request_seq`)                                                                 |
| `recoveries`    | `link_id text`, `new_owner text not null`, `dismissed_at timestamptz null`, `created_at timestamptz not null default now()`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | pk `link_id`                                                                                                       |
| `funding`       | `address text`, `day date not null`, `count_today integer not null`, `last_funded_at timestamptz not null`, `total_wei numeric(78,0) not null`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | pk `address`                                                                                                       |
| `funding_daily` | `day date`, `wei_sent numeric(78,0) not null`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | pk `day`                                                                                                           |
| `signer_nonces` | `address text`, `next_nonce bigint not null`, `updated_at timestamptz not null`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | pk `address`                                                                                                       |

Feature specs add columns only through new migrations, after adding them to 01 §5 (01's rule: add it there first).

**S05-35. Migrations.** `drizzle-kit generate` writes SQL files to `apps/web/drizzle/`, which are committed and reviewed. They are applied with `drizzle-kit migrate` using `DATABASE_MIGRATION_URL`, as a CI step before a production deploy (spec 02 owns the step). `drizzle-kit push` is never used against a shared database. The app never runs migrations at runtime. Root scripts (01 §9): `npm run db:up` starts a local Postgres 16 with Docker (`docker compose -f apps/web/docker-compose.yml up -d`) and runs `roles.sql` (S05-36) once; `npm run db:migrate` runs `drizzle-kit migrate` with `DATABASE_MIGRATION_URL`.

**S05-36. Two roles.** A one-time script `apps/web/drizzle/roles.sql`, run by hand with the database owner's credentials, creates:

```sql
CREATE ROLE amplop_migrator LOGIN PASSWORD :'migrator_pw';
CREATE ROLE amplop_app LOGIN PASSWORD :'app_pw';
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO amplop_migrator;
GRANT USAGE ON SCHEMA public TO amplop_app;
ALTER DEFAULT PRIVILEGES FOR ROLE amplop_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO amplop_app;
ALTER DEFAULT PRIVILEGES FOR ROLE amplop_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO amplop_app;
```

`DATABASE_MIGRATION_URL` logs in as `amplop_migrator`; `DATABASE_URL` as `amplop_app`. `amplop_app` owns no table and cannot `CREATE`, `ALTER`, `DROP` or `TRUNCATE` (PRD 15 "The production database user cannot change tables"). Create the roles with SQL, not the provider's console, so they get no extra membership.

**S05-37. Queries only through the ORM.** All queries use the Drizzle query builder or the `sql` tagged template with bound parameters. `sql.raw(` and string-built SQL are forbidden outside `apps/web/drizzle/`; spec 02 adds a lint rule or CI grep that fails on `sql.raw(` in `apps/web/src`. Transactions use `db.transaction()`.

### H. Chain clients

**S05-38. Clients.** `apps/web/src/lib/server/chain/clients.ts` creates, lazily and once per instance:

- `chain`: viem `monadTestnet` when `NEXT_PUBLIC_CHAIN_ID` is 10143, viem `foundry` (id 31337) when it is 31337, with its RPC URLs replaced by the server ones. Any other id fails at start.
- `transport = fallback([http(MONAD_RPC_URL, { timeout: 5_000, retryCount: 1 }), http(MONAD_RPC_URL_FALLBACK, { timeout: 5_000, retryCount: 1 })], { rank: false, retryCount: 1 })`. A 429, a timeout or a 5xx from the first provider moves the call to the second (PRD 17, case L5 on the server side).
- `publicClient = createPublicClient({ chain, transport })`.
- Three wallet clients, `walletClients.treasury`, `walletClients.cardService`, `walletClients.feeSponsor`, each `createWalletClient({ account: privateKeyToAccount(KEY), chain, transport })` from `TREASURY_PRIVATE_KEY`, `CARD_SERVICE_PRIVATE_KEY` and `FEE_SPONSOR_PRIVATE_KEY`.
- ABI and addresses from `packages/shared` (generated by wagmi CLI from the Foundry build, PRD 15) and `NEXT_PUBLIC_CONTRACT_ADDRESS`, `NEXT_PUBLIC_AUSD_ADDRESS`.

**S05-39. Role and key checks at start.** On first use, read the contract getters `treasury()`, `cardService()`, `settlement()` and `token()` (01 §3). If the treasury key's address differs from `treasury()`, the card-service key's from `cardService()`, `SETTLEMENT_ADDRESS` from `settlement()`, or `NEXT_PUBLIC_AUSD_ADDRESS` from `token()`, log `chain_misconfigured` (names only) and make every send fail with 500 `internal`. If the three key addresses are not all different, log `keys_not_distinct` at level `warn` on every cold start (PRD 6 allows one wallet in the first days; spec 20's final checks require three).

**S05-40. Alerts.** `sendAlert(kind, text)` in `lib/server/alerts.ts` posts `{"text": "<text>"}` to `ALERT_WEBHOOK_URL` (Slack- and Discord-compatible) with a 3 s timeout, at most once per `kind` per hour (bucket `alert:<kind>` in `rate_limits` with `window_start = date_trunc('hour', now())`). Without the URL it only logs `alert` at level `warn`. Alert text never contains keys, names, reasons, shop names, signatures or invite keys. Kinds used by this spec: `demo_mismatch`, `chain_misconfigured`, `reserve_low:<role>`, `send_failed:<role>`.

**S05-41. One send function.** All server transactions go through `sendContractTx(role, request, hooks?)` in `lib/server/chain/send.ts`, where `role` is `treasury | cardService | feeSponsor`, `request` is `{ address, abi, functionName, args, value? }` (or `{ to, value }` for a plain MON transfer), and `hooks.beforeBroadcast(hash)` lets the caller store the hash before it is sent. It returns `{ hash, receipt | null, confirmMs | null }`. Steps:

| #   | Step                | Detail                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Lock the key        | Open a database transaction and run `SELECT pg_advisory_xact_lock(hashtextextended('signer:' \|\| $address, 0))`. This serialises all sends from one key across every server instance. Waiting longer than `lock_timeout` (10 s) fails with 502 `chain_busy`, "The network is busy. Please try again."                                                                                                                                                                                                                                                                                                                                      |
| 2   | Simulate            | `publicClient.simulateContract` from the role's account. A revert throws `ChainRevert { errorName, args }` decoded from the ABI's custom errors. No transaction is sent.                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 3   | Gas limit           | `limit = max(ceil(estimate × 12 / 10), GAS_FLOOR[functionName])`. Monad charges the limit, not the gas used, so the margin stays small; the floor protects calls whose path can change between estimate and inclusion (for example `authorize` approve vs decline). `GAS_FLOOR` is the per-function map in `packages/shared` constants (01 §9), recorded by spec 03 (S03-51) from `forge test --gas-report` as the highest gas plus 10%. The browser uses the same rule (06). Day-one check (PRD 17): confirm in the Monad docs and with one test transaction that the fee is charged on the limit; if it is not, only this margin changes. |
| 4   | Fees                | `publicClient.estimateFeesPerGas()`. If `maxFeePerGas` exceeds `MAX_FEE_PER_GAS = 1000 gwei`, fail with 502 `chain_busy` without sending.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 5   | Reserve check       | S05-42.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 6   | Nonce               | `chainNext = getTransactionCount({ address, blockTag: "latest" })` (on Monad `pending` is the same as `latest`). Read `signer_nonces` for this address. `nonce = row.next_nonce` if `row.next_nonce > chainNext` and `row.updated_at` is less than 30 s old; otherwise `chainNext` (an older higher value means that transaction was dropped).                                                                                                                                                                                                                                                                                              |
| 7   | Sign                | `walletClient.signTransaction` (EIP-1559, explicit `nonce`, `gas`, `maxFeePerGas`, `maxPriorityFeePerGas`, `chainId`). `hash = keccak256(serialized)`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 8   | Store first         | `await hooks.beforeBroadcast?.(hash)`. Hooks write with autocommit (not inside the lock transaction), so a crash after broadcast still leaves the hash stored.                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 9   | Broadcast           | `sendRawTransaction`. "already known" counts as success. "nonce too low" re-reads `chainNext`, re-signs once (steps 6 to 9) and calls `beforeBroadcast` with the new hash. Any other error: throw `ChainUnavailable`; nothing was sent if the error came before the RPC accepted it. On success upsert `signer_nonces(address, next_nonce = nonce + 1, updated_at = now())`.                                                                                                                                                                                                                                                                |
| 10  | Wait                | `waitForTransactionReceipt({ hash, pollingInterval: 250, timeout: 10_000 })`, still inside the lock, so the next send from this key sees the new nonce. Timeout returns `receipt: null` (unknown, not failed). `confirmMs` = time from broadcast to receipt.                                                                                                                                                                                                                                                                                                                                                                                |
| 11  | Finality (optional) | With `{ finalized: true }`, after the receipt poll `getBlock({ blockTag: "finalized" })` every 250 ms (10 s timeout) until its number ≥ the receipt's block, then re-read the receipt and check the block hash is the same. Used for deposits (08).                                                                                                                                                                                                                                                                                                                                                                                         |
| 12  | Unlock              | Commit the lock transaction.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

A receipt with `status: "reverted"` throws `ChainRevert { errorName: "unknown", hash }` (gas was spent). `sendContractTx` never retries a whole send on its own; retries are the caller's decision, because only the caller knows if the action is idempotent (08 uses `paymentId`, 09 uses `purchaseId`).

**S05-42. Reserve-balance rule (PRD 6).** Before signing, read `getBalance(address)`:

- If `value > 0` (a MON transfer, used by the fee sponsor in 07) and `balance − value − limit × maxFeePerGas < RESERVE_WEI` (10 MON), throw `ReserveTooLow` without signing. Monad reverts such transfers anyway except for one "emptying" transaction every 3 blocks; never rely on that exception.
- For every role, if `balance < RESERVE_WEI + DAILY_BUDGET_WEI[role]`, send alert `reserve_low:<role>` and continue.

Constants in `lib/server/chain/reserve.ts`: `RESERVE_WEI = 10 MON`; `DAILY_BUDGET_WEI = { feeSponsor: 50 MON, treasury: 2 MON, cardService: 5 MON }`. So the fee sponsor alerts below 60 MON (PRD 6), the treasury below 12 MON, the card service below 15 MON. Operations keep each wallet under about three days' budget above the reserve (PRD 15 "each holding only a few days' budget"); the docs (18) say so.

**S05-43. Reads and events.** `readContract` helpers always pass the contract address from env. `findEvent(receipt, eventName, match)` decodes only logs whose `address` equals the contract address, and returns the single matching log or throws if there are zero or more than one. `getLogs` calls, where a feature needs them, use ranges of at most 100 blocks (the smallest provider limit on Monad).

**S05-44. Test seam.** Every function above is behind a `ChainPort` interface (`read`, `send`, `getReceipt`, `getBalance`, `getLogs`) passed into feature logic, so server unit tests use a `FakeChain` that can fail, time out or revert on demand. One integration suite runs the real port against Anvil with the real contract.

### I. Logging

**S05-45. Structured JSON logs.** `lib/server/log.ts` exports `log.debug | info | warn | error(event, fields?)`. Each call writes one JSON line to stdout: `{ "ts": ISO, "level", "event", "reqId", "route", ...fields }`. `console.*` is forbidden in `apps/web/src/lib/server` and `apps/web/src/app/api` except inside `log.ts` (ESLint `no-console`, spec 02). Each request ends with one `request` line: `method`, `route` (the pattern, not the URL with ids), `status`, `code` (if error), `durationMs`, `ipHash`, `accountId` (if known). Bodies and headers are never logged.

**S05-46. Redaction.** Before writing, the logger walks fields (depth 6, arrays included) and replaces values with `"[redacted]"`:

1. **By key.** Keys compared case-insensitively after removing `_` and `-`: `privatekey`, `key`, `secret`, `password`, `token`, `cardtoken`, `authorization`, `cookie`, `signature`, `signaturekey`, `amplopauthmessage`, `amplopauthsignature`, `invitekey`, `name`, `studentname`, `trustedname`, `reason`, `text`, `merchantname`, `merchantcity`, `vanumber`, `serverkey`, `databaseurl`, `rpcurl`.
2. **By value pattern.** `0x` followed by exactly 130 hex characters (signatures); strings starting `SB-Mid-server-` or `Mid-server-`; `Bearer ` followed by anything; `postgres://` or `postgresql://` URLs; `-----BEGIN`.
3. **By exact value.** The current values of `TREASURY_PRIVATE_KEY`, `CARD_SERVICE_PRIVATE_KEY`, `FEE_SPONSOR_PRIVATE_KEY` (with and without `0x`), `MIDTRANS_SERVER_KEY`, `CRON_SECRET`, `DATABASE_URL`, `DATABASE_MIGRATION_URL` and `ALERT_WEBHOOK_URL` are replaced anywhere inside any string. `MONAD_RPC_URL` and `MONAD_RPC_URL_FALLBACK` are replaced with `[rpc1]` and `[rpc2]`, because provider URLs often contain an API key.

Transaction hashes (`0x` + 64 hex), addresses, account ids, order ids and purchase ids are kept; they are needed to debug and are not secret on their own. Strings longer than 500 characters are cut. Errors are logged as `{ name, code?, message }` where `message` is viem's `shortMessage` when present, cut to 500 characters, then redacted.

### J. Cron

**S05-47. Cron authentication.** `verifyCron(request)` passes only when `Authorization` equals `Bearer <CRON_SECRET>`, compared in constant time (`crypto.timingSafeEqual` over the SHA-256 of both strings, so lengths match). Failure is 401 `cron_unauthorized`. If `CRON_SECRET` is unset or shorter than 32 characters, every cron call fails with 401 and `log.error("cron_secret_missing")`. Cron routes are `GET`, are not IP-rate-limited, and have `maxDuration = 60`.

**S05-48. Cron is a backstop.** Vercel Hobby runs each cron job at most once a day, at an imprecise minute. So no rule may depend on how often cron runs. Every job that cron does must also be started by a request: a status poll, a user action, a webhook, or `after()` following one. Each cron handler:

- processes at most 50 items, oldest first, and stops starting new items after 50 s;
- is idempotent and safe to run at the same time as request-driven work (it takes the same locks);
- returns its count (`{retried}`, `{collected}`) and logs one summary line.

`apps/web/vercel.json` declares the two jobs from 01 §4 once a day: `/api/cron/deposits` at `0 2 * * *` and `/api/cron/collect` at `30 2 * * *` (09:00 and 09:30 WIB). Each feature spec (08, 09) names its request-driven trigger.

### K. Environment and ids

**S05-49. Environment loader.** `lib/server/env.ts` parses `process.env` once, lazily on first use (so `next build` works without secrets), with a zod schema covering every server variable in 01 §7. Rules: private keys `^0x[0-9a-fA-F]{64}$`; addresses lowercase-normalised; `MIDTRANS_IS_PRODUCTION` must be the string `"false"`; `SAMPLE_RATE_IDR_PER_USD` a positive integer; `SAMPLE_RATE_USD_PER_EUR` matches `^[0-9]+(\.[0-9]{1,6})?$` and is parsed to an integer fraction (`1.1511` → `11511 / 10000`), never a float; `CRON_SECRET` at least 32 characters. A failure lists the missing or invalid **names** only, never values. If the Next.js version in use supports `experimental.taint`, each secret value is passed to `experimental_taintUniqueValue`, so React refuses to send it to a client component.

**S05-50. No secret in a public variable.** No server secret is ever read from a `NEXT_PUBLIC_` variable. The env schema rejects a start where any `NEXT_PUBLIC_` variable has the same value as a server secret.

**S05-51. Random ids.** `randomHex16()` in `lib/server/ids.ts` returns `crypto.randomBytes(16).toString("hex")` (32 lowercase hex). It is the only way to make nonces, order ids, purchase ids, card tokens, invite ids and link ids (01 §5). Nothing visible is numbered in order (PRD 15 "Read another parent's order by guessing its id").

### L. Bundle scan (patterns owned here, CI step owned by 02)

**S05-52. Script.** `apps/web/scripts/bundle-scan.mjs`, run by the web app's `build` script as `next build && node scripts/bundle-scan.mjs`, so a Vercel build fails too. Spec 02's CI runs the same `build`. It scans the browser output: `apps/web/.next/static/**/*.{js,css,map}` and prerendered `apps/web/.next/server/app/**/*.{html,rsc,body}`. It does not scan server JavaScript, which legitimately names server variables.

**S05-53. Patterns.** Stored in `apps/web/scripts/bundle-scan.patterns.json`:

| Id                  | Pattern                                                                                                                                                                                        | Catches                                           |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `env-name`          | `\b(TREASURY_PRIVATE_KEY\|CARD_SERVICE_PRIVATE_KEY\|FEE_SPONSOR_PRIVATE_KEY\|MIDTRANS_SERVER_KEY\|CRON_SECRET\|DATABASE_URL\|DATABASE_MIGRATION_URL\|ALERT_WEBHOOK_URL\|SETTLEMENT_ADDRESS)\b` | a server variable referenced in client code       |
| `env-name-shadowed` | `(?<!NEXT_PUBLIC_)\b(MONAD_RPC_URL\|MONAD_RPC_URL_FALLBACK\|DEMO_MODE\|SAMPLE_RATE_IDR_PER_USD\|SAMPLE_RATE_USD_PER_EUR)\b`                                                                    | server names whose `NEXT_PUBLIC_` twin is allowed |
| `midtrans-key`      | `\b(SB-)?Mid-server-[A-Za-z0-9_-]{8,}`                                                                                                                                                         | a Midtrans server key                             |
| `pg-url`            | `postgres(ql)?://[^\s"']+`                                                                                                                                                                     | a database URL                                    |
| `pem`               | `-----BEGIN [A-Z ]*PRIVATE KEY-----`                                                                                                                                                           | a PEM key                                         |
| `hex32`             | `0x[0-9a-fA-F]{64}(?![0-9a-fA-F])`                                                                                                                                                             | a possible private key                            |

`hex32` matches are checked against `apps/web/scripts/bundle-scan.allow.txt`, one known public 32-byte constant per line with a comment saying where it comes from (for example the secp256k1 curve order or an EIP-712 type hash in a library). Each new entry is reviewed in its pull request.

**S05-54. Exact-value check.** When the build runs with real secrets (Vercel), the script also fails if the value of any server secret listed in S05-46 rule 3 (keys with and without `0x`) appears in the scanned files. In CI, where `.env.example`'s fake values are loaded, it checks those, which proves the check is wired.

**S05-55. Output.** On a match it prints the file, the pattern id and the byte offset, and at most the first 6 characters of the match followed by `…`. It never prints the full value. Exit code 1 on any match, 0 otherwise.

## Interfaces used

| Kind                              | Items                                                                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Endpoints (owned)                 | `GET /api/auth/nonce`                                                                                              |
| Endpoints (served by the wrapper) | all of 01 §4                                                                                                       |
| Tables                            | all of 01 §5; owned here: `nonces`, `rate_limits`, `signer_nonces`                                                 |
| Contract reads                    | `accountInfo`, `trustedAccountOf`, `demoMode`, `treasury`, `cardService`, `settlement`, `token`                    |
| Env                               | all of 01 §7, including `SITE_HOSTS`, `NEXT_PUBLIC_SAMPLE_RATE_IDR_PER_USD`, `NEXT_PUBLIC_SAMPLE_RATE_USD_PER_EUR` |
| Shared code                       | `packages/shared`: generated ABI, `buildAuthMessage`, `sha256Hex`, zod primitives                                  |

Functions this spec provides to every other server spec (all in `apps/web/src/lib/server/`):

```ts
defineRoute(config: RouteConfig, handler: (ctx: Ctx) => Promise<Response>): RouteHandler
ok(json: unknown, status?: number): Response
class ApiError { constructor(status: 400|401|403|404|409|429|500|502, code: string, message: string) }
notFound(): never
verifySignedRequest(req: RawRequest, action: ActionName): Promise<SignedAuth>   // { address, accountId, nonce }
checkRole(kind: AuthKind, auth: SignedAuth): Promise<void>
rateLimit(bucket: string, limit: number, window?: "minute" | "hour"): Promise<void>
isDemo(): boolean
verifyCron(req: Request): void
db                                       // Drizzle instance
sendContractTx(role: Role, request: TxRequest, hooks?: { beforeBroadcast?(hash: Hex): Promise<void> }, opts?: { finalized?: boolean }): Promise<{ hash: Hex; receipt: TransactionReceipt | null; confirmMs: number | null }>
readContract<T>(functionName: string, args: unknown[], opts?: { blockNumber?: bigint }): Promise<T>
findEvent(receipt: TransactionReceipt, eventName: string, match?: Record<string, unknown>): DecodedLog
sendAlert(kind: string, text: string): Promise<void>
log: { debug, info, warn, error }(event: string, fields?: Record<string, unknown>): void
randomHex16(): string
```

## Screens

None.

## Errors and edge cases

Platform error codes (feature specs add their own to the same registry):

| Status | Code                                                                                                                                                                    | Message                                                         | When                                          |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------- |
| 400    | `bad_json`                                                                                                                                                              | Some details in the request are not valid.                      | body is not JSON                              |
| 400    | `bad_input`                                                                                                                                                             | Some details in the request are not valid.                      | zod failure, unknown field, GET with a body   |
| 400    | `bad_content_type`                                                                                                                                                      | Some details in the request are not valid.                      | POST without `application/json`               |
| 400    | `body_too_large`                                                                                                                                                        | This request is too large.                                      | over 10 240 bytes                             |
| 401    | `auth_missing`, `auth_malformed`, `auth_wrong_site`, `auth_wrong_chain`, `auth_wrong_action`, `auth_expired`, `auth_future`, `auth_body_mismatch`, `auth_bad_signature` | Your request could not be checked. Please try again.            | S05-8                                         |
| 401    | `cron_unauthorized`                                                                                                                                                     | Not allowed.                                                    | S05-47                                        |
| 403    | `not_owner` / `not_trusted` / `not_allowed`                                                                                                                             | see S05-11                                                      | S05-11                                        |
| 403    | `wrong_account`                                                                                                                                                         | This request is for a different account.                        | S05-12                                        |
| 403    | `bad_origin`                                                                                                                                                            | This request must come from the Amplop app.                     | S05-27                                        |
| 404    | `not_found`                                                                                                                                                             | Not found.                                                      | unknown path, demo route off, hidden resource |
| 409    | `nonce_invalid`                                                                                                                                                         | This request was already used or has expired. Please try again. | S05-10                                        |
| 429    | `rate_limited`                                                                                                                                                          | Too many requests. Please wait a moment.                        | S05-16                                        |
| 500    | `internal`                                                                                                                                                              | Something went wrong. Please try again.                         | anything else                                 |
| 502    | `chain_unavailable`                                                                                                                                                     | We could not reach the network. Please try again.               | RPC down after fallback                       |
| 502    | `chain_busy`                                                                                                                                                            | The network is busy. Please try again.                          | key lock timeout, fee above cap               |

Edge cases:

- **Client clock wrong.** A phone more than 30 s fast gets `auth_future`. The client (06) retries once with `Issued` corrected by the offset between `expiresAt − 5 min` from the nonce response and its own clock.
- **Nonce fetched, never used.** It expires after 5 minutes and is deleted by S05-17.
- **Two tabs, same account (L8).** Each request has its own nonce; both work; a replayed one gets 409.
- **Both RPC providers down.** Reads fail with 502 `chain_unavailable`. Sends fail before broadcast, so nothing is half-done.
- **Receipt timeout.** `receipt: null` is "unknown"; the caller keeps the stored hash and resolves it later. It is never reported as failed.
- **Dropped transaction.** Its nonce is reused after 30 s (S05-41 step 6). A later landing of the old transaction makes the new one invalid (same nonce), so at most one of them runs.
- **Server restarts mid-send.** The advisory lock is released with the connection; the stored hash lets the caller resolve the outcome.
- **Preview deployments.** `VERCEL_URL` and `VERCEL_BRANCH_URL` are allowed hosts, so signed requests work on previews. The Vercel toolbar's injected script is blocked by CSP; turn the toolbar off in project settings.

## Security

Threat rows from PRD 15 that belong to the platform, each mapped to the requirements that close it:

| PRD 15 threat                                      | Required fix (PRD)                                                                                                                            | Requirements                                                                                                                                                                                       |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Replay a signed request seen once                  | Message names site, chain 10143, action, account, single-use server nonce, time; nonce expires after 5 min; used nonces stored                | S05-6 to S05-10, S05-13                                                                                                                                                                            |
| Use test-only tools on a real deployment           | `DEMO_MODE` server flag; routes 404 when off; hiding a button is never the control                                                            | S05-4, S05-30 to S05-32 (contract side: 03; buttons: 15)                                                                                                                                           |
| Read another parent's order by guessing its id     | Every id a random 128-bit value                                                                                                               | S05-51, S05-12 (404 for hidden resources)                                                                                                                                                          |
| Steal the passkey-derived key with injected script | Strict CSP with nonces, no inline script, no `unsafe-eval`; no `dangerouslySetInnerHTML`; text as plain text                                  | S05-25, S05-26, S05-23 (rendering: 06)                                                                                                                                                             |
| Read the invite's one-time key from logs           | Key after `#`; `Referrer-Policy: no-referrer`; server sees only the address                                                                   | S05-24 (Referrer-Policy), S05-46 (`invitekey` redacted) (link format: 10)                                                                                                                          |
| Use a stolen server key                            | Three wallets each limited by R3, a few days' budget each; keys only in Vercel encrypted env, never `NEXT_PUBLIC_`; build searches the bundle | S05-38, S05-39, S05-42, S05-49, S05-50, S05-52 to S05-55                                                                                                                                           |
| Inject SQL                                         | ORM with parameters only; production user cannot change tables                                                                                | S05-33 to S05-37                                                                                                                                                                                   |
| Flood the server to run up cost                    | Rate limits per IP and per account; 10 KB body limit (reason limit: 12)                                                                       | S05-14 to S05-18                                                                                                                                                                                   |
| Frame the app, or downgrade the connection         | HSTS, `frame-ancestors 'none'`, nosniff, Permissions-Policy for passkeys only; CORS same origin                                               | S05-24, S05-25, S05-27                                                                                                                                                                             |
| Ship a malicious or vulnerable package             | Lockfile, `npm ci`, exact versions (02)                                                                                                       | Platform packages (`drizzle-orm`, `drizzle-kit`, `postgres`, `viem`, `zod`, `server-only`, `vitest`) are added at exact versions after the PRD 15 checks (downloads, maintainers, install scripts) |

Rows owned elsewhere: card endpoint (09), fee sponsor drain (07), Midtrans notification (08), EIP-712 reuse and reentrancy (03).

Other rules:

- The derived passkey key never reaches the server. No route accepts a private key.
- Logs never contain keys, signatures, invite keys, names, reasons or shop names (PRD 15 "Logs"), enforced by S05-46 and tested by T05-15.
- Server keys exist only in Vercel's encrypted environment settings. `.env.example` holds fake values only.

## Tests

Vitest, in `apps/web`, with coverage by `@vitest/coverage-v8`. Floor: **85% of lines** over `apps/web/src/lib/server/**` (PRD 15), set in `vitest.config.ts` `coverage.thresholds.lines = 85` and enforced in CI (02). Three projects:

- `unit`: pure functions and handlers with `FakeChain` and a real Postgres.
- `chain`: the real chain port against Anvil (`anvil --chain-id 31337`) with the contract deployed in demo mode and a stand-in AUSD (spec 19 provides the fixture).
- Postgres for both comes from `DATABASE_URL` in `.env.test` (a local Docker Postgres, or the CI service container from 02), migrated before the run, with the two roles from S05-36.

| Id     | Test                                                                                                                                                                                                                                                                                                                                                                                                                   | Proves               | PRD                                                                                  |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------ |
| T05-1  | Parser accepts a message built by `buildAuthMessage`; rejects CRLF, a trailing newline, 8 or 10 lines, swapped lines, an uppercase address, a missing space, `Issued` without `Z`                                                                                                                                                                                                                                      | S05-7, S05-13        | 15                                                                                   |
| T05-2  | Each S05-8 check: tamper one field at a time and get its exact code; signature by another key gives `auth_bad_signature`; body changed by one byte gives `auth_body_mismatch`                                                                                                                                                                                                                                          | S05-8                | 15                                                                                   |
| T05-3  | **Replay refused:** the same signed request sent twice; the first passes, the second gets 409 `nonce_invalid`                                                                                                                                                                                                                                                                                                          | S05-10               | 15 security test                                                                     |
| T05-4  | **Expired refused:** `Issued` 301 s old gives 401 `auth_expired`; 300 s passes; 31 s in the future gives `auth_future`, 30 s passes; a nonce issued 6 minutes ago and never used gives 409                                                                                                                                                                                                                             | S05-8, S05-9, S05-10 | 15 security test                                                                     |
| T05-5  | Ten concurrent requests with the same nonce: exactly one passes                                                                                                                                                                                                                                                                                                                                                        | S05-10               | 15                                                                                   |
| T05-6  | **Wrong role refused:** matrix of the five signed kinds × signer {owner, trusted, stranger}; each wrong pair gives its 403 code. After `FakeChain` swaps the owner (recovery), the old owner gets `not_owner` on the next request                                                                                                                                                                                      | S05-11               | 14 (private text refused without the right signature), 15 security test, E22, I4, J6 |
| T05-7  | Message `Account` differs from the body's account: 403 `wrong_account`; hidden resource of another account: 404                                                                                                                                                                                                                                                                                                        | S05-12               | 14                                                                                   |
| T05-8  | Pipeline order: a 401 request leaves its nonce unused; a 403 request has used it; a demo route with demo off makes no database query (spy) and returns the catch-all 404 body byte for byte                                                                                                                                                                                                                            | S05-2, S05-4, S05-31 | 15                                                                                   |
| T05-9  | Rate limits: 61st POST from one IP in a minute gets 429 with `Retry-After`; the first POST of the next window passes; 31st signed POST for one account gets 429; two IPv6 addresses in one /64 share a bucket; 121st GET gets 429                                                                                                                                                                                      | S05-14 to S05-16     | 15                                                                                   |
| T05-10 | Body: 10 240 bytes pass; 10 241 get `body_too_large` with and without `Content-Length`; `text/plain` gets `bad_content_type`; invalid JSON gets `bad_json`; one unknown field gets `bad_input`                                                                                                                                                                                                                         | S05-18, S05-19       | 15                                                                                   |
| T05-11 | Error shape: every error response in this suite parses as exactly `{error:{code,message}}`; a thrown `Error("secret detail")` gives 500 `internal` with the generic message, and the detail appears only in the log                                                                                                                                                                                                    | S05-20, S05-21       | 15                                                                                   |
| T05-12 | **XSS strings stored and returned as plain text:** `<script>alert(1)</script>` and `"><img src=x onerror=alert(1)>` saved through `zPlainText` into `profiles.name` and read back with `ok()` are byte-identical, with `Content-Type: application/json; charset=utf-8` and `X-Content-Type-Options: nosniff`. (07 and 12 repeat this on their own endpoints; 06 and 19 check the rendered page logs no CSP violation.) | S05-19, S05-23       | 15 security test                                                                     |
| T05-13 | `buildCsp`: contains `'nonce-…'` and `'strict-dynamic'`, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'none'`; contains no `unsafe-eval` and no script `unsafe-inline` when `NODE_ENV=production`; two calls give two different nonces. The `headers()` config contains the S05-24 values exactly. (Spec 19 checks the live headers on the preview deploy.)                                                | S05-24, S05-25       | 15                                                                                   |
| T05-14 | Origin: POST with `Origin: https://evil.example` gets 403 `bad_origin`; with `Sec-Fetch-Site: cross-site` gets 403; same-origin passes; the webhook and cron kinds skip the check; no API response has `Access-Control-Allow-Origin`                                                                                                                                                                                   | S05-27, S05-28       | 15                                                                                   |
| T05-15 | Logger: every S05-46 key is redacted at depth 1 and depth 5; a 130-hex signature inside a sentence is redacted; the configured key value inside an error message is redacted; an RPC URL becomes `[rpc1]`; a transaction hash is kept                                                                                                                                                                                  | S05-45, S05-46       | 15 "Logs"                                                                            |
| T05-16 | Demo flag: `DEMO_MODE` unset, `"false"`, `"TRUE"`, `"1"` are off; `"true"` is on; `demo-or-cron` with a valid bearer works with demo off                                                                                                                                                                                                                                                                               | S05-30, S05-31       | 15 security test (404 part)                                                          |
| T05-17 | Cron: no header, a wrong secret, and an unset `CRON_SECRET` give 401; the right bearer passes                                                                                                                                                                                                                                                                                                                          | S05-47               | 15                                                                                   |
| T05-18 | `sendContractTx` with `FakeChain`: gas limit is `max(ceil(est × 1.2), floor)`; a simulate revert throws `ChainRevert` with the decoded error name and never signs; a receipt timeout returns `receipt: null`; `beforeBroadcast` runs before `sendRawTransaction`                                                                                                                                                       | S05-41               | 7 (fee on limit)                                                                     |
| T05-19 | Chain suite on Anvil: five concurrent `sendContractTx` calls from one key get five consecutive nonces and all land; a stale `signer_nonces` row (older than 30 s) is ignored                                                                                                                                                                                                                                           | S05-41               | 6                                                                                    |
| T05-20 | Fallback: the first transport answers 429 to every call; reads and sends still work through the second                                                                                                                                                                                                                                                                                                                 | S05-38               | 17, L5                                                                               |
| T05-21 | Reserve: a MON transfer that would leave less than 10 MON throws `ReserveTooLow` before signing; a balance under reserve plus budget sends one alert, and a second call within the hour sends none                                                                                                                                                                                                                     | S05-42, S05-40       | 6                                                                                    |
| T05-22 | Database role: connected as `amplop_app`, `CREATE TABLE x (id int)`, `ALTER TABLE nonces ADD COLUMN y int`, `DROP TABLE nonces` and `TRUNCATE nonces` each fail with "permission denied"; `INSERT` into `nonces` works                                                                                                                                                                                                 | S05-36               | 15                                                                                   |
| T05-23 | Bundle scanner on fixtures: a file containing a fake private key, `TREASURY_PRIVATE_KEY`, `SB-Mid-server-abc12345` or a `postgres://` URL fails with its pattern id and never prints the full value; `NEXT_PUBLIC_MONAD_RPC_URL` alone passes; an allow-listed constant passes; the exact-value check catches a key with its `0x` removed                                                                              | S05-52 to S05-55     | 15 gate "Build"                                                                      |
| T05-24 | `randomHex16`: 100 000 values all match `^[0-9a-f]{32}$` and are unique                                                                                                                                                                                                                                                                                                                                                | S05-51               | 15                                                                                   |
| T05-25 | Env loader: a missing key lists the variable name and not any value; `MIDTRANS_IS_PRODUCTION=true` is refused; `SAMPLE_RATE_USD_PER_EUR=1.1511` parses to 11511/10000                                                                                                                                                                                                                                                  | S05-49               | 15                                                                                   |
| T05-26 | Nonce endpoint: returns a 32-hex nonce and an `expiresAt` 5 minutes ahead; cleanup deletes nonces expired over an hour ago and keeps newer ones                                                                                                                                                                                                                                                                        | S05-6, S05-17        | 15                                                                                   |

End-to-end cases: this spec owns none. It supports L5 (owned by 06) and the PRD 15 security tests run end to end by 19.

## Acceptance checklist

- [ ] Every route under `app/api` uses `defineRoute`; a grep for `request.json()` or `process.env` outside `lib/server/env.ts` and `route.ts` finds nothing.
- [ ] `GET /api/auth/nonce` works; a signed request built by `buildAuthMessage` passes; a replay gets 409.
- [ ] Unknown `/api` paths and switched-off demo routes return the same 404 body.
- [ ] Live headers on the preview deploy: CSP with a fresh nonce on each load, no `unsafe-eval`, HSTS, `frame-ancestors 'none'`, nosniff, `Referrer-Policy: no-referrer`, the exact Permissions-Policy; no CORS headers on `/api`.
- [ ] The app loads with zero CSP violations in the console on Chrome and Safari.
- [ ] Migrations apply with the migration role; the runtime role cannot change tables (T05-22).
- [ ] Three wallet clients start; the role checks against the contract pass on testnet.
- [ ] Five concurrent sends from one key land with consecutive nonces (T05-19).
- [ ] Logs from a full run of the Tier 1 cases contain no key, signature, invite key, name, reason or shop name (grep the captured logs for the sample strings "Raka", "Supermarket", "Laptop broke").
- [ ] `vercel.json` has both cron jobs; both reject calls without the bearer.
- [ ] `npm run build` runs the bundle scan and passes; planting a fake key in a client file makes it fail.
- [ ] Vitest line coverage of `lib/server/**` is at least 85%.

## Skills to use

From MONSKILLS, pinned to commit `3f8efd2` (plugin 0.7.2). Start with `monskill` to route. Where a skill disagrees with this spec or the PRD, the PRD and this spec win.

- `concepts`: asynchronous execution, the `latest` / `safe` / `finalized` block tags, the reserve-balance rule and its "emptying" exception (S05-41 step 11, S05-42).
- `gas`: the fee is charged on the gas limit, so the limit is the 01 §9 rule, `max(estimate + 20%, GAS_FLOOR)` (S05-41 step 3).
- `tooling-and-infra`: RPC providers and their `eth_getLogs` limits, the viem chain definition, fallback transports (S05-38, S05-43).
- Skip `wallet` and `wallet-integration` (PRD 6).

## Decisions made here

1. **Per-key serialisation in Postgres.** Sends from one key are serialised across all serverless instances with a Postgres advisory lock held until the receipt arrives, plus a small `signer_nonces` table for the rare timeout case. An in-memory nonce manager would collide across Vercel instances, and Monad's `pending` tag equals `latest`, so the RPC cannot hand out the next free nonce.
2. **Gas limit formula.** `max(ceil(estimate × 1.2), GAS_FLOOR)`, with floors from the gas report. PRD 7 says "estimate plus a small margin"; the floor stops an `authorize` that was estimated on the decline path from running out of gas on the approve path.
3. **Fee cap.** `MAX_FEE_PER_GAS = 1000 gwei` refuses to send at a surprise price.
4. **Daily budgets.** Treasury 2 MON and card service 5 MON a day (the PRD only fixes the fee sponsor at 50 MON). They set the low-balance alert thresholds.
5. **Per-IP GET limit of 120 a minute** on `/api` (01 only limits POST), because the nonce endpoint writes a row on every call.
6. **Per-account limit counts POSTs only.** Status polling is GET and would otherwise use up the 30-a-minute budget.
7. **Body too large is 400 `body_too_large`,** not 413, to stay inside 01's status list.
8. **Allowed hosts** come from a new `SITE_HOSTS` variable plus Vercel's system URLs, because the `Site` line must be checked against something the client cannot set.
9. **Origin and `Sec-Fetch-Site` checks on POST** as well as no CORS headers. Signed requests already stop forgery; this also stops cross-site calls to unsigned POSTs.
10. **Styles:** `style-src-elem` with the nonce and `style-src-attr 'unsafe-inline'`. PRD 15 forbids inline script and `unsafe-eval`; it does not forbid style attributes, which React server rendering emits.
11. **Every page renders dynamically,** because per-request nonces need it.
12. **`clipboard-write` stays at the browser default** (same origin), because three boards have Copy buttons. Everything else outside WebAuthn is denied.
13. **Status columns are `text` with `CHECK`,** not Postgres enums.
14. **Cron runs daily at 02:00 and 02:30 UTC** and only as a backstop.
15. **Alerts are deduplicated hourly per kind,** using the `rate_limits` table.

## Additions to 01 (status)

1. Env `SITE_HOSTS`: Merged into 01 (section 7).
2. Env `NEXT_PUBLIC_SAMPLE_RATE_IDR_PER_USD` and `NEXT_PUBLIC_SAMPLE_RATE_USD_PER_EUR`: Merged into 01 (section 7).
3. Table `signer_nonces`: Merged into 01 (section 5).
4. Rate limit of 120 GETs a minute per IP, per-account limit on signed POSTs only: Merged into 01 (section 4). The exclusion of cron routes stays a detail of this spec (S05-14).
5. Contract getters: Merged into 01 (section 3).
6. JSON type of `accountId` and `rupiah`: Merged into 01 (section 9).
7. Auth kind details: Merged into 01 (section 9).
8. Status 400 `body_too_large` for an oversized body: Merged into 01 (section 9, platform codes).
9. Platform error codes: Merged into 01 (section 9).
