// Unit tests for the browser side of spec 09 (amounts) and spec 15 (Skip time).
import { describe, expect, it } from "vitest";
import { createSkipQueue, skipDaysFor, type SkipKind } from "@/components/demo/DemoControls";
import { DEMO_SHOPS, groupTyped, minorToTyped, parseShopAmount } from "@/lib/client/card/shops";

const day = (y: number, m: number, d: number, h = 14) => BigInt(Date.UTC(y, m - 1, d, h, 5) / 1000);

describe("checkout amounts (09 S09-6, E12)", () => {
  it("parses euros and dollars with a comma, and whole rupiah", () => {
    expect(parseShopAmount("12,50", "EUR")).toEqual({ ok: true, minor: 1250n });
    expect(parseShopAmount("€1.234,5", "EUR")).toEqual({ ok: true, minor: 123450n });
    expect(parseShopAmount("5", "USD")).toEqual({ ok: true, minor: 500n });
    expect(parseShopAmount("16.500", "IDR")).toEqual({ ok: true, minor: 16500n });
  });
  it("turns Pay off for empty, zero, negative and three decimals", () => {
    expect(parseShopAmount("", "EUR")).toMatchObject({ ok: false, reason: "empty" });
    expect(parseShopAmount("0,00", "EUR")).toMatchObject({ ok: false, reason: "zero" });
    expect(parseShopAmount("-5", "EUR")).toMatchObject({ ok: false, reason: "invalid" });
    expect(parseShopAmount("12,505", "EUR")).toMatchObject({ ok: false, reason: "precision" });
    expect(parseShopAmount("1,5", "IDR")).toMatchObject({ ok: false, reason: "invalid" });
  });
  it("adds thousands dots as the user types and prefills each shop", () => {
    expect(groupTyped("1234567,5", "EUR")).toBe("1.234.567,5");
    expect(groupTyped("16500", "IDR")).toBe("16.500");
    expect(DEMO_SHOPS.map((s) => minorToTyped(s.defaultMinor, s.currency))).toEqual([
      "12,50",
      "3,40",
      "18,00",
      "11,00",
      "20,00",
      "5,00",
    ]);
    expect(DEMO_SHOPS.filter((s) => s.onCardScreen)).toHaveLength(5);
  });
});

describe("Skip time (15 S15-10, S15-11)", () => {
  it("skips to the next Monday at the same time of day, or 2 days", () => {
    expect(skipDaysFor("monday", day(2026, 10, 7))).toBe(5); // Wed → Mon 12 Oct
    expect(skipDaysFor("monday", day(2026, 10, 12))).toBe(7); // Mon → the next Monday
    expect(skipDaysFor("monday", day(2026, 10, 11))).toBe(1); // Sun
    expect(skipDaysFor("48h", day(2026, 10, 7))).toBe(2);
  });
  it("runs one job per tap in order, each with a fresh clock, and stops on a failure", async () => {
    let clock = day(2026, 10, 7);
    const sent: number[] = [];
    let fail = false;
    let last: { running: SkipKind | null; queued: number; error: unknown; dropped: number } | null =
      null;
    const done = new Promise<void>((resolve) => {
      const q = createSkipQueue(
        async (kind) => {
          await new Promise((r) => setTimeout(r, 5));
          if (fail) throw new Error("reverted");
          const n = skipDaysFor(kind, clock);
          sent.push(n);
          clock += BigInt(n * 86400);
        },
        (s) => {
          last = s;
          if (!s.running && s.queued === 0 && (sent.length === 2 || s.error)) resolve();
        },
      );
      q.push("monday");
      q.push("monday");
    });
    await done;
    expect(sent).toEqual([5, 7]); // Wed → Mon → the Monday after
    fail = true;
    const failed = new Promise<void>((resolve) => {
      const q = createSkipQueue(
        () => Promise.reject(new Error("reverted")),
        (s) => {
          last = s;
          if (s.error) resolve();
        },
      );
      q.push("48h");
      q.push("48h");
      q.push("48h");
    });
    await failed;
    expect(last).toMatchObject({ dropped: 2 });
  });
});
