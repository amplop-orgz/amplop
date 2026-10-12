// Recovery on the new phone and on the trusted person's approval page (13 S13-15 to S13-30).
"use client";
import { readJson, writeItem } from "./storage";

export type StoredRecovery = {
  linkId: string;
  newOwner: `0x${string}`;
  createdAt: number;
  approvedAccountId?: string;
  shared?: boolean;
};

const ITEM = "amplop.recovery";
const LIFETIME_MS = 7 * 86_400_000;

export function readRecovery(): StoredRecovery | null {
  const r = readJson("local", ITEM) as StoredRecovery | null;
  return r && /^[0-9a-f]{32}$/.test(r.linkId) && /^0x[0-9a-f]{40}$/.test(r.newOwner) ? r : null;
}

export function writeRecovery(r: StoredRecovery | null): void {
  writeItem("local", ITEM, r ? JSON.stringify(r) : null);
}

export type NewPhoneState = "start" | "waiting" | "approved" | "done" | "cancelled" | "expired";

/** S13-18 to S13-20, from the stored request and two contract reads for the new passkey. */
export function newPhoneState(o: {
  stored: StoredRecovery | null;
  ownAccount: bigint;
  recoveryAccount: bigint;
  nowMs: number;
}): NewPhoneState {
  if (!o.stored) return "start";
  if (o.ownAccount !== 0n) return "done";
  if (o.recoveryAccount !== 0n) return "approved";
  if (o.stored.approvedAccountId) return "cancelled";
  if (o.nowMs > o.stored.createdAt + LIFETIME_MS) return "expired";
  return "waiting";
}

export type ApprovalPageState =
  "dropped" | "done" | "unusable" | "notNow" | "approved" | "approve" | "busyElsewhere";

/** S13-28, in order; S13-27 step 4 for a new passkey already waiting on another account. */
export function approvalPageState(o: {
  dismissed: boolean;
  accountId: bigint;
  newOwner: string;
  ownAccount: bigint;
  trustedOf: bigint;
  recoveryAccount: bigint;
  removalActive: boolean;
  recovery: { active: boolean; data: string };
}): ApprovalPageState {
  if (o.dismissed) return "dropped";
  if (o.ownAccount === o.accountId) return "done";
  if (o.ownAccount !== 0n || o.trustedOf !== 0n) return "unusable";
  if (o.removalActive) return "notNow";
  if (
    o.recovery.active &&
    o.recovery.data.toLowerCase().endsWith(o.newOwner.slice(2).toLowerCase())
  )
    return "approved";
  if (o.recoveryAccount !== 0n && o.recoveryAccount !== o.accountId) return "busyElsewhere";
  return "approve";
}
