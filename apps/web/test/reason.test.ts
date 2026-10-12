// Spec 12 server tests: POST /api/reason, GET /api/reason/[linkId] and GET /api/reason/current.
import { keccak256, toBytes } from "viem";
import type { PrivateKeyAccount } from "viem/accounts";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as readRoute } from "@/app/api/reason/[linkId]/route";
import { GET as currentRoute } from "@/app/api/reason/current/route";
import { POST as saveRoute } from "@/app/api/reason/route";
import { resetEnv } from "@/lib/server/env";
import { reasonValid } from "@/lib/server/reason";
import {
  call,
  errCode,
  fakeChain,
  newAccount,
  resetDb,
  signedHeaders,
  type FakeRpc,
} from "./helpers";

const REASON = "Laptop broke, needs repair before next week's exams.";
const logLines: string[] = [];
beforeAll(() => {
  vi.spyOn(console, "log").mockImplementation((s: string) => {
    logLines.push(s);
  });
});
afterAll(() => {
  expect(logLines.join("\n")).not.toContain("Laptop broke");
  vi.restoreAllMocks();
});

let rpc: FakeRpc;
let raka: PrivateKeyAccount;
let mama: PrivateKeyAccount;

function emergency(seq: bigint, reason = REASON, status = 1) {
  rpc.reads.set("emergency(1)", {
    status,
    requestSeq: seq,
    amount: 70_000_000n,
    reasonHash: keccak256(toBytes(reason)),
    requestedAt: 0n,
    opensAt: 172_800n,
  });
}

async function save(
  body: Record<string, string>,
  who: PrivateKeyAccount = raka,
  accountId = 1n,
  nonce?: string,
) {
  const text = JSON.stringify(body);
  return call(saveRoute, {
    method: "POST",
    body: text,
    headers: await signedHeaders({
      account: who,
      action: "reason.save",
      accountId,
      body: text,
      ...(nonce ? { nonce } : {}),
    }),
  });
}
const valid = (reason = REASON, requestSeq = "1") => ({ accountId: "1", requestSeq, reason });

async function readLink(linkId: string, who: PrivateKeyAccount, accountId = 1n) {
  return call(readRoute, {
    params: { linkId },
    headers: await signedHeaders({ account: who, action: "reason.read", accountId }),
  });
}

beforeEach(async () => {
  resetEnv();
  await resetDb();
  ({ rpc } = fakeChain());
  raka = newAccount();
  mama = newAccount();
  rpc.accounts.set(1n, { owner: raka.address, trusted: mama.address });
  emergency(1n);
});

describe("reason checks", () => {
  it("counts code points, refuses only spaces, and hashes like viem", () => {
    expect(reasonValid("😀".repeat(280))).toBe(true);
    expect(reasonValid("a".repeat(281))).toBe(false);
    expect(reasonValid(" ")).toBe(false);
    expect(reasonValid("")).toBe(false);
    expect(keccak256(toBytes(REASON))).toMatch(/^0x[0-9a-f]{64}$/);
  });
});

describe("POST /api/reason", () => {
  it("saves once and returns the same link id again", async () => {
    const r = await save(valid());
    expect(r.status).toBe(200);
    const { linkId } = r.json as { linkId: string };
    expect(linkId).toMatch(/^[0-9a-f]{32}$/);
    expect(((await save(valid())).json as { linkId: string }).linkId).toBe(linkId);
  });

  it("refuses a mismatched hash, bad lengths, the wrong signer or account, and stale requests", async () => {
    expect(errCode((await save(valid("Something else"))).json)).toBe("reason_mismatch");
    expect(errCode((await save(valid("a".repeat(281)))).json)).toBe("reason_invalid");
    expect(errCode((await save(valid("   "))).json)).toBe("reason_invalid");
    const trusted = await save(valid(), mama);
    expect([trusted.status, errCode(trusted.json)]).toEqual([403, "not_owner"]);
    const other = newAccount();
    rpc.accounts.set(2n, { owner: other.address, trusted: newAccount().address });
    const wrong = await save(valid(), other, 2n);
    expect([wrong.status, errCode(wrong.json)]).toEqual([403, "wrong_account"]);
    expect(errCode((await save(valid(REASON, "2"))).json)).toBe("request_not_found");
    emergency(3n);
    expect(errCode((await save(valid(REASON, "2"))).json)).toBe("request_not_current");
    emergency(0n, REASON, 0);
    expect(errCode((await save(valid(REASON, "1"))).json)).toBe("request_not_found");
  });

  it("needs a signature and refuses a replayed nonce", async () => {
    const none = await call(saveRoute, { method: "POST", body: JSON.stringify(valid()) });
    expect(none.status).toBe(401);
    const { issueNonce } = await import("@/lib/server/auth/verify");
    const { nonce } = await issueNonce();
    expect((await save(valid(), raka, 1n, nonce)).status).toBe(200);
    const replay = await save(valid(), raka, 1n, nonce);
    expect([replay.status, errCode(replay.json)]).toEqual([409, "nonce_invalid"]);
  });
});

describe("GET /api/reason/[linkId] and /current", () => {
  it("lets the owner and the trusted person read, no one else", async () => {
    const { linkId } = (await save(valid())).json as { linkId: string };
    const owner = await readLink(linkId, raka);
    expect([owner.status, owner.json]).toEqual([
      200,
      { accountId: "1", requestSeq: "1", reason: REASON },
    ]);
    expect(owner.res.headers.get("cache-control")).toBe("no-store");
    expect((await readLink(linkId, mama)).status).toBe(200);

    const otherTrusted = newAccount();
    rpc.accounts.set(2n, { owner: newAccount().address, trusted: otherTrusted.address });
    const other = await readLink(linkId, otherTrusted, 2n);
    expect([other.status, errCode(other.json)]).toEqual([404, "reason_not_found"]);

    rpc.accounts.set(1n, { owner: raka.address, trusted: newAccount().address });
    const replaced = await readLink(linkId, mama);
    expect(replaced.status).toBe(403);

    expect(errCode((await readLink("f".repeat(32), raka)).json)).toBe("reason_not_found");
    expect(errCode((await readLink("not-a-link", raka)).json)).toBe("reason_not_found");
  });

  it("returns the current request's row, or 404", async () => {
    const current = async () =>
      call(currentRoute, {
        headers: await signedHeaders({ account: mama, action: "reason.current", accountId: 1n }),
      });
    expect(errCode((await current()).json)).toBe("reason_not_found");
    const { linkId } = (await save(valid())).json as { linkId: string };
    expect((await current()).json).toEqual({ linkId, requestSeq: "1", reason: REASON });
  });
});
