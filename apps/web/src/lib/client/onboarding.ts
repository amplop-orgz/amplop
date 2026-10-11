// Sign-up state (07 S07-1 to S07-4, S07-15). The draft holds no key or address.
import { readJson, writeItem } from "./storage";

export type Split = [number, number, number, number, number];
export type Draft = { name?: string; split?: Split };

export const DEFAULT_SPLIT: Split = [40, 15, 15, 20, 10];

const key = (credentialId: string) => `amplop.onboarding.${credentialId}`;

export function readDraft(credentialId: string): Draft {
  const d = readJson("session", key(credentialId)) as { name?: unknown; split?: unknown } | null;
  if (!d || typeof d !== "object") return {};
  const s: unknown[] = Array.isArray(d.split) ? (d.split as unknown[]) : [];
  const split =
    s.length === 5 &&
    s.every((n) => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= 100)
      ? (s as Split)
      : undefined;
  return { ...(typeof d.name === "string" ? { name: d.name } : {}), ...(split ? { split } : {}) };
}

export function writeDraft(credentialId: string, patch: Draft): void {
  writeItem("session", key(credentialId), JSON.stringify({ ...readDraft(credentialId), ...patch }));
}

export function clearDraft(credentialId: string): void {
  writeItem("session", key(credentialId), null);
}

// --- the split editor's rules (S07-15)

export function total(s: readonly number[]): number {
  return s.reduce((a, b) => a + b, 0);
}

export function canLess(s: readonly number[], i: number): boolean {
  return (s[i] ?? 0) >= 5;
}

export function canMore(s: readonly number[], i: number): boolean {
  return (s[i] ?? 0) < 100 && total(s) < 100;
}

export function step(s: Split, i: number, delta: 5 | -5): Split {
  if (delta > 0 ? !canMore(s, i) : !canLess(s, i)) return s;
  const next = [...s] as Split;
  next[i] = (next[i] ?? 0) + delta;
  return next;
}

export function splitValid(s: readonly number[]): boolean {
  return s.length === 5 && total(s) === 100 && s.every((n) => n % 5 === 0 && n >= 0 && n <= 100);
}

// --- where /app, /app/name and /app/setup go (S07-4)

export type Resume =
  | { to: "name" }
  | { to: "welcome-finish" }
  | { to: "name-account" }
  | { to: "home" }
  | { to: "parent" };

export function resume(
  role: "none" | "student" | "trusted",
  profileSaved: boolean | undefined,
  draft: Draft,
): Resume {
  if (role === "trusted") return { to: "parent" };
  if (role === "student") return profileSaved === false ? { to: "name-account" } : { to: "home" };
  return draft.name ? { to: "welcome-finish" } : { to: "name" };
}

// --- the fund promise started right after the passkey (S07-1 step 2), kept in memory

let funding: { credentialId: string; promise: Promise<void> } | null = null;

export function setFunding(credentialId: string, promise: Promise<void>): void {
  promise.catch(() => undefined); // awaited later by the register step
  funding = { credentialId, promise };
}

export function fundingFor(credentialId: string): Promise<void> | null {
  return funding?.credentialId === credentialId ? funding.promise : null;
}
