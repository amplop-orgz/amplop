// Spec 14 unit tests: alert wording and order, the low-envelope rule and the rupiah total.
// Times are shown in the viewer's zone; the tests pin it.
process.env.TZ = "UTC";
import { EmergencyStatus } from "@amplop/shared/enums";
import type { AlertRow } from "@amplop/shared/indexer";
import { mondayNumber, type Schedule } from "@amplop/shared/schedule";
import { describe, expect, it } from "vitest";
import { rupiahTotal } from "@/components/parent/ParentHome";
import type { AccountInfo } from "@/lib/client/chain/client";
import type { EmergencyInfo } from "@/lib/client/emergency";
import { format } from "@/lib/client/i18n";
import { buildAlerts, lowEnvelopeAlerts, type ParentData } from "@/lib/client/parent";

const usd = (n: number) => BigInt(Math.round(n * 100)) * 10_000n;
const t = (k: string, v?: Record<string, string | number>) => format("en", k, v);
const WED = 20_733; // Wed 7 Oct 2026
const at = (day: number, h = 14, m = 5) => BigInt(day * 86_400 + h * 3600 + m * 60);

const record: Schedule = {
  startMonday: mondayNumber(20_724),
  sharesOut: 2,
  base: [usd(100), usd(37.5), usd(37.5), usd(50)],
  part: [usd(400), usd(150), usd(150), usd(200)],
};
const env = (everyday: number) =>
  [usd(59), usd(70), usd(80), usd(everyday), 0n].map((available) => ({
    available,
    unreleased: 0n,
    held: 0n,
    locked: 0n,
  }));

function data(over: Partial<ParentData> = {}): ParentData {
  return {
    totals: [0n, 0n, 0n, 0n, 0n],
    envelopes: env(50),
    nextReleaseDay: 20_738n,
    info: { lockOn: true, everDeposited: true } as unknown as AccountInfo,
    clock: at(WED, 16),
    schedules: [record],
    em: { status: EmergencyStatus.None, requestSeq: 0n } as EmergencyInfo,
    removal: { active: false, readyAt: 0n },
    decimals: 6,
    ...over,
  };
}

let n = 0;
function alert(kind: AlertRow["kind"], over: Partial<AlertRow> = {}): AlertRow {
  n++;
  return {
    id: `${String(n)}-0`,
    kind,
    status: "Active",
    accountClock: String(at(WED, 9 + n)),
    sortKey: String(n * 100_000),
    readyAt: String(at(WED + 2)),
    requestSeq: null,
    shopType: null,
    fromEnvelope: null,
    toEnvelope: null,
    ...over,
  } as AlertRow;
}

const lines = (d: ParentData, alerts: AlertRow[], linkMissing = false) =>
  buildAlerts({ d, alerts, name: "Raka", t, lang: "en", linkMissing });

describe("alert wording (S14-10)", () => {
  it("has one line per kind, cancelled variants, and hides replaced alerts", () => {
    const out = lines(data(), [
      alert("PurchaseBlocked", { shopType: 7995 }),
      alert("PurchaseBlocked", { shopType: 1234 }),
      alert("PurchaseMoved", { fromEnvelope: "Everyday", toEnvelope: "Study" }),
      alert("EmergencyRequested", { status: "Done", requestSeq: "1" }),
      alert("EmergencyRequested", { status: "Cancelled", requestSeq: "2" }),
      alert("SplitSaved", { status: "Replaced" }),
      alert("SplitSaved"),
      alert("LockOffStarted", { status: "Cancelled" }),
      alert("TrustedRemovalStarted"),
      alert("RecoveryApproved"),
    ]);
    expect(out.map((l) => [l.title, l.sub])).toEqual([
      ["Raka's account is moving to a new passkey", "Today 19:05 · moves Fri, 9 Oct at 14:05"],
      [
        "Raka asked to remove you as trusted person",
        "Today 18:05 · takes effect Fri, 9 Oct at 14:05",
      ],
      ["Raka is switching the Emergency lock off", "Today 17:05 · cancelled"],
      ["Raka saved a new split", "Today 16:05 · starts Fri, 9 Oct at 14:05"],
      ["Raka asks to open Emergency", "Today 14:05 · cancelled"],
      ["Raka asks to open Emergency", "Today 13:05 · opened"],
      ["Raka moved a purchase from Everyday to Study", "Today 12:05"],
      ["A blocked purchase was declined", "Today 11:05 · no money was taken"],
      ["A gambling purchase was declined", "Today 10:05 · no money was taken"],
    ]);
    expect(JSON.stringify(out)).not.toMatch(/Gambling site|Bookshop/);
  });

  it("pins the open Emergency request first, once, and says when its link is missing", () => {
    const d = data({
      em: {
        status: EmergencyStatus.Open,
        requestSeq: 3n,
        requestedAt: at(WED, 8),
      } as EmergencyInfo,
      envelopes: env(9),
    });
    const out = lines(d, [
      alert("EmergencyRequested", { requestSeq: "3" }),
      alert("PurchaseMoved", { fromEnvelope: "Everyday", toEnvelope: "Food" }),
    ]);
    expect(out.map((l) => l.kind)).toEqual(["EmergencyRequested", "PurchaseMoved", "low"]);
    expect(out[0]?.sub).toBe("Today 08:05 · tap to answer");
    expect(lines(d, [], true)[0]?.sub).toBe("Today 08:05 · open the link Raka sent");
  });

  it("builds the removal row from the contract when the indexer has none", () => {
    const d = data({ removal: { active: true, readyAt: at(WED + 2) } });
    expect(lines(d, [])[0]?.title).toBe("Raka asked to remove you as trusted person");
    expect(
      lines(d, [alert("TrustedRemovalStarted")]).filter((l) => l.kind === "TrustedRemovalStarted"),
    ).toHaveLength(1);
  });
});

describe("low-envelope alert (S14-11, J3)", () => {
  it("shows under 20% only, rounds down, and says empty at 0%", () => {
    expect(
      lowEnvelopeAlerts(data({ envelopes: env(9) }), t, "en").map((l) => [l.title, l.sub]),
    ).toEqual([["Everyday has 18% left this week", "Next release Mon, 12 Oct"]]);
    expect(lowEnvelopeAlerts(data({ envelopes: env(10) }), t, "en")).toEqual([]);
    expect(lowEnvelopeAlerts(data({ envelopes: env(0) }), t, "en")[0]?.title).toBe(
      "Everyday is empty this week",
    );
    expect(lowEnvelopeAlerts(data({ envelopes: env(0), schedules: [] }), t, "en")).toEqual([]);
    expect(
      lowEnvelopeAlerts(data({ envelopes: env(9), nextReleaseDay: 0n }), t, "en")[0]?.sub,
    ).toBe("No more shares are due");
  });
});

describe("rupiah total (S14-6)", () => {
  it("shows millions with one decimal, or the rounded rupiah", () => {
    expect(rupiahTotal([usd(659.86)], 6, "en")).toEqual({
      compact: "Rp10,9 million",
      rounded: "Rp10.888.000",
    });
    expect(rupiahTotal([usd(50)], 6, "en").compact).toBe("Rp825.000");
    expect(rupiahTotal([usd(659.86)], 6, "id").compact).toBe("Rp10,9 juta");
  });
});
