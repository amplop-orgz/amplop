// 19 S19-16: the case-map check catches each kind of drift.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mapErrors, testsIn, type Entry } from "../scripts/check-case-map.mjs";

const map = JSON.parse(
  readFileSync(new URL("../e2e/case-map.json", import.meta.url), "utf8"),
) as Entry[];
const tier1 = map.filter((e) => e.tier === 1).map((e) => `test("${e.id} x @tier1", () => {});`);
const auto2 = map
  .filter((e) => e.tier !== 1 && e.automated)
  .map((e) => `test("${e.id} x @tier2", () => {});`);
const ok = testsIn([...tier1, ...auto2]);

describe("check-case-map", () => {
  it("accepts the map with one test per automated case", () => {
    expect(mapErrors(map, ok)).toEqual([]);
  });
  it("finds a missing Tier 1 test, a duplicate, a wrong tag and an unknown id", () => {
    const errors = mapErrors(map, [
      ...ok.filter((t) => t.id !== "C1"),
      { id: "A1", tier: 1 },
      { id: "A4", tier: 1 },
      { id: "Z9", tier: 1 },
    ]);
    expect(errors).toEqual(
      expect.arrayContaining([
        "Tier 1 C1 has 0 tests",
        "Tier 1 A1 has 2 tests",
        "test A4 is tagged tier 1, the map says 2",
        "A4 has a test but automated is false",
      ]),
    );
  });
  it("finds a wrong count", () => {
    expect(mapErrors(map.slice(1), ok)).toEqual(
      expect.arrayContaining(["139 entries, not 140", "A1 appears 0 times"]),
    );
  });
  it("reads ids and tier tags from titles", () => {
    expect(testsIn(['test("E13 Pay tapped twice quickly @tier1 @money", async () => {})'])).toEqual(
      [{ id: "E13", tier: 1 }],
    );
  });
});
