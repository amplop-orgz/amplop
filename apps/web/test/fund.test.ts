// Spec 07 server tests: decideFund rows, then POST /api/fund against Postgres and Anvil.
import { DEVICE_HEADER } from "@amplop/shared/auth";
import { TYPICAL_ACTION_GAS } from "@amplop/shared/constants";
import { sql } from "drizzle-orm";
import { createTestClient, http, parseEther, publicActions, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as fundRoute } from "@/app/api/fund/route";
import { Chain, setChain } from "@/lib/server/chain/chain";
import { createServerRpc } from "@/lib/server/chain/rpc";
import { db } from "@/lib/server/db";
import { FUND_LIMITS } from "@/lib/server/fund/config";
import { decideFund, type FundInput } from "@/lib/server/fund/decide";
import { anvilKey, hasAnvil, startAnvil, type AnvilStack } from "./anvil";
import { call, errCode, fakeChain, newAccount, resetDb, signedHeaders } from "./helpers";

const GWEI = 10n ** 9n;
const unit = TYPICAL_ACTION_GAS * GWEI;
const base: FundInput = {
  balance: 0n,
  unit,
  maxFeePerGas: GWEI,
  ipCountToday: 0,
  addressRow: null,
  today: "2026-10-12",
  deviceNewCountToday: 0,
  weiSentToday: 0n,
  sponsorBalance: parseEther("100"),
  limits: FUND_LIMITS,
};

describe("decideFund (S07-26)", () => {
  it("is not needed at exactly 3 actions' worth, and tops up to 20 below it", () => {
    expect(decideFund({ ...base, balance: 3n * unit })).toEqual({ kind: "not_needed" });
    expect(decideFund({ ...base, balance: 3n * unit - 1n })).toMatchObject({
      kind: "send",
      amount: 17n * unit + 1n,
    });
    expect(decideFund(base)).toMatchObject({ kind: "send", amount: 20n * unit, budgetLow: false });
  });
  it("refuses each limit in order", () => {
    expect(decideFund({ ...base, ipCountToday: 30 })).toMatchObject({ code: "fund_limit_ip" });
    expect(decideFund({ ...base, addressRow: { day: "2026-10-12", countToday: 5 } })).toMatchObject(
      { code: "fund_limit_address" },
    );
    expect(decideFund({ ...base, deviceNewCountToday: 20 })).toMatchObject({
      code: "fund_limit_device",
    });
    expect(decideFund({ ...base, weiSentToday: parseEther("50") - 1n })).toMatchObject({
      code: "fund_daily_cap",
      alert: "fund_cap_reached",
    });
    expect(decideFund({ ...base, sponsorBalance: parseEther("10") + 20n * unit })).toMatchObject({
      code: "fund_unavailable",
      alert: "fund_sponsor_low",
    });
  });
  it("resets the address count on a new day, and spares known addresses the device count", () => {
    expect(decideFund({ ...base, addressRow: { day: "2026-10-11", countToday: 5 } }).kind).toBe(
      "send",
    );
    expect(
      decideFund({
        ...base,
        addressRow: { day: "2026-10-12", countToday: 1 },
        deviceNewCountToday: 99,
      }).kind,
    ).toBe("send");
  });
  it("flags a sponsor that cannot cover the rest of today's budget", () => {
    expect(decideFund({ ...base, sponsorBalance: parseEther("30") })).toMatchObject({
      kind: "send",
      budgetLow: true,
    });
  });
});

const testClient = (url: string) =>
  createTestClient({ chain: foundry, mode: "anvil", transport: http(url) }).extend(publicActions);

const device = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");

async function fund(
  account = newAccount(),
  opts: { dev?: string | null; ip?: string; body?: string } = {},
) {
  const body = opts.body ?? JSON.stringify({ address: account.address.toLowerCase() });
  const headers: Record<string, string> = {
    ...(await signedHeaders({ account, action: "fund", body })),
  };
  if (opts.dev !== null) headers[DEVICE_HEADER] = opts.dev ?? device();
  if (opts.ip) headers["x-real-ip"] = opts.ip;
  return call(fundRoute, { method: "POST", path: "/api/fund", headers, body });
}

describe("POST /api/fund checks before any send", () => {
  beforeEach(async () => {
    await resetDb();
    fakeChain();
  });
  it("refuses unsigned, missing device, extra fields, replays and another address (PRD 15)", async () => {
    const a = newAccount();
    const body = JSON.stringify({ address: a.address.toLowerCase() });
    expect(
      (
        await call(fundRoute as never, {
          method: "POST",
          body,
          headers: { [DEVICE_HEADER]: device() },
        })
      ).status,
    ).toBe(401);
    expect(errCode((await fund(a, { dev: null })).json)).toBe("bad_device");
    expect(
      errCode(
        (await fund(a, { body: JSON.stringify({ address: a.address.toLowerCase(), x: 1 }) })).json,
      ),
    ).toBe("bad_input");
    const other = newAccount();
    const r = await fund(a, { body: JSON.stringify({ address: other.address.toLowerCase() }) });
    expect([r.status, errCode(r.json)]).toEqual([403, "address_mismatch"]);
    const headers = {
      ...(await signedHeaders({ account: a, action: "fund", body })),
      [DEVICE_HEADER]: device(),
    };
    await call(fundRoute, { method: "POST", body, headers });
    expect((await call(fundRoute as never, { method: "POST", body, headers })).status).toBe(409);
  });
  it("changes no counter when the broadcast fails", async () => {
    const { rpc } = fakeChain();
    rpc.balances.set("0x0", 0n);
    const a = newAccount();
    rpc.balances.set(a.address.toLowerCase(), 0n);
    rpc.sendError = new Error("connection reset");
    const r = await fund(a);
    expect([r.status, errCode(r.json)]).toEqual([502, "fund_unavailable"]);
    expect(await db().execute(sql`SELECT * FROM funding`)).toHaveLength(0);
    expect(await db().execute(sql`SELECT * FROM funding_daily`)).toHaveLength(0);
    expect(
      await db().execute(sql`SELECT * FROM rate_limits WHERE bucket LIKE 'fund:%'`),
    ).toHaveLength(0);
  });
});

describe.skipIf(!hasAnvil)("POST /api/fund on Anvil", () => {
  let stack: AnvilStack;
  let test: ReturnType<typeof testClient>;
  let sponsor: Address;
  beforeAll(async () => {
    stack = await startAnvil(8556);
    test = testClient(stack.url);
    sponsor = privateKeyToAccount(anvilKey(4)).address;
  });
  afterAll(() => {
    stack.stop();
  });
  beforeEach(async () => {
    await resetDb();
    setChain(
      new Chain({
        rpc: createServerRpc(31337, stack.url, stack.url),
        chainId: 31337,
        contract: stack.contract,
        token: stack.token,
        settlement: privateKeyToAccount(anvilKey(3)).address,
        accounts: {
          treasury: privateKeyToAccount(anvilKey(1)),
          cardService: privateKeyToAccount(anvilKey(2)),
          feeSponsor: privateKeyToAccount(anvilKey(4)),
        },
        demo: true,
      }),
    );
    await test.setBalance({ address: sponsor, value: parseEther("1000") });
  });

  it("A1: sends about 20 actions' worth and records the funding row", async () => {
    const a = newAccount();
    const r = await fund(a);
    expect(r.json).toMatchObject({ status: "sent" });
    const rows = await db().execute<{ count_today: number }>(
      sql`SELECT count_today FROM funding WHERE address = ${a.address.toLowerCase()}`,
    );
    expect(rows[0]?.count_today).toBe(1);
    expect((await fund(a)).json).toEqual({ status: "not_needed" });
    expect(
      (await db().execute<{ count_today: number }>(sql`SELECT count_today FROM funding`))[0]
        ?.count_today,
    ).toBe(1);
  });

  it("refuses the sixth top-up for one address in a day", async () => {
    const a = newAccount();
    for (let i = 0; i < 5; i++) {
      await test.setBalance({ address: a.address, value: 0n });
      expect((await fund(a)).json).toMatchObject({ status: "sent" });
    }
    await test.setBalance({ address: a.address, value: 0n });
    expect(errCode((await fund(a)).json)).toBe("fund_limit_address");
  });

  it("refuses the 21st new address from one device, then the 31st from one IP", async () => {
    const dev = device();
    for (let i = 0; i < 20; i++)
      expect((await fund(newAccount(), { dev, ip: "198.51.100.1" })).status).toBe(200);
    expect(errCode((await fund(newAccount(), { dev, ip: "198.51.100.1" })).json)).toBe(
      "fund_limit_device",
    );
    for (let i = 0; i < 10; i++)
      expect((await fund(newAccount(), { ip: "198.51.100.1" })).status).toBe(200);
    expect(errCode((await fund(newAccount(), { ip: "198.51.100.1" })).json)).toBe("fund_limit_ip");
  });

  it("stops at the daily cap and alerts once an hour (PRD 15)", async () => {
    await db().execute(
      sql`INSERT INTO funding_daily VALUES (current_date, ${(parseEther("50") - 1n).toString()})`,
    );
    const out: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((s: string) => out.push(s));
    const before = await test.getTransactionCount({ address: sponsor });
    expect(errCode((await fund()).json)).toBe("fund_daily_cap");
    expect(errCode((await fund()).json)).toBe("fund_daily_cap");
    await new Promise((r) => setTimeout(r, 50));
    spy.mockRestore();
    expect(await test.getTransactionCount({ address: sponsor })).toBe(before);
    expect(
      out.filter((l) => l.includes('"event":"alert"') && l.includes("fund_cap_reached")),
    ).toHaveLength(1);
  });

  it("keeps the sponsor above its 10 MON floor", async () => {
    await test.setBalance({ address: sponsor, value: parseEther("10.001") });
    const out: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((s: string) => out.push(s));
    const r = await fund();
    await new Promise((res) => setTimeout(res, 50));
    spy.mockRestore();
    expect([r.status, errCode(r.json)]).toEqual([502, "fund_unavailable"]);
    expect(out.some((l) => l.includes("fund_sponsor_low"))).toBe(true);
  });

  it("serialises parallel requests: at most five sends, consecutive sponsor nonces", async () => {
    const a = newAccount();
    const start = await test.getTransactionCount({ address: sponsor });
    const results = await Promise.all(Array.from({ length: 10 }, () => fund(a)));
    const sent = results.filter((r) => (r.json as { status?: string }).status === "sent");
    expect(sent.length).toBeLessThanOrEqual(5);
    expect(await test.getTransactionCount({ address: sponsor })).toBe(start + sent.length);
    const nonces = await Promise.all(
      sent.map(async (r) => {
        const tx = await test.getTransaction({
          hash: (r.json as { txHash: `0x${string}` }).txHash,
        });
        return tx.nonce;
      }),
    );
    expect(nonces.sort((x, y) => x - y)).toEqual(
      Array.from({ length: sent.length }, (_, i) => start + i),
    );
  }, 60_000);
});
