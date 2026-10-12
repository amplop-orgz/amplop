// Spec 13 unit tests: the pending helper, the lock row, the split edit start, and both recovery pickers.
import { EmergencyStatus, PendingKind } from "@amplop/shared/enums";
import { describe, expect, it } from "vitest";
import { nextSplit } from "@/components/onboarding/SetupStep";
import type { AccountInfo } from "@/lib/client/chain/client";
import type { EmergencyInfo } from "@/lib/client/emergency";
import { approvalPageState, newPhoneState } from "@/lib/client/recovery";
import { lockRow, pendingState, splitInForceAt, type PendingView } from "@/lib/client/settings";

const p = (active: boolean, readyAt = 100n): PendingView => ({ active, readyAt, data: "0x00" });
const pending = (over: Partial<Record<PendingKind, PendingView>> = {}) =>
  ({ 0: p(false), 1: p(false), 2: p(false), 3: p(false), ...over }) as Record<
    PendingKind,
    PendingView
  >;
const info = (over: Partial<AccountInfo> = {}) =>
  ({
    lockOn: true,
    split: [40, 15, 15, 20, 10],
    pendingSplit: [50, 10, 10, 20, 10],
    pendingSplitStartsAt: 0n,
    ...over,
  }) as AccountInfo;
const em = (status: EmergencyStatus) => ({ status }) as EmergencyInfo;

describe("pending changes (S13-11)", () => {
  it("is none, waiting or ready by the account clock", () => {
    expect(pendingState(p(false), 50n)).toBe("none");
    expect(pendingState(p(true), 99n)).toBe("waiting");
    expect(pendingState(p(true), 100n)).toBe("ready");
  });
  it("shows the new split as current once its wait is over", () => {
    expect(splitInForceAt(info(), "waiting")).toEqual([40, 15, 15, 20, 10]);
    expect(splitInForceAt(info(), "ready")).toEqual([50, 10, 10, 20, 10]);
  });
  it("starts the editor from a saved split, else the split in force (S13-5)", () => {
    expect(nextSplit({ info: info() })).toEqual([40, 15, 15, 20, 10]);
    expect(nextSplit({ info: info({ pendingSplitStartsAt: 5n }) })).toEqual([50, 10, 10, 20, 10]);
  });
});

describe("lock row (S13-8)", () => {
  it("has all five states", () => {
    const base = { info: info(), em: em(EmergencyStatus.None), pending: pending() };
    expect(lockRow({ ...base, em: em(EmergencyStatus.Open) }, 50n)).toBe("requestOpen");
    expect(lockRow(base, 50n)).toBe("on");
    expect(lockRow({ ...base, pending: pending({ [PendingKind.LockOff]: p(true) }) }, 50n)).toBe(
      "waiting",
    );
    expect(lockRow({ ...base, pending: pending({ [PendingKind.LockOff]: p(true) }) }, 100n)).toBe(
      "ready",
    );
    expect(lockRow({ ...base, info: info({ lockOn: false }) }, 50n)).toBe("off");
  });
});

describe("recovery on the new phone (S13-18 to S13-20)", () => {
  const stored = { linkId: "a".repeat(32), newOwner: `0x${"b".repeat(40)}` as const, createdAt: 0 };
  it("goes start, waiting, approved, done; or cancelled; or expired", () => {
    const at = (over: Partial<Parameters<typeof newPhoneState>[0]>) =>
      newPhoneState({ stored, ownAccount: 0n, recoveryAccount: 0n, nowMs: 1000, ...over });
    expect(at({ stored: null })).toBe("start");
    expect(at({})).toBe("waiting");
    expect(at({ recoveryAccount: 7n })).toBe("approved");
    expect(at({ ownAccount: 7n })).toBe("done");
    expect(at({ stored: { ...stored, approvedAccountId: "7" } })).toBe("cancelled");
    expect(at({ nowMs: 8 * 86_400_000 })).toBe("expired");
  });
});

describe("recovery approval page (S13-28)", () => {
  const owner = `0x${"b".repeat(40)}`;
  const base = {
    dismissed: false,
    accountId: 1n,
    newOwner: owner,
    ownAccount: 0n,
    trustedOf: 0n,
    recoveryAccount: 0n,
    removalActive: false,
    recovery: { active: false, data: "0x00" },
  };
  it("checks every row in order", () => {
    expect(approvalPageState({ ...base, dismissed: true })).toBe("dropped");
    expect(approvalPageState({ ...base, ownAccount: 1n })).toBe("done");
    expect(approvalPageState({ ...base, ownAccount: 2n })).toBe("unusable");
    expect(approvalPageState({ ...base, trustedOf: 2n })).toBe("unusable");
    expect(approvalPageState({ ...base, removalActive: true })).toBe("notNow");
    expect(
      approvalPageState({
        ...base,
        recovery: { active: true, data: `0x${"0".repeat(24)}${"b".repeat(40)}` },
      }),
    ).toBe("approved");
    expect(approvalPageState({ ...base, recoveryAccount: 9n })).toBe("busyElsewhere");
    expect(approvalPageState(base)).toBe("approve");
  });
});
