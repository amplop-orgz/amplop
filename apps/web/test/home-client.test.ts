// Unit tests for the browser side of spec 11: the Emergency tile, activity rows, badges, the move
// rule and the rupiah reference.
import { EmergencyStatus } from "@amplop/shared/enums";
import type { ActivityResult, PurchaseRow } from "@amplop/shared/indexer";
import { describe, expect, it } from "vitest";
import { chargedNow, purchaseBadge } from "@/components/activity/Activity";
import { moveAmount } from "@/components/activity/PurchaseDetail";
import { emergencyTileState, rupiahAbout } from "@/components/home/Home";
import { apiPurchaseId, buildRows } from "@/lib/client/activity";
import type { AccountInfo } from "@/lib/client/chain/client";
import type { EmergencyInfo } from "@/lib/client/emergency";
import type { EnvelopeView } from "@/lib/client/home";

const usd = (n: number) => BigInt(Math.round(n * 100)) * 10_000n;
const ZERO = "0x0000000000000000000000000000000000000000";
const env = (locked: bigint): EnvelopeView[] =>
  [0, 1, 2, 3, 4].map((i) => ({
    available: 0n,
    unreleased: 0n,
    held: 0n,
    locked: i === 4 ? locked : 0n,
  }));

describe("Emergency tile (S11-9)", () => {
  const info = {
    lockOn: true,
    trusted: "0x00000000000000000000000000000000000000bb",
  } as unknown as AccountInfo;
  const em = { status: EmergencyStatus.None } as EmergencyInfo;
  it("checks each state in order", () => {
    expect(emergencyTileState({ info: { ...info, lockOn: false }, em, envelopes: env(0n) })).toBe(
      "lockOff",
    );
    expect(
      emergencyTileState({
        info,
        em: { ...em, status: EmergencyStatus.Open },
        envelopes: env(usd(100)),
      }),
    ).toBe("open");
    expect(emergencyTileState({ info, em, envelopes: env(0n) })).toBe("empty");
    expect(
      emergencyTileState({ info: { ...info, trusted: ZERO }, em, envelopes: env(usd(100)) }),
    ).toBe("alone");
    expect(emergencyTileState({ info, em, envelopes: env(usd(100)) })).toBe("needs");
  });
});

describe("rupiah reference (S11-7)", () => {
  it("rounds to the nearest Rp500", () => {
    expect(rupiahAbout(usd(124.25), 6)).toBe("Rp2.050.000");
    expect(rupiahAbout(usd(59), 6)).toBe("Rp973.500");
  });
});

const purchase = (over: Partial<PurchaseRow>): PurchaseRow =>
  ({
    id: `0x${"0".repeat(32)}${"ab".repeat(16)}`,
    status: "Held",
    held: "1000",
    collected: "0",
    refunded: "0",
    sortKey: "500000",
    accountClock: String(20_733 * 86_400 + 3600),
    ...over,
  }) as PurchaseRow;

describe("activity rows (S11-15 to S11-17)", () => {
  it("adds due weekly releases, sorts newest first and groups by account-clock day", () => {
    const r: ActivityResult = {
      Deposit: [
        {
          id: "0xdep",
          parts: ["400000000", "150000000", "150000000", "200000000", "100000000"],
          startDay: "20724", // Mon 28 Sep
          sortKey: "100000",
          accountClock: String(20_724 * 86_400),
        } as ActivityResult["Deposit"][number],
      ],
      Purchase: [purchase({})],
      EmergencyRequest: [],
    };
    const rows = buildRows(r, 20_733); // Wed 7 Oct: week 2 released Mon 5 Oct, week 3 not yet
    expect(rows.map((x) => [x.kind, x.day])).toEqual([
      ["purchase", 20_733],
      ["release", 20_731],
      ["deposit", 20_724],
    ]);
    const release = rows[1];
    expect(release?.kind === "release" && release.amount).toBe(usd(225));
  });

  it("shows what a purchase costs now and its badge", () => {
    expect(chargedNow(purchase({}))).toBe(1000n);
    expect(chargedNow(purchase({ status: "Refunded", collected: "1000", refunded: "1000" }))).toBe(
      0n,
    );
    expect(chargedNow(purchase({ status: "Released", held: "0" }))).toBe(0n);
    expect(purchaseBadge({ status: "Held" })).toEqual({ kind: "wait", key: "activity.onHold" });
    expect(purchaseBadge({ status: "Declined" }).kind).toBe("bad");
    expect(apiPurchaseId(purchase({}).id)).toBe("ab".repeat(16));
  });
});

describe("move rule (S11-23, F5 to F8)", () => {
  const base = {
    accountId: 1n,
    envelope: 3,
    amount: 100n,
    held: 100n,
    collected: 0n,
    refunded: 0n,
    shopType: 5942,
    createdAt: 1000n,
    state: 1,
    moved: false,
    everydayStepIn: false,
  };
  it("moves only Everyday purchases, once, within 7 days, with something left", () => {
    expect(moveAmount(base, 1000n)).toBe(100n);
    expect(moveAmount({ ...base, state: 2, held: 0n, collected: 80n, refunded: 10n }, 1000n)).toBe(
      70n,
    );
    expect(moveAmount({ ...base, envelope: 0 }, 1000n)).toBe(0n);
    expect(moveAmount({ ...base, moved: true }, 1000n)).toBe(0n);
    expect(moveAmount(base, 1000n + 7n * 86_400n)).toBe(0n);
    expect(moveAmount({ ...base, state: 3 }, 1000n)).toBe(0n);
    expect(moveAmount({ ...base, state: 0 }, 1000n)).toBe(0n);
  });
});
