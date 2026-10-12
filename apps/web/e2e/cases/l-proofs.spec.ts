// L2 (owned here, S19-13): every screen that can show a proof link, for one account.
import type { Page } from "@playwright/test";
import { expect, test } from "../support/fixtures";
import {
  askEmergency,
  dollars,
  E1_UNITS,
  expectTxProof,
  go,
  linkedPair,
  pay,
  sendAllowance,
} from "../support/helpers";

/** The proof link renders just after its screen; wait for it, then run S19-13's checks. */
async function proofs(page: Page, expected?: Parameters<typeof expectTxProof>[1]) {
  await expect(page.getByTestId("tx-proof").first()).toBeVisible({ timeout: 30_000 });
  return expectTxProof(page, expected);
}

test('L2 Every "View transaction proof" link in the app @tier1', async ({ raka, mama }) => {
  test.setTimeout(240_000); // one account through every proof screen
  await linkedPair(raka, mama);
  await sendAllowance(mama);
  // 1.4 Allowance sent
  expect(await proofs(mama.page, { event: "Deposited", amount: dollars(1000) })).toBeGreaterThan(0);
  // 2.1 Allowance arrived
  await go(raka, "/app");
  await expect(raka.page.getByRole("heading", { name: "Allowance arrived" })).toBeVisible({
    timeout: 30_000,
  });
  await expectTxProof(raka.page, { event: "Deposited", amount: dollars(1000) });
  // 2.6 Approved, then the purchase before and after Collect now
  const held = await pay(raka, "supermarket", "12,50");
  expect(await proofs(raka.page, { event: "PurchaseApproved", amount: E1_UNITS })).toBeGreaterThan(
    0,
  );
  await go(raka, `/app/activity/${held}`);
  await expectTxProof(raka.page, { event: "PurchaseApproved" });
  await raka.page.getByRole("button", { name: "Demo only: collect now" }).click();
  await expect(raka.page.getByText("Collected", { exact: true }).first()).toBeVisible({
    timeout: 60_000,
  });
  await go(raka, `/app/activity/${held}`);
  await expectTxProof(raka.page);
  // 2.7 and 2.8 Declined
  await pay(raka, "gambling");
  await expectTxProof(raka.page, { event: "PurchaseDeclined" });
  await pay(raka, "supermarket", "200,00");
  await expectTxProof(raka.page, { event: "PurchaseDeclined" });
  // 2.10 after a move
  const book = await pay(raka, "bookshop");
  await go(raka, `/app/activity/${book}`);
  await raka.page.getByRole("radio", { name: /^Study/ }).check();
  await raka.page.getByRole("button", { name: "Move to Study" }).click();
  await expect(raka.page.getByText("Moved from Everyday to Study")).toBeVisible({
    timeout: 60_000,
  });
  await expectTxProof(raka.page);
  // 3.4 Emergency opened, on Mama's phone
  await go(mama, (await askEmergency(raka, "70", "Glasses")) ?? "");
  await mama.page.getByRole("button", { name: "Approve with passkey" }).click();
  await expect(mama.page.getByRole("heading", { name: "Emergency envelope opened" })).toBeVisible({
    timeout: 60_000,
  });
  expect(
    await proofs(mama.page, { event: "EmergencyOpened", amount: dollars(70) }),
  ).toBeGreaterThan(0);
});
