// Group F, Activity (owner 11). Tier 1: F1, F2 (indexer on), F10 (indexer off, its own serial project).
import { execFileSync } from "node:child_process";
import { expect, test } from "../support/fixtures";
import {
  askEmergency,
  dollars,
  envelopes,
  expectMoneyAgrees,
  go,
  home,
  linkedPair,
  pay,
  sendAllowance,
  skip,
  waitForIndexer,
} from "../support/helpers";

test("F1 Open Activity after E1, E7 and D1 @tier1 @indexer", async ({ raka, mama }) => {
  await linkedPair(raka, mama);
  await sendAllowance(mama);
  await pay(raka, "supermarket", "12,50");
  await pay(raka, "gambling");
  for (let i = 0; i < 3; i++) await skip(raka, "monday");
  await waitForIndexer();
  await go(raka, "/app/activity");
  const main = raka.page.locator("body");
  await expect(main.getByText("Week 4 share released")).toBeVisible({ timeout: 30_000 });
  const text = (await main.innerText()).replace(/\s+/g, " ");
  const order = [
    "Week 4 share released",
    "Week 3 share released",
    "Week 2 share released",
    "Gambling site",
    "Supermarket",
    "Allowance from",
  ];
  const at = order.map((s) => text.indexOf(s));
  expect(
    at.every((i) => i >= 0),
    `all rows shown in: ${text}`,
  ).toBe(true);
  expect([...at].sort((a, b) => a - b)).toEqual(at);
  const supermarket = text.slice(at[4], at[5]);
  expect(supermarket).toContain("$14,39");
  expect(supermarket).toContain("On hold");
  expect(text.slice(at[3], at[4])).toContain("Declined");
});

test("F2 Move a bookshop purchase from Everyday to Study @tier1 @indexer @money", async ({
  raka,
  mama,
}) => {
  const accountId = await linkedPair(raka, mama);
  await sendAllowance(mama);
  const id = await pay(raka, "bookshop");
  const before = await envelopes(accountId);
  await go(raka, `/app/activity/${id}`);
  await raka.page.getByRole("radio", { name: /^Study/ }).check();
  await raka.page.getByRole("button", { name: "Move to Study" }).click();
  await expect(raka.page.getByText("Moved from Everyday to Study")).toBeVisible({
    timeout: 60_000,
  });
  const after = await envelopes(accountId);
  const amount = (before[3]?.available ?? 0n) - dollars(50);
  expect(after[3]?.available).toBe(dollars(50));
  expect(after[2]?.available).toBe((before[2]?.available ?? 0n) + amount);
  await waitForIndexer();
  await go(mama, "/app/parent");
  await expect(mama.page.getByText("Raka moved a purchase from Everyday to Study")).toBeVisible({
    timeout: 30_000,
  });
  await expect(mama.page.getByText("Bookshop")).toHaveCount(0);
  await expectMoneyAgrees({ raka, mama, accountId });
});

// @testnet-skip: the hosted indexer cannot be switched off from a test; covered locally and by the two-phone script.
test("F10 Indexer switched off @tier1 @indexer-off @testnet-skip", async ({ raka, mama }) => {
  const accountId = await linkedPair(raka, mama);
  await sendAllowance(mama);
  const hasura = execFileSync("docker", ["ps", "-q", "--filter", "publish=8080"]).toString().trim();
  execFileSync("docker", ["pause", hasura]);
  try {
    await go(raka, "/app/activity");
    await expect(raka.page.getByText("History is catching up")).toBeVisible({ timeout: 30_000 });
    await home(raka);
    await expect(raka.page.getByRole("heading", { name: "Hi, Raka" })).toBeVisible();
    await pay(raka, "supermarket", "12,50");
    await expect(raka.page.getByRole("heading", { name: "Approved" })).toBeVisible();
    await go(mama, (await askEmergency(raka, "70", "Bike repair")) ?? "");
    await mama.page.getByRole("button", { name: "Approve with passkey" }).click();
    await expect(mama.page.getByRole("heading", { name: "Emergency envelope opened" })).toBeVisible(
      { timeout: 60_000 },
    );
    await expectMoneyAgrees({ raka, mama, accountId });
  } finally {
    execFileSync("docker", ["unpause", hasura]);
  }
});
