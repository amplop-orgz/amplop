import { describe, expect, it } from "vitest";
import * as analysis from "./check-analysis.mjs";
import * as commit from "./check-commit-msg.mjs";
import * as env from "./check-env-example.mjs";
import * as exact from "./check-exact-versions.mjs";
import * as forge from "./check-forge-coverage.mjs";
import * as install from "./check-install-scripts.mjs";
import * as nosemgrep from "./check-nosemgrep.mjs";
import * as osv from "./check-osv.mjs";
import * as patch from "./check-framework-patch.mjs";
import * as skills from "./check-skills.mjs";

const lcov = (lh, lf, brh, brf, sf = "src/AmplopEnvelopes.sol") =>
  `SF:${sf}\nLH:${lh}\nLF:${lf}\nBRH:${brh}\nBRF:${brf}\nend_of_record\n`;

describe("check-forge-coverage", () => {
  it("passes at the floors", () =>
    expect(forge.check(lcov(950, 1000, 90, 100)).errors).toEqual([]));
  it("fails at 94.9% lines", () =>
    expect(forge.check(lcov(949, 1000, 100, 100)).errors).toHaveLength(1));
  it("fails at 89% branches", () =>
    expect(forge.check(lcov(1000, 1000, 89, 100)).errors).toHaveLength(1));
  it("ignores files outside src", () =>
    expect(
      forge.check(lcov(950, 1000, 90, 100) + lcov(0, 1000, 0, 100, "test/Mock.sol")).errors,
    ).toEqual([]));
  it("fails with no src files", () =>
    expect(forge.check(lcov(0, 10, 0, 1, "test/x.sol")).errors).not.toEqual([]));
});

describe("check-analysis", () => {
  const slither = (impact) => ({
    results: {
      detectors: [
        {
          check: "timestamp",
          impact,
          elements: [{ source_mapping: { filename_relative: "src/A.sol", lines: [7] } }],
        },
      ],
    },
  });
  const accepted = [
    { tool: "slither", detector: "timestamp", location: "src/A.sol:7", reason: "account clock" },
  ];
  it("fails on medium", () =>
    expect(analysis.check(slither("Medium"), {}, [], "")).toHaveLength(1));
  it("fails on an unlisted low", () =>
    expect(analysis.check(slither("Low"), {}, [], "")).toHaveLength(1));
  it("passes a listed low", () =>
    expect(analysis.check(slither("Low"), {}, accepted, "timestamp: account clock")).toEqual([]));
  it("fails when SECURITY.md misses an accepted finding", () =>
    expect(analysis.check(slither("Low"), {}, accepted, "")).toHaveLength(1));
  it("fails on an aderyn high", () =>
    expect(
      analysis.check(
        null,
        { high_issues: { issues: [{ detector_name: "x", instances: [{}] }] } },
        [],
        "",
      ),
    ).toHaveLength(1));
});

describe("check-exact-versions", () => {
  it("accepts exact and npm aliases", () =>
    expect(
      exact.check({ p: { dependencies: { a: "1.2.3", b: "npm:c@4.5.6", d: "1.0.0-rc.1" } } }),
    ).toEqual([]));
  for (const bad of ["^16.0.0", "~1.0.0", "*", "1.x", "latest", ">=1.0.0", "github:a/b"]) {
    it(`rejects ${bad}`, () =>
      expect(exact.check({ p: { devDependencies: { next: bad } } })).toHaveLength(1));
  }
});

describe("check-osv", () => {
  const report = (v) => ({
    results: [{ packages: [{ package: { name: "x", version: "1.0.0" }, vulnerabilities: [v] }] }],
  });
  it("fails on GHSA HIGH", () =>
    expect(
      osv.check(report({ id: "a", database_specific: { severity: "HIGH" } })).bad,
    ).toHaveLength(1));
  it("fails on CVSS 7.0", () =>
    expect(
      osv.check(report({ id: "a", severity: [{ type: "CVSS_V3", score: "7.0" }] })).bad,
    ).toHaveLength(1));
  it("prints moderate", () =>
    expect(
      osv.check(report({ id: "a", database_specific: { severity: "MODERATE" } })).low,
    ).toHaveLength(1));
});

describe("check-env-example", () => {
  const spec =
    "## 7. Environment variables\n\n| Name | Where |\n| --- | --- |\n| `A`, `B_C=1` | server |\n| `VERCEL_TOKEN` | CI secrets only |\n\n## 8. Next";
  it("passes when names match", () => expect(env.check(spec, "A=1\nB_C=2\n")).toEqual([]));
  it("fails on a missing name", () => expect(env.check(spec, "A=1\n")).toHaveLength(1));
  it("fails on an extra name", () =>
    expect(env.check(spec, "A=1\nB_C=1\nVERCEL_TOKEN=x\n")).toHaveLength(1));
  it("reads the real 01 section", async () => {
    const { readFileSync } = await import("node:fs");
    const names = env.specNames(
      readFileSync(new URL("../specs/01-conventions.md", import.meta.url), "utf8"),
    );
    expect(names).toContain("SAMPLE_RATE_IDR_PER_USD");
    expect(names).not.toContain("VERCEL_TOKEN");
  });
});

describe("check-nosemgrep", () => {
  it("passes with a reason", () =>
    expect(nosemgrep.check({ f: "x // nosemgrep: rule.id -- fixed input" })).toEqual([]));
  it("fails without a reason", () =>
    expect(nosemgrep.check({ f: "x // nosemgrep: rule.id" })).toHaveLength(1));
});

describe("check-commit-msg", () => {
  it.each([
    "feat(card): decline gambling purchases",
    "fix(contract): cap skipDays (SA-03)",
    "Merge pull request #1 from a/b",
  ])("accepts %s", (m) => expect(commit.ok(m)).toBe(true));
  it.each([
    "update stuff",
    "feat: no area",
    "Feat(card): caps",
    "feat(Card): x",
    "fix(contract):  double space",
  ])("rejects %s", (m) => expect(commit.ok(m)).toBe(false));
});

describe("check-skills", () => {
  const good =
    "monskills https://github.com/therealharpaljadeja/monskills 3f8efd2 plugin 0.7.2\npashov-skills https://github.com/pashov/skills 92b0ea6 solidity-auditor 4.1\n";
  it("passes the pinned lock", () => expect(skills.check(good)).toEqual([]));
  it("fails on another commit", () =>
    expect(skills.check(good.replace("92b0ea6", "1234567"))).toHaveLength(1));
});

describe("check-install-scripts and framework patch", () => {
  it("flags an unlisted install script", () =>
    expect(
      install.check([{ name: "x", version: "1.0.0" }], [{ name: "y", version: "1.0.0" }]),
    ).toHaveLength(1));
  it("finds the newest patch of the same minor", () =>
    expect(
      patch.newestPatch("16.0.1", ["16.0.0", "16.0.1", "16.0.10", "16.1.0", "16.0.11-canary.1"]),
    ).toBe("16.0.10"));
});
