// Group B, invite and trusted person (owner 10). Tier 1: B1, B3.
import { expect, test } from "../support/fixtures";
import { acceptInvite, makeInvite, signUpStudent, go } from "../support/helpers";

test("B1 Raka shares the invite; Mama opens it in her own profile, accepts, creates a passkey @tier1", async ({
  raka,
  mama,
}) => {
  await signUpStudent(raka);
  await acceptInvite(mama, await makeInvite(raka));
  await expect(mama.page.getByRole("heading", { name: "Raka's allowance" })).toBeVisible();
  await go(raka, "/app/settings");
  await expect(raka.page.getByText("Mama", { exact: false }).first()).toBeVisible();
});

test("B3 The same link opened a second time by someone else @tier1", async ({
  raka,
  mama,
  stranger,
}) => {
  await signUpStudent(raka);
  const link = await makeInvite(raka);
  await acceptInvite(mama, link);
  await stranger.page.goto(link);
  await expect(stranger.page.getByText("This invite has already been used")).toBeVisible();
  await expect(
    stranger.page.getByRole("button", { name: "Accept and create a passkey" }),
  ).toHaveCount(0);
});
