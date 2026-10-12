// 15 S15-2 and S15-15: the flag guard and the demo-off bundle search.
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { flagError } from "../scripts/check-demo-flags.mjs";
import { demoHits } from "../scripts/check-demo-off-bundle.mjs";

describe("demo build checks", () => {
  it("accepts matching flags and refuses a mismatch", () => {
    expect(flagError({ NEXT_PUBLIC_DEMO_MODE: "true", DEMO_MODE: "true" })).toBeNull();
    expect(flagError({})).toBeNull();
    expect(flagError({ NEXT_PUBLIC_DEMO_MODE: "false" })).toBeNull();
    expect(flagError({ NEXT_PUBLIC_DEMO_MODE: "true", DEMO_MODE: "false" })).toMatch(/must both/);
    expect(flagError({ NEXT_PUBLIC_DEMO_MODE: "false", DEMO_MODE: "true" })).toMatch(/must both/);
    expect(flagError({ NEXT_PUBLIC_DEMO_MODE: "TRUE", DEMO_MODE: "TRUE" })).toMatch(/must both/);
  });
  it("finds demo copy in a bundle file", () => {
    const dir = mkdtempSync(join(tmpdir(), "demo-off-"));
    const clean = join(dir, "a.js");
    const dirty = join(dir, "b.js");
    writeFileSync(clean, "const x = 'Allowance sent';");
    writeFileSync(dirty, "const y = 'Demo only: view as Raka';");
    expect(demoHits([clean, dirty])).toEqual([{ file: dirty, string: "Demo only:" }]);
  });
});
