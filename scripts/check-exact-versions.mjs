// Every dependency in every package.json is an exact version (S02-25).
import { readFileSync } from "node:fs";
import { fail, isMain } from "./lib.mjs";

const FIELDS = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"];
const EXACT = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/;

export function isExact(v) {
  if (v.startsWith("npm:")) return EXACT.test(v.slice(v.lastIndexOf("@") + 1));
  return EXACT.test(v);
}

export function check(pkgs) {
  const errors = [];
  for (const [file, pkg] of Object.entries(pkgs)) {
    for (const field of FIELDS) {
      for (const [name, v] of Object.entries(pkg[field] ?? {})) {
        if (!isExact(v)) errors.push(`${file} ${field}.${name} = "${v}" is not exact`);
      }
    }
  }
  return errors;
}

if (isMain(import.meta)) {
  const root = JSON.parse(readFileSync("package.json", "utf8"));
  const pkgs = { "package.json": root };
  for (const ws of root.workspaces ?? []) {
    pkgs[`${ws}/package.json`] = JSON.parse(readFileSync(`${ws}/package.json`, "utf8"));
  }
  const errors = check(pkgs);
  if (errors.length) fail(errors);
  console.log(`exact versions: ${Object.keys(pkgs).length} package.json files ok`);
}
