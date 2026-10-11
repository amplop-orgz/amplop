// Responses (05 S05-20 to S05-23, S05-29). Every /api response is JSON, no-store and nosniff.
import "server-only";
import type { ApiError } from "./errors";

const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

/** bigint becomes a decimal string; a JavaScript number above the safe range is a bug, not data. */
export function toJson(value: unknown): string {
  return JSON.stringify(value, (_k, v: unknown) => {
    if (typeof v === "bigint") return v.toString();
    if (typeof v === "number" && Number.isInteger(v) && !Number.isSafeInteger(v)) {
      throw new Error("unsafe integer in a response");
    }
    return v;
  });
}

export function ok(json: unknown, status = 200): Response {
  return new Response(toJson(json), { status, headers: HEADERS });
}

export function errorResponse(e: ApiError): Response {
  const headers: Record<string, string> = { ...HEADERS };
  if (e.retryAfter !== undefined) headers["Retry-After"] = String(e.retryAfter);
  return new Response(toJson({ error: { code: e.code, message: e.message } }), {
    status: e.status,
    headers,
  });
}
