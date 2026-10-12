import { defineConfig, devices } from "@playwright/test";

// 19 S19-1, S19-2: two phone-sized projects at 390 × 844. The local stack starts in global-setup.
const CI = Boolean(process.env.CI);
const testnet = Boolean(process.env.E2E_TESTNET);

const LATER = /@indexer-off|@after-run/;
const PIXEL = {
  ...devices["Pixel 7"],
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
};
// Playwright's screenshot adds an inline style that WebKit reports under the page's policy, which
// the CSP guard would count against the app. Video and traces still record WebKit failures.
const IPHONE = { ...devices["iPhone 13"], screenshot: "off" as const };
// E2E_ENGINE=chromium or webkit runs one engine, so CI can run the two side by side (S19-17).
const ENGINE = process.env.E2E_ENGINE;
const PHONES = (
  [
    ["chromium-phone", PIXEL],
    ["webkit-phone", IPHONE],
  ] as const
).filter(([name]) => !ENGINE || name.startsWith(ENGINE));
const LAST_ENGINE = PHONES.at(-1)?.[1] ?? PIXEL;

export default defineConfig({
  testDir: "./e2e/cases",
  globalSetup: "./e2e/global-setup.ts",
  timeout: testnet ? 300_000 : 120_000,
  expect: { timeout: 15_000 },
  retries: CI ? 1 : 0,
  // Stop early in CI so a broken engine ends the job and still uploads its report and traces.
  maxFailures: CI ? 5 : undefined,
  workers: testnet ? 1 : 4,
  reporter: CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    locale: "en-US",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    // A protected Vercel preview lets the smoke run through with this header.
    ...(process.env.VERCEL_AUTOMATION_BYPASS_SECRET
      ? {
          extraHTTPHeaders: {
            "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
          },
        }
      : {}),
  },
  projects: [
    ...PHONES.map(([name, use]) => ({ name, grepInvert: LATER, use })),
    // S19-11: the indexer-off group pauses the shared indexer, so it runs alone after the rest.
    {
      name: "indexer-off",
      grep: /@indexer-off/,
      fullyParallel: false,
      dependencies: PHONES.map(([name]) => name),
      use: LAST_ENGINE,
    },
    // SEC3 reads the server log that every other test wrote.
    { name: "after-run", grep: /@after-run/, dependencies: ["indexer-off"], use: LAST_ENGINE },
  ],
});
