// zod primitives shared by the server's strict parsing and the client (05 S05-19).
import { z } from "zod";

export const zHex32 = z.string().regex(/^[0-9a-f]{32}$/);

export const zAccountId = z
  .string()
  .regex(/^[1-9][0-9]{0,17}$/)
  .transform((s) => BigInt(s));

export const zAddress = z.string().regex(/^0x[0-9a-f]{40}$/);

export const zUnits = z
  .string()
  .regex(/^(0|[1-9][0-9]{0,77})$/)
  .transform((s) => BigInt(s));

// C0 and C1 controls and the bidi controls. `<`, `>`, `"` and `&` are kept: escaping is the renderer's job.
const PLAIN_BAD = /[\p{Cc}\u202A-\u202E\u2066-\u2069]/u;

/** Trimmed, NFC-normalised plain text of `min` to `max` code points. */
export function zPlainText(min: number, max: number) {
  return z
    .string()
    .transform((s) => s.normalize("NFC").trim())
    .refine((s) => !PLAIN_BAD.test(s), { message: "bad_chars" })
    .refine((s) => Array.from(s).length >= min && Array.from(s).length <= max, {
      message: "length",
    });
}
