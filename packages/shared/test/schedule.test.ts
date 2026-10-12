import { describe, expect, it } from "vitest";
import { formatShopAmount, formatUsd, shopAmountToUnits, usdCentsToUnits } from "../src/money";
import {
  daysToNextMonday,
  mondayDay,
  mondayNumber,
  nextRelease,
  shareAmount,
  sharesOutAt,
  weekdayIndex,
  type Schedule,
} from "../src/schedule";

const day = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d) / 86_400_000;
const usd = (n: number) => BigInt(Math.round(n * 100)) * 10_000n;

// The board's allowance: $1.000 on Mon 28 Sep split 40/15/15/20 (Emergency has no weekly share).
const record: Schedule = {
  startMonday: mondayNumber(day(2026, 9, 28)),
  sharesOut: 2,
  base: [usd(100), usd(37.5), usd(37.5), usd(50)],
  part: [usd(400), usd(150), usd(150), usd(200)],
};

describe("release maths (11 S11-1)", () => {
  it("knows weekdays and Mondays", () => {
    expect(weekdayIndex(day(2026, 10, 12))).toBe(0);
    expect(weekdayIndex(day(2026, 10, 7))).toBe(2);
    expect(weekdayIndex(day(2026, 10, 11))).toBe(6);
    expect(mondayDay(mondayNumber(day(2026, 10, 7)))).toBe(day(2026, 10, 5));
  });
  it("gives the board's next release: Mon 12 Oct, $225,00", () => {
    const today = day(2026, 10, 7);
    expect(sharesOutAt(record, today)).toBe(2);
    const next = nextRelease([record], today);
    expect(next?.day).toBe(day(2026, 10, 12));
    expect(formatUsd(next?.total ?? 0n, 6)).toBe("$225,00");
    expect(next?.perEnvelope[3]).toBe(usd(50));
  });
  it("puts the rounding remainder in share 4 and stops after it", () => {
    const odd: Schedule = { ...record, base: [33n, 0n, 0n, 0n], part: [100n, 0n, 0n, 0n] };
    expect(shareAmount(odd, 0, 3)).toBe(33n);
    expect(shareAmount(odd, 0, 4)).toBe(1n);
    expect(nextRelease([record], day(2026, 10, 19))).toBeNull();
    expect(nextRelease([], day(2026, 10, 19))).toBeNull();
  });
  it("skips to the next Monday: 7 on a Monday, 1 on a Sunday (15 S15-10)", () => {
    expect([12, 13, 14, 18].map((d) => daysToNextMonday(day(2026, 10, d)))).toEqual([7, 6, 5, 1]);
  });
});

describe("shop currencies (09 S09-11)", () => {
  it("converts each currency, rounding down", () => {
    expect(shopAmountToUnits("EUR", 1250n, 6)).toBe(14_388_750n);
    expect(shopAmountToUnits("EUR", 1n, 6)).toBe(11_511n);
    expect(shopAmountToUnits("USD", 500n, 6)).toBe(5_000_000n);
    expect(usdCentsToUnits(1n, 6)).toBe(10_000n);
    expect(shopAmountToUnits("IDR", 16_500n, 6)).toBe(1_000_000n);
    expect(shopAmountToUnits("IDR", 1n, 6)).toBe(60n);
    expect(shopAmountToUnits("IDR", 1n, 0)).toBe(0n);
  });
  it("shows a shop's own price", () => {
    expect([
      formatShopAmount("EUR", 1250n),
      formatShopAmount("USD", 500n),
      formatShopAmount("IDR", 16_500n),
    ]).toEqual(["€12,50", "$5,00", "Rp16.500"]);
  });
});

describe("home and envelope maths (11 S11-1 to S11-3)", () => {
  const wed = day(2026, 10, 7);
  it("counts weeks of the newest allowance and hides after share 4 (D6)", async () => {
    const { weekCounter } = await import("../src/schedule");
    expect(weekCounter([], wed)).toBeNull();
    expect(weekCounter([record], day(2026, 9, 28))).toBe(1);
    expect(weekCounter([record], wed)).toBe(2);
    expect(weekCounter([record], day(2026, 10, 25))).toBe(4);
    expect(weekCounter([record], day(2026, 10, 26))).toBeNull();
  });
  it("dates share 1 to its arrival week's Monday and later shares to their Mondays", async () => {
    const { releaseDay } = await import("../src/schedule");
    const sunday: Schedule = { ...record, startMonday: mondayNumber(day(2026, 10, 4)) };
    expect(releaseDay(sunday, 1)).toBe(day(2026, 9, 28));
    expect(releaseDay(sunday, 2)).toBe(day(2026, 10, 5)); // D3: the day after a Sunday arrival
    expect(releaseDay(record, 4)).toBe(day(2026, 10, 19));
  });
  it("sums this week's shares across overlapping allowances (C14)", async () => {
    const { thisWeekShare } = await import("../src/schedule");
    expect(thisWeekShare([record], wed, 0)).toBe(usd(100));
    const second: Schedule = { ...record, startMonday: mondayNumber(wed) };
    expect(thisWeekShare([record, second], wed, 0)).toBe(usd(200));
    expect(thisWeekShare([record], day(2026, 10, 26), 0)).toBe(0n);
  });
  it("puts the board's pace tick at 57%: Food on plan, Everyday spending fast", async () => {
    const { barPercent, isSpendingFast, pace, paceTick } = await import("../src/schedule");
    const p = pace([record], wed);
    if (!p) throw new Error("no pace");
    expect(p).toEqual({ periodStart: day(2026, 10, 5), periodEnd: day(2026, 10, 12) });
    expect(Math.round(paceTick(p, wed) * 100)).toBe(57);
    expect(barPercent(usd(59), usd(100))).toBe(59);
    expect(isSpendingFast(usd(59), usd(100), p, wed)).toBe(false);
    expect(barPercent(usd(9), usd(50))).toBe(18);
    expect(isSpendingFast(usd(9), usd(50), p, wed)).toBe(true);
    expect(paceTick(p, day(2026, 10, 11))).toBe(0);
    expect(barPercent(usd(150), usd(100))).toBe(100);
    expect(barPercent(usd(1), 0n)).toBeNull();
    expect(pace([record], day(2026, 10, 26))).toBeNull();
  });
  it("always adds the four shares up to the part (fuzz)", () => {
    for (let i = 0; i < 1000; i++) {
      const part = BigInt(Math.floor(Math.random() * 1e12));
      const r: Schedule = { startMonday: 0, sharesOut: 0, base: [part / 4n], part: [part] };
      expect([1, 2, 3, 4].reduce((s, k) => s + shareAmount(r, 0, k), 0n)).toBe(part);
    }
    const tiny: Schedule = { startMonday: 0, sharesOut: 0, base: [2n], part: [10n] };
    expect([1, 2, 3, 4].map((k) => shareAmount(tiny, 0, k))).toEqual([2n, 2n, 2n, 4n]);
  });
});

describe("shop kinds (11 S11-30)", () => {
  it("labels known codes and falls back for others", async () => {
    const { shopKind } = await import("../src/mcc");
    expect(shopKind(5942)).toEqual({
      label: "Bookshop",
      plural: "Bookshops",
      category: "bookshop",
    });
    expect(shopKind(5542).label).toBe("Fuel station");
    expect(shopKind(1234)).toEqual({ label: "Card purchase", plural: null, category: "other" });
  });
});
