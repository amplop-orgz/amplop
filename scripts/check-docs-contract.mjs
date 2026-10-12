// 18 S18-13: every function and event of the contract is on the docs Contracts page.
import { readFileSync } from "node:fs";
import { fail, isMain } from "./lib.mjs";

export function check(abi, page) {
  return abi
    .filter(
      (x) => (x.type === "function" || x.type === "event") && x.name !== "EIP712DomainChanged",
    )
    .filter((x) => !new RegExp(`\\b${x.name}\\b`).test(page))
    .map((x) => `contracts.mdx: missing ${x.type} ${x.name}`);
}

if (isMain(import.meta)) {
  const errors = check(
    JSON.parse(readFileSync("packages/shared/abi/AmplopEnvelopes.json", "utf8")),
    readFileSync("apps/docs/src/content/docs/contracts.mdx", "utf8"),
  );
  if (errors.length) fail(errors);
  console.log("docs contract ok");
}
