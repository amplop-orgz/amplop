// package-lock.json exists and matches package.json (S02-25).
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fail } from "./lib.mjs";

if (!existsSync("package-lock.json")) fail("package-lock.json is missing");
try {
  execFileSync("npm", ["ci", "--dry-run", "--ignore-scripts"], { stdio: "pipe" });
} catch (e) {
  fail(["npm ci --dry-run reports a lockfile mismatch", String(e.stderr ?? e)]);
}
console.log("lockfile ok");
