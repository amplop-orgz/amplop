// Group K, demo controls (owner 15). Tier 1: K1.
import { expect, test } from "../support/fixtures";
import { acceptInvite, makeInvite, signUpStudent, viewAs } from "../support/helpers";

// @testnet-skip: tells the two passkeys apart by the test hook's address, local chain only.
test("K1 View as Mama, then View as Raka, on one profile @tier1 @testnet-skip", async ({
  raka,
}) => {
  const accountId = await signUpStudent(raka);
  const rakaAddress = await raka.address();
  // Demo: the student opens their own invite on this phone to add Mama's passkey here too.
  await acceptInvite(raka, await makeInvite(raka));
  await expect.poll(() => raka.address()).not.toBe(rakaAddress);
  const mamaAddress = await raka.address();
  expect(mamaAddress).not.toBeNull();
  await viewAs(raka, "Raka");
  await expect.poll(() => raka.address()).toBe(rakaAddress);
  expect(await raka.accountId()).toBe(accountId);
  await viewAs(raka, "Mama");
  await expect(raka.page.getByRole("heading", { name: "Raka's allowance" })).toBeVisible();
  await expect.poll(() => raka.address()).toBe(mamaAddress);
});
