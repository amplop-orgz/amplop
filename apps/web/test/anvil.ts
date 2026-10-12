// Starts Anvil with the real contract in demo mode and a stand-in AUSD (01 section 9 wallets).
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  http,
  maxUint256,
  parseAbi,
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

export async function startAnvil(port: number, extraArgs: string[] = []): Promise<AnvilStack> {
  const proc: ChildProcess = spawn(
    "anvil",
    ["--port", String(port), "--chain-id", "31337", "--silent", ...extraArgs],
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
  // As the real deployment: test AUSD for Treasury and Settlement, and both approvals (spec 04 S04-9).
  const erc20 = parseAbi([
    "function mint(address to, uint256 amount)",
    "function approve(address spender, uint256 amount) returns (bool)",
  ]);
  for (const i of [1, 3]) {
    await pub.waitForTransactionReceipt({
      hash: await deployer.writeContract({
        address: token,
        abi: erc20,
        functionName: "mint",
        args: [addr(i), 1_000_000n * 10n ** 6n],
      }),
    });
    const owner = createWalletClient({
      chain: foundry,
      transport: http(url),
      account: mnemonicToAccount(MNEMONIC, { addressIndex: i }),
    });
    await pub.waitForTransactionReceipt({
      hash: await owner.writeContract({
        address: token,
        abi: erc20,
        functionName: "approve",
        args: [contract, maxUint256],
      }),
    });
  }
  return { url, contract, token, stop: () => proc.kill() };
}

/** A server Chain over the stack, with Anvil's accounts 1, 2 and 4 as the three server keys. */
export async function anvilChain(stack: AnvilStack) {
  const { Chain } = await import("@/lib/server/chain/chain");
  const { createServerRpc } = await import("@/lib/server/chain/rpc");
  const { privateKeyToAccount } = await import("viem/accounts");
  return new Chain({
    rpc: createServerRpc(31337, stack.url, stack.url),
    chainId: 31337,
    contract: stack.contract,
    token: stack.token,
    settlement: privateKeyToAccount(anvilKey(3)).address,
    accounts: {
      treasury: privateKeyToAccount(anvilKey(1)),
      cardService: privateKeyToAccount(anvilKey(2)),
      feeSponsor: privateKeyToAccount(anvilKey(4)),
    },
    demo: true,
  });
}
