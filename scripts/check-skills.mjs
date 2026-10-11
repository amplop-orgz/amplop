// tools/ai-skills.lock pins exactly the two skill sets at their commits (S02-26).
import { readFileSync } from "node:fs";
import { fail, isMain } from "./lib.mjs";

export const EXPECTED = {
  monskills: ["https://github.com/therealharpaljadeja/monskills", "3f8efd2"],
  "pashov-skills": ["https://github.com/pashov/skills", "92b0ea6"],
};

export function check(lock) {
  const rows = lock
    .split("\n")
    .map((l) => l.trim().split(/\s+/))
    .filter((r) => r[0]);
  const errors = [];
  if (rows.length !== Object.keys(EXPECTED).length)
    errors.push(`expected 2 skill sets, found ${rows.length}`);
  for (const [name, url, commit] of rows) {
    const want = EXPECTED[name];
    if (!want) errors.push(`unexpected skill set ${name}`);
    else if (want[0] !== url || want[1] !== commit)
      errors.push(`${name} must be ${want.join(" @ ")}`);
  }
  return errors;
}

if (isMain(import.meta)) {
  const errors = check(readFileSync("tools/ai-skills.lock", "utf8"));
  if (errors.length) fail(errors);
  console.log("ai skills lock ok");
}
