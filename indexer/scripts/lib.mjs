// Shared by check.mjs and write-e2e-config.mjs: reading the configs, the ABI and the handlers.
import { readdirSync, readFileSync } from "node:fs";

const here = (p) => new URL(`../${p}`, import.meta.url);
export const read = (p) => readFileSync(here(p), "utf8");

// OpenZeppelin's EIP712 event: in the ABI but never emitted, since the domain never changes.
export const NOT_INDEXED = ["EIP712DomainChanged"];

export function abiEvents(abiText) {
  return JSON.parse(abiText)
    .filter((x) => x.type === "event" && !NOT_INDEXED.includes(x.name))
    .map((x) => x.name)
    .sort();
}

export function configEvents(yaml) {
  return [...yaml.matchAll(/^\s+- event: (\w+)\s*$/gm)].map((m) => m[1]).sort();
}

export function configChain(yaml) {
  return {
    startBlock: Number(/^\s+start_block: (\d+)\s*$/m.exec(yaml)?.[1]),
    address: /^\s+address: "?(0x[0-9a-fA-F]{40})"?\s*$/m.exec(yaml)?.[1] ?? "",
  };
}

export function handledEvents(dir = "src/handlers") {
  const names = [];
  for (const f of readdirSync(here(dir))) {
    if (!f.endsWith(".ts")) continue;
    for (const m of read(`${dir}/${f}`).matchAll(/AmplopEnvelopes\.(\w+)\.handler\(/g))
      names.push(m[1]);
  }
  return names.sort();
}
