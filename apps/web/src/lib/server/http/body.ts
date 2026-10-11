// Body cap and content type (05 S05-18).
import "server-only";
import { apiError } from "./errors";

export const BODY_LIMIT = 10_240;

export async function readBody(req: Request): Promise<Uint8Array<ArrayBuffer>> {
  const len = req.headers.get("content-length");
  if (len !== null && Number(len) > BODY_LIMIT) throw apiError("body_too_large");
  if (req.body === null) return new Uint8Array();
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > BODY_LIMIT) {
      await reader.cancel();
      throw apiError("body_too_large");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

export function checkContentType(req: Request): void {
  const t = (req.headers.get("content-type") ?? "").toLowerCase().replace(/\s+/g, "");
  if (t !== "application/json" && t !== "application/json;charset=utf-8")
    throw apiError("bad_content_type");
}
