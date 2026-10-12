// The local stack (19 S19-7, S19-8): Anvil at Mon 28 Sep 2026 09:00 UTC with the real contract in demo
// mode, Postgres migrations, the stand-ins, and a production build of the app on port 3000.
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { PORTS } from "./stand-ins";

export const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
export const WEB = fileURLToPath(new URL("../../", import.meta.url));
export const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

// Anvil's public test keys (accounts 1, 2 and 4); allowlisted in gitleaks and never used elsewhere.
export const KEYS = {
  treasury: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  cardService: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  feeSponsor: "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
};
export const MIDTRANS_KEY = "SB-Mid-server-e2e-test-key";
export const CRON_SECRET = "e2e-cron-secret-00000000000000000000";

export type Deployment = { address: string; token: string; settlement: string };

/** S19-17: the testnet run targets the real deployment; everything else runs on Anvil. */
export const TESTNET = Boolean(process.env.E2E_TESTNET);

export function deployment(): Deployment {
  const file = TESTNET ? "monad-testnet" : "anvil";
  return JSON.parse(readFileSync(`${ROOT}deployments/${file}.json`, "utf8")) as Deployment;
}

/** S19-8: every variable the app and server read in the harness. */
export function appEnv(d: Deployment): Record<string, string> {
  const example = Object.fromEntries(
    readFileSync(`${ROOT}.env.example`, "utf8")
      .split("\n")
      .filter((l) => /^[A-Z0-9_]+=/.test(l))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
  );
  return {
    ...example,
    NODE_ENV: "production",
    NEXT_PUBLIC_CHAIN_ID: "31337",
    MONAD_RPC_URL: `http://127.0.0.1:${String(PORTS.serverRpc)}`,
    MONAD_RPC_URL_FALLBACK: `http://127.0.0.1:${String(PORTS.serverRpc)}`,
    NEXT_PUBLIC_MONAD_RPC_URL: `http://127.0.0.1:${String(PORTS.browserRpc)}`,
    NEXT_PUBLIC_MONAD_RPC_URL_FALLBACK: "http://127.0.0.1:8545",
    NEXT_PUBLIC_CONTRACT_ADDRESS: d.address,
    NEXT_PUBLIC_AUSD_ADDRESS: d.token,
    NEXT_PUBLIC_EXPLORER_TX_URL: `http://127.0.0.1:${String(PORTS.explorer)}/tx/`,
    NEXT_PUBLIC_INDEXER_URL: "http://127.0.0.1:8080/v1/graphql",
    NEXT_PUBLIC_SITE_URL: BASE_URL,
    DEMO_MODE: "true",
    NEXT_PUBLIC_DEMO_MODE: "true",
    TREASURY_PRIVATE_KEY: KEYS.treasury,
    CARD_SERVICE_PRIVATE_KEY: KEYS.cardService,
    FEE_SPONSOR_PRIVATE_KEY: KEYS.feeSponsor,
    SETTLEMENT_ADDRESS: d.settlement,
    MIDTRANS_SERVER_KEY: MIDTRANS_KEY,
    MIDTRANS_IS_PRODUCTION: "false",
    MIDTRANS_API_BASE_URL: `http://127.0.0.1:${String(PORTS.midtrans)}`,
    SAMPLE_RATE_IDR_PER_USD: "16500",
    SAMPLE_RATE_USD_PER_EUR: "1.1511",
    NEXT_PUBLIC_SAMPLE_RATE_IDR_PER_USD: "16500",
    NEXT_PUBLIC_SAMPLE_RATE_USD_PER_EUR: "1.1511",
    CRON_SECRET,
    SITE_HOSTS: new URL(BASE_URL).host,
    ...(process.env.DATABASE_URL ? { DATABASE_URL: process.env.DATABASE_URL } : {}),
    ...(process.env.DATABASE_MIGRATION_URL
      ? { DATABASE_MIGRATION_URL: process.env.DATABASE_MIGRATION_URL }
      : {}),
  };
}

function run(cmd: string, args: string[], env: Record<string, string>, cwd: string): void {
  const r = spawnSync(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: "inherit" });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed`);
}

async function waitFor(
  url: string,
  ok: (r: Response) => boolean,
  label: string,
  ms = 120_000,
): Promise<void> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
      });
      if (ok(r)) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`${label} did not start`);
}

export async function startAnvil(): Promise<ChildProcess> {
  const anvil = spawn(
    "anvil",
    [
      "--chain-id",
      "31337",
      "--port",
      "8545",
      "--accounts",
      "10",
      "--balance",
      "10000",
      "--timestamp",
      "1790586000",
      // A block every half second like Monad, so the app's "wait a few blocks" ends without new txs.
      "--block-time",
      "0.5",
      "--silent",
    ],
    { stdio: "ignore" },
  );
  await waitFor("http://127.0.0.1:8545", (r) => r.ok, "anvil", 20_000);
  run("bash", ["contracts/script/deploy-local.sh"], {}, ROOT);
  return anvil;
}

/**
 * Anvil starts empty each run, so account ids repeat; rows from an earlier run would then belong to a
 * new account (a stale invite name on the wrong student). Every app table starts empty too; Drizzle's
 * own record of applied migrations is kept.
 */
async function resetDatabase(url: string): Promise<void> {
  const sql = postgres(url, { max: 1, onnotice: () => undefined });
  try {
    const rows = await sql<
      { t: string }[]
    >`SELECT tablename AS t FROM pg_tables WHERE schemaname = 'public' AND tablename <> '__drizzle_migrations'`;
    if (rows.length) await sql.unsafe(`TRUNCATE ${rows.map((r) => `"${r.t}"`).join(", ")} CASCADE`);
  } finally {
    await sql.end();
  }
}

/** Migrations, then (unless E2E_SKIP_BUILD) a production build, then `next start`. */
export async function startApp(env: Record<string, string>): Promise<ChildProcess> {
  run("npm", ["run", "db:migrate"], env, WEB);
  await resetDatabase(env.DATABASE_MIGRATION_URL ?? "");
  if (!process.env.E2E_SKIP_BUILD || !existsSync(`${WEB}.next/BUILD_ID`))
    run("npx", ["next", "build"], env, WEB);
  mkdirSync(`${WEB}test-results`, { recursive: true });
  const log = createWriteStream(`${WEB}test-results/server.log`);
  const app = spawn("npx", ["next", "start", "-p", new URL(BASE_URL).port || "3000"], {
    cwd: WEB,
    env: { ...process.env, ...env },
  });
  app.stdout.pipe(log);
  app.stderr.pipe(log);
  await waitFor(`${BASE_URL}/api/auth/nonce`, (r) => r.status < 500, "the app", 120_000);
  return app;
}

const INDEXER_DIR = `${ROOT}indexer`;
export const INDEXER_URL = "http://127.0.0.1:8080/v1/graphql";

/** The indexer's `_meta` row, or null while it is down (S19-11). */
export async function indexerMeta(): Promise<{ progressBlock: number; isReady: boolean } | null> {
  try {
    const r = await fetch(INDEXER_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "{ _meta { progressBlock isReady } }" }),
    });
    const j = (await r.json()) as {
      data?: { _meta: { progressBlock: number; isReady: boolean }[] };
    };
    return j.data?._meta[0] ?? null;
  } catch {
    return null;
  }
}

/** S19-11: 16's config.e2e.yaml under `envio dev --restart` (Docker), so each run starts empty. */
export async function startIndexer(): Promise<ChildProcess> {
  run("node", ["scripts/write-e2e-config.mjs"], {}, INDEXER_DIR);
  // envio creates its network from two tasks at once and can end up with duplicates it then rejects.
  spawnSync("docker", ["network", "create", "envio-network"], { stdio: "ignore" });
  mkdirSync(`${WEB}test-results`, { recursive: true });
  const log = createWriteStream(`${WEB}test-results/indexer.log`);
  const ix = spawn("pnpm", ["envio", "--config", "config.e2e.yaml", "dev", "--restart"], {
    cwd: INDEXER_DIR,
    env: { ...process.env, TUI_OFF: "true" },
  });
  ix.stdout.pipe(log);
  ix.stderr.pipe(log);
  const until = Date.now() + 300_000;
  while (Date.now() < until) {
    if ((await indexerMeta())?.isReady) return ix;
    if (ix.exitCode !== null) break;
    await new Promise((r) => setTimeout(r, 1_000));
  }
  ix.kill();
  throw new Error("the indexer did not start; see test-results/indexer.log");
}

/** Stops the indexer and removes its containers and database. */
export function stopIndexer(ix: ChildProcess): void {
  ix.kill();
  spawnSync("pnpm", ["envio", "--config", "config.e2e.yaml", "stop"], {
    cwd: INDEXER_DIR,
    stdio: "ignore",
  });
}
