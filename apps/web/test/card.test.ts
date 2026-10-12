// Spec 09 server tests: T09-1 to T09-16 with the fake chain, T09-17 to T09-21 on Anvil.
import { amplopEnvelopesAbi } from "@amplop/shared/abi";
import { sql } from "drizzle-orm";
import {
  createTestClient,
  createWalletClient,
  decodeFunctionData,
  http,
  pad,
  parseEther,
  parseTransaction,
  publicActions,
  type Address,
  type Hex,
} from "viem";
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as authorizeRoute } from "@/app/api/card/authorize/route";
import { POST as collectRoute } from "@/app/api/card/collect/route";
import { POST as issueRoute } from "@/app/api/card/issue/route";
import { GET as cronRoute } from "@/app/api/cron/collect/route";
import { GET as purchasesRoute } from "@/app/api/purchases/route";
import { contractCall } from "@/lib/server/card/common";
import { holdAction, refundPurchase, sweepHolds } from "@/lib/server/card/holds";
import { chain, setChain } from "@/lib/server/chain/chain";
import { db } from "@/lib/server/db";
import { resetEnv } from "@/lib/server/env";
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

// after() work (the hold sweeps) is collected so each test can wait for it before checking.
const pending: Promise<unknown>[] = [];
vi.mock("next/server", () => ({
  after: (fn: () => unknown) => {
    pending.push(Promise.resolve().then(fn));
  },
}));
async function flush(): Promise<void> {
  while (pending.length) await Promise.allSettled(pending.splice(0));
}

const logLines: string[] = [];
beforeAll(() => {
  vi.spyOn(console, "log").mockImplementation((s: string) => {
    logLines.push(s);
  });
});
afterAll(() => {
  // T09-15: shop names, cities and card tokens never reach the logs (R27).
  const all = logLines.join("\n");
  for (const leak of ["Supermarket", "Amsterdam", "Cinema", "Gambling site"])
    expect(all).not.toContain(leak);
  for (const t of cardTokens) expect(all).not.toContain(t);
  vi.restoreAllMocks();
});

const cardTokens: string[] = [];
const hex32 = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");

type Shop = {
  amount: string;
  currency: "EUR" | "USD" | "IDR";
  merchantName: string;
  merchantCity: string;
  mcc: string;
};
const SUPERMARKET: Shop = {
  amount: "1250",
  currency: "EUR",
  merchantName: "Supermarket",
  merchantCity: "Amsterdam",
  mcc: "5411",
};
const GAMBLING: Shop = {
  amount: "2000",
  currency: "EUR",
  merchantName: "Gambling site",
  merchantCity: "Online",
  mcc: "7995",
};
const CINEMA: Shop = {
  amount: "1100",
  currency: "EUR",
  merchantName: "Cinema",
  merchantCity: "Amsterdam",
  mcc: "7832",
};

async function issue(account: PrivateKeyAccount, accountId: bigint): Promise<string> {
  const body = JSON.stringify({ accountId: accountId.toString() });
  const r = await call(issueRoute, {
    method: "POST",
    body,
    headers: await signedHeaders({ account, action: "card.issue", accountId, body }),
  });
  await flush();
  const token = (r.json as { cardToken: string }).cardToken;
  cardTokens.push(token);
  return token;
}

async function pay(
  account: PrivateKeyAccount,
  accountId: bigint,
  cardToken: string,
  shop: Shop,
  key = hex32(),
  extra: Record<string, unknown> = {},
) {
  const body = JSON.stringify({ cardToken, ...shop, idempotencyKey: key, ...extra });
  const r = await call(authorizeRoute, {
    method: "POST",
    body,
    headers: await signedHeaders({ account, action: "card.authorize", accountId, body }),
  });
  await flush();
  return r;
}

async function collectSigned(
  account: PrivateKeyAccount,
  accountId: bigint,
  purchaseId: string,
  amountUnits?: bigint,
) {
  const body = JSON.stringify({
    purchaseId,
    ...(amountUnits === undefined ? {} : { amountUnits: amountUnits.toString() }),
  });
  const r = await call(collectRoute, {
    method: "POST",
    body,
    headers: await signedHeaders({ account, action: "card.collect", accountId, body }),
  });
  await flush();
  return r;
}

describe("holdAction (T09-11)", () => {
  const start = new Date("2026-10-07T10:00:00Z");
  const p = (realMs: number, clockS: bigint) =>
    holdAction(
      { createdAtReal: start, createdAtClock: 1000n, accountClock: 1000n + clockS },
      new Date(start.getTime() + realMs),
    );
  it("collects after 24 real hours, releases at 7 days on the account clock, release wins", () => {
    expect(p(24 * 3600_000 - 60_000, 0n)).toBe("none");
    expect(p(24 * 3600_000, 0n)).toBe("collect");
    expect(p(24 * 3600_000, 7n * 86400n)).toBe("release");
    expect(p(0, 7n * 86400n)).toBe("release");
    expect(p(0, 7n * 86400n - 1n)).toBe("none");
    expect(p(25 * 3600_000, 7n * 86400n - 1n)).toBe("collect");
  });
});

describe("card endpoints with the fake chain", () => {
  const raka = newAccount();
  const sari = newAccount();
  const mama = newAccount();
  let rpc: FakeRpc;
  let token: string;

  const approveAll = (fn: string, args: readonly unknown[]) => {
    if (fn !== "authorize") return [];
    const [accountId, purchaseId, shopType, amount] = args as [bigint, Hex, number, bigint];
    return [
      eventLog("PurchaseApproved", {
        accountId,
        purchaseId,
        envelope: 0,
        amount,
        shopType,
        everydayStepIn: false,
      }),
    ];
  };

  beforeEach(async () => {
    vi.unstubAllEnvs();
    await flush();
    resetEnv();
    await resetDb();
    ({ rpc } = fakeChain());
    rpc.accounts.set(1n, { owner: raka.address, trusted: mama.address });
    rpc.accounts.set(2n, {
      owner: sari.address,
      trusted: "0x0000000000000000000000000000000000000000",
    });
    rpc.reads.set("tokenDecimals", 6);
    rpc.onSend = approveAll;
    token = await issue(raka, 1n);
    rpc.calls.length = 0;
  });

  it("T09-1: no signature is refused before any chain call", async () => {
    const body = JSON.stringify({ cardToken: token, ...SUPERMARKET, idempotencyKey: hex32() });
    const r = await call(authorizeRoute, { method: "POST", body });
    expect(r.status).toBe(401);
    expect(rpc.calls).toEqual([]);
    expect(await db().execute(sql`SELECT 1 FROM purchases`)).toHaveLength(0);
  });

  it("T09-2: another account's signature is refused before any send", async () => {
    let r = await pay(sari, 2n, token, SUPERMARKET);
    expect([r.status, errCode(r.json)]).toEqual([403, "wrong_account"]);
    expect(rpc.calls).toEqual([]);
    r = await pay(mama, 1n, token, SUPERMARKET);
    expect([r.status, errCode(r.json)]).toEqual([403, "not_owner"]);
    expect(rpc.calls).toEqual(["read:accountInfo"]);
  });

  it("T09-3: after a recovery the old passkey is refused and the new one pays", async () => {
    const newPhone = newAccount();
    rpc.accounts.set(1n, { owner: newPhone.address, trusted: mama.address });
    expect(errCode((await pay(raka, 1n, token, SUPERMARKET)).json)).toBe("not_owner");
    expect((await pay(newPhone, 1n, token, SUPERMARKET)).json).toMatchObject({
      result: "approved",
      envelope: "food",
    });
  });

  it("T09-5: one key, one send; concurrent retries share it; other details conflict", async () => {
    const key = hex32();
    const a = await pay(raka, 1n, token, SUPERMARKET, key);
    const b = await pay(raka, 1n, token, SUPERMARKET, key);
    expect(a.json).toEqual(b.json);
    expect(rpc.sent).toHaveLength(1);
    await db().execute(sql`DELETE FROM rate_limits`); // the card allows 10 a minute
    const key2 = hex32();
    const many = await Promise.all(
      Array.from({ length: 10 }, () => pay(raka, 1n, token, SUPERMARKET, key2)),
    );
    expect(new Set(many.map((m) => JSON.stringify(m.json))).size).toBe(1);
    expect(rpc.sent).toHaveLength(2);
    await db().execute(sql`DELETE FROM rate_limits`);
    expect(errCode((await pay(raka, 1n, token, { ...SUPERMARKET, amount: "999" }, key)).json)).toBe(
      "idempotency_conflict",
    );
  });

  it("T09-6: results from the event, stored as answered", async () => {
    rpc.onSend = (fn, args) => {
      const [accountId, purchaseId, shopType, amount] = args as [bigint, Hex, number, bigint];
      return shopType === 7995
        ? [eventLog("PurchaseDeclined", { accountId, purchaseId, amount, shopType, reason: 1 })]
        : shopType === 7832
          ? [eventLog("PurchaseDeclined", { accountId, purchaseId, amount, shopType, reason: 2 })]
          : [
              eventLog("PurchaseApproved", {
                accountId,
                purchaseId,
                envelope: 3,
                amount,
                shopType,
                everydayStepIn: true,
              }),
            ];
    };
    rpc.reads.set("shopEnvelope", [3, false]);
    expect((await pay(raka, 1n, token, SUPERMARKET)).json).toMatchObject({
      result: "approved",
      envelope: "everyday",
      everydayStepIn: true,
      amountUnits: "14388750",
    });
    const blocked = (await pay(raka, 1n, token, GAMBLING)).json as Record<string, unknown>;
    expect(blocked).toMatchObject({ result: "declined", reason: "blocked", everydayStepIn: false });
    expect(blocked.envelope).toBeUndefined();
    expect((await pay(raka, 1n, token, CINEMA)).json).toMatchObject({
      result: "declined",
      reason: "not_enough",
      envelope: "everyday",
    });
    const rows = await db().execute<{ result: string; hold_state: string | null }>(
      sql`SELECT result, hold_state FROM purchases ORDER BY created_at`,
    );
    expect(rows.map((r) => [r.result, r.hold_state])).toEqual([
      ["approved", "held"],
      ["declined", null],
      ["declined", null],
    ]);
    for (const r of [blocked]) expect(JSON.stringify(r)).not.toContain("Gambling");
  });

  it("T09-7: chain unreachable says nothing was charged, and a retry pays once", async () => {
    const key = hex32();
    const realSimulate = rpc.simulate.bind(rpc);
    rpc.simulate = () =>
      import("@/lib/server/chain/types").then(({ ChainUnavailable }) =>
        Promise.reject(new ChainUnavailable()),
      );
    const r = await pay(raka, 1n, token, SUPERMARKET, key);
    expect([r.status, errCode(r.json)]).toEqual([502, "chain_unavailable"]);
    expect((r.json as { error: { message: string } }).error.message).toContain(
      "Nothing was charged",
    );
    expect(rpc.sent).toHaveLength(0);
    rpc.simulate = realSimulate;
    const again = await pay(raka, 1n, token, SUPERMARKET, key);
    expect(again.json).toMatchObject({ result: "approved" });
    expect(rpc.sent).toHaveLength(1);
  });

  it("T09-8: a receipt timeout is unconfirmed; a retry resolves it without a second send", async () => {
    const key = hex32();
    rpc.receiptTimeout = true;
    const r = await pay(raka, 1n, token, SUPERMARKET, key);
    expect([r.status, errCode(r.json)]).toEqual([502, "payment_unconfirmed"]);
    expect(
      (await db().execute<{ result: string }>(sql`SELECT result FROM purchases`))[0]?.result,
    ).toBe("pending");
    expect(errCode((await pay(raka, 1n, token, SUPERMARKET, key)).json)).toBe(
      "purchase_in_progress",
    );
    rpc.receiptTimeout = false; // the receipt now exists
    expect((await pay(raka, 1n, token, SUPERMARKET, key)).json).toMatchObject({
      result: "approved",
    });
    expect(rpc.sent).toHaveLength(1);
  });

  it("T09-8: with no receipt after 60 s and an unused id, it sends again with the same purchase id", async () => {
    const key = hex32();
    rpc.receiptTimeout = true;
    await pay(raka, 1n, token, SUPERMARKET, key);
    await db().execute(sql`UPDATE purchases SET updated_at = now() - interval '61 seconds'`);
    rpc.receiptTimeout = false;
    const realReceipt = rpc.getReceipt.bind(rpc);
    rpc.getReceipt = () => Promise.resolve(null); // the first hash never landed
    rpc.reads.set("purchaseUsed", false);
    const r = await pay(raka, 1n, token, SUPERMARKET, key);
    rpc.getReceipt = realReceipt;
    expect(r.json).toMatchObject({ result: "approved" });
    expect(rpc.sent).toHaveLength(2);
    // Compare the decoded purchase id: raw bytes differ, and even their length moves with the signature.
    const ids = rpc.sent.map(
      (raw) =>
        decodeFunctionData({
          abi: amplopEnvelopesAbi,
          data: parseTransaction(raw).data ?? "0x",
        }).args[1],
    );
    expect(ids[0]).toBeDefined();
    expect(ids[0]).toBe(ids[1]);
  });

  it("T09-9: the eleventh authorisation a minute on one card is refused", async () => {
    for (let i = 0; i < 10; i++) expect((await pay(raka, 1n, token, SUPERMARKET)).status).toBe(200);
    expect(errCode((await pay(raka, 1n, token, SUPERMARKET)).json)).toBe("rate_limited");
    const sariToken = await issue(sari, 2n);
    expect((await pay(sari, 2n, sariToken, SUPERMARKET)).status).toBe(200);
  });

  it("T09-12 limits, T09-14 card issue, T09-16 strict body", async () => {
    expect(
      errCode(
        (await pay(raka, 1n, token, { ...SUPERMARKET, currency: "USD", amount: "1000001" })).json,
      ),
    ).toBe("amount_too_large");
    expect(
      (await pay(raka, 1n, token, { ...SUPERMARKET, currency: "USD", amount: "1000000" })).status,
    ).toBe(200);
    const [a, b] = await Promise.all([issue(raka, 1n), issue(raka, 1n)]);
    expect(a).toBe(token);
    expect(b).toBe(token);
    expect(token).toMatch(/^[0-9a-f]{32}$/);
    expect(token).not.toContain(raka.address.slice(2, 10).toLowerCase());
    for (const bad of [
      { x: 1 },
      { mcc: "54111" },
      { currency: "GBP" },
      { amount: "12.50" },
      { amount: "0" },
      { amount: "-5" },
    ]) {
      const body = JSON.stringify({
        cardToken: token,
        ...SUPERMARKET,
        idempotencyKey: hex32(),
        ...bad,
      });
      const r = await call(authorizeRoute, {
        method: "POST",
        body,
        headers: await signedHeaders({
          account: raka,
          action: "card.authorize",
          accountId: 1n,
          body,
        }),
      });
      expect([JSON.stringify(bad), r.status]).toEqual([JSON.stringify(bad), 400]);
    }
    const unknownCard = await pay(raka, 1n, hex32(), SUPERMARKET);
    expect(errCode(unknownCard.json)).toBe("card_not_found");
  });

  it("T09-10: Collect now is 404 with demo off, the cron bearer still works", async () => {
    vi.stubEnv("DEMO_MODE", "false");
    const body = JSON.stringify({ purchaseId: hex32() });
    const headers = await signedHeaders({
      account: raka,
      action: "card.collect",
      accountId: 1n,
      body,
    });
    const spy = vi.spyOn(db(), "execute");
    const r = await call(collectRoute, { method: "POST", body, headers });
    spy.mockRestore();
    expect(r.status).toBe(404);
    expect(spy).not.toHaveBeenCalled();
    const cron = await call(collectRoute, {
      method: "POST",
      body: JSON.stringify({ purchaseId: hex32() }),
      headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` },
    });
    expect(cron.status).not.toBe(404);
  });

  it("GET /api/purchases gives names to the owner only", async () => {
    await pay(raka, 1n, token, SUPERMARKET);
    const r = await call(purchasesRoute, {
      headers: await signedHeaders({ account: raka, action: "purchases.read", accountId: 1n }),
    });
    expect(r.json).toMatchObject({
      items: [
        {
          merchantName: "Supermarket",
          merchantCity: "Amsterdam",
          currency: "EUR",
          amount: "1250",
          result: "approved",
        },
      ],
    });
    const m = await call(purchasesRoute, {
      headers: await signedHeaders({ account: mama, action: "purchases.read", accountId: 1n }),
    });
    expect(errCode(m.json)).toBe("not_owner");
    // 14 J4: the trusted person with Account = 0 is refused too, with no items.
    const zero = await call(purchasesRoute, {
      headers: await signedHeaders({ account: mama, action: "purchases.read", accountId: 0n }),
    });
    expect(zero.status).toBe(403);
    expect(zero.json).not.toHaveProperty("items");
    // 11 S11-27, S11-28: no private columns, a signature needed, and the old owner refused (I4).
    const item = (r.json as { items: Record<string, unknown>[] }).items[0] ?? {};
    for (const k of ["txHash", "tx_hash", "mcc", "idempotencyKey", "idempotency_key"])
      expect(item).not.toHaveProperty(k);
    expect((await call(purchasesRoute)).status).toBe(401);
    rpc.accounts.set(1n, { owner: newAccount().address, trusted: mama.address });
    const old = await call(purchasesRoute, {
      headers: await signedHeaders({ account: raka, action: "purchases.read", accountId: 1n }),
    });
    expect([old.status, errCode(old.json)]).toEqual([403, "not_owner"]);
  });
});

describe.skipIf(!hasAnvil)("card flows on Anvil with the real contract", () => {
  let stack: AnvilStack;
  let test: ReturnType<typeof testClient>;
  const testClient = (url: string) =>
    createTestClient({ chain: foundry, mode: "anvil", transport: http(url) }).extend(publicActions);
  const usd = (n: number) => BigInt(Math.round(n * 100)) * 10_000n;

  beforeAll(async () => {
    stack = await startAnvil(8558);
    test = testClient(stack.url);
  });
  afterAll(() => {
    stack.stop();
  });
  beforeEach(async () => {
    await flush();
    resetEnv();
    await resetDb();
    setChain(await anvilChain(stack));
  });

  /** A registered student with an allowance deposited on Monday-relative time as Anvil has it. */
  async function student(deposit: bigint) {
    const pk = generatePrivateKey();
    const account = privateKeyToAccount(pk);
    await test.setBalance({ address: account.address, value: parseEther("1") });
    const w = createWalletClient({ chain: foundry, transport: http(stack.url), account }).extend(
      publicActions,
    );
    const hash = await w.writeContract({
      address: stack.contract,
      abi: amplopEnvelopesAbi,
      functionName: "register",
      args: [[40, 15, 15, 20, 10]],
    });
    await w.waitForTransactionReceipt({ hash });
    const accountId = await chain().read<bigint>("accountOf", [account.address]);
    if (deposit > 0n)
      await chain().send(
        "treasury",
        contractCall("deposit", [accountId, deposit, pad(`0x${hex32()}`, { size: 32 })]),
      );
    return { account, accountId, wallet: w };
  }
  const available = async (id: bigint, e: number) =>
    (await chain().read<readonly [readonly { available: bigint }[], bigint]>("envelopes", [id]))[0][
      e
    ]?.available ?? 0n;
  const balanceOf = (who: Address) =>
    test.readContract({
      address: stack.token,
      abi: [
        {
          type: "function",
          name: "balanceOf",
          stateMutability: "view",
          inputs: [{ type: "address" }],
          outputs: [{ type: "uint256" }],
        },
      ],
      functionName: "balanceOf",
      args: [who],
    });

  it("T09-17: €12,50 at a supermarket is approved from Food and held", async () => {
    const s = await student(usd(1000));
    const before = await available(s.accountId, 0);
    const token = await issue(s.account, s.accountId);
    const r = (await pay(s.account, s.accountId, token, SUPERMARKET)).json as {
      purchaseId: string;
      result: string;
      envelope: string;
      confirmMs: number;
    };
    expect(r).toMatchObject({ result: "approved", envelope: "food", amountUnits: "14388750" });
    expect(before - (await available(s.accountId, 0))).toBe(14_388_750n);
    const p = await chain().read<{ state: number }>("purchase", [
      pad(`0x${r.purchaseId}`, { size: 32 }),
    ]);
    expect(p.state).toBe(1);
  });

  it("T09-18: two payments for the last dollars: one approved, one declined", async () => {
    const s = await student(usd(1000));
    const token = await issue(s.account, s.accountId);
    const left = await available(s.accountId, 3); // Everyday this week: $50
    const priced = {
      ...CINEMA,
      currency: "USD" as const,
      amount: String(((left / 10_000n) * 6n) / 10n),
    }; // 60% each
    const [a, b] = await Promise.all([
      pay(s.account, s.accountId, token, priced),
      pay(s.account, s.accountId, token, priced),
    ]);
    const results = [a.json, b.json].map((j) => (j as { result: string }).result).sort();
    expect(results).toEqual(["approved", "declined"]);
    expect(await available(s.accountId, 3)).toBeGreaterThanOrEqual(0n);
  });

  it("T09-19 and T09-10: partial collect returns the rest; repeats and over-collect are safe", async () => {
    const s = await student(usd(1000));
    const token = await issue(s.account, s.accountId);
    const { purchaseId } = (await pay(s.account, s.accountId, token, SUPERMARKET)).json as {
      purchaseId: string;
    };
    const food = await available(s.accountId, 0);
    const settlementBefore = await balanceOf(chain().cfg.settlement);
    expect(
      errCode((await collectSigned(s.account, s.accountId, purchaseId, 20_000_000n)).json),
    ).toBe("amount_above_hold");
    const r = await collectSigned(s.account, s.accountId, purchaseId, 10_000_000n);
    expect(r.json).toMatchObject({ state: "collected" });
    expect((await balanceOf(chain().cfg.settlement)) - settlementBefore).toBe(10_000_000n);
    expect((await available(s.accountId, 0)) - food).toBe(4_388_750n);
    const again = await collectSigned(s.account, s.accountId, purchaseId);
    expect(again.json).toEqual(r.json);
    const other = await student(0n);
    expect(errCode((await collectSigned(other.account, other.accountId, purchaseId)).json)).toBe(
      "wrong_account",
    );
  });

  it("T09-20 and T09-12: after Skip 7 days, opening the Card screen releases the hold; collect is then refused", async () => {
    const s = await student(usd(1000));
    const token = await issue(s.account, s.accountId);
    const { purchaseId } = (await pay(s.account, s.accountId, token, SUPERMARKET)).json as {
      purchaseId: string;
    };
    const food = await available(s.accountId, 0);
    for (let i = 0; i < 1; i++) {
      const hash = await s.wallet.writeContract({
        address: stack.contract,
        abi: amplopEnvelopesAbi,
        functionName: "skipDays",
        args: [7],
      });
      await s.wallet.waitForTransactionReceipt({ hash });
    }
    await issue(s.account, s.accountId); // the sweep runs after card.issue
    const p = await chain().read<{ state: number }>("purchase", [
      pad(`0x${purchaseId}`, { size: 32 }),
    ]);
    expect(p.state).toBe(3);
    expect((await available(s.accountId, 0)) - food).toBeGreaterThanOrEqual(14_388_750n);
    const row = await db().execute<{ hold_state: string }>(
      sql`SELECT hold_state FROM purchases WHERE purchase_id = ${purchaseId}`,
    );
    expect(row[0]?.hold_state).toBe("released");
    expect(errCode((await collectSigned(s.account, s.accountId, purchaseId)).json)).toBe(
      "not_held",
    );
  });

  it("T09-21 and T09-13: refund returns the money to the envelope that paid", async () => {
    const s = await student(usd(1000));
    const token = await issue(s.account, s.accountId);
    const { purchaseId } = (await pay(s.account, s.accountId, token, SUPERMARKET)).json as {
      purchaseId: string;
    };
    await expect(refundPurchase(purchaseId)).rejects.toThrow("not_collected");
    await collectSigned(s.account, s.accountId, purchaseId);
    const food = await available(s.accountId, 0);
    await refundPurchase(purchaseId, 4_000_000n);
    expect((await available(s.accountId, 0)) - food).toBe(4_000_000n);
    const row = await db().execute<{ hold_state: string }>(
      sql`SELECT hold_state FROM purchases WHERE purchase_id = ${purchaseId}`,
    );
    expect(row[0]?.hold_state).toBe("refunded");
  });

  it("E7 and E19 on chain: gambling is declined and nothing moves; an unknown shop type pays from Everyday", async () => {
    const s = await student(usd(1000));
    const token = await issue(s.account, s.accountId);
    const before = await Promise.all([0, 1, 2, 3, 4].map((e) => available(s.accountId, e)));
    expect((await pay(s.account, s.accountId, token, GAMBLING)).json).toMatchObject({
      result: "declined",
      reason: "blocked",
    });
    expect(await Promise.all([0, 1, 2, 3, 4].map((e) => available(s.accountId, e)))).toEqual(
      before,
    );
    const web = {
      amount: "500",
      currency: "USD" as const,
      merchantName: "Web shop",
      merchantCity: "Online",
      mcc: "5999",
    };
    expect((await pay(s.account, s.accountId, token, web)).json).toMatchObject({
      result: "approved",
      envelope: "everyday",
      amountUnits: "5000000",
    });
  });

  it("T09-12: the cron sweep collects holds older than a day", async () => {
    const s = await student(usd(1000));
    const token = await issue(s.account, s.accountId);
    const { purchaseId } = (await pay(s.account, s.accountId, token, SUPERMARKET)).json as {
      purchaseId: string;
    };
    await db().execute(sql`UPDATE purchases SET created_at = now() - interval '25 hours'`);
    const r = await call(cronRoute, {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` },
    });
    expect(r.json).toEqual({ collected: 1 });
    const p = await chain().read<{ state: number }>("purchase", [
      pad(`0x${purchaseId}`, { size: 32 }),
    ]);
    expect(p.state).toBe(2);
    expect(await sweepHolds({ limit: 50 })).toEqual({ collected: 0, released: 0 });
  });
});
