// The signed API client (01 section 4, 06 S06-28, S06-29). The message, signature, nonce and body
// are never logged.
"use client";
import {
  AUTH_MESSAGE_HEADER,
  AUTH_SIGNATURE_HEADER,
  buildAuthMessage,
  DEVICE_HEADER,
  sha256Hex,
  toBase64Url,
  type ActionName,
} from "@amplop/shared/auth";
import { currentSession } from "./account";
import { CHAIN_ID } from "./env";
import { readItem, writeItem } from "./storage";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type CallOpts = { auth?: { action: ActionName; accountId?: bigint }; device?: boolean };

let deviceInMemory: string | null = null;

/** 07 S07-25: one random id per device, or per tab when storage is blocked. */
export function deviceId(): string {
  const stored = readItem("local", "amplop.device");
  if (stored && /^[0-9a-f]{32}$/.test(stored)) return stored;
  deviceInMemory ??= Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  writeItem("local", "amplop.device", deviceInMemory);
  return deviceInMemory;
}

async function send(
  method: "GET" | "POST",
  path: string,
  body: unknown,
  opts: CallOpts,
): Promise<unknown> {
  const bytes = method === "POST" ? JSON.stringify(body ?? {}) : "";
  const headers: Record<string, string> = {};
  if (method === "POST") headers["Content-Type"] = "application/json";
  if (opts.device) headers[DEVICE_HEADER] = deviceId();
  if (opts.auth) {
    const session = currentSession();
    if (!session) throw new ApiError(401, "auth_missing", "Sign in first.");
    const nonceRes = await fetchJson("GET", "/api/auth/nonce", undefined, {});
    const { nonce, expiresAt } = nonceRes as { nonce: string; expiresAt: string };
    const serverOffset = Date.parse(expiresAt) - 5 * 60_000 - Date.now();
    const message = buildAuthMessage({
      site: location.host,
      chainId: CHAIN_ID,
      action: opts.auth.action,
      accountId: opts.auth.accountId ?? 0n,
      address: session.address,
      nonce,
      issued: new Date(Date.now() + serverOffset).toISOString(),
      bodySha256: await sha256Hex(bytes),
    });
    headers[AUTH_MESSAGE_HEADER] = toBase64Url(message);
    headers[AUTH_SIGNATURE_HEADER] = await session.account.signMessage({ message });
  }
  return fetchJson(method, path, bytes, headers);
}

async function fetchJson(
  method: "GET" | "POST",
  path: string,
  body: string | undefined,
  headers: Record<string, string>,
): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers,
      ...(method === "POST" ? { body } : {}),
      credentials: "same-origin",
      referrerPolicy: "no-referrer",
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "offline", "No connection.");
  }
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const err = (json as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiError(
      res.status,
      err?.code ?? "internal",
      err?.message ?? "Something went wrong.",
    );
  }
  return json;
}

/** A 409 (nonce used or expired) is retried once with a fresh nonce; 401 and 403 never are. */
async function withRetry(
  method: "GET" | "POST",
  path: string,
  body: unknown,
  opts: CallOpts,
): Promise<unknown> {
  try {
    return await send(method, path, body, opts);
  } catch (e) {
    if (opts.auth && e instanceof ApiError && e.status === 409 && e.code === "nonce_invalid")
      return send(method, path, body, opts);
    throw e;
  }
}

export const api = {
  get: <T>(path: string, opts: CallOpts = {}) =>
    withRetry("GET", path, undefined, opts) as Promise<T>,
  post: <T>(path: string, body: unknown, opts: CallOpts = {}) =>
    withRetry("POST", path, body, opts) as Promise<T>,
};
