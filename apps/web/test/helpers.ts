// Test helpers: signed requests, a fake RPC behind the chain seam, and a database reset.
import { buildAuthMessage, sha256Hex, toBase64Url, type ActionName } from "@amplop/shared/auth";
import { sql } from "drizzle-orm";
import { type Address, type Hex, type TransactionReceipt, zeroAddress } from "viem";
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { issueNonce } from "@/lib/server/auth/verify";
import { Chain, setChain } from "@/lib/server/chain/chain";
import type { ContractTx, Fees, Rpc } from "@/lib/server/chain/types";
import { db } from "@/lib/server/db";

export const newAccount = (): PrivateKeyAccount => privateKeyToAccount(generatePrivateKey());

export async function resetDb(): Promise<void> {
  // The app role may not TRUNCATE (T05-22), so rows are deleted.
  for (const t of [
    "nonces",
    "rate_limits",
    "profiles",
    "cards",
    "orders",
    "purchases",
    "invites",
    "reasons",
    "recoveries",
    "funding",
    "funding_daily",
    "signer_nonces",
  ]) {
    await db().execute(sql`DELETE FROM ${sql.identifier(t)}`);
  }
}

export type SignOpts = {
  account: PrivateKeyAccount;
  action: ActionName;
  accountId?: bigint;
  body?: string;
  site?: string;
  chainId?: number;
  issued?: string;
  nonce?: string;
  address?: string;
};

export async function signedHeaders(o: SignOpts): Promise<Record<string, string>> {
  const nonce = o.nonce ?? (await issueNonce()).nonce;
  const message = buildAuthMessage({
    site: o.site ?? "localhost:3000",
    chainId: o.chainId ?? 31337,
    action: o.action,
    accountId: o.accountId ?? 0n,
    address: o.address ?? o.account.address,
    nonce,
    issued: o.issued ?? new Date().toISOString(),
    bodySha256: await sha256Hex(o.body ?? ""),
  });
  return {
    "Amplop-Auth-Message": toBase64Url(message),
    "Amplop-Auth-Signature": await o.account.signMessage({ message }),
  };
}

export type CallOpts = {
  method?: "GET" | "POST" | "PUT";
  path?: string;
  headers?: Record<string, string>;
  body?: string | null;
  params?: Record<string, string>;
};

type Handler = (
  req: Request,
  next?: { params: Promise<Record<string, string | string[]>> },
) => Promise<Response>;

export function request(o: CallOpts = {}): Request {
  const method = o.method ?? "GET";
  const headers = new Headers({ "x-real-ip": "203.0.113.7", ...(o.headers ?? {}) });
  if (method !== "GET" && !headers.has("content-type"))
    headers.set("content-type", "application/json");
  return new Request(`http://localhost:3000${o.path ?? "/api/test"}`, {
    method,
    headers,
    ...(o.body === undefined || o.body === null ? {} : { body: o.body }),
  });
}

export async function call(
  handler: Handler,
  o: CallOpts = {},
): Promise<{ status: number; json: unknown; res: Response }> {
  const res = await handler(request(o), { params: Promise.resolve(o.params ?? {}) });
  const text = await res.clone().text();
  return { status: res.status, json: text ? (JSON.parse(text) as unknown) : null, res };
}

export function errCode(json: unknown): string | undefined {
  return (json as { error?: { code?: string } } | null)?.error?.code;
}

type AccountState = { owner: Address; trusted: Address };

/** A programmable fake of the RPC. Contract reads come from `accounts` and `reads`. */
export class FakeRpc implements Rpc {
  accounts = new Map<bigint, AccountState>();
  reads = new Map<string, unknown>();
  balances = new Map<string, bigint>();
  fees: Fees = { maxFeePerGas: 100n * 10n ** 9n, maxPriorityFeePerGas: 10n ** 9n };
  gasEstimate = 100_000n;
  txCount = 0;
  sent: Hex[] = [];
  calls: string[] = [];
  failReads = false;
  revertWith: string | null = null;
  receiptTimeout = false;
  receiptStatus: "success" | "reverted" = "success";
  sendError: Error | null = null;

  readContract(req: ContractTx): Promise<unknown> {
    this.calls.push(`read:${req.functionName}`);
    if (this.failReads) return Promise.reject(new Error("rpc down"));
    const [arg] = req.args;
    if (req.functionName === "accountInfo") {
      const a = this.accounts.get(arg as bigint);
      return Promise.resolve({
        owner: a?.owner ?? zeroAddress,
        trusted: a?.trusted ?? zeroAddress,
        split: [0, 0, 0, 0, 0],
        pendingSplit: [0, 0, 0, 0, 0],
        pendingSplitStartsAt: 0n,
        lockOn: false,
        everDeposited: false,
        requestSeq: 0n,
        skipSeconds: 0n,
      });
    }
    if (req.functionName === "trustedAccountOf") {
      for (const [id, a] of this.accounts)
        if (a.trusted.toLowerCase() === String(arg).toLowerCase()) return Promise.resolve(id);
      return Promise.resolve(0n);
    }
    if (req.functionName === "accountOf") {
      for (const [id, a] of this.accounts)
        if (a.owner.toLowerCase() === String(arg).toLowerCase()) return Promise.resolve(id);
      return Promise.resolve(0n);
    }
    const key = `${req.functionName}(${req.args.map(String).join(",")})`;
    if (this.reads.has(key)) return Promise.resolve(this.reads.get(key));
    if (this.reads.has(req.functionName)) return Promise.resolve(this.reads.get(req.functionName));
    return Promise.reject(new Error(`no fake for ${key}`));
  }
  simulate(req: ContractTx): Promise<void> {
    this.calls.push(`simulate:${req.functionName}`);
    if (this.revertWith) {
      return import("@/lib/server/chain/types").then(({ ChainRevert }) => {
        throw new ChainRevert(this.revertWith ?? "");
      });
    }
    return Promise.resolve();
  }
  estimateGas(): Promise<bigint> {
    return Promise.resolve(this.gasEstimate);
  }
  estimateFees(): Promise<Fees> {
    return Promise.resolve(this.fees);
  }
  getBalance(address: Address): Promise<bigint> {
    return Promise.resolve(this.balances.get(address.toLowerCase()) ?? 10n ** 21n);
  }
  getTransactionCount(): Promise<number> {
    return Promise.resolve(this.txCount);
  }
  sendRaw(serialized: Hex): Promise<Hex> {
    this.calls.push("sendRaw");
    if (this.sendError) return Promise.reject(this.sendError);
    this.sent.push(serialized);
    this.txCount++;
    return Promise.resolve("0x" as Hex);
  }
  waitForReceipt(hash: Hex): Promise<TransactionReceipt | null> {
    if (this.receiptTimeout) return Promise.resolve(null);
    return Promise.resolve(this.receipt(hash));
  }
  getReceipt(hash: Hex): Promise<TransactionReceipt | null> {
    return Promise.resolve(this.receipt(hash));
  }
  finalizedBlockNumber(): Promise<bigint> {
    return Promise.resolve(10n);
  }
  getBlockNumber(): Promise<bigint> {
    return Promise.resolve(10n);
  }
  private receipt(hash: Hex): TransactionReceipt {
    return {
      transactionHash: hash,
      status: this.receiptStatus,
      blockNumber: 5n,
      blockHash: `0x${"ab".repeat(32)}`,
      logs: [],
    } as unknown as TransactionReceipt;
  }
}

export const CONTRACT = "0x00000000000000000000000000000000000000c0" as Address;

/** Installs a Chain over a FakeRpc whose role getters match the given keys. */
export function fakeChain(rpc = new FakeRpc()): { rpc: FakeRpc; chain: Chain } {
  const accounts = { treasury: newAccount(), cardService: newAccount(), feeSponsor: newAccount() };
  rpc.reads.set("treasury", accounts.treasury.address);
  rpc.reads.set("cardService", accounts.cardService.address);
  rpc.reads.set("settlement", "0x00000000000000000000000000000000000000e1");
  rpc.reads.set("token", "0x00000000000000000000000000000000000000a1");
  rpc.reads.set("demoMode", true);
  const chain = new Chain({
    rpc,
    chainId: 31337,
    contract: CONTRACT,
    token: "0x00000000000000000000000000000000000000a1",
    settlement: "0x00000000000000000000000000000000000000e1",
    accounts,
    demo: true,
  });
  setChain(chain);
  return { rpc, chain };
}
