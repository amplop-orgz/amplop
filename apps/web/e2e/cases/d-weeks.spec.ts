// Group D, weekly release (owner 11). Tier 1: D1, D2.
import { expect, test } from "../support/fixtures";
import {
  dollars,
  envelopes,
  expectMoneyAgrees,
  home,
  linkedPair,
  sendAllowance,
  skip,
  usd,
} from "../support/helpers";

const weekly = async (accountId: bigint) =>
  (await envelopes(accountId)).slice(0, 4).reduce((a, e) => a + e.available, 0n);

test("D1 After C1, Skip to next Monday three times @tier1 @money", async ({ raka, mama }) => {
  const accountId = await linkedPair(raka, mama);
  await sendAllowance(mama);
  expect(await weekly(accountId)).toBe(dollars(225));
  for (const want of [450, 675, 900]) {
    await skip(raka, "monday");
    expect(await weekly(accountId)).toBe(dollars(want));
  }
  await home(raka);
  await expect(raka.page.getByText("All shares released").first()).toBeVisible();
  await skip(raka, "monday");
  expect(await weekly(accountId)).toBe(dollars(900));
  await expectMoneyAgrees({ raka, mama, accountId });
});

test("D2 Nothing is spent in week 1 @tier1 @money", async ({ raka, mama }) => {
  const accountId = await linkedPair(raka, mama);
  await sendAllowance(mama);
  await skip(raka, "monday");
  await home(raka);
  await expect(raka.page.getByTestId("home-available-0")).toHaveText(usd(dollars(200)));
  await expect(raka.page.getByTestId("home-available-3")).toHaveText(usd(dollars(100)));
  await expectMoneyAgrees({ raka, mama, accountId });
});
