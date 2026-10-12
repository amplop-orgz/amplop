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

export default defineConfig({
  testDir: "./e2e/cases",
  globalSetup: "./e2e/global-setup.ts",
  timeout: testnet ? 300_000 : 120_000,
  expect: { timeout: 15_000 },
  retries: CI ? 1 : 0,
  workers: testnet ? 1 : 2,
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
    { name: "chromium-phone", grepInvert: LATER, use: PIXEL },
    {
      name: "webkit-phone",
      grepInvert: LATER,
      // Playwright's screenshot adds an inline style that WebKit reports under the page's policy,
      // which the CSP guard would count against the app. Video and traces still record failures.
      use: { ...devices["iPhone 13"], screenshot: "off" },
    },
    // S19-11: the indexer-off group pauses the shared indexer, so it runs alone after the rest.
    {
      name: "indexer-off",
      grep: /@indexer-off/,
      fullyParallel: false,
      dependencies: ["chromium-phone", "webkit-phone"],
      use: PIXEL,
    },
    // SEC3 reads the server log that every other test wrote.
    { name: "after-run", grep: /@after-run/, dependencies: ["indexer-off"], use: PIXEL },
  ],
});
