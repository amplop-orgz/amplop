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
