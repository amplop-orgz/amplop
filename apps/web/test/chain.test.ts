// T05-18 and T05-21 (sendContractTx and the reserve rule) with the fake RPC; T05-13 and T05-23.
import { readFileSync } from "node:fs";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { amplopEnvelopesAbi } from "@amplop/shared/abi";
import { GAS_FLOOR } from "@amplop/shared/constants";
import { sql } from "drizzle-orm";
import {
  encodeEventTopics,
  encodeAbiParameters,
  parseEther,
  parseTransaction,
  type TransactionReceipt,
} from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";
import config, { SECURITY_HEADERS } from "../next.config";
import { gasLimit, MAX_FEE_PER_GAS } from "@/lib/server/chain/chain";
import { ChainBusy, ChainRevert, ChainUnavailable, ReserveTooLow } from "@/lib/server/chain/types";
import { db } from "@/lib/server/db";
import { buildCsp } from "@/lib/server/security/csp";
import {
  filesToScan,
  loadAllow,
  scan,
  secretValues,
  type Pattern,
} from "../scripts/bundle-scan.mjs";
import { CONTRACT, fakeChain, resetDb } from "./helpers";

beforeEach(async () => {
  await resetDb();
});

const call = (functionName: string, args: unknown[] = []) => ({
  address: CONTRACT,
  abi: amplopEnvelopesAbi,
  functionName,
  args,
});

describe("T05-18 sendContractTx", () => {
  it("sets the gas limit to the larger of estimate + 20% and the floor", async () => {
    expect(gasLimit(100_000n, "register")).toBe(GAS_FLOOR.register);
    expect(gasLimit(200_000n, "register")).toBe(240_000n);
    expect(gasLimit(100_001n, "unknownFn")).toBe(120_002n);
    const { rpc, chain } = fakeChain();
    rpc.gasEstimate = 300_000n;
    await chain.send("cardService", call("collect", [`0x${"0".repeat(64)}`, 1n]));
    const tx = parseTransaction(rpc.sent[0] ?? "0x");
    expect(tx.gas).toBe(360_000n);
    expect(tx.nonce).toBe(0);
  });
  it("throws the decoded revert and never signs", async () => {
    const { rpc, chain } = fakeChain();
    rpc.revertWith = "PurchaseIdUsed";
    await expect(
      chain.send("cardService", call("collect", [`0x${"0".repeat(64)}`, 1n])),
    ).rejects.toMatchObject({
      name: "ChainRevert",
      errorName: "PurchaseIdUsed",
    });
    expect(rpc.calls).not.toContain("sendRaw");
  });
  it("returns receipt null on a timeout, and stores the hash before broadcast", async () => {
    const { rpc, chain } = fakeChain();
    rpc.receiptTimeout = true;
    const order: string[] = [];
    const r = await chain.send("treasury", call("deposit", [1n, 1n, `0x${"0".repeat(64)}`]), {
      beforeBroadcast: (hash) => {
        order.push(`hook:${hash}`);
        expect(rpc.calls).not.toContain("sendRaw");
        return Promise.resolve();
      },
    });
    expect(r.receipt).toBeNull();
    expect(r.confirmMs).toBeNull();
    expect(order).toEqual([`hook:${r.hash}`]);
  });
  it("throws on a reverted receipt, a fee above the cap, and a broadcast error", async () => {
    let { rpc, chain } = fakeChain();
    rpc.receiptStatus = "reverted";
    await expect(
      chain.send("cardService", call("releaseHold", [`0x${"0".repeat(64)}`])),
    ).rejects.toBeInstanceOf(ChainRevert);
    ({ rpc, chain } = fakeChain());
    rpc.fees = { maxFeePerGas: MAX_FEE_PER_GAS + 1n, maxPriorityFeePerGas: 1n };
    await expect(
      chain.send("cardService", call("releaseHold", [`0x${"0".repeat(64)}`])),
    ).rejects.toBeInstanceOf(ChainBusy);
    ({ rpc, chain } = fakeChain());
    rpc.sendError = new Error("connection reset");
    await expect(
      chain.send("cardService", call("releaseHold", [`0x${"0".repeat(64)}`])),
    ).rejects.toBeInstanceOf(ChainUnavailable);
  });
  it("treats already known as sent, and re-signs once on nonce too low", async () => {
    let { rpc, chain } = fakeChain();
    rpc.sendError = new Error("already known");
    await expect(chain.send("feeSponsor", { to: CONTRACT, value: 1n })).resolves.toMatchObject({
      receipt: expect.anything() as unknown,
    });
    ({ rpc, chain } = fakeChain());
    const hooks: string[] = [];
    let first = true;
    const real = rpc.sendRaw.bind(rpc);
    rpc.sendRaw = (s) => {
      if (first) {
        first = false;
        rpc.txCount = 4;
        return Promise.reject(new Error("nonce too low"));
      }
      return real(s);
    };
    await chain.send(
      "feeSponsor",
      { to: CONTRACT, value: 1n },
      { beforeBroadcast: (h) => Promise.resolve(void hooks.push(h)) },
    );
    expect(hooks).toHaveLength(2);
    expect(parseTransaction(rpc.sent[0] ?? "0x").nonce).toBe(4);
    expect(parseTransaction(rpc.sent[0] ?? "0x").gas).toBe(21_000n);
  });
  it("uses a fresh signer_nonces row over the chain count, and ignores a stale one", async () => {
    const { rpc, chain } = fakeChain();
    const addr = chain.address("treasury").toLowerCase();
    await db().execute(sql`INSERT INTO signer_nonces VALUES (${addr}, 9, now())`);
    await chain.send("treasury", call("deposit", [1n, 1n, `0x${"0".repeat(64)}`]));
    expect(parseTransaction(rpc.sent[0] ?? "0x").nonce).toBe(9);
    await db().execute(
      sql`UPDATE signer_nonces SET next_nonce = 50, updated_at = now() - interval '31 seconds'`,
    );
    await chain.send("treasury", call("deposit", [1n, 1n, `0x${"0".repeat(64)}`]));
    expect(parseTransaction(rpc.sent[1] ?? "0x").nonce).toBe(1);
  });
  it("refuses to send when a key does not match the contract", async () => {
    const { rpc, chain } = fakeChain();
    rpc.reads.set("treasury", "0x0000000000000000000000000000000000000bad");
    await expect(
      chain.send("treasury", call("deposit", [1n, 1n, `0x${"0".repeat(64)}`])),
    ).rejects.toThrow("misconfigured");
    expect(rpc.calls).not.toContain("sendRaw");
  });
  it("finds the single matching event of the contract", () => {
    const { chain } = fakeChain();
    const topics = encodeEventTopics({
      abi: amplopEnvelopesAbi,
      eventName: "TrustedRemoved",
      args: { accountId: 3n, trusted: CONTRACT },
    });
    const log = { address: CONTRACT, topics, data: "0x" };
    const other = { address: "0x0000000000000000000000000000000000000001", topics, data: "0x" };
    const receipt = { logs: [log, other] } as unknown as TransactionReceipt;
    expect(chain.findEvent(receipt, "TrustedRemoved").args).toMatchObject({ accountId: 3n });
    expect(() => chain.findEvent(receipt, "TrustedLinked")).toThrow();
    expect(() =>
      chain.findEvent({ logs: [log, log] } as unknown as TransactionReceipt, "TrustedRemoved"),
    ).toThrow();
    expect(encodeAbiParameters([{ type: "uint256" }], [1n])).toBeTruthy();
  });
});

describe("T05-21 reserve", () => {
  it("refuses a transfer that would leave under 10 MON, before signing", async () => {
    const { rpc, chain } = fakeChain();
    rpc.balances.set(chain.address("feeSponsor").toLowerCase(), parseEther("10.5"));
    await expect(
      chain.send("feeSponsor", { to: CONTRACT, value: parseEther("0.5") }),
    ).rejects.toBeInstanceOf(ReserveTooLow);
    expect(rpc.calls).not.toContain("sendRaw");
  });
  it("alerts once an hour when a wallet is under reserve plus budget", async () => {
    const { rpc, chain } = fakeChain();
    rpc.balances.set(chain.address("cardService").toLowerCase(), parseEther("14"));
    const out: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((s: string) => out.push(s));
    await chain.send("cardService", call("releaseHold", [`0x${"0".repeat(64)}`]));
    await chain.send("cardService", call("releaseHold", [`0x${"0".repeat(64)}`]));
    await new Promise((r) => setTimeout(r, 100)); // the alert is not awaited by send
    spy.mockRestore();
    expect(
      out.filter((l) => l.includes('"event":"alert"') && l.includes("reserve_low:cardService")),
    ).toHaveLength(1);
    expect(rpc.sent).toHaveLength(2);
  });
});

describe("T05-13 headers and CSP", () => {
  it("builds a nonce policy without unsafe-eval in production", () => {
    const p = buildCsp("abc", {
      NODE_ENV: "production",
      NEXT_PUBLIC_MONAD_RPC_URL: "https://rpc.example/key",
      NEXT_PUBLIC_INDEXER_URL: "https://idx.example/v1/graphql",
    });
    for (const part of [
      "'nonce-abc'",
      "'strict-dynamic'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'none'",
      "https://rpc.example",
      "https://idx.example",
    ]) {
      expect(p).toContain(part);
    }
    expect(p).not.toContain("unsafe-eval");
    expect(p).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(p).not.toContain("/key");
    expect(buildCsp("n", { NODE_ENV: "development" })).toContain("'unsafe-eval'");
    expect(p).toContain("upgrade-insecure-requests");
    expect(buildCsp("n", { localHttp: true })).not.toContain("upgrade-insecure-requests");
  });
  it("sets the static headers exactly", async () => {
    const h = await config.headers?.();
    expect(h).toEqual([{ source: "/:path*", headers: SECURITY_HEADERS }]);
    expect(Object.fromEntries(SECURITY_HEADERS.map((x) => [x.key, x.value]))).toMatchObject({
      "Referrer-Policy": "no-referrer",
      "X-Frame-Options": "DENY",
      "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
    });
    expect(config.poweredByHeader).toBe(false);
  });
});

describe("T05-23 bundle scanner", () => {
  const patterns = JSON.parse(
    readFileSync(new URL("../scripts/bundle-scan.patterns.json", import.meta.url), "utf8"),
  ) as Pattern[];
  const fakeKey = `0x${"12".repeat(32)}`;
  function fixture(files: Record<string, string>): string {
    const root = mkdtempSync(join(tmpdir(), "scan-"));
    for (const [name, text] of Object.entries(files)) {
      const p = join(root, ".next", name);
      mkdirSync(join(p, ".."), { recursive: true });
      writeFileSync(p, text);
    }
    return root;
  }
  const run = (root: string, allow = "", env: Record<string, string> = {}) =>
    scan({
      files: filesToScan(join(root, ".next")),
      patterns,
      allow: loadAllow(allow),
      secrets: secretValues(env),
      root,
    });

  it("catches each pattern and never prints the full value", () => {
    const root = fixture({
      "static/a.js": `const k="${fakeKey}"`,
      "static/b.js": "process.env.TREASURY_PRIVATE_KEY",
      "static/c.css": "SB-Mid-server-abc12345",
      "server/app/x.html": "postgres://u:p@h/db",
    });
    const hits = run(root);
    expect(hits.map((h) => h.id).sort()).toEqual(["env-name", "hex32", "midtrans-key", "pg-url"]);
    for (const h of hits) expect(h.preview.length).toBeLessThanOrEqual(7);
  });
  it("passes public names and allow-listed constants, and catches a secret value without 0x", () => {
    const root = fixture({
      "static/a.js": `NEXT_PUBLIC_MONAD_RPC_URL ${fakeKey}`,
      "static/b.js": `x${fakeKey.slice(2)}y`,
    });
    const hits = run(root, `${fakeKey} # test constant`, { TREASURY_PRIVATE_KEY: fakeKey });
    // a.js holds the key with and without 0x, b.js without.
    expect(hits.map((h) => h.id)).toEqual(Array(3).fill("value:TREASURY_PRIVATE_KEY"));
    expect(run(fixture({ "static/a.js": "NEXT_PUBLIC_MONAD_RPC_URL" }))).toEqual([]);
  });
});
