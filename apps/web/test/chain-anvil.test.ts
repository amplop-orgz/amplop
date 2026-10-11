// The real chain port against Anvil (05 T05-19, T05-20). Needs Foundry and `forge build` output.
import { createServer, type Server } from "node:http";
import { amplopEnvelopesAbi } from "@amplop/shared/abi";
import { privateKeyToAccount } from "viem/accounts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Chain } from "@/lib/server/chain/chain";
import { createServerRpc } from "@/lib/server/chain/rpc";
import { ChainRevert } from "@/lib/server/chain/types";
import { anvilKey, hasAnvil, startAnvil, type AnvilStack } from "./anvil";
import { newAccount, resetDb } from "./helpers";

if (!hasAnvil && process.env.CI) throw new Error("CI needs Anvil for the chain suite");

describe.skipIf(!hasAnvil)("chain port on Anvil", () => {
  let stack: AnvilStack;
  let limited: Server;
  let limitedUrl: string;
  const chainOver = (rpc1: string, rpc2: string) =>
    new Chain({
      rpc: createServerRpc(31337, rpc1, rpc2),
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

  beforeAll(async () => {
    stack = await startAnvil(8555);
    // The first provider answers every call with HTTP 429 (L5 on the server side).
    limited = createServer((_req, res) => {
      res.writeHead(429).end("rate limited");
    });
    await new Promise<void>((r) => limited.listen(0, "127.0.0.1", r));
    const a = limited.address();
    limitedUrl = `http://127.0.0.1:${String(typeof a === "object" && a ? a.port : 0)}`;
  });

  afterAll(() => {
    stack.stop();
    limited.close();
  });

  beforeEach(resetDb);

  it("T05-19: five concurrent sends from one key get consecutive nonces and all land", async () => {
    const chain = chainOver(stack.url, stack.url);
    const to = newAccount().address;
    const start = await chain.rpc.getTransactionCount(chain.address("feeSponsor"));
    const results = await Promise.all(
      Array.from({ length: 5 }, () => chain.send("feeSponsor", { to, value: 1n })),
    );
    expect(results.every((r) => r.receipt?.status === "success")).toBe(true);
    expect(await chain.rpc.getBalance(to)).toBe(5n);
    expect(await chain.rpc.getTransactionCount(chain.address("feeSponsor"))).toBe(start + 5);
  });

  it("decodes a contract revert from the real simulation", async () => {
    const chain = chainOver(stack.url, stack.url);
    await expect(
      chain.send("treasury", {
        address: stack.contract,
        abi: amplopEnvelopesAbi,
        functionName: "deposit",
        args: [99n, 1n, `0x${"1".repeat(64)}`],
      }),
    ).rejects.toBeInstanceOf(ChainRevert);
    expect(await chain.rpc.getReceipt(`0x${"2".repeat(64)}`)).toBeNull();
  });

  it("T05-20: reads and sends still work when the first provider is rate-limited", async () => {
    const chain = chainOver(limitedUrl, stack.url);
    expect(await chain.read<bigint>("accountCount")).toBe(0n);
    const r = await chain.send("feeSponsor", { to: newAccount().address, value: 1n });
    expect(r.receipt?.status).toBe("success");
    expect(typeof (await chain.rpc.finalizedBlockNumber())).toBe("bigint");
  });
});
