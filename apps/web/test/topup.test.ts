// Spec 08 server tests: T08-1 to T08-19 with the fake chain and a fake Midtrans, T08-20 and T08-21 on
// Anvil with the real contract.
import { amplopEnvelopesAbi } from "@amplop/shared/abi";
import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import {
  createTestClient,
  createWalletClient,
  decodeFunctionData,
  erc20Abi,
  http,
  parseAbi,
  parseEther,
  parseTransaction,
  publicActions,
  type Hex,
} from "viem";
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as cronRoute } from "@/app/api/cron/deposits/route";
import { POST as webhookRoute } from "@/app/api/midtrans/webhook/route";
import { POST as simulateRoute } from "@/app/api/topup/[orderId]/simulate/route";
import { GET as readRoute } from "@/app/api/topup/[orderId]/route";
import { POST as createRoute } from "@/app/api/topup/route";
import { chain, setChain } from "@/lib/server/chain/chain";
import { ChainRevert } from "@/lib/server/chain/types";
import { db, schema } from "@/lib/server/db";
import { resetEnv } from "@/lib/server/env";
import { backoffMs, runDeposit } from "@/lib/server/topup/deposit";
import { paymentIdFor } from "@/lib/server/topup/orders";
import { anvilChain, hasAnvil, startAnvil, type AnvilStack } from "./anvil";
import {
  call,
  errCode,
  eventLog,
  fakeChain,
  newAccount,
  resetDb,
  signedHeaders,
  type FakeRpc,
} from "./helpers";

const pending: Promise<unknown>[] = [];
vi.mock("next/server", () => ({
  after: (fn: () => unknown) => {
    pending.push(Promise.resolve().then(fn));
  },
}));
async function flush(): Promise<void> {
  while (pending.length) await Promise.allSettled(pending.splice(0));
}

const VA = "812785002530231";
const logLines: string[] = [];
beforeAll(() => {
  vi.spyOn(console, "log").mockImplementation((s: string) => {
    logLines.push(s);
  });
});
afterAll(() => {
  // T08-19: no VA number, signature or server key in the logs.
  const all = logLines.join("\n");
  expect(all).not.toContain(VA);
  expect(all).not.toContain(process.env.MIDTRANS_SERVER_KEY ?? "missing");
  for (const s of signatures) expect(all).not.toContain(s);
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------- fake Midtrans

type StatusBody = Record<string, string>;
const midtrans = {
  charges: [] as unknown[],
  chargeMode: "ok" as "ok" | "timeout" | "500",
  statuses: new Map<string, StatusBody>(),
  statusFail: false,
  statusCalls: 0,
  reset() {
    this.charges = [];
    this.chargeMode = "ok";
    this.statuses.clear();
    this.statusFail = false;
    this.statusCalls = 0;
  },
};
const realFetch = globalThis.fetch;
beforeAll(() => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.startsWith(process.env.MIDTRANS_API_BASE_URL ?? "none")) return realFetch(input, init);
    const json = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      });
    if (url.endsWith("/v2/charge")) {
      midtrans.charges.push(JSON.parse(init?.body as string));
      if (midtrans.chargeMode === "timeout") throw new Error("aborted");
      if (midtrans.chargeMode === "500") return json(500, { status_code: "500" });
      return json(201, {
        status_code: "201",
        transaction_status: "pending",
        transaction_time: "2098-12-31 14:02:00",
        expiry_time: "2099-01-01 14:02:00",
        va_numbers: [{ bank: "bca", va_number: VA }],
      });
    }
    const m = /\/v2\/([0-9a-f]{32})\/status$/.exec(url);
    if (m?.[1]) {
      midtrans.statusCalls++;
      if (midtrans.statusFail) throw new Error("down");
      return json(200, midtrans.statuses.get(m[1]) ?? { status_code: "404" });
    }
    return json(404, {});
  });
});

const signatures: string[] = [];
function notification(o: { orderId: string; gross?: string; status?: string; extra?: object }) {
  const body = {
    order_id: o.orderId,
    status_code: "200",
    gross_amount: o.gross ?? "16500000.00",
    transaction_status: o.status ?? "settlement",
    payment_type: "bank_transfer",
    ...o.extra,
  };
  const signature_key = createHash("sha512")
    .update(
      body.order_id +
        body.status_code +
        body.gross_amount +
        (process.env.MIDTRANS_SERVER_KEY ?? ""),
    )
    .digest("hex");
  signatures.push(signature_key);
  return { ...body, signature_key };
}
function setStatus(orderId: string, status: string, extra: StatusBody = {}) {
  midtrans.statuses.set(orderId, {
    order_id: orderId,
    status_code: "200",
    gross_amount: "16500000.00",
    transaction_status: status,
    payment_type: "bank_transfer",
    ...extra,
  });
}
const webhook = async (body: unknown) => {
  const r = await call(webhookRoute, { method: "POST", body: JSON.stringify(body) });
  await flush();
  return r;
};

// ---------------------------------------------------------------- helpers

let raka: PrivateKeyAccount;
let mama: PrivateKeyAccount;
let rpc: FakeRpc;
const ACCOUNT = 1n;

function deposits(): { args: readonly unknown[] }[] {
  return rpc.sent.flatMap((s) => {
    const tx = parseTransaction(s);
    try {
      const d = decodeFunctionData({ abi: amplopEnvelopesAbi, data: tx.data ?? "0x" });
      return d.functionName === "deposit" ? [{ args: d.args }] : [];
    } catch {
      return [];
    }
  });
}
function sentNames(): string[] {
  const abi = [...amplopEnvelopesAbi, ...erc20Abi, ...parseAbi(["function requestFunds(address)"])];
  return rpc.sent.map(
    (s) => decodeFunctionData({ abi, data: parseTransaction(s).data ?? "0x" }).functionName,
  );
}

async function create(rupiah = "16500000", who = mama) {
  const body = JSON.stringify({ accountId: ACCOUNT.toString(), rupiah });
  return call(createRoute, {
    method: "POST",
    body,
    headers: await signedHeaders({
      account: who,
      action: "topup.create",
      accountId: ACCOUNT,
      body,
    }),
  });
}
async function newOrder(rupiah = "16500000"): Promise<string> {
  const r = await create(rupiah);
  expect(r.status).toBe(200);
  return (r.json as { orderId: string }).orderId;
}
async function read(orderId: string, who = mama) {
  return call(readRoute, {
    params: { orderId },
    headers: await signedHeaders({ account: who, action: "topup.read", accountId: ACCOUNT }),
  });
}
async function simulate(orderId: string) {
  const body = "{}";
  const r = await call(simulateRoute, {
    method: "POST",
    body,
    params: { orderId },
    headers: await signedHeaders({
      account: mama,
      action: "topup.simulate",
      accountId: ACCOUNT,
      body,
    }),
  });
  await flush();
  return r;
}
async function row(orderId: string) {
  const rows = await db().select().from(schema.orders).where(eq(schema.orders.orderId, orderId));
  const r = rows[0];
  if (!r) throw new Error("no order");
  return r;
}
async function setRow(orderId: string, patch: Partial<typeof schema.orders.$inferInsert>) {
  await db().update(schema.orders).set(patch).where(eq(schema.orders.orderId, orderId));
}

function depositedOn(fake: FakeRpc) {
  fake.onSend = (fn, args) =>
    fn === "deposit"
      ? [
          eventLog("Deposited", {
            accountId: args[0],
            paymentId: args[2],
            amount: args[1],
            parts: [0n, 0n, 0n, args[1], 0n],
            startDay: 20_738n,
          }),
        ]
      : [];
}

beforeEach(async () => {
  await flush();
  resetEnv();
  await resetDb();
  midtrans.reset();
  raka = newAccount();
  mama = newAccount();
  ({ rpc } = fakeChain());
  rpc.accounts.set(ACCOUNT, { owner: raka.address, trusted: mama.address });
  rpc.reads.set("tokenDecimals", 6);
  rpc.reads.set("paymentUsed", false);
  rpc.reads.set("balanceOf", 25_000n * 10n ** 6n);
  rpc.reads.set("allowance", 2n ** 255n);
  depositedOn(rpc);
});
afterEach(async () => {
  await flush();
});

// ---------------------------------------------------------------- create and read

describe("POST /api/topup", () => {
  it("T08-10: limits, roles, the exact charge body, a failed charge and the daily cap", async () => {
    expect(errCode((await create("99999")).json)).toBe("amount_out_of_range");
    expect(errCode((await create("50000001")).json)).toBe("amount_out_of_range");
    expect((await create("100000")).status).toBe(200);
    const max = await create("50000000");
    expect(max.status).toBe(200);
    expect(max.json).toMatchObject({
      vaNumber: VA,
      bank: "bca",
      rupiah: "50000000",
      dollars: "3030303030",
      rate: 16500,
      expiresAt: "2099-01-01T07:02:00.000Z",
    });
    expect(midtrans.charges.at(-1)).toEqual({
      payment_type: "bank_transfer",
      transaction_details: {
        order_id: (max.json as { orderId: string }).orderId,
        gross_amount: 50_000_000,
      },
      bank_transfer: { bank: "bca" },
    });

    const before = (await db().select().from(schema.orders)).length;
    const student = await create("16500000", raka);
    expect([student.status, errCode(student.json)]).toEqual([403, "not_trusted"]);
    const stranger = await create("16500000", newAccount());
    expect([stranger.status, errCode(stranger.json)]).toEqual([403, "not_trusted"]);
    expect((await db().select().from(schema.orders)).length).toBe(before);

    midtrans.chargeMode = "timeout";
    const failed = await create();
    expect([failed.status, errCode(failed.json)]).toEqual([502, "midtrans_unavailable"]);
    const f = (
      await db()
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.lastError, "charge_failed:timeout"))
    )[0];
    expect(f?.status).toBe("failed");

    midtrans.chargeMode = "ok";
    for (let i = (await db().select().from(schema.orders)).length; i < 10; i++) await newOrder();
    const eleventh = await create();
    expect([eleventh.status, errCode(eleventh.json)]).toEqual([429, "too_many_orders"]);
  });

  it("T08-11: the rate is locked on the order and the deposit sends the stored units", async () => {
    const orderId = await newOrder();
    process.env.SAMPLE_RATE_IDR_PER_USD = "15000";
    process.env.NEXT_PUBLIC_SAMPLE_RATE_IDR_PER_USD = "15000";
    resetEnv();
    try {
      expect((await simulate(orderId)).json).toMatchObject({
        status: "sent",
        dollars: "1000000000",
      });
      expect(deposits()[0]?.args[1]).toBe(1_000_000_000n);
    } finally {
      process.env.SAMPLE_RATE_IDR_PER_USD = "16500";
      process.env.NEXT_PUBLIC_SAMPLE_RATE_IDR_PER_USD = "16500";
      resetEnv();
    }
  });
});

describe("GET /api/topup/[orderId]", () => {
  it("T08-12: scoped to the account, re-checks Midtrans at most every 10 s, survives Midtrans down", async () => {
    const orderId = await newOrder();
    const other = newAccount();
    rpc.accounts.set(2n, { owner: newAccount().address, trusted: other.address });
    const r404 = await call(readRoute, {
      params: { orderId },
      headers: await signedHeaders({ account: other, action: "topup.read", accountId: 2n }),
    });
    expect([r404.status, errCode(r404.json)]).toEqual([404, "not_found"]);

    setStatus(orderId, "pending");
    await setRow(orderId, { lastCheckedAt: new Date(Date.now() - 5_000) });
    await read(orderId);
    expect(midtrans.statusCalls).toBe(0);
    await setRow(orderId, { lastCheckedAt: new Date(Date.now() - 11_000) });
    expect((await read(orderId)).json).toMatchObject({
      status: "waiting",
      vaNumber: VA,
      bank: "bca",
    });
    expect(midtrans.statusCalls).toBe(1);

    const old = new Date(Date.now() - 20_000);
    await setRow(orderId, { lastCheckedAt: old });
    midtrans.statusFail = true;
    const r = await read(orderId);
    expect(r.status).toBe(200);
    expect((r.json as { lastCheckedAt: string }).lastCheckedAt).toBe(old.toISOString());
  });

  it("a poll that finds a settlement deposits and answers sent", async () => {
    const orderId = await newOrder();
    setStatus(orderId, "settlement");
    await setRow(orderId, { lastCheckedAt: new Date(Date.now() - 11_000) });
    const r = (await read(orderId)).json as {
      status: string;
      depositTx: string;
      confirmMs: number;
    };
    expect(r.status).toBe("sent");
    expect(r.depositTx).toMatch(/^0x[0-9a-f]{64}$/);
    expect(deposits()).toHaveLength(1);
  });
});

// ---------------------------------------------------------------- webhook

describe("POST /api/midtrans/webhook", () => {
  it("T08-1: one changed signature character is refused before anything else", async () => {
    const orderId = await newOrder();
    setStatus(orderId, "settlement");
    const n = notification({ orderId });
    const bad = {
      ...n,
      signature_key: (n.signature_key[0] === "a" ? "b" : "a") + n.signature_key.slice(1),
    };
    const r = await webhook(bad);
    expect([r.status, errCode(r.json)]).toEqual([401, "bad_signature"]);
    expect(midtrans.statusCalls).toBe(0);
    expect((await row(orderId)).status).toBe("waiting");
    expect(rpc.sent).toHaveLength(0);
  });

  it("T08-2: three deliveries in a row, then three at once, make one deposit", async () => {
    const orderId = await newOrder();
    setStatus(orderId, "settlement");
    for (let i = 0; i < 3; i++) expect((await webhook(notification({ orderId }))).status).toBe(200);
    const second = await newOrder();
    setStatus(second, "settlement");
    const all = await Promise.all([1, 2, 3].map(() => webhook(notification({ orderId: second }))));
    expect(all.map((r) => r.status)).toEqual([200, 200, 200]);
    await flush();
    expect((await row(orderId)).status).toBe("sent");
    expect((await row(second)).status).toBe("sent");
    expect(deposits()).toHaveLength(2);
  });

  it("T08-4: a correctly signed but different amount is refused, in the notice or the status", async () => {
    const orderId = await newOrder();
    setStatus(orderId, "settlement");
    const r = await webhook(notification({ orderId, gross: "16500001.00" }));
    expect([r.status, errCode(r.json)]).toEqual([400, "amount_mismatch"]);
    setStatus(orderId, "settlement", { gross_amount: "16500001.00" });
    const r2 = await webhook(notification({ orderId }));
    expect([r2.status, errCode(r2.json)]).toEqual([400, "amount_mismatch"]);
    expect((await row(orderId)).status).toBe("waiting");
    expect(rpc.sent).toHaveLength(0);
  });

  it("T08-5: a pending status deposits nothing, even when the notice says settlement", async () => {
    const orderId = await newOrder();
    setStatus(orderId, "pending");
    expect((await webhook(notification({ orderId, status: "pending" }))).status).toBe(200);
    expect((await webhook(notification({ orderId }))).status).toBe(200);
    expect((await row(orderId)).status).toBe("waiting");
    expect(rpc.sent).toHaveLength(0);
  });

  it("T08-6: the status mapping", async () => {
    const cases: [string, string, string?][] = [
      ["expire", "expired"],
      ["cancel", "failed"],
      ["deny", "failed"],
      ["failure", "failed"],
      ["capture", "waiting"],
      ["refund", "waiting"],
      ["settlement", "waiting", "credit_card"],
    ];
    for (const [status, want, paymentType] of cases) {
      const orderId = await newOrder("100000");
      setStatus(orderId, status, {
        gross_amount: "100000.00",
        ...(paymentType ? { payment_type: paymentType } : {}),
      });
      expect((await webhook(notification({ orderId, status, gross: "100000.00" }))).status).toBe(
        200,
      );
      expect([status, (await row(orderId)).status]).toEqual([status, want]);
    }
    expect(rpc.sent).toHaveLength(0);
  });

  it("T08-7: a settlement for an expired order still deposits", async () => {
    const orderId = await newOrder();
    await setRow(orderId, { status: "expired" });
    setStatus(orderId, "settlement");
    expect((await webhook(notification({ orderId }))).status).toBe(200);
    expect((await row(orderId)).status).toBe("sent");
    expect(deposits()).toHaveLength(1);
  });

  it("T08-8: an unknown order answers 200; an unknown field is refused and logged by name only", async () => {
    const unknown = await webhook(notification({ orderId: "f".repeat(32) }));
    expect([unknown.status, unknown.json]).toEqual([200, { ok: true }]);
    const test = await webhook(notification({ orderId: "payment_notif_test_G123" }));
    expect(test.status).toBe(200);
    const orderId = await newOrder();
    const extra = await webhook(
      notification({ orderId, extra: { surprise_field: "secret-value-123" } }),
    );
    expect([extra.status, errCode(extra.json)]).toEqual([400, "bad_input"]);
    const all = logLines.join("\n");
    expect(all).toContain("surprise_field");
    expect(all).not.toContain("secret-value-123");
  });

  it("answers 502 when the status cannot be fetched, and the poll covers it later", async () => {
    const orderId = await newOrder();
    midtrans.statusFail = true;
    const r = await webhook(notification({ orderId }));
    expect([r.status, errCode(r.json)]).toEqual([502, "midtrans_unavailable"]);
    midtrans.statusFail = false;
    setStatus(orderId, "settlement");
    await setRow(orderId, { lastCheckedAt: new Date(Date.now() - 11_000) });
    expect(((await read(orderId)).json as { status: string }).status).toBe("sent");
  });
});

// ---------------------------------------------------------------- simulate

describe("POST /api/topup/[orderId]/simulate", () => {
  it("T08-9: 404 with demo off; two concurrent taps make one deposit; an expired order is closed", async () => {
    const orderId = await newOrder();
    process.env.DEMO_MODE = "false";
    try {
      const off = await simulate(orderId);
      expect([off.status, errCode(off.json)]).toEqual([404, "not_found"]);
      // 15 PRD 15 security test: unsigned too.
      const unsigned = await call(simulateRoute, {
        method: "POST",
        body: "{}",
        params: { orderId },
      });
      expect(unsigned.status).toBe(404);
    } finally {
      process.env.DEMO_MODE = "true";
    }
    expect((await row(orderId)).status).toBe("waiting");

    const [a, b] = await Promise.all([simulate(orderId), simulate(orderId)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(deposits()).toHaveLength(1);
    expect((await simulate(orderId)).json).toMatchObject({ status: "sent" });
    expect(deposits()).toHaveLength(1);

    const closed = await newOrder();
    await setRow(closed, { status: "expired" });
    const r = await simulate(closed);
    expect([r.status, errCode(r.json)]).toEqual([409, "order_closed"]);
  });
});

// ---------------------------------------------------------------- the deposit path

describe("runDeposit", () => {
  async function received(): Promise<string> {
    const orderId = await newOrder();
    await setRow(orderId, { status: "received", nextAttemptAt: new Date() });
    return orderId;
  }

  it("T08-3: two chain failures are retried with backoff, then one deposit", async () => {
    const orderId = await received();
    rpc.sendError = new Error("connection refused");
    expect(await runDeposit(orderId)).toBe("retry");
    await setRow(orderId, { updatedAt: new Date(Date.now() - 61_000) });
    expect(await runDeposit(orderId, { force: true })).toBe("retry");
    const r = await row(orderId);
    expect([r.status, r.attempts, r.lastError]).toEqual(["received", 2, "chain_unavailable"]);
    expect(await runDeposit(orderId)).toBe("not_due");
    rpc.sendError = null;
    await setRow(orderId, {
      nextAttemptAt: new Date(Date.now() - 1),
      updatedAt: new Date(Date.now() - 61_000),
    });
    expect(((await read(orderId)).json as { status: string }).status).toBe("sent");
    expect(deposits()).toHaveLength(1);
  });

  it("T08-13: lock, stored hashes, the used-id revert and the 60 s in-flight window", async () => {
    const orderId = await received();
    await db().transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${`order:${orderId}`}, 0))`,
      );
      expect(await runDeposit(orderId)).toBe("busy");
    });

    const landed: Hex = `0x${"11".repeat(32)}`;
    const paymentId = paymentIdFor(orderId);
    const deposited = eventLog("Deposited", {
      accountId: ACCOUNT,
      paymentId,
      amount: 1n,
      parts: [0n, 0n, 0n, 1n, 0n],
      startDay: 1n,
    });
    rpc.receiptLogs.set(landed, [deposited]);
    await setRow(orderId, { sentHashes: [landed], depositTx: landed });
    expect(await runDeposit(orderId)).toBe("sent");
    expect((await row(orderId)).depositTx).toBe(landed);
    expect(rpc.sent).toHaveLength(0);

    const raced = await received();
    const racedHash: Hex = `0x${"22".repeat(32)}`;
    await setRow(raced, { sentHashes: [racedHash], updatedAt: new Date(Date.now() - 61_000) });
    rpc.simulate = () => {
      rpc.receiptLogs.set(racedHash, [
        eventLog("Deposited", {
          accountId: ACCOUNT,
          paymentId: paymentIdFor(raced),
          amount: 1n,
          parts: [0n, 0n, 0n, 1n, 0n],
          startDay: 1n,
        }),
      ]);
      return Promise.reject(new ChainRevert("PaymentAlreadyUsed"));
    };
    expect(await runDeposit(raced)).toBe("sent");
    expect((await row(raced)).depositTx).toBe(racedHash);

    rpc.simulate = () => Promise.resolve();
    const flying = await received();
    rpc.receiptTimeout = true;
    await setRow(flying, {
      sentHashes: [`0x${"33".repeat(32)}`],
      updatedAt: new Date(Date.now() - 30_000),
    });
    expect(await runDeposit(flying, { force: true })).toBe("in_flight");
    expect(rpc.sent).toHaveLength(0);
    await setRow(flying, { updatedAt: new Date(Date.now() - 61_000) });
    expect(await runDeposit(flying, { force: true })).toBe("retry");
    expect(rpc.sent).toHaveLength(1);
    expect((await row(flying)).lastError).toBe("unconfirmed");
  });

  it("T08-14: backoff 5 s doubling to 10 min, and an alert at the fifth attempt", async () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => backoffMs(n) / 1000)).toEqual([
      5, 10, 20, 40, 80, 160, 320, 600, 600,
    ]);
    const orderId = await received();
    await setRow(orderId, { attempts: 4 });
    rpc.sendError = new Error("down");
    await runDeposit(orderId, { force: true });
    await vi.waitFor(() => {
      expect(logLines.some((l) => l.includes('"kind":"deposit_stuck"'))).toBe(true);
    });
  });

  it("T08-15: a short treasury sends nothing, asks the faucet once a minute, then deposits once", async () => {
    process.env.AUSD_FAUCET_ADDRESS = "0xd236c18d274e54faccc3dd9dda4b27965a73ee6c";
    resetEnv();
    try {
      const orderId = await received();
      rpc.reads.set("balanceOf", 0n);
      expect(await runDeposit(orderId)).toBe("treasury_low");
      await flush();
      expect((await row(orderId)).lastError).toBe("treasury_low");
      expect(sentNames()).toEqual(["requestFunds"]);
      expect(await runDeposit(orderId, { force: true })).toBe("treasury_low");
      await flush();
      expect(sentNames()).toEqual(["requestFunds"]);
      expect(deposits()).toHaveLength(0);

      rpc.reads.set("balanceOf", 25_000n * 10n ** 6n);
      await setRow(orderId, { nextAttemptAt: new Date(Date.now() - 1) });
      expect(((await read(orderId)).json as { status: string }).status).toBe("sent");
      expect(deposits()).toHaveLength(1);
    } finally {
      delete process.env.AUSD_FAUCET_ADDRESS;
      resetEnv();
    }
  });

  it("T08-16: a short allowance sends approve before deposit", async () => {
    const orderId = await received();
    rpc.reads.set("allowance", 0n);
    expect(await runDeposit(orderId)).toBe("sent");
    expect(sentNames()).toEqual(["approve", "deposit"]);
  });
});

describe("GET /api/cron/deposits", () => {
  it("T08-17: needs the bearer; retries received orders when not due; re-checks stale waiting ones", async () => {
    expect((await call(cronRoute)).status).toBe(401);
    const due = await newOrder();
    await setRow(due, { status: "received", nextAttemptAt: new Date(Date.now() + 3_600_000) });
    const stale = await newOrder();
    setStatus(stale, "expire");
    await setRow(stale, { lastCheckedAt: new Date(Date.now() - 11 * 60_000) });
    const fresh = await newOrder();
    setStatus(fresh, "expire");
    const r = await call(cronRoute, {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` },
    });
    expect([r.status, r.json]).toEqual([200, { retried: 1 }]);
    expect((await row(due)).status).toBe("sent");
    expect((await row(stale)).status).toBe("expired");
    expect((await row(fresh)).status).toBe("waiting");
  });
});

// ---------------------------------------------------------------- Anvil

describe.skipIf(!hasAnvil)("top-ups on Anvil with the real contract", () => {
  let stack: AnvilStack;
  let miner: ReturnType<typeof setInterval>;
  const testClient = (url: string) =>
    createTestClient({ chain: foundry, mode: "anvil", transport: http(url) }).extend(publicActions);

  beforeAll(async () => {
    // One slot per epoch: the finalized block trails the head by two, so `sent` waits for finality.
    stack = await startAnvil(8559, ["--slots-in-an-epoch", "1"]);
    const t = testClient(stack.url);
    miner = setInterval(() => {
      void t.mine({ blocks: 1 }).catch(() => undefined);
    }, 200);
  });
  afterAll(() => {
    clearInterval(miner);
    stack.stop();
  });
  beforeEach(async () => {
    setChain(await anvilChain(stack));
  });

  async function student(): Promise<{ accountId: bigint; account: PrivateKeyAccount }> {
    const account = privateKeyToAccount(generatePrivateKey());
    await testClient(stack.url).setBalance({ address: account.address, value: parseEther("1") });
    const w = createWalletClient({ chain: foundry, transport: http(stack.url), account }).extend(
      publicActions,
    );
    await w.waitForTransactionReceipt({
      hash: await w.writeContract({
        address: stack.contract,
        abi: amplopEnvelopesAbi,
        functionName: "register",
        args: [[40, 15, 15, 20, 10]],
      }),
    });
    return { account, accountId: await chain().read<bigint>("accountOf", [account.address]) };
  }

  it("T08-20 and T08-21: Simulate deposits once on the real contract, after finality", async () => {
    const s = await student();
    // The route's role check reads the fake-free chain, so the order is driven through the server functions.
    const orderId = "ab".repeat(16);
    await db()
      .insert(schema.orders)
      .values({
        orderId,
        accountId: s.accountId,
        rupiah: 1_234_567n,
        dollarsUnits: 74_822_242n,
        rateIdrPerUsd: 16_500,
        status: "received",
        paymentId: paymentIdFor(orderId),
        nextAttemptAt: new Date(),
      });
    expect(await runDeposit(orderId)).toBe("sent");
    const r = await row(orderId);
    expect(r.status).toBe("sent");
    const receipt = await chain().rpc.getReceipt(r.depositTx as Hex);
    expect(receipt?.blockNumber).toBeLessThanOrEqual(await chain().rpc.finalizedBlockNumber());
    if (!receipt) throw new Error("no receipt");
    const ev = chain().findEvent(receipt, "Deposited");
    const args = ev.args as unknown as { paymentId: Hex; amount: bigint; parts: readonly bigint[] };
    expect(args.paymentId).toBe(paymentIdFor(orderId));
    expect(args.amount).toBe(74_822_242n);
    expect(args.parts.reduce((a, b) => a + b, 0n)).toBe(74_822_242n);
    expect(args.parts[3]).toBe(14_964_450n);

    // T08-21: a second send for the same paymentId reverts on the contract; the order keeps its hash.
    await expect(
      chain().send("treasury", {
        address: stack.contract,
        abi: amplopEnvelopesAbi,
        functionName: "deposit",
        args: [s.accountId, 1n, paymentIdFor(orderId)],
      }),
    ).rejects.toMatchObject({ errorName: "PaymentAlreadyUsed" });
    const first = r.depositTx;
    await setRow(orderId, { status: "received", sentHashes: [] });
    expect(await runDeposit(orderId, { force: true })).toBe("sent");
    const after = await row(orderId);
    expect(after.status).toBe("sent");
    expect(after.depositTx).toBe(first);
    expect(logLines.some((l) => l.includes("deposit_unmatched"))).toBe(true);
  });
});
