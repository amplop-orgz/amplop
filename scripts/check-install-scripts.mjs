// Only allowlisted packages may run install scripts (S02-25).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fail, isMain } from "./lib.mjs";

export function check(found, allowed) {
  const ok = new Set(allowed.map((a) => `${a.name}@${a.version}`));
  return found
    .filter((p) => !ok.has(`${p.name}@${p.version}`))
    .map(
      (p) =>
        `${p.name}@${p.version} has an install script and is not in tools/allowed-install-scripts.json`,
    );
}

if (isMain(import.meta)) {
  const query =
    ":attr(scripts, [preinstall]), :attr(scripts, [install]), :attr(scripts, [postinstall])";
  const found = JSON.parse(execFileSync("npm", ["query", query], { encoding: "utf8" }));
  const errors = check(
    found,
    JSON.parse(readFileSync("tools/allowed-install-scripts.json", "utf8")),
  );
  if (errors.length) fail(errors);
  console.log(`install scripts: ${found.length} found, all allowlisted`);
}
