// 18 S18-1: the README and SECURITY.md copies of each shared fragment equal the fragment, after
// dropping link URLs and normalising whitespace and table rules.
import { readFileSync } from "node:fs";
import { fail, isMain } from "./lib.mjs";

const DIR = "apps/docs/src/fragments";
export const PLACES = {
  "README.md": ["real-simulated", "demo-time", "r27"],
  "SECURITY.md": ["threats", "accepted-risks"],
};

export function normalise(md) {
  return md
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/-{3,}/g, "---")
    .replace(/\s+/g, "")
    .trim();
}

export function copyOf(doc, name) {
  // nosemgrep -- fragment names come from the committed fragments folder, not input
  const m = new RegExp(
    `<!-- fragment:${name}:start -->([\\s\\S]*?)<!-- fragment:${name}:end -->`,
  ).exec(doc);
  return m ? m[1] : null;
}

export function check(read) {
  const errors = [];
  for (const [file, names] of Object.entries(PLACES)) {
    const doc = read(file);
    for (const name of names) {
      const copy = copyOf(doc, name);
      if (copy === null) errors.push(`${file}: no copy of fragment ${name}`);
      else if (normalise(copy) !== normalise(read(`${DIR}/${name}.md`)))
        errors.push(`${file}: fragment ${name} differs from ${DIR}/${name}.md`);
    }
  }
  return errors;
}

if (isMain(import.meta)) {
  const errors = check((f) => readFileSync(f, "utf8"));
  if (errors.length) fail(errors);
  console.log("fragments ok");
}
