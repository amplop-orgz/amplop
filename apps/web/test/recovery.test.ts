// Spec 13 server tests: POST /api/recovery, GET /api/recovery/[linkId] and the dismiss route.
import { eq } from "drizzle-orm";
import type { PrivateKeyAccount } from "viem/accounts";
import { beforeEach, describe, expect, it } from "vitest";
import { POST as dismissRoute } from "@/app/api/recovery/[linkId]/dismiss/route";
import { GET as readRoute } from "@/app/api/recovery/[linkId]/route";
import { POST as createRoute } from "@/app/api/recovery/route";
import { issueNonce } from "@/lib/server/auth/verify";
import { db, schema } from "@/lib/server/db";
import { resetEnv } from "@/lib/server/env";
import {
  call,
  errCode,
  fakeChain,
  newAccount,
  resetDb,
  signedHeaders,
  type FakeRpc,
} from "./helpers";

let rpc: FakeRpc;
let raka: PrivateKeyAccount;
let mama: PrivateKeyAccount;
let fresh: PrivateKeyAccount;

beforeEach(async () => {
  resetEnv();
  await resetDb();
  ({ rpc } = fakeChain());
  raka = newAccount();
  mama = newAccount();
  fresh = newAccount();
  rpc.accounts.set(1n, { owner: raka.address, trusted: mama.address });
});

async function create(
  who: PrivateKeyAccount,
  newOwner = who.address.toLowerCase(),
  opts: { accountId?: bigint; nonce?: string } = {},
) {
  const body = JSON.stringify({ newOwner });
  return call(createRoute, {
    method: "POST",
    body,
    headers: await signedHeaders({
      account: who,
      action: "recovery.create",
      accountId: opts.accountId ?? 0n,
      body,
      ...(opts.nonce ? { nonce: opts.nonce } : {}),
    }),
  });
}
const linkOf = (r: { json: unknown }) => (r.json as { linkId: string }).linkId;

async function read(linkId: string, who: PrivateKeyAccount, accountId = 1n) {
  return call(readRoute, {
    params: { linkId },
    headers: await signedHeaders({ account: who, action: "recovery.read", accountId }),
  });
}

describe("POST /api/recovery", () => {
  it("creates once, refuses a mismatched signer, an account owner and a trusted person", async () => {
    const r = await create(fresh);
    expect(linkOf(r)).toMatch(/^[0-9a-f]{32}$/);
    expect(linkOf(await create(fresh))).toBe(linkOf(r));
    const other = await create(fresh, newAccount().address.toLowerCase());
    expect([other.status, errCode(other.json)]).toEqual([403, "address_mismatch"]);
    const owner = await create(raka);
    expect([owner.status, errCode(owner.json)]).toEqual([409, "recovery_new_owner_has_account"]);
    const trusted = await create(mama);
    expect([trusted.status, errCode(trusted.json)]).toEqual([
      409,
      "recovery_new_owner_has_account",
    ]);
    expect(errCode((await create(fresh, undefined, { accountId: 1n })).json)).toBe("bad_input");
  });

  it("needs a signature, refuses a replayed nonce and limits new links to 3 a day", async () => {
    const none = await call(createRoute, {
      method: "POST",
      body: JSON.stringify({ newOwner: fresh.address.toLowerCase() }),
    });
    expect(none.status).toBe(401);
    const { nonce } = await issueNonce();
    expect((await create(fresh, undefined, { nonce })).status).toBe(200);
    expect(errCode((await create(fresh, undefined, { nonce })).json)).toBe("nonce_invalid");
    for (let i = 0; i < 2; i++) {
      await db().update(schema.recoveries).set({ dismissedAt: new Date() });
      expect((await create(fresh)).status).toBe(200);
    }
    await db().update(schema.recoveries).set({ dismissedAt: new Date() });
    const fourth = await create(fresh);
    expect([fourth.status, errCode(fourth.json)]).toEqual([429, "rate_limited"]);
  });
});

describe("GET /api/recovery/[linkId] and dismiss", () => {
  it("lets any current trusted person read; refuses the owner and strangers; 404 unknown and expired", async () => {
    const linkId = linkOf(await create(fresh));
    const ok = await read(linkId, mama);
    expect(ok.status).toBe(200);
    expect(ok.json).toMatchObject({ newOwner: fresh.address.toLowerCase(), dismissed: false });
    expect(ok.res.headers.get("cache-control")).toBe("no-store");
    expect((await read(linkId, raka)).status).toBe(403);
    expect((await read(linkId, newAccount())).status).toBe(403);
    expect(errCode((await read("f".repeat(32), mama)).json)).toBe("recovery_not_found");
    await db()
      .update(schema.recoveries)
      .set({ createdAt: new Date(Date.now() - 8 * 86_400_000) })
      .where(eq(schema.recoveries.linkId, linkId));
    expect(errCode((await read(linkId, mama)).json)).toBe("recovery_expired");
  });

  it("dismisses idempotently, for the trusted person only", async () => {
    const linkId = linkOf(await create(fresh));
    const dismiss = async (who: PrivateKeyAccount) =>
      call(dismissRoute, {
        method: "POST",
        body: "{}",
        params: { linkId },
        headers: await signedHeaders({
          account: who,
          action: "recovery.dismiss",
          accountId: 1n,
          body: "{}",
        }),
      });
    expect((await dismiss(newAccount())).status).toBe(403);
    expect((await dismiss(mama)).json).toEqual({ ok: true });
    expect((await dismiss(mama)).status).toBe(200);
    expect((await read(linkId, mama)).json).toMatchObject({ dismissed: true });
  });
});
