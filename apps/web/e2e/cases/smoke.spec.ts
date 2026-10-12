// S19-18: the preview smoke set. No transactions; safe against any deployment (`npm run e2e:smoke`).
import { expect, test } from "@playwright/test";

const BANNED = /crypto|blockchain|hackathon|monad/i;

test("L1 Landing page: Open the app @tier2 @smoke", async ({ page }) => {
  await page.goto("/");
  for (const a of await page.locator('header a[href^="#"]').all()) {
    const id = (await a.getAttribute("href"))?.slice(1) ?? "";
    await a.click();
    await expect(page.locator(`#${id}`)).toBeInViewport();
  }
  await page
    .getByRole("link", { name: /^Open the app/ })
    .first()
    .click();
  await expect(page.getByRole("button", { name: "Create a passkey" })).toBeVisible();
});

test("L3 The words crypto, blockchain, hackathon and Monad on the landing page @tier2 @smoke", async ({
  page,
}) => {
  await page.goto("/");
  expect(BANNED.exec(await page.locator("body").innerText())?.[0] ?? null).toBeNull();
  expect(BANNED.exec(await page.title())?.[0] ?? null).toBeNull();
});

test("smoke: security headers on / and /app @smoke", async ({ request, baseURL }) => {
  const https = baseURL?.startsWith("https") ?? false;
  for (const path of ["/", "/app"]) {
    const h = (await request.get(path)).headers();
    const csp = h["content-security-policy"] ?? "";
    const scripts = /script-src ([^;]*)/.exec(csp)?.[1] ?? "";
    expect(scripts).toMatch(/'nonce-/);
    expect(scripts).not.toMatch(/unsafe-eval|unsafe-inline/);
    expect(csp).toContain("frame-ancestors 'none'");
    if (https) expect(h["strict-transport-security"]).toBeTruthy();
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["referrer-policy"]).toBe("no-referrer");
    expect(h["permissions-policy"]).toBeTruthy();
  }
});

test("smoke: nonce and the simulate guard @smoke", async ({ request }) => {
  const nonce = await request.get("/api/auth/nonce");
  expect(nonce.status()).toBe(200);
  expect(JSON.stringify(await nonce.json())).toMatch(/"[0-9a-f]{32}"/);
  const sim = await request.post(`/api/topup/${"ab".repeat(16)}/simulate`, { data: {} });
  expect(sim.status()).toBe(401);
});

test("smoke: no console error or policy violation on / and /app @smoke", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" || /Content.Security.Policy/i.test(m.text())) errors.push(m.text());
  });
  for (const path of ["/", "/app"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
  }
  expect(errors).toEqual([]);
});
