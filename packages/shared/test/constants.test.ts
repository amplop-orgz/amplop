import { describe, expect, it } from "vitest";
import abi from "../abi/AmplopEnvelopes.json";
import { GAS_FLOOR, TYPICAL_ACTION_GAS } from "../src/constants";
import { amplopEnvelopesAbi } from "../src/generated/amplop";
import * as enums from "../src/enums";

const SERVER = ["deposit", "authorize", "collect", "releaseHold", "refund"];

describe("constants", () => {
  it("has a gas floor for every contract write and nothing else", () => {
    const writes = amplopEnvelopesAbi
      .filter((f) => f.type === "function" && f.stateMutability === "nonpayable")
      .map((f) => (f as { name: string }).name)
      .sort();
    expect(Object.keys(GAS_FLOOR).sort()).toEqual(writes);
  });

  it("sets TYPICAL_ACTION_GAS to the largest user-signed floor", () => {
    const user = Object.entries(GAS_FLOOR).filter(([k]) => !SERVER.includes(k));
    expect(TYPICAL_ACTION_GAS).toBe(user.reduce((m, [, v]) => (v > m ? v : m), 0n));
  });
});

describe("generated ABI", () => {
  it("JSON copy equals the typed ABI", () => {
    expect(abi).toEqual(JSON.parse(JSON.stringify(amplopEnvelopesAbi)));
  });

  it("enum mirrors match the contract's order", () => {
    expect(enums.Envelope.Emergency).toBe(4);
    expect(enums.PurchaseState.Refunded).toBe(4);
    expect(enums.DeclineReason.NotEnough).toBe(2);
    expect(enums.PendingKind.Recovery).toBe(3);
    expect(enums.EmergencyStatus.Cancelled).toBe(3);
    expect(enums.OpenedBy.Time).toBe(1);
  });
});
