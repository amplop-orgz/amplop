// Group G, Emergency (owner 12). Tier 1: G1, G2, G5, G6, G12.
import { expect, test } from "../support/fixtures";
import {
  askEmergency,
  dollars,
  envelopes,
  expectMoneyAgrees,
  expectTxProof,
  go,
  linkedPair,
  sendAllowance,
  signUpStudent,
  skip,
} from "../support/helpers";
import type { Profile } from "../support/fixtures";

async function funded(raka: Profile, mama: Profile) {
  const accountId = await linkedPair(raka, mama);
  await sendAllowance(mama);
  return accountId;
}

test("G1 Raka asks for $70 with a reason; Mama approves @tier1 @money", async ({ raka, mama }) => {
  const accountId = await funded(raka, mama);
  const link = await askEmergency(raka, "70", "Laptop charger broke before exams");
  await go(mama, link ?? "");
  await expect(mama.page.getByText("Laptop charger broke before exams")).toBeVisible();
  await mama.page.getByRole("button", { name: "Approve with passkey" }).click();
  await expect(mama.page.getByRole("heading", { name: "Emergency envelope opened" })).toBeVisible({
    timeout: 60_000,
  });
  await expectTxProof(mama.page, { event: "EmergencyOpened", amount: dollars(70) });
  const list = await envelopes(accountId);
  expect(list[3]?.available).toBe(dollars(50 + 70));
  expect(list[4]?.locked).toBe(dollars(30));
  await go(raka, "/app/emergency");
  await expect(raka.page.getByText("Emergency opened").first()).toBeVisible({ timeout: 30_000 });
  await expectMoneyAgrees({ raka, mama, accountId });
});

test("G2 Raka asks; nobody answers; Skip 48 hours; Raka opens the app @tier1 @money", async ({
  raka,
  mama,
}) => {
  const accountId = await funded(raka, mama);
  await askEmergency(raka, "70", "Train ticket home");
  await skip(raka, "48h");
  await go(raka, "/app");
  await expect
    .poll(async () => (await envelopes(accountId))[3]?.available, { timeout: 60_000 })
    .toBe(dollars(120));
  expect((await envelopes(accountId))[4]?.locked).toBe(dollars(30));
  await expectMoneyAgrees({ raka, mama, accountId });
});

test("G5 No trusted person: start the 48-hour wait, then skip @tier1 @money", async ({
  raka,
  mama,
}) => {
  const accountId = await funded(raka, mama);
  // Raka removes Mama: 48 hours, then the app finishes the change.
  await go(raka, "/app/settings");
  await raka.page.getByRole("button", { name: "Change" }).click();
  await raka.page.getByRole("button", { name: "Start the 48-hour wait" }).click();
  await expect(raka.page.getByText(/Mama · leaving on/)).toBeVisible({ timeout: 60_000 });
  await skip(raka, "48h");
  await go(raka, "/app/settings");
  await expect(raka.page.getByText("Nobody yet")).toBeVisible({ timeout: 60_000 });

  await askEmergency(raka, "70", "Doctor visit", "");
  await expect(raka.page.getByText(/approval/i)).toHaveCount(0);
  await skip(raka, "48h");
  await go(raka, "/app");
  await expect
    .poll(async () => (await envelopes(accountId))[3]?.available, { timeout: 60_000 })
    .toBe(dollars(120));
  await expectMoneyAgrees({ raka, accountId });
});

test("G6 Amount above the locked balance, or 0 @tier1", async ({ raka, mama }) => {
  await funded(raka, mama);
  const { page } = raka;
  await go(raka, "/app/emergency");
  await page.getByLabel("Reason").fill("Rent");
  const send = page.getByRole("button", { name: "Send request to Mama" });
  for (const amount of ["101", "0"]) {
    await page.getByLabel("Amount requested").fill(amount);
    await expect(send).toBeDisabled();
  }
  await page.getByLabel("Amount requested").fill("100");
  await expect(send).toBeEnabled();
});

test("G12 Someone who is not the trusted person opens the approval link @tier1", async ({
  raka,
  mama,
  stranger,
}) => {
  await funded(raka, mama);
  const link = await askEmergency(raka, "70", "Secret reason text");
  // Someone signed in with their own passkey, not the trusted person.
  await signUpStudent(stranger, "Dewi");
  await go(stranger, link ?? "");
  await expect(stranger.page.getByText(/not for you/).first()).toBeVisible({ timeout: 30_000 });
  await expect(stranger.page.getByText("Secret reason text")).toHaveCount(0);
  await expect(stranger.page.getByRole("button", { name: "Approve with passkey" })).toHaveCount(0);
});
