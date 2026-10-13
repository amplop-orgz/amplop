// 19 S19-5: the day-one check that Mera accepts the harness's authenticator. Create a passkey through
// Welcome, reload, sign in again and get the same address.
import { expect, test } from "../support/fixtures";

test("passkey check: create, reload, sign in, same address", async ({ raka }) => {
  const { page } = raka;
  await page.goto("/app");
  await page.getByRole("button", { name: "Create a passkey" }).click();
  await page.waitForURL("**/app/name");
  await expect.poll(() => raka.address()).toMatch(/^0x[0-9a-fA-F]{40}$/);
  const first = await raka.address();
  expect(await raka.authenticator.credentials()).toHaveLength(1);

  // 06 S06-16a: a reload keeps the session, with no passkey prompt.
  await page.reload();
  await page.getByLabel("Your name").waitFor();
  await expect.poll(() => raka.address()).toBe(first);

  // Closing the tab drops the kept copy (cleared here); /app then shows Welcome back (S06-10a).
  await page.evaluate(() => {
    sessionStorage.clear();
  });
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await page.getByRole("button", { name: "Sign in with passkey" }).click();
  await expect.poll(() => raka.address()).toBe(first);
});
