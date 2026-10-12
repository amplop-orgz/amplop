import { defineConfig, devices } from "@playwright/test";

// 19 S19-1, S19-2: two phone-sized projects at 390 × 844. The local stack starts in global-setup.
const CI = Boolean(process.env.CI);
const testnet = Boolean(process.env.E2E_TESTNET);

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
  },
  projects: [
    {
      name: "chromium-phone",
      use: {
        ...devices["Pixel 7"],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
    { name: "webkit-phone", use: { ...devices["iPhone 13"] } },
  ],
});
