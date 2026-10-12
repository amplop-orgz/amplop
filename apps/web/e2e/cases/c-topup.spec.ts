// Group C, allowance top-up (owner 08). Tier 1: C1, C2, C4, C5, C6, C12, C14.
import { expect, test } from "../support/fixtures";
import {
  deposits,
  dollars,
  envelopes,
  expectMoneyAgrees,
  expectTxProof,
  go,
  linkedPair,
  sendAllowance,
  sendWebhook,
  skip,
  startOrder,
  totals,
} from "../support/helpers";
import { control, PORTS } from "../support/stand-ins";

const C1_AVAILABLE = [dollars(100), dollars(37.5), dollars(37.5), dollars(50), 0n];

test("C1 Mama sends Rp16.500.000 with Simulate payment @tier1 @money", async ({ raka, mama }) => {
  const accountId = await linkedPair(raka, mama);
  await sendAllowance(mama);
  await expect(mama.page.getByText("Rp16.500.000 arrived as $1.000,00")).toBeVisible();
  await expectTxProof(mama.page, { event: "Deposited", amount: dollars(1000) });
  const list = await envelopes(accountId);
  expect(list.map((e) => e.available)).toEqual(C1_AVAILABLE);
  expect(list[4]?.locked).toBe(dollars(100));
  await go(raka, "/app");
  await expect(raka.page.getByRole("heading", { name: "Allowance arrived" })).toBeVisible();
  await expectMoneyAgrees({ raka, mama, accountId });
});

// @testnet-skip: Midtrans sandbox's own status API would not confirm a self-signed payment.
test("C2 Same amount through a signed sandbox webhook @tier1 @money @testnet-skip", async ({
  raka,
  mama,
}) => {
  const accountId = await linkedPair(raka, mama);
  await sendAllowance(mama, 16_500_000, "webhook");
  await expectTxProof(mama.page, { event: "Deposited", amount: dollars(1000) });
  expect((await envelopes(accountId)).map((e) => e.available)).toEqual(C1_AVAILABLE);
  await expectMoneyAgrees({ raka, mama, accountId });
});

test("C4 Webhook with a wrong signature @tier1", async ({ raka, mama }) => {
  const accountId = await linkedPair(raka, mama);
  const orderId = await startOrder(mama);
  await control(PORTS.midtrans, { orderId, status: "settlement" });
  const r = await sendWebhook({
    orderId,
    grossAmount: "16500000.00",
    transactionStatus: "settlement",
    signatureKey: "0".repeat(128),
  });
  expect(r.status).toBe(401);
  await mama.page.waitForTimeout(5_000);
  expect(await deposits(accountId)).toHaveLength(0);
  await expect(mama.page.getByRole("heading", { name: "Waiting for payment" })).toBeVisible();
});

// @testnet-skip: as C2, the sandbox status API would not confirm a self-signed payment.
test("C5 The same webhook delivered three times @tier1 @money @testnet-skip", async ({
  raka,
  mama,
}) => {
  const accountId = await linkedPair(raka, mama);
  const orderId = await startOrder(mama);
  await control(PORTS.midtrans, { orderId, status: "settlement" });
  const once = () =>
    sendWebhook({ orderId, grossAmount: "16500000.00", transactionStatus: "settlement" });
  const codes = await Promise.all([once(), once(), once()]).then((rs) => rs.map((r) => r.status));
  expect(codes.every((c) => c === 200 || c === 409)).toBe(true);
  await expect(mama.page.getByRole("heading", { name: "Allowance sent" })).toBeVisible({
    timeout: 90_000,
  });
  expect((await once()).status).toBe(200);
  expect(await deposits(accountId)).toHaveLength(1);
  await expectMoneyAgrees({ raka, mama, accountId });
});

test("C6 Simulate payment tapped twice quickly @tier1 @money", async ({ raka, mama }) => {
  const accountId = await linkedPair(raka, mama);
  await startOrder(mama);
  await mama.page.getByRole("button", { name: "Simulate payment (test mode)" }).dblclick();
  await expect(mama.page.getByRole("heading", { name: "Allowance sent" })).toBeVisible({
    timeout: 90_000,
  });
  expect(await deposits(accountId)).toHaveLength(1);
  await expectMoneyAgrees({ raka, mama, accountId });
});

test("C12 Rp1.234.567, which does not divide evenly @tier1 @money", async ({ raka, mama }) => {
  const accountId = await linkedPair(raka, mama);
  await sendAllowance(mama, 1_234_567);
  const [dep] = await deposits(accountId);
  if (!dep) throw new Error("no deposit");
  expect(dep.parts.reduce((a, b) => a + b, 0n)).toBe(dep.amount);
  // Default split 40/15/15/20/10: every part but Everyday rounds down, Everyday takes the rest.
  const floor = (pct: bigint) => (dep.amount * pct) / 100n;
  expect([dep.parts[0], dep.parts[1], dep.parts[2], dep.parts[4]]).toEqual([
    floor(40n),
    floor(15n),
    floor(15n),
    floor(10n),
  ]);
  expect(dep.parts[3]).toBeGreaterThanOrEqual(floor(20n));
  const t = await totals(accountId);
  expect(t.reduce((a, b) => a + b, 0n)).toBe(dep.amount);
  await expectMoneyAgrees({ raka, mama, accountId });
});

test("C14 A second allowance in week 2 of the first @tier1 @money", async ({ raka, mama }) => {
  const accountId = await linkedPair(raka, mama);
  await sendAllowance(mama);
  await skip(raka, "monday");
  await sendAllowance(mama);
  const [a, b] = await deposits(accountId);
  if (!a || !b) throw new Error("two deposits expected");
  const t = await totals(accountId);
  for (let i = 0; i < 5; i++) expect(t[i]).toBe((a.parts[i] ?? 0n) + (b.parts[i] ?? 0n));
  // First schedule: two shares released; second: one share. Food: 2×100 + 100.
  expect((await envelopes(accountId))[0]?.available).toBe(dollars(300));
  await expectMoneyAgrees({ raka, mama, accountId });
});
