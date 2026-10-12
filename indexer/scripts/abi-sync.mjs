// Copies the contract ABI from packages/shared (16 S16-3). The copy is committed because Envio
// Cloud builds from indexer/ only.
import { copyFileSync } from "node:fs";

copyFileSync(
  new URL("../../packages/shared/abi/AmplopEnvelopes.json", import.meta.url),
  new URL("../abis/AmplopEnvelopes.json", import.meta.url),
);
console.log("abis/AmplopEnvelopes.json synced");
