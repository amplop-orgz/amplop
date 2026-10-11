// Every nosemgrep comment names a reason after " -- " (S02-17).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fail, isMain } from "./lib.mjs";

const SELF = /^scripts\/(check-nosemgrep|checks\.test)\.mjs$/;

export function check(files) {
  const errors = [];
  for (const [file, text] of Object.entries(files)) {
    text.split("\n").forEach((line, i) => {
      if (!/(\/\/|#|\/\*|<!--)\s*nosemgrep/.test(line)) return;
      if (!/nosemgrep(:\s*[\w.-]+)?\s+--\s+\S/.test(line))
        errors.push(`${file}:${i + 1} nosemgrep without a reason`);
    });
  }
  return errors;
}

if (isMain(import.meta)) {
  const tracked = execFileSync("git", ["ls-files", "-co", "--exclude-standard"], {
    encoding: "utf8",
  })
    .split("\n")
    .filter(
      (f) => f && !f.startsWith("specs/") && !f.startsWith("contracts/lib/") && !SELF.test(f),
    );
  const files = {};
  for (const f of tracked) {
    try {
      files[f] = readFileSync(f, "utf8");
    } catch {
      // submodule folders and deleted files are not readable as text
      continue;
    }
  }
  const errors = check(files);
  if (errors.length) fail(errors);
  console.log("nosemgrep: every suppression has a reason");
}
