// U20 (16 S16-6): every ABI event has exactly one handler and both configs list exactly those events.
import { describe, expect, it } from "vitest";
import { check } from "../scripts/check.mjs";
import { abiEvents, configEvents, handledEvents, read } from "../scripts/lib.mjs";

describe("config check", () => {
  it("U20: 22 events, each handled once, all in config.yaml", () => {
    const events = abiEvents(read("abis/AmplopEnvelopes.json")) as string[];
    expect(events).toHaveLength(22);
    expect(handledEvents()).toEqual(events);
    expect(configEvents(read("config.yaml"))).toEqual(events);
    expect(check()).toEqual([]);
  });
});
