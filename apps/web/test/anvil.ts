// Starts Anvil with the real contract in demo mode and a stand-in AUSD (01 section 9 wallets).
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  http,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { foundry } from "viem/chains";

const MNEMONIC = "test test test test test test test test test test test junk";
export const anvilKey = (i: number): Hex => {
  const pk = mnemonicToAccount(MNEMONIC, { addressIndex: i }).getHdKey().privateKey;
  return `0x${Buffer.from(pk ?? []).toString("hex")}`;
};

export const hasAnvil = spawnSync("anvil", ["--version"]).status === 0;

function artifact(file: string, name: string): { abi: Abi; bytecode: Hex } {
  const p = fileURLToPath(new URL(`../../../contracts/out/${file}/${name}.json`, import.meta.url));
  const j = JSON.parse(readFileSync(p, "utf8")) as { abi: Abi; bytecode: { object: Hex } };
  return { abi: j.abi, bytecode: j.bytecode.object };
}

export type AnvilStack = { url: string; contract: Address; token: Address; stop(): void };

export async function startAnvil(port: number): Promise<AnvilStack> {
  const proc: ChildProcess = spawn(
    "anvil",
    ["--port", String(port), "--chain-id", "31337", "--silent"],
    { stdio: "ignore" },
  );
  const url = `http://127.0.0.1:${String(port)}`;
  const pub = createPublicClient({ chain: foundry, transport: http(url) });
  for (let i = 0; i < 100; i++) {
    try {
      await pub.getChainId();
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  const deployer = createWalletClient({
    chain: foundry,
    transport: http(url),
    account: mnemonicToAccount(MNEMONIC, { addressIndex: 0 }),
  });
  const addr = (i: number) => mnemonicToAccount(MNEMONIC, { addressIndex: i }).address;
  const mock = artifact("MockERC20.sol", "MockERC20");
  const tokenTx = await deployer.deployContract({
    ...mock,
    args: ["AUSD test stand-in", "AUSD", 6],
  });
  const token = (await pub.waitForTransactionReceipt({ hash: tokenTx })).contractAddress as Address;
  const amplop = artifact("AmplopEnvelopes.sol", "AmplopEnvelopes");
  const tx = await deployer.deployContract({
    ...amplop,
    args: [token, addr(3), addr(1), addr(2), true],
  });
  const contract = (await pub.waitForTransactionReceipt({ hash: tx })).contractAddress as Address;
  return { url, contract, token, stop: () => proc.kill() };
}
