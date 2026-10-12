// Group H, settings changes (owner 13). Tier 1: H2.
import { expect, test } from "../support/fixtures";
import {
  deposits,
  expectMoneyAgrees,
  go,
  linkedPair,
  sendAllowance,
  setSplit,
  skip,
} from "../support/helpers";

const parts = (amount: bigint, split: number[]) => {
  const p = split.map((s) => (amount * BigInt(s)) / 100n);
  p[3] = amount - p.reduce((a, b, i) => (i === 3 ? a : a + b), 0n);
  return p;
};

test("H2 Change the split after an allowance; Skip 48 hours; send another @tier1 @money", async ({
  raka,
  mama,
}) => {
  const accountId = await linkedPair(raka, mama);
  await sendAllowance(mama);
  await go(raka, "/app/setup?edit=1");
  await setSplit(raka, [50, 10, 10, 20, 10]);
  await raka.page.getByRole("button", { name: "Save split" }).click();
  await expect(raka.page.getByText(/^Split saved\. It starts on/)).toBeVisible({ timeout: 60_000 });
  await skip(raka, "48h");
  await sendAllowance(mama);
  const [first, second] = await deposits(accountId);
  if (!first || !second) throw new Error("two deposits expected");
  expect([...first.parts]).toEqual(parts(first.amount, [40, 15, 15, 20, 10]));
  expect([...second.parts]).toEqual(parts(second.amount, [50, 10, 10, 20, 10]));
  await expectMoneyAgrees({ raka, mama, accountId });
});
