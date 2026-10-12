// Profiles and guards for every case (19 S19-3, S19-4, S19-14). Each profile is its own browser
// context with its own authenticator, like two phones. Every test fails on a dialog or a
// Content-Security-Policy violation.
import {
  test as base,
  expect,
  type Browser,
  type BrowserContext,
  type CDPSession,
  type Page,
} from "@playwright/test";

import { installSoftAuthenticator } from "./soft-authenticator";

export type Profile = {
  name: "raka" | "mama" | "stranger";
  context: BrowserContext;
  page: Page;
  authenticator: Authenticator;
  /** The signed-in address from the app's test hook (chain 31337 only). */
  address: () => Promise<string | null>;
  accountId: () => Promise<bigint | null>;
};

export type Authenticator = {
  credentials: () => Promise<unknown[]>;
  failNext: () => Promise<void>;
};

const ZONES = { raka: "Europe/Amsterdam", mama: "Asia/Jakarta", stranger: "Asia/Jakarta" } as const;

/** S19-4: Chromium's virtual authenticator with PRF, the passkey extension Mera needs. */
async function chromiumAuthenticator(page: Page): Promise<Authenticator> {
  const cdp: CDPSession = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable", { enableUI: false });
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
      hasPrf: true,
    },
  });
  return {
    credentials: async () =>
      (await cdp.send("WebAuthn.getCredentials", { authenticatorId })).credentials,
    failNext: async () => {
      await cdp.send("WebAuthn.setUserVerified", { authenticatorId, isUserVerified: false });
    },
  };
}

const GUARD = () => {
  const w = window as unknown as { __cspViolations: string[] };
  w.__cspViolations = [];
  document.addEventListener("securitypolicyviolation", (e) => {
    w.__cspViolations.push(`${e.violatedDirective} ${e.blockedURI}`);
  });
};

async function makeProfile(
  browser: Browser,
  name: Profile["name"],
  use: Parameters<Browser["newContext"]>[0],
): Promise<Profile> {
  const context = await browser.newContext({ ...use, timezoneId: ZONES[name] });
  await context.addInitScript(GUARD);
  const soft =
    browser.browserType().name() === "chromium" ? null : await installSoftAuthenticator(context);
  const page = await context.newPage();
  page.on("dialog", (d) => {
    throw new Error(`a dialog opened: ${d.message()}`);
  });
  const authenticator = soft ?? (await chromiumAuthenticator(page));
  const hook = () =>
    page.evaluate(
      () =>
        (
          window as unknown as {
            __amplopTest?: { address: string | null; accountId: string | null };
          }
        ).__amplopTest ?? null,
    );
  return {
    name,
    context,
    page,
    authenticator,
    address: async () => (await hook())?.address ?? null,
    accountId: async () => {
      const id = (await hook())?.accountId;
      return id ? BigInt(id) : null;
    },
  };
}

async function closeChecked(p: Profile): Promise<void> {
  const violations = await p.page
    .evaluate(() => (window as unknown as { __cspViolations?: string[] }).__cspViolations ?? [])
    .catch(() => []);
  await p.context.close();
  expect(violations, `${p.name}: Content-Security-Policy violations`).toEqual([]);
}

export const test = base.extend<{ raka: Profile; mama: Profile; stranger: Profile }>({
  raka: async ({ browser, contextOptions }, use) => {
    const p = await makeProfile(browser, "raka", contextOptions);
    await use(p);
    await closeChecked(p);
  },
  mama: async ({ browser, contextOptions }, use) => {
    const p = await makeProfile(browser, "mama", contextOptions);
    await use(p);
    await closeChecked(p);
  },
  stranger: async ({ browser, contextOptions }, use) => {
    const p = await makeProfile(browser, "stranger", contextOptions);
    await use(p);
    await closeChecked(p);
  },
});

export { expect };
