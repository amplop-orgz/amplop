#!/usr/bin/env node
// Writes deployments/<network>.json from Foundry's broadcast record (S04-11). Node 22, no dependencies.
// Usage: node script/write-deployment.mjs <chainId>   (10143 or 31337)
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const contractsDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const chainId = Number(process.argv[2]);
const outFile = { 10143: "monad-testnet.json", 31337: "anvil.json" }[chainId];
if (!outFile) fail("usage: write-deployment.mjs <10143|31337>");

const rpcUrl =
  process.env.RPC_URL ?? (chainId === 10143 ? process.env.MONAD_RPC_URL : "http://127.0.0.1:8545");
if (!rpcUrl) fail("set MONAD_RPC_URL (or RPC_URL)");

// Newest broadcast of either script for this chain.
const candidates = ["Deploy.s.sol", "LocalSetup.s.sol"]
  .map((s) => join(contractsDir, "broadcast", s, String(chainId), "run-latest.json"))
  .filter((p) => existsSync(p))
  .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
const broadcastPath = candidates[0];
if (!broadcastPath)
  fail(`no broadcast found under ${join(contractsDir, "broadcast")}/*/${chainId}/`);

const run = JSON.parse(readFileSync(broadcastPath, "utf8"));
const tx = run.transactions.find(
  (t) => t.transactionType === "CREATE" && t.contractName === "AmplopEnvelopes",
);
if (!tx) fail(`no CREATE transaction for AmplopEnvelopes in ${broadcastPath}`);
const receipt = run.receipts.find((r) => r.transactionHash === tx.hash);
if (!receipt) fail(`no receipt for ${tx.hash} in ${broadcastPath}`);

const [token, settlement, treasury, cardService, demoMode] = tx.arguments;
const address = checksum(receipt.contractAddress ?? tx.contractAddress);

let commit;
try {
  commit = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
} catch {
  if (chainId === 10143) fail("git rev-parse HEAD failed; deploy from a committed checkout");
  commit = "0".repeat(40); // local only: repo may have no commits yet
}

const record = {
  chainId,
  contract: "AmplopEnvelopes",
  address,
  deployBlock: Number(BigInt(receipt.blockNumber)),
  deployTx: tx.hash,
  commit,
  compiler: readFileSync(join(contractsDir, "foundry.toml"), "utf8").match(
    /solc_version\s*=\s*"([^"]+)"/,
  )[1],
  token: checksum(token),
  tokenDecimals: Number(cast(["call", address, "tokenDecimals()(uint8)"])),
  tokenSource:
    chainId === 10143
      ? (process.env.TOKEN_SOURCE ?? fail("set TOKEN_SOURCE"))
      : "MockERC20 (local)",
  settlement: checksum(settlement),
  treasury: checksum(treasury),
  cardService: checksum(cardService),
  demoMode: demoMode === "true",
  verified: false,
  deployedAt: new Date().toISOString(),
};

const outPath = join(contractsDir, "..", "deployments", outFile);
writeFileSync(outPath, JSON.stringify(record, null, 2) + "\n");
console.log(`wrote ${outPath}`);

function cast(args) {
  return execFileSync("cast", [...args, "--rpc-url", rpcUrl], { encoding: "utf8" }).trim();
}

function checksum(a) {
  return execFileSync("cast", ["to-check-sum-address", a], { encoding: "utf8" }).trim();
}

function fail(msg) {
  console.error(`write-deployment: ${msg}`);
  process.exit(1);
}
