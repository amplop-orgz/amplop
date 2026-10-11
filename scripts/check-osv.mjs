// Fails on any HIGH or CRITICAL vulnerability in OSV-Scanner JSON output (S02-19).
import { readFileSync } from "node:fs";
import { fail, isMain } from "./lib.mjs";

const BAD = new Set(["HIGH", "CRITICAL"]);

export function isBad(vuln) {
  const ghsa = vuln.database_specific?.severity?.toUpperCase();
  if (ghsa && BAD.has(ghsa)) return true;
  for (const s of vuln.severity ?? []) {
    if (!s.type?.startsWith("CVSS_V3")) continue;
    const score = Number(s.score);
    if (!Number.isNaN(score) && score >= 7) return true;
  }
  return false;
}

export function check(report) {
  const bad = [];
  const low = [];
  for (const r of report.results ?? []) {
    for (const p of r.packages ?? []) {
      for (const v of p.vulnerabilities ?? []) {
        (isBad(v) ? bad : low).push(`${p.package?.name}@${p.package?.version} ${v.id}`);
      }
    }
  }
  return { bad, low };
}

if (isMain(import.meta)) {
  const { bad, low } = check(JSON.parse(readFileSync(process.argv[2] ?? "osv.json", "utf8")));
  for (const l of low) console.log(`lower severity: ${l}`);
  if (bad.length) fail(bad.map((b) => `high or critical: ${b}`));
  console.log("osv: no high or critical");
}
