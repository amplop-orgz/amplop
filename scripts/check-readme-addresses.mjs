// 18 S18-7: every address in README.md is one of deployments/monad-testnet.json's, and each of
// those addresses appears in it.
import { readFileSync } from "node:fs";
import { fail, isMain } from "./lib.mjs";

export function check(readme, deploy) {
  const known = ["address", "token", "settlement", "treasury", "cardService"].map((k) =>
    String(deploy[k]).toLowerCase(),
  );
  const errors = [];
  const found = [...readme.matchAll(/0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/g)].map((m) =>
    m[0].toLowerCase(),
  );
  for (const a of found)
    if (!known.includes(a) && !(deploy.feeSponsor && a === deploy.feeSponsor.toLowerCase()))
      errors.push(`README.md: ${a} is not in deployments/monad-testnet.json`);
  for (const k of known) if (!found.includes(k)) errors.push(`README.md: missing ${k}`);
  return errors;
}

if (isMain(import.meta)) {
  const errors = check(
    readFileSync("README.md", "utf8"),
    JSON.parse(readFileSync("deployments/monad-testnet.json", "utf8")),
  );
  if (errors.length) fail(errors);
  console.log("readme addresses ok");
}
