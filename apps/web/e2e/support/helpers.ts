// Helpers every case uses (19 S19-3, S19-9, S19-12, S19-13). They drive the UI only and never call the
// contract to change state; reads go to the chain for the checks.
import { amplopEnvelopesAbi } from "@amplop/shared/abi";
import { formatUsd } from "@amplop/shared/money";
import { createHash } from "node:crypto";
import { createPublicClient, decodeEventLog, http, type Hash } from "viem";
import { foundry, monadTestnet } from "viem/chains";
import { expect, type Profile } from "./fixtures";
import { BASE_URL, deployment, indexerMeta, MIDTRANS_KEY, TESTNET } from "./stack";
import { control, PORTS } from "./stand-ins";

export const chain = createPublicClient({
  chain: TESTNET ? monadTestnet : foundry,
  transport: http(process.env.E2E_RPC_URL ?? (TESTNET ? undefined : "http://127.0.0.1:8545")),
});
// S19-13 step 4: the explorer stand-in locally, the real explorer on testnet.
const EXPLORER_TX =
  process.env.E2E_EXPLORER_TX_URL ??
  (TESTNET
    ? "https://testnet.monadvision.com/tx/"
    : `http://127.0.0.1:${String(PORTS.explorer)}/tx/`);
const contract = () => deployment().address as `0x${string}`;

type EnvelopeView = { available: bigint; unreleased: bigint; held: bigint; locked: bigint };

export async function envelopes(accountId: bigint) {
  const [list] = (await chain.readContract({
    address: contract(),
    abi: amplopEnvelopesAbi,
    functionName: "envelopes",
    args: [accountId],
  })) as readonly [readonly EnvelopeView[], bigint];
  return list;
}

export async function totals(accountId: bigint) {
  return (await chain.readContract({
    address: contract(),
    abi: amplopEnvelopesAbi,
    functionName: "totals",
    args: [accountId],
  })) as readonly bigint[];
}

export const usd = (units: bigint) => formatUsd(units, 6);
/** E1: 12,50 euro at the sample rate 1,1511 is $14,38875, shown as $14,39. */
export const E1_UNITS = 14_388_750n;
export const dollars = (n: number) => BigInt(Math.round(n * 100)) * 10_000n;

/** Opens a path; a full page load drops the in-memory passkey session, so sign back in when asked. */
export async function go(p: Profile, path: string): Promise<void> {
  await p.page.goto(path).catch((e: unknown) => {
    // The app may redirect on its own (Allowance arrived); the page is still where the app wants it.
    if (!String(e).includes("interrupted by another navigation")) throw e;
  });
  // The unlock sheet, or Welcome on /app, both offer the passkey sign-in.
  const signIn = p.page.getByRole("button", { name: "Sign in with passkey" });
  await p.page.locator("main, h1, h2").first().waitFor();
  await p.page.waitForLoadState("networkidle"); // the gate decides after the session check
  if ((await p.authenticator.credentials()).length > 0 && (await signIn.isVisible())) {
    await signIn.click();
    await signIn.waitFor({ state: "hidden" });
  }
}

/** Records every window.open URL, so WhatsApp links can be read without leaving the page. */
export async function captureOpens(p: Profile): Promise<void> {
  await p.page.addInitScript(() => {
    const w = window as unknown as { __opened: string[] };
    w.__opened = [];
    window.open = (url?: string | URL) => {
      w.__opened.push(String(url));
      return null;
    };
  });
}

export async function lastOpened(p: Profile): Promise<string> {
  const all = await p.page.evaluate(
    () => (window as unknown as { __opened?: string[] }).__opened ?? [],
  );
  const last = all.at(-1);
  if (!last) throw new Error("nothing was opened");
  return last;
}

/** The approval or recovery link from the last WhatsApp share (needs `captureOpens` first). */
export async function sharedLink(p: Profile, kind: "approve" | "recover"): Promise<string> {
  await expect
    .poll(() =>
      p.page.evaluate(() => (window as unknown as { __opened?: string[] }).__opened?.length ?? 0),
    )
    .toBeGreaterThan(0);
  const text = decodeURIComponent((await lastOpened(p)).split("text=")[1] ?? "");
  const link = new RegExp(`https?://\\S+/${kind}/[^\\s"]+`).exec(text)?.[0];
  if (!link) throw new Error(`no ${kind} link in: ${text}`);
  return link.replace(/^https?:\/\/[^/]+/, BASE_URL);
}

/** G1: Raka asks to open Emergency; with a trusted person, shares the link and returns it. */
export async function askEmergency(
  raka: Profile,
  amount: string,
  reason: string,
  trusted = "Mama",
): Promise<string | null> {
  const { page } = raka;
  await captureOpens(raka);
  await go(raka, "/app/emergency");
  await page.getByLabel("Amount requested").fill(amount);
  await page.getByLabel("Reason").fill(reason);
  if (trusted === "") {
    await page.getByRole("button", { name: "Start the 48-hour wait" }).click();
    await expect(page.getByText("Opens automatically in").first()).toBeVisible({ timeout: 60_000 });
    return null;
  }
  await page.getByRole("button", { name: `Send request to ${trusted}` }).click();
  await page
    .getByRole("button", { name: /^Send the link to .+ on WhatsApp$/ })
    .click({ timeout: 60_000 });
  return sharedLink(raka, "approve");
}

/**
 * Testnet only: the deployed build has no test hook (it exists on chain 31337 only), so the account
 * just made is the newest AccountCreated. The testnet run is serial, so it is this profile's.
 * shortcut: assumes nobody else signs up in the same seconds; fine for the judged demo deployment.
 */
async function learnFromChain(p: Profile): Promise<void> {
  const head = await chain.getBlockNumber();
  const logs = await chain.getContractEvents({
    address: contract(),
    abi: amplopEnvelopesAbi,
    eventName: "AccountCreated",
    fromBlock: head - 100n,
  });
  const last = logs.at(-1)?.args as { accountId: bigint; owner: string } | undefined;
  if (!last) throw new Error("no AccountCreated in the last 100 blocks");
  p.known.accountId = last.accountId;
  p.known.address = last.owner;
}

/** A1: create a passkey, type the name, keep or set the split, land on the invite step. */
export async function signUpStudent(p: Profile, name = "Raka", split?: number[]): Promise<bigint> {
  const { page } = p;
  await go(p, "/app");
  await page.getByRole("button", { name: "Create a passkey" }).click();
  await page.waitForURL("**/app/name");
  await page.getByLabel("Your name").fill(name);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL("**/app/setup");
  if (split) await setSplit(p, split);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL("**/app/invite", { timeout: 60_000 });
  if (TESTNET) await learnFromChain(p);
  await expect.poll(() => p.accountId(), { timeout: 30_000 }).not.toBeNull();
  return (await p.accountId()) as bigint;
}

const NAMES = ["Food", "Transport", "Study", "Everyday", "Emergency"];

/** Steps the split to `want` with the board 0.3 steppers (5 at a time). */
export async function setSplit(p: Profile, want: number[]): Promise<void> {
  const current = [40, 15, 15, 20, 10];
  // Lower first, so the total never has to pass 100.
  for (const pass of ["less", "more"] as const) {
    for (let i = 0; i < 5; i++) {
      while (
        pass === "less" ? (current[i] ?? 0) > (want[i] ?? 0) : (current[i] ?? 0) < (want[i] ?? 0)
      ) {
        await p.page
          .getByRole("button", { name: `${pass === "less" ? "Less" : "More"} ${NAMES[i] ?? ""}` })
          .click();
        current[i] = (current[i] ?? 0) + (pass === "less" ? -5 : 5);
      }
    }
  }
}

/** B1 (Raka's side): name the trusted person and share the invite; returns the link. */
export async function makeInvite(raka: Profile, trustedName = "Mama"): Promise<string> {
  await raka.context.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => undefined);
  await go(raka, "/app/invite");
  await raka.page.getByLabel("Their name").fill(trustedName);
  await raka.page.getByRole("button", { name: "Copy invite link" }).click();
  // The ready screen's WhatsApp button carries the link in its address.
  const share = raka.page.getByRole("link", { name: "Share invite on WhatsApp" });
  await share.waitFor({ timeout: 60_000 });
  const text = decodeURIComponent((await share.getAttribute("href"))?.split("text=")[1] ?? "");
  const link = /https?:\/\/\S+\/invite\/[0-9a-f]{32}#k=(?:0x)?[0-9a-f]{64}/.exec(text)?.[0];
  if (!link)
    throw new Error(`no invite link in: ${JSON.stringify(await share.getAttribute("href"))}`);
  return link.replace(/^https?:\/\/[^/]+/, BASE_URL);
}

/** B1 (Mama's side): open the link, accept, create her own passkey, land on parent home. */
export async function acceptInvite(mama: Profile, link: string): Promise<void> {
  await mama.page.goto(link);
  await mama.page.getByRole("button", { name: "Accept and create a passkey" }).click();
  await mama.page.waitForURL("**/app/parent", { timeout: 60_000 });
}

/** Raka and Mama linked, as most cases start. */
export async function linkedPair(raka: Profile, mama: Profile, split?: number[]): Promise<bigint> {
  const accountId = await signUpStudent(raka, "Raka", split);
  await acceptInvite(mama, await makeInvite(raka));
  mama.known.accountId ??= accountId;
  return accountId;
}

/** C1 or C2: Mama sends rupiah; Simulate payment, or a signed sandbox webhook. */
export async function sendAllowance(
  mama: Profile,
  rupiah = 16_500_000,
  via: "simulate" | "webhook" = "simulate",
): Promise<string> {
  const { page } = mama;
  const orderId = await startOrder(mama, rupiah);
  if (via === "simulate") {
    await page.getByRole("button", { name: "Simulate payment (test mode)" }).click();
  } else {
    await control(PORTS.midtrans, { orderId, status: "settlement" });
    const r = await sendWebhook({
      orderId,
      grossAmount: `${String(rupiah)}.00`,
      transactionStatus: "settlement",
    });
    expect(r.status).toBe(200);
  }
  await expect(page.getByRole("heading", { name: "Allowance sent" })).toBeVisible({
    timeout: 90_000,
  });
  return orderId;
}

/** Mama's order up to the "Waiting for payment" screen; returns the order id. */
export async function startOrder(mama: Profile, rupiah = 16_500_000): Promise<string> {
  const { page } = mama;
  await go(mama, "/app/parent/send?change=1");
  await page.getByLabel(/^Amount for /).fill(String(rupiah));
  const toOrder = /\/app\/parent\/send\/[0-9a-f]{32}$/;
  // WebKit sometimes loses a tap made while the screen re-renders; tap again if nothing happened.
  for (let i = 0; i < 2 && !toOrder.test(page.url()); i++) {
    await page.getByRole("button", { name: /^Continue to pay/ }).click();
    await page.waitForURL(toOrder, { timeout: 20_000 }).catch(() => undefined);
  }
  await page.waitForURL(toOrder, { timeout: 40_000 });
  return page.url().split("/").pop() ?? "";
}

/** S19-11: waits until the indexer has the chain's newest block (max 30 s), else fails with the gap. */
export async function waitForIndexer(): Promise<void> {
  const head = Number(await chain.getBlockNumber());
  await expect
    .poll(async () => (await indexerMeta())?.progressBlock ?? -1, {
      timeout: 30_000,
      message: `indexer behind the chain (head ${String(head)})`,
    })
    .toBeGreaterThanOrEqual(head);
}

/** Every Deposited event for this account, oldest first. */
export async function deposits(accountId: bigint) {
  const logs = await chain.getContractEvents({
    address: contract(),
    abi: amplopEnvelopesAbi,
    eventName: "Deposited",
    args: { accountId },
    fromBlock: 0n,
  });
  return logs.map((l) => l.args as { amount: bigint; parts: readonly bigint[] });
}

/** Every event of this name for this account, oldest first (E13, F2, G1…). */
export async function accountEvents(accountId: bigint, eventName: string) {
  const logs = await chain.getContractEvents({
    address: contract(),
    abi: amplopEnvelopesAbi,
    eventName: eventName as "Deposited",
    args: { accountId },
    fromBlock: 0n,
  });
  return logs.map((l) => l.args as Record<string, unknown>);
}

/** S19-9: a Midtrans notification signed with the sandbox key, or with `signatureKey` to test C4. */
export async function sendWebhook(o: {
  orderId: string;
  grossAmount: string;
  transactionStatus: string;
  statusCode?: string;
  signatureKey?: string;
}): Promise<Response> {
  const statusCode = o.statusCode ?? "200";
  const signature =
    o.signatureKey ??
    createHash("sha512")
      .update(o.orderId + statusCode + o.grossAmount + MIDTRANS_KEY)
      .digest("hex");
  return fetch(`${BASE_URL}/api/midtrans/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      order_id: o.orderId,
      status_code: statusCode,
      gross_amount: o.grossAmount,
      signature_key: signature,
      transaction_status: o.transactionStatus,
      payment_type: "bank_transfer",
    }),
  });
}

/** E1 and friends: pay at a demo shop; returns the result screen's purchase id. */
export async function pay(raka: Profile, shop: string, amount?: string): Promise<string> {
  const { page } = raka;
  await go(raka, `/app/card/pay?shop=${shop}`);
  if (amount !== undefined) await page.getByLabel("Amount").fill(amount);
  await page.getByRole("button", { name: "Pay with card" }).click();
  await page.waitForURL(/\/app\/card\/result\/[0-9a-f]{32}/, { timeout: 60_000 });
  return new URL(page.url()).pathname.split("/").pop() ?? "";
}

/** S19-10: time moves only through Skip time in Settings. */
export async function skip(p: Profile, kind: "monday" | "48h"): Promise<void> {
  const { page } = p;
  const accountId = await p.accountId();
  if (accountId === null) throw new Error(`${p.name} has no account to skip`);
  const clock = () =>
    chain.readContract({
      address: contract(),
      abi: amplopEnvelopesAbi,
      functionName: "clock",
      args: [accountId],
    });
  const before = await clock();
  await go(p, "/app/settings");
  await page.getByRole("button", { name: "Skip", exact: true }).click();
  await page
    .getByRole("button", { name: kind === "monday" ? /^Skip to next Monday/ : /^Skip 48 hours/ })
    .click();
  // The contract's clock is the proof; the screen may move on (I1: the account leaves this passkey).
  // The clock also creeps forward with every block, so wait for the jump itself.
  const jump = kind === "48h" ? 172_800n : 86_400n;
  await expect.poll(clock, { timeout: 60_000 }).toBeGreaterThanOrEqual(before + jump);
  const close = page.getByRole("button", { name: "Close" });
  if (await close.isVisible()) await close.click();
}

/** Student home; taps through "Allowance arrived" when a new deposit sends the app there first. */
export async function home(p: Profile): Promise<void> {
  await go(p, "/app");
  const arrived = p.page.getByRole("link", { name: "See my envelopes" });
  const first = p.page.getByTestId("home-available-0");
  await expect(arrived.or(first)).toBeVisible({ timeout: 30_000 });
  await p.page.waitForLoadState("networkidle");
  // The arrival is marked seen once shown, so opening /app again lands on home (and signs in if a
  // tap before hydration made it a full page load).
  if (await arrived.isVisible()) await go(p, "/app");
  await first.waitFor();
}

/** K1: switch to the other profile on this device (Settings for a student, parent home for Mama). */
export async function viewAs(p: Profile, who: "Mama" | "Raka"): Promise<void> {
  const { page } = p;
  if (who === "Mama") {
    await go(p, "/app/settings");
    await page.getByRole("button", { name: "Switch" }).click();
    await page.waitForURL("**/app/parent", { timeout: 60_000 });
  } else {
    await go(p, "/app/parent");
    await page.getByRole("button", { name: /^Demo only: view as/ }).click();
    await page.waitForURL(/\/app$/, { timeout: 60_000 });
  }
}

/** S19-12: what each screen shows equals what the contract says, and the contract agrees with itself. */
export async function expectMoneyAgrees(o: {
  raka: Profile;
  mama?: Profile;
  accountId: bigint;
}): Promise<void> {
  const list = await envelopes(o.accountId);
  const t = await totals(o.accountId);
  for (let i = 0; i < 4; i++) {
    const e = list[i] as EnvelopeView;
    expect(t[i], `total ${NAMES[i] ?? ""}`).toBe(e.available + e.unreleased);
  }
  const em = list[4] as EnvelopeView;
  expect(t[4], "total Emergency").toBe(em.locked + em.available);

  const { page } = o.raka;
  await home(o.raka);
  for (let i = 0; i < 4; i++) {
    const e = list[i] as EnvelopeView;
    await expect(page.getByTestId(`home-available-${String(i)}`), NAMES[i]).toHaveText(
      usd(e.available),
    );
    if (e.unreleased > 0n)
      await expect(page.getByTestId(`home-footer-${String(i)}`)).toContainText(usd(e.unreleased));
  }
  await expect(page.getByTestId("home-available-4")).toHaveText(usd(em.locked));
  await expectTxProof(page);

  if (o.mama) {
    await go(o.mama, "/app/parent");
    for (let i = 0; i < 5; i++)
      await expect(
        o.mama.page.getByTestId(`parent-total-${String(i)}`),
        `parent ${NAMES[i] ?? ""}`,
      ).toHaveText(usd(t[i] ?? 0n));
  }
}

/** S19-13 (L2): every proof link on the page opens a successful transaction of this contract. */
export async function expectTxProof(
  page: Profile["page"],
  expected?: { event: string; amount?: bigint },
): Promise<number> {
  const links = page.getByTestId("tx-proof");
  const n = await links.count();
  for (let i = 0; i < n; i++) {
    const href = (await links.nth(i).getAttribute("href")) ?? "";
    expect(href).toMatch(new RegExp(`^${EXPLORER_TX.replace(/[.]/g, "\\.")}0x[0-9a-f]{64}$`));
    const hash = href.split("/").pop() as Hash;
    const receipt = await chain.getTransactionReceipt({ hash });
    expect(receipt.status).toBe("success");
    expect(receipt.to?.toLowerCase()).toBe(contract().toLowerCase());
    if (expected) {
      const events = receipt.logs.flatMap((l) => {
        try {
          return [decodeEventLog({ abi: amplopEnvelopesAbi, data: l.data, topics: l.topics })];
        } catch {
          return [];
        }
      });
      const ev = events.find((e) => e.eventName === expected.event);
      expect(ev, `${expected.event} in ${hash}`).toBeTruthy();
      if (expected.amount !== undefined)
        expect((ev?.args as { amount?: bigint } | undefined)?.amount).toBe(expected.amount);
    }
    expect((await fetch(href)).status).toBe(200);
  }
  return n;
}
