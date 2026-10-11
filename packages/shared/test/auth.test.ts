import { describe, expect, it } from "vitest";
import { buildAuthMessage, fromBase64Url, sha256Hex, toBase64Url } from "../src/auth";

const FIXED = {
  site: "amplop.app",
  chainId: 10143,
  action: "profile.save",
  accountId: 7n,
  address: "0xABCDEF0000000000000000000000000000000001",
  nonce: "0123456789abcdef0123456789abcdef",
  issued: "2026-10-12T09:00:00.000Z",
  bodySha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
} as const;

describe("signed message (01 section 4)", () => {
  it("builds the exact nine lines, address lowercase, no trailing newline", () => {
    expect(buildAuthMessage(FIXED)).toBe(
      [
        "Amplop request",
        "Site: amplop.app",
        "Chain: 10143",
        "Action: profile.save",
        "Account: 7",
        "Address: 0xabcdef0000000000000000000000000000000001",
        "Nonce: 0123456789abcdef0123456789abcdef",
        "Issued: 2026-10-12T09:00:00.000Z",
        "Body: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      ].join("\n"),
    );
  });

  it("hashes the empty body to the known value", async () => {
    expect(await sha256Hex("")).toBe(FIXED.bodySha256);
    expect(await sha256Hex(new Uint8Array())).toBe(FIXED.bodySha256);
  });

  it("round-trips base64url, including non-ASCII", () => {
    const msg = buildAuthMessage(FIXED) + "é";
    const enc = toBase64Url(msg);
    expect(enc).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(fromBase64Url(enc)).toBe(msg);
    expect(fromBase64Url(enc + "=")).toBe(msg);
    expect(fromBase64Url("not base64!")).toBeNull();
    expect(fromBase64Url("_w")).toBeNull(); // 0xff is not UTF-8
  });
});
