// Unit tests for the browser side of spec 08: amount rules, the split in force, the open orders kept
// on the device, and the student's rupiah figure.
import { describe, expect, it } from "vitest";
import type { AccountInfo } from "@/lib/client/chain/client";
import {
  amountProblem,
  digitsOnly,
  forgetOrder,
  groupVa,
  lastAmount,
  readEntries,
  rememberOrder,
  rupiahOf,
  shownStatus,
  splitInForce,
  type OrderView,
} from "@/lib/client/topup";

describe("amount rules (S08-3, C10, C11)", () => {
  it("keeps digits only and checks the inclusive limits", () => {
    expect(digitsOnly("Rp16.500.000")).toBe("16500000");
    expect(digitsOnly("abc12x3")).toBe("123");
    expect(digitsOnly("0005")).toBe("5");
    expect(amountProblem("")).toBe("empty");
    expect(amountProblem("99999")).toBe("below");
    expect(amountProblem("100000")).toBeNull();
    expect(amountProblem("50000000")).toBeNull();
    expect(amountProblem("50000001")).toBe("above");
  });
  it("groups the VA number in fours", () => {
    expect(groupVa("8808081234567890")).toBe("8808 0812 3456 7890");
    expect(groupVa("812785002530231")).toBe("8127 8500 2530 231");
  });
});

describe("split in force (S08-4, C15)", () => {
  const info = {
    split: [40, 15, 15, 20, 10],
    pendingSplit: [30, 20, 20, 20, 10],
    pendingSplitStartsAt: 1000n,
  } as unknown as AccountInfo;
  it("uses the pending split only once it has started", () => {
    expect(splitInForce(info, 999n)).toEqual([40, 15, 15, 20, 10]);
    expect(splitInForce(info, 1000n)).toEqual([30, 20, 20, 20, 10]);
    expect(splitInForce({ ...info, pendingSplitStartsAt: 0n }, 5000n)).toEqual([
      40, 15, 15, 20, 10,
    ]);
  });
});

describe("order status shown (S08-9)", () => {
  const o = { status: "waiting", expiresAt: "2026-10-12T16:59:00.000Z" } as OrderView;
  it("shows a waiting order past its expiry as expired", () => {
    expect(shownStatus(o, Date.parse("2026-10-12T16:58:00Z"))).toBe("waiting");
    expect(shownStatus(o, Date.parse("2026-10-12T17:00:00Z"))).toBe("expired");
    expect(shownStatus({ ...o, status: "received" }, Date.parse("2026-10-13T00:00:00Z"))).toBe(
      "received",
    );
  });
});

describe("open orders on this device (S08-6)", () => {
  const entry = (n: number, accountId = "1") => ({
    accountId,
    orderId: n.toString(16).padStart(32, "0"),
    rupiah: String(100_000 * n),
    createdAt: n,
  });
  it("keeps at most 5, newest first, and the newest closed one as the prefill", () => {
    for (let n = 1; n <= 7; n++) rememberOrder(entry(n));
    expect(readEntries().map((e) => e.createdAt)).toEqual([7, 6, 5, 4, 3]);
    expect(lastAmount(1n)).toBe(700_000n);
    forgetOrder(entry(7).orderId);
    expect(readEntries()).toHaveLength(5);
    forgetOrder(entry(5).orderId);
    expect(readEntries().map((e) => e.createdAt)).toEqual([7, 6, 4, 3]);
    expect(lastAmount(2n)).toBe(16_500_000n);
  });
});

describe("rupiah on board 2.1 (S08-12)", () => {
  it("gives back the exact order amount at the sample rate", () => {
    expect(rupiahOf(1_000_000_000n, 6, 16_500n)).toBe(16_500_000n);
    expect(rupiahOf(74_822_242n, 6, 16_500n)).toBe(1_234_567n);
    expect(rupiahOf(6_060_606n, 6, 16_500n)).toBe(100_000n);
  });
});
