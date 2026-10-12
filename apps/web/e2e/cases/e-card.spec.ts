// Group E, card payments (owner 09). Tier 1: E1–E7, E10, E13.
import { expect, test } from "../support/fixtures";
import {
  accountEvents,
  dollars,
  E1_UNITS,
  envelopes,
  expectMoneyAgrees,
  expectTxProof,
  go,
  linkedPair,
  pay,
  sendAllowance,
} from "../support/helpers";
import type { Profile } from "../support/fixtures";

async function funded(raka: Profile, mama: Profile, split?: number[]) {
  const accountId = await linkedPair(raka, mama, split);
  await sendAllowance(mama);
  return accountId;
}
const available = async (id: bigint) => (await envelopes(id)).map((e) => e.available);

test("E1 Supermarket, 12,50 euro @tier1 @money", async ({ raka, mama }) => {
  const accountId = await funded(raka, mama);
  await pay(raka, "supermarket", "12,50");
  const { page } = raka;
  await expect(page.getByRole("heading", { name: "Approved" })).toBeVisible();
  await expect(page.getByText("$14,39").first()).toBeVisible();
  await expect(page.getByText("On hold").first()).toBeVisible();
  await expectTxProof(page, { event: "PurchaseApproved", amount: E1_UNITS });
  expect((await envelopes(accountId))[0]?.available).toBe(dollars(100) - E1_UNITS);
  await expectMoneyAgrees({ raka, mama, accountId });
});

test("E2 Tram and train; cinema with enough in Everyday @tier1 @money", async ({ raka, mama }) => {
  const accountId = await funded(raka, mama);
  await pay(raka, "tram");
  await expect(raka.page.getByRole("heading", { name: "Approved" })).toBeVisible();
  const afterTram = await available(accountId);
  expect(afterTram[1]).toBeLessThan(dollars(37.5));
  expect(afterTram[3]).toBe(dollars(50));
  await pay(raka, "cinema");
  await expect(raka.page.getByRole("heading", { name: "Approved" })).toBeVisible();
  const afterCinema = await available(accountId);
  expect(afterCinema[3]).toBeLessThan(dollars(50));
  expect(afterCinema.slice(0, 3)).toEqual(afterTram.slice(0, 3));
  await expectMoneyAgrees({ raka, mama, accountId });
});

test("E3 Food is short, Everyday has enough @tier1 @money", async ({ raka, mama }) => {
  const accountId = await funded(raka, mama);
  await pay(raka, "supermarket", "80,00");
  const before = await available(accountId);
  await pay(raka, "supermarket", "12,50");
  await expect(raka.page.getByRole("heading", { name: "Approved" })).toBeVisible();
  await expect(raka.page.getByText("Food was short, so Everyday paid.")).toBeVisible();
  const after = await available(accountId);
  expect(after[0]).toBe(before[0]);
  expect(after[3]).toBe((before[3] ?? 0n) - E1_UNITS);
  await expectMoneyAgrees({ raka, mama, accountId });
});

test("E4 Collect now on a held purchase @tier1 @money", async ({ raka, mama }) => {
  const accountId = await funded(raka, mama);
  await pay(raka, "supermarket", "12,50");
  await raka.page.getByRole("button", { name: "Demo only: collect now" }).click();
  await expect
    .poll(async () => (await accountEvents(accountId, "PurchaseCollected"))[0]?.amount, {
      timeout: 60_000,
    })
    .toBe(E1_UNITS);
  await expect(raka.page.getByText("Collected", { exact: true }).first()).toBeVisible();
  await expectTxProof(raka.page);
  await expectMoneyAgrees({ raka, mama, accountId });
});

test("E5 Matching envelope and Everyday are both short @tier1 @money", async ({ raka, mama }) => {
  const accountId = await funded(raka, mama);
  const before = await available(accountId);
  await pay(raka, "supermarket", "200,00");
  await expect(raka.page.getByRole("heading", { name: "Declined" })).toBeVisible();
  await expect(
    raka.page.getByText("Your Food envelope and Everyday don't have enough this week."),
  ).toBeVisible();
  expect(await available(accountId)).toEqual(before);
  await expectMoneyAgrees({ raka, mama, accountId });
});

test("E6 Cinema when Everyday itself is short @tier1 @money", async ({ raka, mama }) => {
  const accountId = await funded(raka, mama);
  const before = await available(accountId);
  await pay(raka, "cinema", "100,00");
  await expect(raka.page.getByRole("heading", { name: "Declined" })).toBeVisible();
  await expect(
    raka.page.getByText("Food, Transport and Study can't pay for this.", { exact: false }),
  ).toBeVisible();
  expect(await available(accountId)).toEqual(before);
  await expectMoneyAgrees({ raka, mama, accountId });
});

test("E7 Gambling site @tier1 @money", async ({ raka, mama }) => {
  const accountId = await funded(raka, mama);
  const before = await available(accountId);
  await pay(raka, "gambling");
  await expect(raka.page.getByRole("heading", { name: "Declined" })).toBeVisible();
  await expect(raka.page.getByText("This card can't be used for gambling.")).toBeVisible();
  expect(await available(accountId)).toEqual(before);
  await go(mama, "/app/parent");
  await expect(mama.page.getByText("A gambling purchase was declined")).toBeVisible({
    timeout: 30_000,
  });
  await expect(mama.page.getByText("Gambling site")).toHaveCount(0);
  await expectMoneyAgrees({ raka, mama, accountId });
});

test("E10 Every weekly envelope is empty, Emergency holds money @tier1 @money", async ({
  raka,
  mama,
}) => {
  const accountId = await funded(raka, mama, [0, 0, 0, 0, 100]);
  const before = await envelopes(accountId);
  await pay(raka, "supermarket", "12,50");
  await expect(raka.page.getByRole("heading", { name: "Declined" })).toBeVisible();
  expect(await envelopes(accountId)).toEqual(before);
  expect(before[4]?.locked).toBe(dollars(1000));
  await expectMoneyAgrees({ raka, mama, accountId });
});

test("E13 Pay tapped twice quickly @tier1 @money", async ({ raka, mama }) => {
  const accountId = await funded(raka, mama);
  await go(raka, "/app/card/pay?shop=supermarket");
  await raka.page.getByRole("button", { name: "Pay with card" }).dblclick();
  await raka.page.waitForURL(/\/app\/card\/result\//, { timeout: 60_000 });
  await raka.page.waitForTimeout(3_000);
  expect(await accountEvents(accountId, "PurchaseApproved")).toHaveLength(1);
  await expectMoneyAgrees({ raka, mama, accountId });
});
