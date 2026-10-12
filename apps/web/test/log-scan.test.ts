// SEC3: the teardown's log scan finds each kind of leak and passes a clean log.
import { describe, expect, it } from "vitest";
import { logLeaks } from "../e2e/support/log-scan";
import { KEYS } from "../e2e/support/stack";

describe("SEC3 log scan", () => {
  it("passes a log with ids and hashes only", () => {
    expect(
      logLeaks(
        `{"route":"/api/invite","inviteId":"${"ab".repeat(16)}","tx":"0x${"cd".repeat(32)}"}`,
      ),
    ).toEqual([]);
  });
  it("finds a private key, an invite key and typed text", () => {
    const log = `${KEYS.treasury.slice(2)} /invite/x#k=${"ef".repeat(32)} reason: Glasses`;
    expect(logLeaks(log)).toEqual(["a private key", "an invite key", '"Glasses"']);
  });
});
