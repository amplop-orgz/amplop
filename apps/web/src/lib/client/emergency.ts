// Emergency helpers for boards 3.1 to 3.5 (spec 12): input rules, which screen shows, the countdown,
// the reads, and this device's record of shared and seen requests.
"use client";
import { EmergencyStatus, PendingKind } from "@amplop/shared/enums";
import { parseDecimalInput } from "@amplop/shared/money";
import { useCallback } from "react";
import { read, ZERO_ADDRESS, type AccountInfo } from "./chain/client";
import { useRead } from "./query";
import { readJson, writeItem } from "./storage";

export type EmergencyInfo = {
  status: EmergencyStatus;
  requestSeq: bigint;
  amount: bigint;
  reasonHash: `0x${string}`;
  requestedAt: bigint;
  opensAt: bigint;
};

export type EmergencyData = {
  info: AccountInfo;
  locked: bigint;
  em: EmergencyInfo;
  lockOffPending: boolean;
  clock: bigint;
  decimals: number;
  /** performance.now() at the read, so the clock can run on between reads (S12-8). */
  readAt: number;
};

type EnvelopeView = { available: bigint; unreleased: bigint; held: bigint; locked: bigint };

async function load(accountId: bigint): Promise<EmergencyData> {
  const [info, env, em, lockOff, clock, decimals] = await Promise.all([
    read<AccountInfo>("accountInfo", [accountId]),
    read<readonly [readonly EnvelopeView[], bigint]>("envelopes", [accountId]),
    read<EmergencyInfo>("emergency", [accountId]),
    read<readonly [boolean, bigint, `0x${string}`]>("pending", [accountId, PendingKind.LockOff]),
    read<bigint>("clock", [accountId]),
    read<number>("tokenDecimals"),
  ]);
  return {
    info,
    locked: env[0][4]?.locked ?? 0n,
    em,
    lockOffPending: lockOff[0],
    clock,
    decimals,
    readAt: performance.now(),
  };
}

/** S12-1 and S12-22: re-read every 10 s while visible and after each transaction. */
export function useEmergency(accountId: bigint | undefined) {
  const fetcher = useCallback(() => load(accountId ?? 0n), [accountId]);
  return useRead(accountId === undefined ? null : `emergency:${accountId.toString()}`, fetcher, {
    intervalMs: 10_000,
  });
}

/** The account clock now: the last read plus the wall-clock time since (S12-8). */
export function clockNow(
  d: Pick<EmergencyData, "clock" | "readAt">,
  nowMs = performance.now(),
): bigint {
  return d.clock + BigInt(Math.max(0, Math.floor((nowMs - d.readAt) / 1000)));
}

/** S12-5: comma decimal, dot thousands, an optional "$", at most 2 decimals; in token units. */
export function parseRequestAmount(text: string, decimals: number): bigint | null {
  const p = parseDecimalInput(text.trim().replace(/^\$/, ""), 2);
  if (!p.ok) return null;
  return decimals >= 2
    ? p.minor * 10n ** BigInt(decimals - 2)
    : p.minor / 10n ** BigInt(2 - decimals);
}

/** Code points of the trimmed reason (PRD 14 rule 6). */
export function reasonLength(text: string): number {
  return Array.from(text.trim()).length;
}

export function canSend(amount: bigint | null, locked: bigint, reason: string): boolean {
  const n = reasonLength(reason);
  return amount !== null && amount > 0n && amount <= locked && n >= 1 && n <= 280;
}

/** S12-8: "47 h 12 min", "59 min", or null for under a minute. */
export function countdownParts(seconds: number): { h: number; m: number } | null {
  if (seconds < 60) return null;
  const total = Math.floor(seconds / 60);
  return { h: Math.floor(total / 60), m: total % 60 };
}

export type StudentScreen = "lockOff" | "waiting" | "opened" | "lockOffPending" | "empty" | "form";

/** S12-2, in order. */
export function studentScreen(d: EmergencyData, seenSeq: bigint | null): StudentScreen {
  if (!d.info.lockOn) return "lockOff";
  if (d.em.status === EmergencyStatus.Open) return "waiting";
  if (d.em.status === EmergencyStatus.Opened && seenSeq !== d.em.requestSeq) return "opened";
  if (d.lockOffPending) return "lockOffPending";
  if (d.locked === 0n) return "empty";
  return "form";
}

export const hasTrustedPerson = (info: AccountInfo) => info.trusted !== ZERO_ADDRESS;

export type ApprovalState =
  | "notForYou"
  | "ownerView"
  | "approve"
  | "openedByTime"
  | "done"
  | "alreadyOpened"
  | "cancelled"
  | "closed";

/** S12-18 and S12-19, for the trusted person (the owner sees the request read-only). */
export function approvalState(o: {
  isTrusted: boolean;
  isOwner: boolean;
  em: EmergencyInfo;
  linkSeq: bigint;
  clock: bigint;
  approvedHere: boolean;
}): ApprovalState {
  if (!o.isTrusted && !o.isOwner) return "notForYou";
  if (o.em.requestSeq > o.linkSeq) return "closed";
  if (o.em.status === EmergencyStatus.Cancelled) return "cancelled";
  if (o.em.status === EmergencyStatus.Opened) return o.approvedHere ? "done" : "alreadyOpened";
  if (o.em.status !== EmergencyStatus.Open || o.em.requestSeq !== o.linkSeq) return "closed";
  if (o.clock >= o.em.opensAt) return "openedByTime";
  return o.isTrusted ? "approve" : "ownerView";
}

// ------------------------------------------------------------ amplop.emergency.v1 (01 section 9)

type Marks = { sharedSeq?: string; seenSeq?: string };
const ITEM = "amplop.emergency.v1";

function all(): Record<string, Marks> {
  const raw = readJson("local", ITEM);
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, Marks>)
    : {};
}

export function marks(accountId: bigint): { sharedSeq: bigint | null; seenSeq: bigint | null } {
  const m = all()[accountId.toString()] ?? {};
  const big = (s?: string) => (s && /^[0-9]+$/.test(s) ? BigInt(s) : null);
  return { sharedSeq: big(m.sharedSeq), seenSeq: big(m.seenSeq) };
}

export function mark(accountId: bigint, field: keyof Marks, seq: bigint): void {
  const map = all();
  const k = accountId.toString();
  writeItem("local", ITEM, JSON.stringify({ ...map, [k]: { ...map[k], [field]: seq.toString() } }));
}

export function approvalLink(origin: string, linkId: string): string {
  return `${origin}/approve/${linkId}`;
}
