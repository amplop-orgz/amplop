// The PRD 15 commit message rule (S02-11). Used by the commit-msg hook and the CI commits job.
import { readFileSync } from "node:fs";
import { fail, isMain } from "./lib.mjs";

export const RULE =
  /^(feat|fix|test|docs|chore|refactor|ci|build|perf|style|revert)\([a-z0-9-]+\): [^\s].{0,98}( \(SA-\d{2}\))?$/;

export function ok(message) {
  const first = message.split("\n")[0] ?? "";
  return RULE.test(first) || first.startsWith("Merge pull request ");
}

if (isMain(import.meta)) {
  const msg = readFileSync(process.argv[2], "utf8");
  if (!ok(msg)) {
    fail([
      `Commit message does not follow \`type(area): what changed\`: "${msg.split("\n")[0]}"`,
      "Example: feat(card): decline gambling purchases",
    ]);
  }
}
