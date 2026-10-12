// Group I, recovery (owner 13). Tier 1: I1, I3. `stranger` plays Raka's new phone.
import { expect, test } from "../support/fixtures";
import type { Profile } from "../support/fixtures";
import {
  captureOpens,
  envelopes,
  expectMoneyAgrees,
  go,
  linkedPair,
  pay,
  sendAllowance,
  sharedLink,
  skip,
} from "../support/helpers";

/** New passkey on the new phone, recovery link to Mama, Mama approves. */
async function recoverTo(newPhone: Profile, mama: Profile): Promise<void> {
  await captureOpens(newPhone);
  await newPhone.page.goto("/recover");
  await newPhone.page.waitForLoadState("networkidle");
  await newPhone.page.getByRole("button", { name: "Create a new passkey" }).click();
  await newPhone.page
    .getByRole("button", { name: "Send the recovery link on WhatsApp" })
    .click({ timeout: 60_000 });
  await go(mama, await sharedLink(newPhone, "recover"));
  await mama.page.getByRole("button", { name: "Approve with passkey" }).click();
  await expect(mama.page.getByRole("heading", { name: "Approved" })).toBeVisible({
    timeout: 60_000,
  });
}

test("I1 New profile, new passkey, recovery link to Mama, she approves, Skip 48 hours @tier1 @money", async ({
  raka,
  mama,
  stranger,
}) => {
  const accountId = await linkedPair(raka, mama);
  await sendAllowance(mama);
  await pay(raka, "supermarket", "12,50");
  const before = await envelopes(accountId);
  await recoverTo(stranger, mama);
  await skip(raka, "48h");
  await expect.poll(() => stranger.accountId(), { timeout: 90_000 }).toBe(accountId);
  expect(await envelopes(accountId)).toEqual(before);
  expect(before[0]?.held).toBeGreaterThan(0n);
  await expectMoneyAgrees({ raka: stranger, mama, accountId });
});

test("I3 The old passkey cancels during the wait @tier1", async ({ raka, mama, stranger }) => {
  const accountId = await linkedPair(raka, mama);
  await recoverTo(stranger, mama);
  await go(raka, "/app/settings");
  await raka.page.getByRole("button", { name: "Cancel recovery" }).click();
  await expect(
    raka.page.getByText("Recovery cancelled. Your account stays on this passkey."),
  ).toBeVisible({ timeout: 60_000 });
  await skip(raka, "48h");
  await expect(stranger.page.getByText("Recovery cancelled").first()).toBeVisible({
    timeout: 60_000,
  });
  expect(await stranger.accountId()).toBeNull();
  expect(await raka.accountId()).toBe(accountId);
});
