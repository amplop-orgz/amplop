// Unit tests for the browser side of spec 12: input rules, the countdown and both screen pickers.
import { EmergencyStatus } from "@amplop/shared/enums";
import { describe, expect, it } from "vitest";
import type { AccountInfo } from "@/lib/client/chain/client";
import {
  approvalState,
  canSend,
  clockNow,
  countdownParts,
  mark,
  marks,
  parseRequestAmount,
  reasonLength,
  studentScreen,
  type EmergencyData,
  type EmergencyInfo,
} from "@/lib/client/emergency";

const usd = (n: number) => BigInt(Math.round(n * 100)) * 10_000n;

describe("request inputs (S12-5, G6, G7)", () => {
  it("parses dollar amounts with a comma decimal and dot thousands", () => {
    expect(parseRequestAmount("70", 6)).toBe(usd(70));
    expect(parseRequestAmount("70,00", 6)).toBe(usd(70));
    expect(parseRequestAmount("$70,00", 6)).toBe(usd(70));
    expect(parseRequestAmount("1.000,50", 6)).toBe(usd(1000.5));
    for (const bad of ["70,001", "-5", "abc", ""]) expect(parseRequestAmount(bad, 6)).toBeNull();
  });
  it("counts code points of the trimmed reason and checks every limit", () => {
    expect(reasonLength("  😀😀  ")).toBe(2);
    const ok = "😀".repeat(280);
    expect(canSend(usd(70), usd(100), ok)).toBe(true);
    expect(canSend(usd(70), usd(100), ok + "a")).toBe(false);
    expect(canSend(usd(70), usd(100), "   ")).toBe(false);
    expect(canSend(usd(101), usd(100), "Laptop")).toBe(false);
    expect(canSend(0n, usd(100), "Laptop")).toBe(false);
    expect(canSend(null, usd(100), "Laptop")).toBe(false);
  });
});

describe("countdown (S12-8)", () => {
  it("formats hours and minutes, minutes, and under a minute", () => {
    expect(countdownParts(169_920)).toEqual({ h: 47, m: 12 });
    expect(countdownParts(3_599)).toEqual({ h: 0, m: 59 });
    expect(countdownParts(59)).toBeNull();
  });
  it("runs the account clock on from the last read", () => {
    expect(clockNow({ clock: 1000n, readAt: 0 }, 2_500)).toBe(1002n);
  });
});

const em = (status: EmergencyStatus, requestSeq = 1n, opensAt = 1000n): EmergencyInfo => ({
  status,
  requestSeq,
  amount: usd(70),
  reasonHash: "0x00",
  requestedAt: 0n,
  opensAt,
});

describe("student screen (S12-2)", () => {
  const base: EmergencyData = {
    info: { lockOn: true } as AccountInfo,
    locked: usd(100),
    em: em(EmergencyStatus.None, 0n),
    lockOffPending: false,
    clock: 0n,
    decimals: 6,
    readAt: 0,
  };
  it("picks each row in order", () => {
    expect(studentScreen({ ...base, info: { lockOn: false } as AccountInfo }, null)).toBe(
      "lockOff",
    );
    expect(studentScreen({ ...base, em: em(EmergencyStatus.Open) }, null)).toBe("waiting");
    expect(studentScreen({ ...base, em: em(EmergencyStatus.Opened) }, null)).toBe("opened");
    expect(studentScreen({ ...base, em: em(EmergencyStatus.Opened) }, 1n)).toBe("form");
    expect(studentScreen({ ...base, lockOffPending: true }, null)).toBe("lockOffPending");
    expect(studentScreen({ ...base, locked: 0n }, null)).toBe("empty");
    expect(studentScreen(base, null)).toBe("form");
  });
  it("remembers seen and shared requests per account", () => {
    mark(7n, "seenSeq", 3n);
    mark(7n, "sharedSeq", 4n);
    expect(marks(7n)).toEqual({ seenSeq: 3n, sharedSeq: 4n });
    expect(marks(8n)).toEqual({ seenSeq: null, sharedSeq: null });
  });
});

describe("approval page states (S12-18, S12-19)", () => {
  const o = {
    isTrusted: true,
    isOwner: false,
    em: em(EmergencyStatus.Open),
    linkSeq: 1n,
    clock: 10n,
    approvedHere: false,
  };
  it("has one state per row", () => {
    expect(approvalState(o)).toBe("approve");
    expect(approvalState({ ...o, isTrusted: false })).toBe("notForYou");
    expect(approvalState({ ...o, isTrusted: false, isOwner: true })).toBe("ownerView");
    expect(approvalState({ ...o, clock: 1000n })).toBe("openedByTime");
    expect(approvalState({ ...o, em: em(EmergencyStatus.Opened), approvedHere: true })).toBe(
      "done",
    );
    expect(approvalState({ ...o, em: em(EmergencyStatus.Opened) })).toBe("alreadyOpened");
    expect(approvalState({ ...o, em: em(EmergencyStatus.Cancelled) })).toBe("cancelled");
    expect(approvalState({ ...o, em: em(EmergencyStatus.Open, 2n) })).toBe("closed");
  });
});
