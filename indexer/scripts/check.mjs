// 16 S16-6: the ABI copy, config.yaml's address and start block, both event lists and the handlers.
import { existsSync } from "node:fs";
import { abiEvents, configChain, configEvents, handledEvents, read } from "./lib.mjs";

export function check() {
  const errors = [];
  const abi = read("abis/AmplopEnvelopes.json");
  if (abi !== read("../packages/shared/abi/AmplopEnvelopes.json"))
    errors.push("abis/AmplopEnvelopes.json differs from packages/shared: run pnpm abi:sync");
  const events = abiEvents(abi);
  const yaml = read("config.yaml");
  const deploy = JSON.parse(read("../deployments/monad-testnet.json"));
  const chain = configChain(yaml);
  if (chain.address.toLowerCase() !== String(deploy.address).toLowerCase())
    errors.push(`config.yaml address ${chain.address} is not ${deploy.address}`);
  if (chain.startBlock !== deploy.deployBlock)
    errors.push(`config.yaml start_block ${chain.startBlock} is not ${deploy.deployBlock}`);
  const files = [
    "config.yaml",
    ...(existsSync(new URL("../config.e2e.yaml", import.meta.url)) ? ["config.e2e.yaml"] : []),
  ];
  for (const f of files) {
    if (JSON.stringify(configEvents(read(f))) !== JSON.stringify(events))
      errors.push(`${f} events are not exactly the ABI's ${events.length} events`);
  }
  const handled = handledEvents();
  for (const e of events) if (!handled.includes(e)) errors.push(`no handler for ${e}`);
  for (const e of handled)
    if (handled.indexOf(e) !== handled.lastIndexOf(e)) errors.push(`two handlers for ${e}`);
  return errors;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const errors = check();
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exit(1);
  }
  console.log("indexer config ok");
}
