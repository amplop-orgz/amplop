// Group J, parent view (owner 14). Tier 1: J1, J4.
import { expect, test } from "../support/fixtures";
import {
  askEmergency,
  expectMoneyAgrees,
  go,
  linkedPair,
  pay,
  sendAllowance,
} from "../support/helpers";

test("J1 Parent home after C1, E1 and G1 @tier1 @money", async ({ raka, mama }) => {
  const accountId = await linkedPair(raka, mama);
  await sendAllowance(mama);
  await pay(raka, "supermarket", "12,50");
  await go(mama, (await askEmergency(raka, "70", "Phone screen")) ?? "");
  await mama.page.getByRole("button", { name: "Approve with passkey" }).click();
  await expect(mama.page.getByRole("heading", { name: "Emergency envelope opened" })).toBeVisible({
    timeout: 60_000,
  });
  // S19-12 step 3 proves total = available + not yet released; step 2 that parent home shows the totals.
  await expectMoneyAgrees({ raka, mama, accountId });
});

// @testnet-skip: calls the API through the test hook, which only the local chain's build has.
test("J4 Mama's profile asks the server for Raka's shop names @tier1 @testnet-skip", async ({
  raka,
  mama,
}) => {
  const accountId = await linkedPair(raka, mama);
  await go(mama, "/app/parent");
  await expect(mama.page.getByRole("heading", { name: "Raka's allowance" })).toBeVisible();
  for (const forAccount of [accountId.toString(), "0"]) {
    const r = await mama.page.evaluate(
      ([id]) =>
        (
          window as unknown as {
            __amplopTest: {
              signedGet: (
                p: string,
                a: string,
                id: string,
              ) => Promise<{ status: number; body: unknown }>;
            };
          }
        ).__amplopTest.signedGet("/api/purchases", "purchases.read", id ?? "0"),
      [forAccount],
    );
    expect(r.status).toBe(403);
    expect(r.body).toBeNull();
  }
});
