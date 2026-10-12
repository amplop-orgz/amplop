// The only place that reads process.env (05 S05-49, S05-50). Parsed once, lazily, so `next build`
// works without secrets. A failure lists variable names, never values.
import "server-only";
import { z } from "zod";

const key = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const address = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/)
  .transform((s) => s.toLowerCase() as `0x${string}`);
const url = z.url();
const rate = z.string().regex(/^[0-9]+(\.[0-9]{1,6})?$/);

const schema = z.object({
  DATABASE_URL: url,
  DATABASE_MIGRATION_URL: z.string().optional(),
  MONAD_RPC_URL: url,
  MONAD_RPC_URL_FALLBACK: url,
  NEXT_PUBLIC_CHAIN_ID: z.enum(["10143", "31337"]),
  NEXT_PUBLIC_CONTRACT_ADDRESS: address,
  NEXT_PUBLIC_AUSD_ADDRESS: address,
  DEMO_MODE: z.string().optional(),
  SETTLEMENT_ADDRESS: address,
  TREASURY_PRIVATE_KEY: key,
  CARD_SERVICE_PRIVATE_KEY: key,
  FEE_SPONSOR_PRIVATE_KEY: key,
  MIDTRANS_SERVER_KEY: z.string().min(1),
  MIDTRANS_IS_PRODUCTION: z.literal("false"),
  MIDTRANS_API_BASE_URL: z
    .url()
    .refine((u) => /^(localhost|127\.0\.0\.1|(.+\.)?midtrans\.com)$/.test(new URL(u).hostname))
    .optional(),
  SAMPLE_RATE_IDR_PER_USD: z.string().regex(/^[1-9][0-9]*$/),
  SAMPLE_RATE_USD_PER_EUR: rate,
  NEXT_PUBLIC_SAMPLE_RATE_IDR_PER_USD: z.string(),
  NEXT_PUBLIC_SAMPLE_RATE_USD_PER_EUR: z.string(),
  // S05-47: shorter than 32 characters means cron is switched off (every call 401), not a failed start.
  CRON_SECRET: z.string().optional(),
  ALERT_WEBHOOK_URL: z.union([z.literal(""), url]).optional(),
  AUSD_FAUCET_ADDRESS: z.union([z.literal(""), address]).optional(),
  SITE_HOSTS: z.string().default(""),
  NODE_ENV: z.string().optional(),
  VERCEL_PROJECT_PRODUCTION_URL: z.string().optional(),
  VERCEL_BRANCH_URL: z.string().optional(),
  VERCEL_URL: z.string().optional(),
});

type Raw = z.infer<typeof schema>;

export type Env = Raw & {
  chainId: 10143 | 31337;
  idrPerUsd: bigint;
  usdPerEur: { num: bigint; den: bigint };
  cronSecret: string | null;
  secrets: string[];
};

/** `1.1511` → `{ num: 11511n, den: 10000n }`, never a float. */
export function parseRate(s: string): { num: bigint; den: bigint } {
  const [whole = "0", frac = ""] = s.split(".");
  const den = 10n ** BigInt(frac.length);
  return { num: BigInt(whole) * den + BigInt(frac || "0"), den };
}

export class EnvError extends Error {
  constructor(readonly names: string[]) {
    super(`Invalid or missing environment variables: ${names.join(", ")}`);
    this.name = "EnvError";
  }
}

export function parseEnv(source: Record<string, string | undefined>): Env {
  const r = schema.safeParse(source);
  if (!r.success)
    throw new EnvError([...new Set(r.error.issues.map((i) => String(i.path[0])))].sort());
  const e = r.data;
  const bad: string[] = [];
  if (e.NEXT_PUBLIC_SAMPLE_RATE_IDR_PER_USD !== e.SAMPLE_RATE_IDR_PER_USD)
    bad.push("NEXT_PUBLIC_SAMPLE_RATE_IDR_PER_USD");
  if (e.NEXT_PUBLIC_SAMPLE_RATE_USD_PER_EUR !== e.SAMPLE_RATE_USD_PER_EUR)
    bad.push("NEXT_PUBLIC_SAMPLE_RATE_USD_PER_EUR");
  const secrets = [
    e.TREASURY_PRIVATE_KEY,
    e.CARD_SERVICE_PRIVATE_KEY,
    e.FEE_SPONSOR_PRIVATE_KEY,
    e.MIDTRANS_SERVER_KEY,
    e.CRON_SECRET,
    e.DATABASE_URL,
    e.DATABASE_MIGRATION_URL,
    e.ALERT_WEBHOOK_URL,
  ].filter((v): v is string => typeof v === "string" && v.length > 0);
  // S05-50: no NEXT_PUBLIC_ variable may carry a server secret.
  for (const [name, value] of Object.entries(source)) {
    if (
      name.startsWith("NEXT_PUBLIC_") &&
      value &&
      secrets.some((s) => s === value || s.replace(/^0x/, "") === value)
    ) {
      bad.push(name);
    }
  }
  if (bad.length) throw new EnvError(bad.sort());
  const cron = e.CRON_SECRET ?? "";
  return {
    ...e,
    chainId: Number(e.NEXT_PUBLIC_CHAIN_ID) as 10143 | 31337,
    idrPerUsd: BigInt(e.SAMPLE_RATE_IDR_PER_USD),
    usdPerEur: parseRate(e.SAMPLE_RATE_USD_PER_EUR),
    cronSecret: cron.length >= 32 ? cron : null,
    secrets,
  };
}

let cached: Env | undefined;

export function env(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}

/** Tests only: drop the parsed copy so the next call re-reads process.env. */
export function resetEnv(): void {
  cached = undefined;
}

/** S05-30: exactly "true" is on; anything else is off. */
export function isDemo(): boolean {
  return process.env.DEMO_MODE === "true";
}

const SECRET_NAMES = [
  "TREASURY_PRIVATE_KEY",
  "CARD_SERVICE_PRIVATE_KEY",
  "FEE_SPONSOR_PRIVATE_KEY",
  "MIDTRANS_SERVER_KEY",
  "CRON_SECRET",
  "DATABASE_URL",
  "DATABASE_MIGRATION_URL",
  "ALERT_WEBHOOK_URL",
] as const;

/** Raw values the logger redacts (S05-46 rule 3). Read without validation, so logging works on a bad start. */
export function redactionValues(): { secrets: string[]; rpc1?: string; rpc2?: string } {
  const secrets: string[] = [];
  for (const n of SECRET_NAMES) {
    const v = process.env[n];
    if (v && v.length >= 6) secrets.push(v, ...(/^0x/.test(v) ? [v.slice(2)] : []));
  }
  return { secrets, rpc1: process.env.MONAD_RPC_URL, rpc2: process.env.MONAD_RPC_URL_FALLBACK };
}
