// Signed requests (01 section 4, 05 S05-6 to S05-12).
import "server-only";
import { ACTIONS, fromBase64Url, sha256Hex, type ActionName } from "@amplop/shared/auth";
import { sql } from "drizzle-orm";
import { recoverMessageAddress, type Hex } from "viem";
import { db } from "../db";
import { env } from "../env";
import { apiError } from "../http/errors";
import { allowedHosts } from "../http/net";
import { randomHex16 } from "../ids";

export type SignedAuth = { address: `0x${string}`; accountId: bigint; nonce: string };

const NONCE_LIFE_S = 300;
const MAX_AGE_S = 300;
const MAX_FUTURE_S = 30;

const LINES: [string, RegExp][] = [
  ["Site", /^[a-z0-9.-]+(:[0-9]{1,5})?$/],
  ["Chain", /^[0-9]{1,10}$/],
  ["Action", /^[a-z.]+$/],
  ["Account", /^(0|[1-9][0-9]{0,17})$/],
  ["Address", /^0x[0-9a-f]{40}$/],
  ["Nonce", /^[0-9a-f]{32}$/],
  ["Issued", /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/],
  ["Body", /^[0-9a-f]{64}$/],
];

export type ParsedMessage = {
  site: string;
  chain: string;
  action: string;
  account: bigint;
  address: `0x${string}`;
  nonce: string;
  issued: string;
  body: string;
};

/** S05-7: exactly nine lines in order, one space after each colon; null on any deviation. */
export function parseAuthMessage(message: string): ParsedMessage | null {
  if (message.includes("\r")) return null;
  const lines = message.split("\n");
  if (lines.length !== 9 || lines[0] !== "Amplop request") return null;
  const v: string[] = [];
  for (let i = 0; i < LINES.length; i++) {
    const [name, re] = LINES[i] as [string, RegExp];
    const line = lines[i + 1] ?? "";
    const prefix = `${name}: `;
    if (!line.startsWith(prefix)) return null;
    const value = line.slice(prefix.length);
    if (!re.test(value)) return null;
    v.push(value);
  }
  const [site, chain, action, account, address, nonce, issued, body] = v as [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  if (Number.isNaN(Date.parse(issued))) return null;
  return {
    site,
    chain,
    action,
    account: BigInt(account),
    address: address as `0x${string}`,
    nonce,
    issued,
    body,
  };
}

/** S05-8 checks 1 to 9. Does not touch the nonce. */
export async function verifySignedRequest(
  headers: Headers,
  rawBody: Uint8Array<ArrayBuffer>,
  action: ActionName,
  nowMs = Date.now(),
): Promise<SignedAuth> {
  const encoded = headers.get("amplop-auth-message");
  const signature = headers.get("amplop-auth-signature");
  if (encoded === null || signature === null) throw apiError("auth_missing");
  const message = encoded.length <= 1024 ? fromBase64Url(encoded) : null;
  const m = message === null ? null : parseAuthMessage(message);
  if (
    !m ||
    !/^0x[0-9a-fA-F]{130}$/.test(signature) ||
    !(ACTIONS as readonly string[]).includes(m.action)
  ) {
    throw apiError("auth_malformed");
  }
  if (!allowedHosts().has(m.site)) throw apiError("auth_wrong_site");
  if (m.chain !== String(env().chainId)) throw apiError("auth_wrong_chain");
  if (m.action !== action) throw apiError("auth_wrong_action");
  const age = (nowMs - Date.parse(m.issued)) / 1000;
  if (age > MAX_AGE_S) throw apiError("auth_expired");
  if (-age > MAX_FUTURE_S) throw apiError("auth_future");
  if ((await sha256Hex(rawBody)) !== m.body) throw apiError("auth_body_mismatch");
  let signer: string;
  try {
    signer = await recoverMessageAddress({
      message: message as string,
      signature: signature as Hex,
    });
  } catch {
    throw apiError("auth_bad_signature");
  }
  if (signer.toLowerCase() !== m.address) throw apiError("auth_bad_signature");
  return { address: m.address, accountId: m.account, nonce: m.nonce };
}

/** S05-6: a fresh nonce, valid for five minutes. */
export async function issueNonce(): Promise<{ nonce: string; expiresAt: string }> {
  const nonce = randomHex16();
  const rows = await db().execute<{ expires_at: string }>(sql`
    INSERT INTO nonces (nonce, expires_at) VALUES (${nonce}, now() + make_interval(secs => ${NONCE_LIFE_S}))
    RETURNING to_char(expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS expires_at`);
  return { nonce, expiresAt: rows[0]?.expires_at ?? "" };
}

/** S05-10: single use, atomically. */
export async function consumeNonce(nonce: string): Promise<void> {
  const rows = await db().execute(sql`
    UPDATE nonces SET used_at = now()
    WHERE nonce = ${nonce} AND used_at IS NULL AND expires_at > now()
    RETURNING nonce`);
  if (rows.length !== 1) throw apiError("nonce_invalid");
}

/** S05-17: drops old nonces and rate-limit windows, a bounded batch at a time. 07's daily fund buckets live until their UTC day ends. */
export async function cleanup(): Promise<void> {
  await db().execute(
    sql`DELETE FROM nonces WHERE nonce IN (SELECT nonce FROM nonces WHERE expires_at < now() - interval '1 hour' LIMIT 500)`,
  );
  await db().execute(
    sql`DELETE FROM rate_limits WHERE (bucket, window_start) IN (SELECT bucket, window_start FROM rate_limits WHERE window_start < now() - interval '2 hours' AND NOT (bucket LIKE 'fund:%' AND window_start >= date_trunc('day', now())) LIMIT 500)`,
  );
}
