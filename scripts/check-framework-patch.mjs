// next, react and react-dom are on the newest patch of their pinned minor (S02-25).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fail, isMain } from "./lib.mjs";

const FRAMEWORK = ["next", "react", "react-dom"];

export function newestPatch(pinned, published) {
  const [maj, min] = pinned.split(".");
  return published
    .filter((v) => /^\d+\.\d+\.\d+$/.test(v) && v.startsWith(`${maj}.${min}.`))
    .sort((a, b) => Number(a.split(".")[2]) - Number(b.split(".")[2]))
    .at(-1);
}

function published(name) {
  for (let attempt = 0; ; attempt++) {
    try {
      return JSON.parse(
        execFileSync("npm", ["view", name, "versions", "--json"], { encoding: "utf8" }),
      );
    } catch (e) {
      if (attempt === 1) throw e; // retry once, then fail
    }
  }
}

if (isMain(import.meta)) {
  const root = JSON.parse(readFileSync("package.json", "utf8"));
  const pins = {};
  for (const ws of root.workspaces ?? []) {
    const pkg = JSON.parse(readFileSync(`${ws}/package.json`, "utf8"));
    for (const name of FRAMEWORK) {
      const v = pkg.dependencies?.[name] ?? pkg.devDependencies?.[name];
      if (v) pins[name] = v;
    }
  }
  const errors = [];
  for (const [name, v] of Object.entries(pins)) {
    const newest = newestPatch(v, published(name));
    if (newest && newest !== v) errors.push(`${name} ${v} is behind ${newest}`);
  }
  if (errors.length) fail(errors);
  console.log(
    `framework patch: ${Object.keys(pins).length ? JSON.stringify(pins) : "no framework pinned yet"}`,
  );
}
