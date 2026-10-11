// Operator alerts (05 S05-40): `{ text }` to ALERT_WEBHOOK_URL, at most once per kind per hour.
// Alert text never carries keys, names, reasons, shop names, signatures or invite keys.
import "server-only";
import { env } from "./env";
import { bump } from "./http/ratelimit";
import { log } from "./log";

export async function sendAlert(kind: string, text: string): Promise<void> {
  try {
    if ((await bump(`alert:${kind}`, "hour")) > 1) return;
    const url = env().ALERT_WEBHOOK_URL;
    if (!url) {
      log.warn("alert", { kind, alertText: text });
      return;
    }
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(3_000),
    });
    if (!res.ok) log.warn("alert_failed", { kind, status: res.status });
  } catch (e) {
    // An alert never changes the response it follows.
    log.warn("alert_failed", { kind, error: e });
  }
}
