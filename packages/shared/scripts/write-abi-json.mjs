// Copies the plain JSON ABI from the Foundry build for the indexer (S02-3, S04-14).
import { readFileSync, writeFileSync } from "node:fs";

const artifact = JSON.parse(
  readFileSync(
    new URL("../../../contracts/out/AmplopEnvelopes.sol/AmplopEnvelopes.json", import.meta.url),
    "utf8",
  ),
);
writeFileSync(
  new URL("../abi/AmplopEnvelopes.json", import.meta.url),
  JSON.stringify(artifact.abi, null, 2) + "\n",
);
