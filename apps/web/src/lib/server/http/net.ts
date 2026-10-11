// Client IP, allowed hosts and the origin check (05 S05-15, S05-27, S05-28).
import "server-only";
import { createHash } from "node:crypto";
import { env } from "../env";
import { apiError } from "./errors";

/** IPv4 as is; IPv6 cut to its /64. */
export function ipKey(headers: Headers): string {
  const raw = headers.get("x-real-ip") ?? headers.get("x-forwarded-for")?.split(",")[0] ?? "";
  const ip = raw.trim().toLowerCase();
  if (ip === "") return "unknown";
  if (!ip.includes(":")) return ip;
  return expandV6(ip).slice(0, 4).join(":");
}

function expandV6(ip: string): string[] {
  const [head = "", tail] = ip.split("::");
  const a = head ? head.split(":") : [];
  const b = tail ? tail.split(":") : [];
  const fill =
    tail === undefined ? [] : Array<string>(Math.max(0, 8 - a.length - b.length)).fill("0");
  return [...a, ...fill, ...b].map((g) => g.replace(/^0+(?=.)/, ""));
}

export function ipHash(key: string): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 12);
}

export function allowedHosts(): Set<string> {
  const e = env();
  const hosts = e.SITE_HOSTS.split(",").map((h) => h.trim().toLowerCase());
  for (const v of [e.VERCEL_PROJECT_PRODUCTION_URL, e.VERCEL_BRANCH_URL, e.VERCEL_URL]) {
    if (v) hosts.push(v.toLowerCase());
  }
  if (e.NODE_ENV !== "production") hosts.push("localhost:3000", "127.0.0.1:3000");
  return new Set(hosts.filter(Boolean));
}

export function checkOrigin(headers: Headers): void {
  const site = headers.get("sec-fetch-site");
  if (site === "cross-site" || site === "same-site") throw apiError("bad_origin");
  const origin = headers.get("origin");
  if (origin === null) return;
  let host: string;
  try {
    host = new URL(origin).host.toLowerCase();
  } catch {
    throw apiError("bad_origin");
  }
  if (!allowedHosts().has(host)) throw apiError("bad_origin");
}
