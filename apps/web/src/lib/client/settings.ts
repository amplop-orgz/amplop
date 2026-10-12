// Settings reads and the pending-change helper (13 S13-1, S13-8, S13-11). Every date and countdown
// uses the student's account clock, so a demo skip moves them.
"use client";
import { EmergencyStatus, PendingKind } from "@amplop/shared/enums";
import { useCallback } from "react";
import { read, type AccountInfo } from "./chain/client";
import type { EmergencyInfo } from "./emergency";
import { useRead } from "./query";

export type PendingView = { active: boolean; readyAt: bigint; data: `0x${string}` };
export type PendingState = "none" | "waiting" | "ready";

export type SettingsData = {
  info: AccountInfo;
  clock: bigint;
  em: EmergencyInfo;
  pending: Record<PendingKind, PendingView>;
  readAt: number;
};

const KINDS = [
  PendingKind.Split,
  PendingKind.TrustedRemoval,
  PendingKind.LockOff,
  PendingKind.Recovery,
];

export function useSettingsData(accountId: bigint | undefined) {
  const fetcher = useCallback(async (): Promise<SettingsData> => {
    const id = accountId ?? 0n;
    const [info, clock, em, ...p] = await Promise.all([
      read<AccountInfo>("accountInfo", [id]),
      read<bigint>("clock", [id]),
      read<EmergencyInfo>("emergency", [id]),
      ...KINDS.map((k) => read<readonly [boolean, bigint, `0x${string}`]>("pending", [id, k])),
    ]);
    const pending = Object.fromEntries(
      KINDS.map((k, i) => {
        const x = p[i] as readonly [boolean, bigint, `0x${string}`];
        return [k, { active: x[0], readyAt: x[1], data: x[2] }];
      }),
    ) as Record<PendingKind, PendingView>;
    return { info, clock, em, pending, readAt: performance.now() };
  }, [accountId]);
  return useRead(accountId === undefined ? null : `settings:${accountId.toString()}`, fetcher, {
    intervalMs: 15_000,
  });
}

/** S13-11: none, waiting (`clock < readyAt`) or ready. */
export function pendingState(p: PendingView, clock: bigint): PendingState {
  if (!p.active) return "none";
  return clock < p.readyAt ? "waiting" : "ready";
}

export type LockRow = "requestOpen" | "on" | "waiting" | "ready" | "off";

/** S13-8, in table order. */
export function lockRow(d: Pick<SettingsData, "info" | "em" | "pending">, clock: bigint): LockRow {
  if (!d.info.lockOn) return "off";
  const lockOff = pendingState(d.pending[PendingKind.LockOff], clock);
  if (lockOff === "waiting") return "waiting";
  if (lockOff === "ready") return "ready";
  if (d.em.status === EmergencyStatus.Open) return "requestOpen";
  return "on";
}

/** The pending split's new values once it has started, else the split in force (S13-4). */
export function splitInForceAt(info: AccountInfo, splitPending: PendingState): readonly number[] {
  return splitPending === "ready" ? info.pendingSplit : info.split;
}
