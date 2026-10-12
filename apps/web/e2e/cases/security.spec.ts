// S19-14: browser-level security checks, run with Tier 1. The dialog and CSP guards in fixtures.ts do
// the "no dialog, no violation" half of SEC1 in every test.
import { expect, test } from "../support/fixtures";
import type { Profile } from "../support/fixtures";
import {
  acceptInvite,
  askEmergency,
  go,
  makeInvite,
  sendAllowance,
  signUpStudent,
} from "../support/helpers";

const INJECTED = ["<script>alert(1)</script>", '"><img src=x onerror=alert(1)>'];

for (const [n, s] of INJECTED.entries()) {
  test(`SEC1 Injected text shows as text, string ${String(n + 1)} @tier1`, async ({
    raka,
    mama,
  }) => {
    await signUpStudent(raka, s);
    await acceptInvite(mama, await makeInvite(raka, s));
    await sendAllowance(mama);
    const link = await askEmergency(raka, "10", s, s.split(" ")[0]);
    const shows = async (p: Profile, path: string, text = s) => {
      await go(p, path);
      await expect(p.page.getByText(text).first()).toBeVisible({ timeout: 30_000 });
    };
    await shows(raka, "/app");
    await shows(raka, "/app/settings");
    await shows(raka, "/app/emergency");
    // Parent home names the student by their first word (14).
    await shows(mama, "/app/parent", s.split(" ")[0]);
    await shows(mama, link ?? "");
  });
}

test("SEC2 The invite key never leaves the browser @tier1", async ({ raka, mama }) => {
  const seen: { url: string; headers: Record<string, string>; body: string }[] = [];
  for (const p of [raka, mama])
    p.context.on("request", (r) => {
      seen.push({ url: r.url(), headers: r.headers(), body: r.postData() ?? "" });
    });
  await signUpStudent(raka);
  const link = await makeInvite(raka);
  await acceptInvite(mama, link);
  const key = /#k=(?:0x)?([0-9a-f]{64})/.exec(link)?.[1];
  if (!key) throw new Error("no key in the invite link");
  for (const r of seen) {
    const all = `${r.url} ${JSON.stringify(r.headers)} ${r.body}`.toLowerCase();
    expect(all.includes(key), `key sent in ${r.url}`).toBe(false);
    expect(r.headers.referer ?? "", `fragment in Referer of ${r.url}`).not.toContain("#k=");
  }
});

// SEC3 runs in the global teardown (support/log-scan.ts), after every run and in every shard.
