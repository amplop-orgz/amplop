// Structured JSON logs with redaction (05 S05-45, S05-46). The only place server code may print.
import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { redactionValues } from "../env";

type Level = "debug" | "info" | "warn" | "error";
type Fields = Record<string, unknown>;

const context = new AsyncLocalStorage<{ reqId: string; route: string }>();

export function withLogContext<T>(ctx: { reqId: string; route: string }, fn: () => T): T {
  return context.run(ctx, fn);
}

const KEYS = new Set([
  "privatekey",
  "key",
  "secret",
  "password",
  "token",
  "cardtoken",
  "authorization",
  "cookie",
  "signature",
  "signaturekey",
  "amplopauthmessage",
  "amplopauthsignature",
  "invitekey",
  "name",
  "studentname",
  "trustedname",
  "reason",
  "text",
  "merchantname",
  "merchantcity",
  "vanumber",
  "serverkey",
  "databaseurl",
  "rpcurl",
]);

const PATTERNS = [
  /0x[0-9a-fA-F]{130}(?![0-9a-fA-F])/g,
  /(SB-)?Mid-server-[A-Za-z0-9_-]*/g,
  /Bearer .*/g,
  /postgres(ql)?:\/\/\S+/g,
  /-----BEGIN[\s\S]*/g,
];

const R = "[redacted]";
const MAX = 500;

export function redactString(s: string): string {
  const { secrets, rpc1, rpc2 } = redactionValues();
  let out = s;
  if (rpc1) out = out.split(rpc1).join("[rpc1]");
  if (rpc2) out = out.split(rpc2).join("[rpc2]");
  for (const v of secrets) out = out.split(v).join(R);
  for (const p of PATTERNS) out = out.replace(p, R);
  return out.length > MAX ? out.slice(0, MAX) : out;
}

function errorFields(e: Error, nested = false): Fields {
  const short = (e as { shortMessage?: unknown }).shortMessage;
  const code = (e as { code?: unknown }).code;
  return {
    name: e.name,
    ...(code === undefined ? {} : { code: redact(code, 1) }),
    message: redactString(typeof short === "string" ? short : e.message),
    // Drizzle wraps the driver error, so the Postgres reason (e.g. 42P01, 42501) is only on the cause.
    ...(!nested && e.cause instanceof Error ? { cause: errorFields(e.cause, true) } : {}),
  };
}

export function redact(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return redactString(value);
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Error) return errorFields(value);
  if (value === null || typeof value !== "object") return value;
  if (depth >= 6) return "[depth]";
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out: Fields = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = KEYS.has(k.toLowerCase().replace(/[_-]/g, "")) ? R : redact(v, depth + 1);
  }
  return out;
}

function write(level: Level, event: string, fields?: Fields): void {
  const ctx = context.getStore();
  const line = {
    ts: new Date().toISOString(),
    level,
    event,
    ...(ctx ? { reqId: ctx.reqId, route: ctx.route } : {}),
    ...(fields ? (redact(fields) as Fields) : {}),
  };
  console.log(JSON.stringify(line));
}

export const log = {
  debug: (event: string, fields?: Fields) => {
    write("debug", event, fields);
  },
  info: (event: string, fields?: Fields) => {
    write("info", event, fields);
  },
  warn: (event: string, fields?: Fields) => {
    write("warn", event, fields);
  },
  error: (event: string, fields?: Fields) => {
    write("error", event, fields);
  },
};
