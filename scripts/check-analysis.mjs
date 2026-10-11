// Gates Slither and Aderyn output (S02-16).
import { readFileSync } from "node:fs";
import { fail, isMain } from "./lib.mjs";

const key = (f) => `${f.tool}|${f.detector}|${f.location}`;

export function findings(slither, aderyn) {
  const out = [];
  for (const d of slither?.results?.detectors ?? []) {
    const el = d.elements?.[0];
    const loc = el?.source_mapping
      ? `${el.source_mapping.filename_relative}:${el.source_mapping.lines?.[0] ?? 0}`
      : "";
    out.push({
      tool: "slither",
      detector: d.check,
      location: loc,
      severity: d.impact.toLowerCase(),
    });
  }
  for (const sev of ["high", "low"]) {
    for (const issue of aderyn?.[`${sev}_issues`]?.issues ?? []) {
      for (const inst of issue.instances ?? [{}]) {
        out.push({
          tool: "aderyn",
          detector: issue.detector_name,
          location: `${inst.contract_path ?? ""}:${inst.line_no ?? 0}`,
          severity: sev,
        });
      }
    }
  }
  return out;
}

export function check(slither, aderyn, accepted, securityMd) {
  // An accepted location is "file:line" for one finding, or "file" for every finding of that detector in it,
  // since line numbers move with every edit.
  const isAccepted = (f) =>
    accepted.some(
      (a) =>
        a.tool === f.tool &&
        a.detector === f.detector &&
        (a.location === f.location || f.location.startsWith(`${a.location}:`)),
    );
  const errors = [];
  for (const f of findings(slither, aderyn)) {
    if (f.severity === "high" || f.severity === "medium") errors.push(`${f.severity}: ${key(f)}`);
    else if (f.severity === "low" && !isAccepted(f)) errors.push(`unlisted low: ${key(f)}`);
  }
  for (const a of accepted) {
    if (!a.reason) errors.push(`accepted finding without reason: ${key(a)}`);
    if (!securityMd.includes(a.detector))
      errors.push(`accepted finding not in SECURITY.md: ${a.detector}`);
  }
  return errors;
}

if (isMain(import.meta)) {
  const read = (p, d) => {
    try {
      return readFileSync(p, "utf8");
    } catch {
      return d;
    }
  };
  const errors = check(
    JSON.parse(read("contracts/build/slither.json", "null")) ?? fail("missing slither.json"),
    JSON.parse(read("contracts/build/aderyn.json", "null")) ?? fail("missing aderyn.json"),
    JSON.parse(read("audits/accepted-findings.json", "[]")),
    read("SECURITY.md", ""),
  );
  if (errors.length) fail(errors);
  console.log("contract analysis: no high or medium; every low listed");
}
