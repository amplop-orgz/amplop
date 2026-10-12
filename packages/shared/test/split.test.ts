// 08 S08-4, T08-18: the preview maths match the contract (the same vector file runs in Foundry).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { rupiahToUnits, splitParts, weeklyShares } from "../src/money";

type Vector = { units: string; split: number[]; parts: string[] };
const { cases } = JSON.parse(
  readFileSync(new URL("./vectors/split.json", import.meta.url), "utf8"),
) as { cases: Vector[] };

describe("split maths", () => {
  it("matches every shared vector and sums to the amount", () => {
    for (const c of cases) {
      const parts = splitParts(BigInt(c.units), c.split);
      expect(parts.map(String)).toEqual(c.parts);
      expect(parts.reduce((a, b) => a + b, 0n)).toBe(BigInt(c.units));
    }
  });

  it("converts the T08-18 rupiah samples at 6 decimals", () => {
    expect(rupiahToUnits(16_500_000n, 6, 16_500n)).toBe(1_000_000_000n);
    expect(rupiahToUnits(1_234_567n, 6, 16_500n)).toBe(74_822_242n);
    expect(rupiahToUnits(100_000n, 6, 16_500n)).toBe(6_060_606n);
    const parts = splitParts(74_822_242n, [40, 15, 15, 20, 10]);
    expect(parts).toEqual([29_928_896n, 11_223_336n, 11_223_336n, 14_964_450n, 7_482_224n]);
  });

  it("gives the last weekly share the rest", () => {
    expect(weeklyShares(150_000_000n)).toEqual([
      37_500_000n,
      37_500_000n,
      37_500_000n,
      37_500_000n,
    ]);
    expect(weeklyShares(11_223_336n)).toEqual([2_805_834n, 2_805_834n, 2_805_834n, 2_805_834n]);
    expect(weeklyShares(7n)).toEqual([1n, 1n, 1n, 4n]);
  });
});
