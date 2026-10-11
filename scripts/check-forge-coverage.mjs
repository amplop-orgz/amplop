// Fails below 95% lines or 90% branches over contracts/src (S02-15).
import { readFileSync } from "node:fs";
import { fail, isMain } from "./lib.mjs";

export const FLOORS = { lines: 95, branches: 90 };

export function coverage(lcov) {
  let file = "";
  const t = { LH: 0, LF: 0, BRH: 0, BRF: 0 };
  for (const line of lcov.split("\n")) {
    if (line.startsWith("SF:")) file = line.slice(3);
    const m = /^(LH|LF|BRH|BRF):(\d+)$/.exec(line);
    if (m && /(^|\/)src\//.test(file)) t[m[1]] += Number(m[2]);
  }
  const pct = (h, f) => (f === 0 ? 100 : (h * 100) / f);
  return { lines: pct(t.LH, t.LF), branches: pct(t.BRH, t.BRF), files: t.LF };
}

export function check(lcov) {
  const c = coverage(lcov);
  const errors = [];
  if (c.files === 0) errors.push("no src/ files in lcov");
  if (c.lines < FLOORS.lines) errors.push(`lines ${c.lines.toFixed(2)}% < ${FLOORS.lines}%`);
  if (c.branches < FLOORS.branches)
    errors.push(`branches ${c.branches.toFixed(2)}% < ${FLOORS.branches}%`);
  return { ...c, errors };
}

if (isMain(import.meta)) {
  const r = check(readFileSync(process.argv[2] ?? "lcov.info", "utf8"));
  console.log(
    `contracts/src coverage: lines ${r.lines.toFixed(2)}%, branches ${r.branches.toFixed(2)}%`,
  );
  if (r.errors.length) fail(r.errors);
}
