// 19 S19-16: e2e/case-map.json and the test titles in e2e/cases must agree.
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const GROUPS = { A: 17, B: 11, C: 17, D: 7, E: 22, F: 11, G: 18, H: 6, I: 9, J: 7, K: 4, L: 11 };
const TIERS = { 1: 40, 2: 65, 3: 35 };

/** Every `test("<ID> … @tags", …)` title in the sources, as { id, tier }. */
export function testsIn(sources) {
  const out = [];
  for (const src of sources)
    for (const m of src.matchAll(/\btest\(\s*([`"'])([A-L]\d+|SEC\d+) ((?:\\.|(?!\1).)*)\1/g)) {
      const tier = /@tier([123])/.exec(m[3])?.[1];
      out.push({ id: m[2], tier: tier ? Number(tier) : null });
    }
  return out;
}

/** The list of problems; empty when the map and the tests agree. */
export function mapErrors(map, tests) {
  const errors = [];
  const want = Object.entries(GROUPS).flatMap(([g, n]) =>
    Array.from({ length: n }, (_, i) => `${g}${String(i + 1)}`),
  );
  const ids = map.map((e) => e.id);
  if (map.length !== 140) errors.push(`${String(map.length)} entries, not 140`);
  for (const id of want) {
    const n = ids.filter((x) => x === id).length;
    if (n !== 1) errors.push(`${id} appears ${String(n)} times`);
  }
  for (const [tier, n] of Object.entries(TIERS)) {
    const got = map.filter((e) => e.tier === Number(tier)).length;
    if (got !== n) errors.push(`tier ${tier} has ${String(got)}, not ${String(n)}`);
  }
  const byId = new Map(map.map((e) => [e.id, e]));
  for (const t of tests) {
    if (t.id.startsWith("SEC")) continue;
    const e = byId.get(t.id);
    if (!e) errors.push(`test ${t.id} is not in the map`);
    else if (t.tier !== e.tier)
      errors.push(`test ${t.id} is tagged tier ${String(t.tier)}, the map says ${String(e.tier)}`);
  }
  for (const e of map) {
    const n = tests.filter((t) => t.id === e.id).length;
    if (e.tier === 1 && n !== 1) errors.push(`Tier 1 ${e.id} has ${String(n)} tests`);
    if (e.automated && n === 0) errors.push(`${e.id} is automated but has no test`);
    if (!e.automated && n > 0) errors.push(`${e.id} has a test but automated is false`);
  }
  return errors;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const dir = new URL("../e2e/", import.meta.url);
  const map = JSON.parse(readFileSync(new URL("case-map.json", dir), "utf8"));
  const sources = readdirSync(new URL("cases/", dir))
    .filter((f) => f.endsWith(".spec.ts"))
    .map((f) => readFileSync(new URL(`cases/${f}`, dir), "utf8"));
  const errors = mapErrors(map, testsIn(sources));
  if (errors.length) {
    console.error(`case-map.json disagrees with the tests:\n- ${errors.join("\n- ")}`);
    process.exit(1);
  }
  console.log("case map: 140 cases, 40 / 65 / 35, every Tier 1 case has one test");
}
