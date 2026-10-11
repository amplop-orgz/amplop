// Unit tests for the browser-side logic of specs 06, 07 and 10.
import { amplopEnvelopesAbi } from "@amplop/shared/abi";
import { GAS_FLOOR } from "@amplop/shared/constants";
import { entropyToMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { toViemAccount } from "@category-labs/mera/viem";
import { recoverTypedDataAddress, zeroAddress, type Hex } from "viem";
import { generatePrivateKey, mnemonicToAccount, privateKeyToAddress } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { homeState } from "@/components/onboarding/HomeEmpty";
import { canChange, rowState } from "@/components/trusted/TrustedPersonRow";
import { deriveSigner } from "@/lib/client/account";
import { isChatAppBrowser } from "@/lib/client/browser";
import { gasLimitFor } from "@/lib/client/chain/write";
import type { AccountData } from "@/lib/client/data";
import { chainErrorKey } from "@/lib/client/errors";
import { decideRoute, guardFor, type Role } from "@/lib/client/guard";
import { format, hasKey } from "@/lib/client/i18n";
import {
  acceptTypedData,
  existingPasskeyDecision,
  inviteLink,
  parseInviteFragment,
  signAccept,
} from "@/lib/client/invite";
import {
  canLess,
  canMore,
  DEFAULT_SPLIT,
  readDraft,
  resume,
  splitValid,
  step,
  total,
  writeDraft,
  type Split,
} from "@/lib/client/onboarding";
import { lastProfileId, listProfiles, saveProfile, setProfileLabel } from "@/lib/client/profiles";
import { whatsappUrl } from "@/lib/client/share";
import en from "../messages/en.json";
import id from "../messages/id.json";

describe("key derivation (S06-14)", () => {
  it("pins a fixed PRF output to one address, the BIP-44 path of its mnemonic", () => {
    const prf = new Uint8Array(32).fill(7);
    const expected = mnemonicToAccount(entropyToMnemonic(prf, wordlist)).address;
    const account = toViemAccount(deriveSigner(prf));
    expect(account.address).toBe(expected);
    expect(account.address).toBe("0x29458C602E3DB4fC3b54EC2bbEE26Dbe64C7779f");
    expect(prf.every((b) => b === 0)).toBe(true); // the PRF output is wiped
  });
});

describe("decideRoute (S06-8)", () => {
  const none: Role = {};
  const student: Role = { studentAccountId: 1n };
  const trusted: Role = { trustedAccountId: 2n };
  const both: Role = { studentAccountId: 1n, trustedAccountId: 2n };
  const cell = (path: string, role: Role | null) =>
    decideRoute(path, { session: role ? { role } : null });
  it("covers every cell of the table", () => {
    const table: [string, [unknown, unknown, unknown, unknown]][] = [
      [
        "/app/card",
        [{ unlock: true }, { redirect: "/app" }, { allow: true }, { redirect: "/app/parent" }],
      ],
      [
        "/app/parent",
        [{ unlock: true }, { redirect: "/app" }, { redirect: "/app" }, { allow: true }],
      ],
      [
        "/app/name",
        [{ unlock: true }, { allow: true }, { allow: true }, { redirect: "/app/parent" }],
      ],
      ["/approve/abc", [{ unlock: true }, { allow: true }, { allow: true }, { allow: true }]],
      ["/invite/abc", [{ allow: true }, { allow: true }, { allow: true }, { allow: true }]],
    ];
    for (const [path, want] of table) {
      expect([
        cell(path, null),
        cell(path, none),
        cell(path, student),
        cell(path, trusted),
      ]).toEqual(want);
    }
    expect(cell("/app/card", both)).toEqual({ allow: true });
    expect(cell("/app/parent/send", both)).toEqual({ allow: true });
    expect(guardFor("/recover")).toBe("none");
    expect(guardFor("/recover/x")).toBe("signedIn");
    expect(guardFor("/app/setup")).toBe("onboarding");
  });
});

describe("error sentences (S06-35, S06-34)", () => {
  it("has a sentence for every contract error", () => {
    for (const e of amplopEnvelopesAbi.filter((x) => x.type === "error")) {
      const key = chainErrorKey(e.name);
      expect([e.name, hasKey(key)]).toEqual([e.name, true]);
    }
  });
  it("keeps both languages in step, with no empty value", () => {
    expect(Object.keys(id).sort()).toEqual(Object.keys(en).sort());
    for (const v of [...Object.values(en), ...Object.values(id)]) expect(v.trim()).not.toBe("");
    expect(format("id", "home.hi", { name: "Raka" })).toBe("Hai, Raka");
    expect(format("en", "setup.mustAdd", { sum: 95 })).toBe("Must add up to 100%. Now 95%.");
  });
});

describe("chat-app browsers (S06-49)", () => {
  const cases: [string, boolean][] = [
    [
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36 WhatsApp/2.24.1",
      true,
    ],
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 WhatsApp/24.1",
      true,
    ],
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 345.0",
      true,
    ],
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 [FBAN/FBIOS;FBAV/480.0]",
      true,
    ],
    [
      "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36 [FB_IAB/Orca-Android;FBAV/470.0]",
      true,
    ],
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari Line/14.10.0",
      true,
    ],
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1 Telegram-iOS",
      false,
    ],
    [
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36",
      false,
    ],
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      false,
    ],
    [
      "Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0 Mobile Safari/537.36",
      false,
    ],
    [
      "Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0 Mobile Safari/537.36",
      true,
    ],
    [
      "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36 musical_ly_2023 BytedanceWebview/d8a21c6",
      true,
    ],
  ];
  it("detects the twelve user agents", () => {
    for (const [ua, want] of cases) expect([ua, isChatAppBrowser(ua)]).toEqual([ua, want]);
  });
});

describe("sharing and profiles (S06-50, S06-17)", () => {
  it("keeps secrets off wa.me", () => {
    expect(whatsappUrl("a b&c", { secret: true })).toBe("whatsapp://send?text=a%20b%26c");
    expect(whatsappUrl("a b", { secret: false })).toBe("https://wa.me/?text=a%20b");
  });
  it("stores only id, label and transports, five at most, newest first", () => {
    for (let i = 0; i < 7; i++)
      saveProfile({
        credentialId: `c${String(i)}`,
        label: `L${String(i)}`,
        transports: ["internal"],
      });
    saveProfile({ credentialId: "c3", label: "again" });
    const list = listProfiles();
    expect(list.map((p) => p.credentialId)).toEqual(["c3", "c6", "c5", "c4", "c2"]);
    expect(Object.keys(list[1] ?? {}).sort()).toEqual(["credentialId", "label", "transports"]);
    expect(lastProfileId()).toBe("c3");
    setProfileLabel("c6", "Raka");
    expect(listProfiles()[1]?.label).toBe("Raka");
  });
});

describe("gas limit (S06-23, 01 section 9)", () => {
  it("uses the larger of estimate + 20% and the floor", () => {
    expect(gasLimitFor(10_000n, "register")).toBe(GAS_FLOOR.register);
    expect(gasLimitFor(500_000n, "register")).toBe(600_000n);
  });
});

describe("split editor and resume (S07-15, S07-4)", () => {
  it("steps by 5 within 0 and 100 and never past a total of 100", () => {
    expect(total(DEFAULT_SPLIT)).toBe(100);
    expect(canMore(DEFAULT_SPLIT, 0)).toBe(false);
    const less = step(DEFAULT_SPLIT, 4, -5);
    expect(less).toEqual([40, 15, 15, 20, 5]);
    expect(splitValid(less)).toBe(false);
    expect(step(less, 0, 5)).toEqual([45, 15, 15, 20, 5]);
    const zero: Split = [100, 0, 0, 0, 0];
    expect(canLess(zero, 1)).toBe(false);
    expect(step(zero, 1, -5)).toBe(zero);
    expect(canMore(zero, 0)).toBe(false);
    expect(splitValid(zero)).toBe(true);
    expect(splitValid([45, 15, 15, 25, 0])).toBe(true);
    expect(splitValid([50, 15, 15, 20, 5])).toBe(false); // 105 from a changed draft
  });
  it("keeps the draft per credential and drops bad splits", () => {
    writeDraft("cred", { name: "Raka" });
    writeDraft("cred", { split: [50, 10, 10, 20, 10] });
    expect(readDraft("cred")).toEqual({ name: "Raka", split: [50, 10, 10, 20, 10] });
    writeDraft("cred2", { split: [1, 2] as unknown as Split });
    expect(readDraft("cred2")).toEqual({});
  });
  it("picks the right step for every row", () => {
    expect(resume("none", undefined, {})).toEqual({ to: "name" });
    expect(resume("none", undefined, { name: "Raka" })).toEqual({ to: "welcome-finish" });
    expect(resume("student", false, {})).toEqual({ to: "name-account" });
    expect(resume("student", true, {})).toEqual({ to: "home" });
    expect(resume("trusted", undefined, {})).toEqual({ to: "parent" });
  });
  it("writes the top-up share text in both languages", () => {
    const url = "https://amplop.app/app/parent/send";
    expect(format("en", "home.topUpText", { name: "Mama", url })).toMatch(/\/app\/parent\/send$/);
    expect(format("id", "home.topUpText", { name: "Mama", url })).toBe(
      `Halo Mama, kirim uang sakuku lewat Amplop di sini: ${url}`,
    );
  });
});

const account = (
  over: Partial<AccountData> & { trusted?: string; inviteKey?: string; used?: boolean } = {},
): AccountData => ({
  info: {
    owner: "0x0000000000000000000000000000000000000001",
    trusted: (over.trusted ?? zeroAddress) as `0x${string}`,
    split: [40, 15, 15, 20, 10],
    pendingSplit: [0, 0, 0, 0, 0],
    pendingSplitStartsAt: 0n,
    lockOn: true,
    everDeposited: false,
    requestSeq: 0n,
    skipSeconds: 0n,
  },
  invite: {
    inviteKey: (over.inviteKey ?? zeroAddress) as `0x${string}`,
    expiresAt: 100n,
    used: over.used ?? false,
  },
  removal: over.removal ?? { active: false, readyAt: 0n, data: "0x" },
  recovery: over.recovery ?? { active: false, readyAt: 0n, data: "0x" },
  clock: over.clock ?? 50n,
  readAt: 0,
});

describe("home and trusted-person states (S07-19, S10-21)", () => {
  const someone = "0x00000000000000000000000000000000000000aa";
  it("picks linked, invited or nobody", () => {
    expect(homeState(account({ trusted: someone }))).toBe("linked");
    expect(homeState(account({ inviteKey: someone }))).toBe("invited");
    expect(homeState(account({ inviteKey: someone, used: true }))).toBe("nobody");
    expect(homeState(account({ inviteKey: someone, clock: 100n }))).toBe("nobody");
  });
  it("covers all six row states", () => {
    expect(rowState(account())).toBe("nobody");
    expect(rowState(account({ inviteKey: someone }))).toBe("invited");
    expect(rowState(account({ trusted: someone }))).toBe("linked");
    expect(
      rowState(account({ trusted: someone, recovery: { active: true, readyAt: 60n, data: "0x" } })),
    ).toBe("linkedRecovery");
    expect(
      rowState(account({ trusted: someone, removal: { active: true, readyAt: 60n, data: "0x" } })),
    ).toBe("leaving");
    expect(
      rowState(account({ trusted: someone, removal: { active: true, readyAt: 50n, data: "0x" } })),
    ).toBe("finishing");
    expect(
      canChange(
        account({ trusted: someone, recovery: { active: true, readyAt: 60n, data: "0x" } }),
      ),
    ).toBe(true);
    expect(
      canChange(
        account({ trusted: someone, recovery: { active: true, readyAt: 50n, data: "0x" } }),
      ),
    ).toBe(false);
  });
});

describe("invite links and signatures (S10-4, S10-13, S10-15, S10-16)", () => {
  const key: Hex = `0x${"ab".repeat(32)}`;
  it("puts the key only after the #", () => {
    const link = inviteLink("https://amplop.app", "0".repeat(32), key);
    expect(link).toBe(`https://amplop.app/invite/${"0".repeat(32)}#k=${"ab".repeat(32)}`);
    expect(link.split("#")[0]).not.toContain("abab");
  });
  it("parses 64 hex with or without 0x and refuses anything else", () => {
    expect(parseInviteFragment(`#k=${"AB".repeat(32)}`)).toBe(key);
    expect(parseInviteFragment(`#k=0x${"ab".repeat(32)}`)).toBe(key);
    for (const bad of [
      `#k=${"a".repeat(63)}`,
      `#k=${"a".repeat(65)}`,
      `#k=${"g".repeat(64)}`,
      `#${"a".repeat(64)}`,
      "",
    ]) {
      expect(parseInviteFragment(bad)).toBeNull();
    }
  });
  it("signs the EIP-712 accept with the invite key, recoverable to its address", async () => {
    const k = generatePrivateKey();
    const contract = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
    const trusted = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
    const sig = await signAccept(k, 31337, contract, 1n, trusted);
    expect(
      await recoverTypedDataAddress({
        ...acceptTypedData(31337, contract, 1n, trusted),
        signature: sig,
      }),
    ).toBe(privateKeyToAddress(k));
    const fixed = await signAccept(`0x${"11".repeat(32)}`, 31337, contract, 1n, trusted);
    expect(fixed).toBe(await signAccept(`0x${"11".repeat(32)}`, 31337, contract, 1n, trusted)); // RFC 6979: deterministic
  });
  it("decides the four rows for an existing passkey", () => {
    expect(existingPasskeyDecision({ studentAccountId: 3n }, 3n)).toBe("own");
    expect(existingPasskeyDecision({ trustedAccountId: 3n }, 3n)).toBe("already");
    expect(existingPasskeyDecision({ trustedAccountId: 4n }, 3n)).toBe("other");
    expect(existingPasskeyDecision({ studentAccountId: 4n }, 3n)).toBe("accept");
    expect(existingPasskeyDecision({}, 3n)).toBe("accept");
  });
  it("puts the link last in the WhatsApp text", () => {
    const link = inviteLink("https://amplop.app", "0".repeat(32), key);
    for (const lang of ["en", "id"] as const) {
      expect(format(lang, "invite.whatsapp", { name: "Mama", link }).split("\n").at(-1)).toBe(link);
    }
  });
});
