// .env.example lists exactly the names in 01 section 7, minus CI-only secrets (S02-24).
import { readFileSync } from "node:fs";
import { fail, isMain } from "./lib.mjs";

export function specNames(conventions) {
  const section = conventions.split("## 7. Environment variables")[1]?.split("\n## ")[0] ?? "";
  const names = [];
  for (const row of section.split("\n")) {
    if (!row.startsWith("| `") || row.includes("CI secrets only")) continue;
    const first = row.split("|")[1] ?? "";
    for (const m of first.matchAll(/`([A-Z0-9_]+)(?:=[^`]*)?`/g)) names.push(m[1]);
  }
  return names;
}

export function exampleNames(example) {
  return example
    .split("\n")
    .map((l) => /^([A-Z0-9_]+)=/.exec(l)?.[1])
    .filter(Boolean);
}

export function check(conventions, example) {
  const want = new Set(specNames(conventions));
  const have = new Set(exampleNames(example));
  const errors = [];
  if (want.size === 0) errors.push("no names found in 01 section 7");
  for (const n of want) if (!have.has(n)) errors.push(`missing from .env.example: ${n}`);
  for (const n of have) if (!want.has(n)) errors.push(`not in 01 section 7: ${n}`);
  return errors;
}

if (isMain(import.meta)) {
  const errors = check(
    readFileSync("specs/01-conventions.md", "utf8"),
    readFileSync(".env.example", "utf8"),
  );
  if (errors.length) fail(errors);
  console.log(".env.example matches 01 section 7");
}
