// Group A, sign-up (owner 07). Tier 1: A1, A2, A3, A8, A10.
import { expect, test } from "../support/fixtures";
import { signUpStudent, go } from "../support/helpers";

test("A1 New student: create passkey, type name, keep the default split, skip the invite @tier1", async ({
  raka,
}) => {
  await signUpStudent(raka);
  await raka.page.getByRole("link", { name: "Skip for now" }).click();
  await expect(raka.page.getByRole("heading", { name: "Hi, Raka" })).toBeVisible();
  await expect(raka.page.getByText("Waiting for the first allowance")).toBeVisible();
});

test("A2 Sign out, then Sign in with passkey @tier1", async ({ raka }) => {
  await signUpStudent(raka);
  const address = await raka.address();
  await go(raka, "/app/settings");
  await raka.page.getByRole("button", { name: "Sign out" }).click();
  await raka.page.waitForURL(/\/app$/); // sign-out goes to Welcome by itself
  await raka.page.goto("/app");
  await raka.page.getByRole("button", { name: "Sign in with passkey" }).first().click();
  await expect(raka.page.getByRole("heading", { name: "Hi, Raka" })).toBeVisible();
  expect(await raka.address()).toBe(address);
});

test("A3 Change the split to 50 / 10 / 10 / 20 / 10 and continue @tier1", async ({ raka }) => {
  await signUpStudent(raka, "Raka", [50, 10, 10, 20, 10]);
  await go(raka, "/app/settings");
  await expect(raka.page.getByTestId("split-line")).toHaveText(
    "Food 50 · Transport 10 · Study 10 · Everyday 20 · Emergency 10",
  );
});

test("A8 Name left empty, or only spaces @tier1", async ({ raka }) => {
  await go(raka, "/app");
  await raka.page.getByRole("button", { name: "Create a passkey" }).click();
  await raka.page.waitForURL("**/app/name");
  const next = raka.page.getByRole("button", { name: "Continue" });
  await expect(next).toBeDisabled();
  await raka.page.getByLabel("Your name").fill("   ");
  await expect(next).toBeDisabled();
});

test("A10 Split totals 95% or 105% @tier1", async ({ raka }) => {
  await go(raka, "/app");
  await raka.page.getByRole("button", { name: "Create a passkey" }).click();
  await raka.page.getByLabel("Your name").fill("Raka");
  await raka.page.getByRole("button", { name: "Continue" }).click();
  await raka.page.waitForURL("**/app/setup");
  const next = raka.page.getByRole("button", { name: "Continue" });
  await raka.page.getByRole("button", { name: "Less Food" }).click();
  await expect(raka.page.getByText("Must add up to 100%. Now 95%.")).toBeVisible();
  await expect(next).toBeDisabled();
  await raka.page.getByRole("button", { name: "More Food" }).click();
  await expect(next).toBeEnabled();
  // 105% cannot be reached: every plus turns off at 100% (07 S07-15, A11).
  for (const name of ["Food", "Transport", "Study", "Everyday", "Emergency"])
    await expect(raka.page.getByRole("button", { name: `More ${name}` })).toBeDisabled();
});
