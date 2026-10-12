// Midtrans Core API (08 S08-18, S08-24 to S08-27): charge, status fetch and the notification check.
// Midtrans receives only the order id and the amount (S08-37).
import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { env } from "../env";
import { apiError } from "../http/errors";
import { log } from "../log";

const SANDBOX = "https://api.sandbox.midtrans.com";
const TIMEOUT_MS = 8_000;
const DAY_MS = 86_400_000;

function base(): string {
  return (env().MIDTRANS_API_BASE_URL ?? SANDBOX).replace(/\/$/, "");
}

function headers(): Record<string, string> {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Basic ${Buffer.from(`${env().MIDTRANS_SERVER_KEY}:`).toString("base64")}`,
  };
}

/** `YYYY-MM-DD HH:mm:ss` in Western Indonesian Time (UTC+7). */
export function midtransTime(s: string | undefined): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) return null;
  const d = new Date(`${s.replace(" ", "T")}+07:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** `"16500000"` or `"16500000.00"` to whole rupiah; anything else is null. */
export function grossRupiah(s: string): bigint | null {
  const m = /^([0-9]+)(\.00)?$/.exec(s);
  return m?.[1] ? BigInt(m[1]) : null;
}

export type Charge = { vaNumber: string; bank: string; expiresAt: Date };

const chargeResponse = z.looseObject({
  status_code: z.literal("201"),
  transaction_status: z.literal("pending"),
  va_numbers: z.array(z.looseObject({ bank: z.string(), va_number: z.string() })).min(1),
  expiry_time: z.string().optional(),
  transaction_time: z.string().optional(),
});

/** S08-18. Throws `charge_failed:<http status or timeout>` on anything but a pending BCA VA. */
export async function charge(orderId: string, rupiah: bigint): Promise<Charge> {
  let res: Response;
  try {
    res = await fetch(`${base()}/v2/charge`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        payment_type: "bank_transfer",
        transaction_details: { order_id: orderId, gross_amount: Number(rupiah) },
        bank_transfer: { bank: "bca" },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new Error("charge_failed:timeout");
  }
  const parsed = chargeResponse.safeParse(await res.json().catch(() => null));
  if ((res.status !== 200 && res.status !== 201) || !parsed.success)
    throw new Error(`charge_failed:${String(res.status)}`);
  const r = parsed.data;
  const va = r.va_numbers[0] as { bank: string; va_number: string };
  const tt = midtransTime(r.transaction_time);
  const expiresAt = midtransTime(r.expiry_time) ?? new Date((tt?.getTime() ?? Date.now()) + DAY_MS);
  return { vaNumber: va.va_number, bank: va.bank, expiresAt };
}

const statusResponse = z.looseObject({
  order_id: z.string(),
  transaction_status: z.string(),
  gross_amount: z.string(),
  status_code: z.string(),
  payment_type: z.string().optional(),
});
export type MidtransStatus = z.infer<typeof statusResponse>;

/** S08-27: an upstream answer, so unknown fields are allowed. */
export async function fetchStatus(orderId: string): Promise<MidtransStatus> {
  const res = await fetch(`${base()}/v2/${orderId}/status`, {
    headers: headers(),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const parsed = statusResponse.safeParse(await res.json().catch(() => null));
  if (!res.ok || !parsed.success) throw new Error(`status_failed:${String(res.status)}`);
  return parsed.data;
}

const s = z.string();
const optional = Object.fromEntries(
  [
    "transaction_id",
    "transaction_time",
    "settlement_time",
    "expiry_time",
    "status_message",
    "payment_type",
    "merchant_id",
    "fraud_status",
    "currency",
    "approval_code",
    "permata_va_number",
    "bill_key",
    "biller_code",
    "channel_response_code",
    "channel_response_message",
    "reference_id",
    "transaction_type",
    "issuer",
    "acquirer",
  ].map((k) => [k, s.optional()]),
);

/** S08-24: every documented bank-transfer field; anything else is refused. */
export const notificationSchema = z
  .object({
    order_id: s,
    status_code: s,
    gross_amount: s,
    signature_key: s,
    transaction_status: s,
    ...optional,
    va_numbers: z.array(z.object({ bank: s, va_number: s }).strict()).optional(),
    payment_amounts: z.array(z.object({ paid_at: s, amount: s }).strict()).optional(),
  })
  .strict();
export type Notification = z.infer<typeof notificationSchema>;

/** Parses the body; an unknown field is logged by key name only (S08-24). */
export function parseNotification(json: unknown): Notification {
  const r = notificationSchema.safeParse(json);
  if (r.success) return r.data;
  const unknown = r.error.issues.flatMap((i) => (i.code === "unrecognized_keys" ? i.keys : []));
  log.warn("webhook_bad_input", unknown.length ? { unknownKeys: unknown } : {});
  throw apiError("bad_input");
}

/** S08-25: sha512(order_id + status_code + gross_amount + server key), compared in constant time. */
export function signatureOk(n: Notification): boolean {
  const expected = Buffer.from(
    createHash("sha512")
      .update(n.order_id + n.status_code + n.gross_amount + env().MIDTRANS_SERVER_KEY)
      .digest("hex"),
  );
  const got = Buffer.from(n.signature_key.toLowerCase());
  return got.length === expected.length && timingSafeEqual(got, expected);
}
