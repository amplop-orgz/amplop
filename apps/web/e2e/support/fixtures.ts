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
import { TESTNET } from "./stack";

export type Profile = {
  name: "raka" | "mama" | "stranger";
  context: BrowserContext;
  page: Page;
  authenticator: Authenticator;
  /** The signed-in address from the app's test hook (chain 31337 only). */
  address: () => Promise<string | null>;
  accountId: () => Promise<bigint | null>;
  /** What the testnet run learned from the chain, used when the test hook is absent. */
  known: { accountId?: bigint; address?: string };
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

// S19-14: every policy violation and every console line about the policy, across all page loads.
const GUARD = () => {
  const report = (window as unknown as { __amplopCsp?: (s: string) => void }).__amplopCsp;
  document.addEventListener("securitypolicyviolation", (e) => {
    report?.(
      `${e.violatedDirective} ${e.blockedURI} in ${e.documentURI} at ${e.sourceFile}:${String(e.lineNumber)} ${e.sample} <${(e.target as Node).nodeName}>`,
    );
  });
};
const violations = new WeakMap<BrowserContext, string[]>();

async function makeProfile(
  browser: Browser,
  name: Profile["name"],
  use: Parameters<Browser["newContext"]>[0],
): Promise<Profile> {
  // Each person is on their own phone, so per-IP limits (07 S07-27) count them apart.
  const ip = `10.${[0, 0, 0].map(() => String(Math.floor(Math.random() * 256))).join(".")}`;
  // Set on the context, not by route(): WebKit drops headers that route() adds. Not on testnet: the
  // header reaches the public RPCs too, which refuse it in CORS, and Vercel replaces it anyway.
  const context = await browser.newContext({
    ...use,
    timezoneId: ZONES[name],
    extraHTTPHeaders: TESTNET
      ? { ...use?.extraHTTPHeaders }
      : { ...use?.extraHTTPHeaders, "x-real-ip": ip },
  });
  const seen: string[] = [];
  violations.set(context, seen);
  await context.exposeFunction("__amplopCsp", (v: string) => seen.push(v));
  await context.addInitScript(GUARD);
  const soft =
    browser.browserType().name() === "chromium" ? null : await installSoftAuthenticator(context);
  const page = await context.newPage();
  page.on("console", (m) => {
    if (/Content.Security.Policy/i.test(m.text())) seen.push(m.text());
  });
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
  const known: Profile["known"] = {};
  return {
    name,
    context,
    page,
    authenticator,
    known,
    address: async () => (await hook())?.address ?? known.address ?? null,
    accountId: async () => {
      const id = (await hook())?.accountId;
      return id ? BigInt(id) : (known.accountId ?? null);
    },
  };
}

async function closeChecked(p: Profile): Promise<void> {
  await p.context.close();
  expect(violations.get(p.context), `${p.name}: Content-Security-Policy violations`).toEqual([]);
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
