import { describe, expect, it } from "vitest";
import {
  eurMinorToUnits,
  formatEur,
  formatPercent,
  formatRupiah,
  formatRupiahCompact,
  formatRupiahRounded,
  formatUsd,
  parseDecimalInput,
  rupiahToUnits,
} from "../src/money";
import { graphemeCount, normalizeName, shortName } from "../src/names";
import {
  accountClockNow,
  dayNumber,
  formatDay,
  formatDayTime,
  formatDuration,
  formatMonthYear,
  formatRelative,
  mondayNumber,
} from "../src/dates";
import { zAccountId, zAddress, zHex32, zPlainText, zUnits } from "../src/schemas";

describe("money (S06-32)", () => {
  it("formats dollars with a dot for thousands and a comma for cents", () => {
    expect(formatUsd(1_000_000_000n, 6)).toBe("$1.000,00");
    expect(formatUsd(14_388_750n, 6)).toBe("$14,39");
    expect(formatUsd(14_385_000n, 6)).toBe("$14,39");
    expect(formatUsd(14_384_999n, 6)).toBe("$14,38");
    expect(formatUsd(5_000n, 6)).toBe("$0,01");
    expect(formatUsd(0n, 6)).toBe("$0,00");
    expect(formatUsd(50_000_000_000_000n, 6)).toBe("$50.000.000,00");
    expect(formatUsd(-14_388_750n, 6)).toBe("−$14,39");
    expect(formatUsd(150n, 1)).toBe("$15,00");
  });

  it("formats rupiah, rounded and compact", () => {
    expect(formatRupiah(16_500_000n)).toBe("Rp16.500.000");
    expect(formatRupiah(-500n)).toBe("−Rp500");
    expect(formatRupiahRounded(2_050_125n)).toBe("Rp2.050.000");
    expect(formatRupiahRounded(2_050_500n)).toBe("Rp2.051.000");
    expect(formatRupiahCompact(10_887_690n, "en")).toBe("Rp10,9 million");
    expect(formatRupiahCompact(10_887_690n, "id")).toBe("Rp10,9 juta");
    expect(formatRupiahCompact(10_000_000n, "en")).toBe("Rp10 million");
    expect(formatRupiahCompact(2_500_000_000n, "en")).toBe("Rp2,5 billion");
    expect(formatRupiahCompact(2_500_000_000n, "id")).toBe("Rp2,5 miliar");
    expect(formatRupiahCompact(950_400n, "en")).toBe("Rp950.000");
  });

  it("formats euros and percentages", () => {
    expect(formatEur(1250n)).toBe("€12,50");
    expect(formatEur(123_456n)).toBe("€1.234,56");
    expect(formatPercent(40)).toBe("40%");
  });

  it("converts with the sample rates, rounding down (01 section 8)", () => {
    expect(rupiahToUnits(16_500_000n, 6)).toBe(1_000_000_000n);
    expect(rupiahToUnits(1n, 6)).toBe(60n);
    expect(eurMinorToUnits(1250n, 6)).toBe(14_388_750n);
    expect(eurMinorToUnits(1n, 6)).toBe(11_511n);
  });

  it("parses typed amounts", () => {
    const ok = (t: string, d = 2) => {
      const r = parseDecimalInput(t, d);
      return r.ok ? r.minor : r.reason;
    };
    expect(ok("12,50")).toBe(1250n);
    expect(ok("12.50")).toBe(1250n);
    expect(ok("12.5")).toBe(1250n);
    expect(ok("1.234,56")).toBe(123456n);
    expect(ok("1.234")).toBe(123400n);
    expect(ok("12")).toBe(1200n);
    expect(ok("12,505")).toBe("too_precise");
    expect(ok("-1")).toBe("invalid");
    expect(ok("")).toBe("empty");
    expect(ok("abc")).toBe("invalid");
    expect(ok("1,2,3")).toBe("invalid");
    expect(ok("12,")).toBe("invalid");
    expect(ok("1,2.3")).toBe("invalid");
    expect(ok(".")).toBe("invalid");
    expect(ok("1.500.000", 0)).toBe(1_500_000n);
    expect(ok("1.50", 0)).toBe(150n);
  });
});

describe("names (S06-31)", () => {
  it("normalises, trims and collapses white space", () => {
    expect(normalizeName("  Raka   Pratama ")).toEqual({ ok: true, value: "Raka Pratama" });
    expect(normalizeName("")).toEqual({ ok: false, reason: "empty" });
    expect(normalizeName("    ")).toEqual({ ok: false, reason: "empty" });
  });

  it("counts graphemes, 60 allowed and 61 refused", () => {
    expect(normalizeName("a".repeat(60)).ok).toBe(true);
    expect(normalizeName("a".repeat(61))).toEqual({ ok: false, reason: "too_long" });
    expect(graphemeCount("👨‍👩‍👧")).toBe(1);
    expect(normalizeName("👨‍👩‍👧".repeat(60)).ok).toBe(true);
  });

  it("accepts any script and markup as plain text", () => {
    expect(normalizeName("ꦫꦏ").ok).toBe(true);
    expect(normalizeName("رَاكَا").ok).toBe(true);
    expect(normalizeName("<script>alert(1)</script>")).toEqual({
      ok: true,
      value: "<script>alert(1)</script>",
    });
  });

  it("refuses control, separator and bidi characters", () => {
    for (const bad of ["Ra\u202Eka", "Ra\u2066ka", "Ra\u0000ka", "Ra\nka", "Ra\u2028ka"]) {
      expect(normalizeName(bad)).toEqual({ ok: false, reason: "bad_chars" });
    }
  });

  it("takes the first word as the short name", () => {
    expect(shortName("Raka Pratama")).toBe("Raka");
    expect(shortName("Raka")).toBe("Raka");
  });
});

describe("dates (S06-33)", () => {
  const MON_12_OCT = Date.UTC(2026, 9, 12, 0, 0) / 1000;

  it("counts days and Mondays as 01 section 1 does", () => {
    expect(dayNumber(MON_12_OCT)).toBe(20738);
    expect(mondayNumber(dayNumber(MON_12_OCT))).toBe(2963);
    expect(mondayNumber(dayNumber(MON_12_OCT) - 1)).toBe(2962); // Sunday is the week before
  });

  it("follows the account clock, not the device clock", () => {
    expect(accountClockNow(1000n, 5000, 7500)).toBe(1002);
    expect(accountClockNow(1000n, 5000, 5000 + 86_400_000)).toBe(1000 + 86400);
  });

  it("formats days in both languages", () => {
    expect(formatDay(MON_12_OCT, "en")).toBe("Mon, 12 Oct");
    expect(formatDay(MON_12_OCT, "id")).toBe("Sen, 12 Okt");
  });

  it("formats moments in the given time zone", () => {
    const wed = Date.UTC(2026, 9, 7, 14, 5) / 1000;
    expect(formatDayTime(wed, "en", "UTC")).toBe("Wed, 7 Oct at 14:05");
    expect(formatDayTime(wed, "id", "UTC")).toBe("Rab, 7 Okt pukul 14.05");
    expect(formatDayTime(wed, "en", "Asia/Jakarta")).toBe("Wed, 7 Oct at 21:05");
  });

  it("says Today and Yesterday at the day boundary", () => {
    const now = Date.UTC(2026, 9, 12, 0, 30) / 1000;
    expect(formatRelative(now - 25 * 60, now, "en", "UTC")).toBe("Today 00:05");
    expect(formatRelative(now - 31 * 60, now, "en", "UTC")).toBe("Yesterday 23:59");
    expect(formatRelative(now - 31 * 60, now, "id", "UTC")).toBe("Kemarin 23.59");
    expect(formatRelative(now, now, "id", "UTC")).toBe("Hari ini 00.30");
    expect(formatRelative(now - 2 * 86400, now, "en", "UTC")).toBe("Sat, 10 Oct at 00:30");
  });

  it("formats durations and months", () => {
    expect(formatDuration(169_920, "en")).toBe("47 h 12 min");
    expect(formatDuration(169_920, "id")).toBe("47 j 12 mnt");
    expect(formatDuration(720, "en")).toBe("12 min");
    expect(formatDuration(-5, "en")).toBe("0 min");
    expect(formatMonthYear(MON_12_OCT, "en", "UTC")).toBe("October 2026");
    expect(formatMonthYear(MON_12_OCT, "id", "UTC")).toBe("Oktober 2026");
  });
});

describe("schemas (S05-19)", () => {
  it("parses ids, accounts, addresses and units", () => {
    expect(zHex32.safeParse("0".repeat(32)).success).toBe(true);
    expect(zHex32.safeParse("A".repeat(32)).success).toBe(false);
    expect(zAccountId.parse("12")).toBe(12n);
    expect(zAccountId.safeParse("0").success).toBe(false);
    expect(zAccountId.safeParse("01").success).toBe(false);
    expect(zAccountId.safeParse(12).success).toBe(false);
    expect(zAddress.safeParse("0x" + "ab".repeat(20)).success).toBe(true);
    expect(zAddress.safeParse("0x" + "AB".repeat(20)).success).toBe(false);
    expect(zUnits.parse("0")).toBe(0n);
    expect(zUnits.safeParse("-1").success).toBe(false);
  });

  it("keeps plain text unchanged apart from trimming and NFC", () => {
    const t = zPlainText(1, 60);
    expect(t.parse('  "><img src=x onerror=alert(1)>  ')).toBe('"><img src=x onerror=alert(1)>');
    expect(t.parse("é")).toBe("é");
    expect(t.safeParse("a\u202Eb").success).toBe(false);
    expect(t.safeParse("a\u0085b").success).toBe(false);
    expect(t.safeParse("   ").success).toBe(false);
    expect(t.safeParse("a".repeat(61)).success).toBe(false);
  });
});
