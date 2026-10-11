// Spec 07 profile tests and spec 10 invite tests.
import { amplopEnvelopesAbi } from "@amplop/shared/abi";
import type { Abi } from "viem";

// Widened so a function name can be a plain string; the contract checks the call itself.
const ABI: Abi = amplopEnvelopesAbi;
import {
  createTestClient,
  createWalletClient,
  http,
  parseEther,
  publicActions,
  type Address,
} from "viem";
import { generatePrivateKey, privateKeyToAccount, privateKeyToAddress } from "viem/accounts";
import { foundry } from "viem/chains";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET as readProfileRoute } from "@/app/api/profile/[accountId]/route";
import { POST as saveProfileRoute } from "@/app/api/profile/route";
import { GET as readInviteRoute } from "@/app/api/invite/[inviteId]/route";
import { GET as latestRoute } from "@/app/api/invite/latest/route";
import { POST as createInviteRoute } from "@/app/api/invite/route";
import { Chain, setChain } from "@/lib/server/chain/chain";
import { createServerRpc } from "@/lib/server/chain/rpc";
import { inviteState } from "@/lib/server/invite";
import { anvilKey, hasAnvil, startAnvil, type AnvilStack } from "./anvil";
import {
  call,
  errCode,
  fakeChain,
  newAccount,
  resetDb,
  signedHeaders,
  type FakeRpc,
} from "./helpers";

const owner = newAccount();
const trusted = newAccount();
const stranger = newAccount();
let rpc: FakeRpc;

beforeEach(async () => {
  await resetDb();
  ({ rpc } = fakeChain());
  rpc.accounts.set(7n, { owner: owner.address, trusted: trusted.address });
  rpc.accounts.set(8n, {
    owner: stranger.address,
    trusted: "0x0000000000000000000000000000000000000000",
  });
});

async function post(
  route: Parameters<typeof call>[0],
  account: typeof owner,
  action: "profile.save" | "invite.create",
  accountId: bigint,
  body: unknown,
) {
  const text = JSON.stringify(body);
  const headers = await signedHeaders({ account, action, accountId, body: text });
  return call(route, { method: "POST", headers, body: text });
}

async function get(
  route: Parameters<typeof call>[0],
  account: typeof owner,
  action: "profile.read" | "invite.latest",
  accountId: bigint,
  params: Record<string, string> = {},
) {
  const headers = await signedHeaders({ account, action, accountId });
  return call(route, { headers, params });
}

describe("profile (S07-31, S07-32)", () => {
  it("saves trimmed names up to 60 graphemes and refuses the rest", async () => {
    expect(
      (
        await post(saveProfileRoute, owner, "profile.save", 7n, {
          accountId: "7",
          name: "  Raka Pratama ",
        })
      ).json,
    ).toEqual({ ok: true });
    expect(
      (await get(readProfileRoute, owner, "profile.read", 7n, { accountId: "7" })).json,
    ).toEqual({ name: "Raka Pratama" });
    expect(
      (
        await post(saveProfileRoute, owner, "profile.save", 7n, {
          accountId: "7",
          name: "a".repeat(60),
        })
      ).status,
    ).toBe(200);
    for (const name of ["a".repeat(61), "", "   ", "Ra\u202Eka"]) {
      expect(
        errCode(
          (await post(saveProfileRoute, owner, "profile.save", 7n, { accountId: "7", name })).json,
        ),
      ).toBe("name_invalid");
    }
  });
  it("stores markup unchanged, as plain text (PRD 15)", async () => {
    await post(saveProfileRoute, owner, "profile.save", 7n, {
      accountId: "7",
      name: "<script>alert(1)</script>",
    });
    expect(
      (await get(readProfileRoute, trusted, "profile.read", 7n, { accountId: "7" })).json,
    ).toEqual({ name: "<script>alert(1)</script>" });
  });
  it("checks roles and the signed account", async () => {
    expect(
      errCode(
        (await post(saveProfileRoute, trusted, "profile.save", 7n, { accountId: "7", name: "X" }))
          .json,
      ),
    ).toBe("not_owner");
    expect(
      errCode(
        (await post(saveProfileRoute, owner, "profile.save", 7n, { accountId: "8", name: "X" }))
          .json,
      ),
    ).toBe("wrong_account");
    expect(
      errCode((await get(readProfileRoute, stranger, "profile.read", 7n, { accountId: "7" })).json),
    ).toBe("not_allowed");
    expect(
      errCode((await get(readProfileRoute, owner, "profile.read", 7n, { accountId: "8" })).json),
    ).toBe("wrong_account");
    expect(
      errCode((await get(readProfileRoute, owner, "profile.read", 7n, { accountId: "7" })).json),
    ).toBe("profile_not_found");
  });
});

describe("invite state (S10-10)", () => {
  const key = privateKeyToAddress(generatePrivateKey()).toLowerCase();
  it("checks replaced, used, expired, open in order; expiry at exactly expiresAt", () => {
    expect(
      inviteState(
        key,
        { inviteKey: "0x0000000000000000000000000000000000000001", expiresAt: 0n, used: true },
        9n,
      ),
    ).toBe("replaced");
    expect(
      inviteState(
        key,
        { inviteKey: key.toUpperCase().replace("0X", "0x"), expiresAt: 10n, used: true },
        0n,
      ),
    ).toBe("used");
    expect(inviteState(key, { inviteKey: key, expiresAt: 10n, used: false }, 10n)).toBe("expired");
    expect(inviteState(key, { inviteKey: key, expiresAt: 10n, used: false }, 9n)).toBe("open");
  });
});

describe("POST /api/invite and the reads (S10-9 to S10-11)", () => {
  const key = privateKeyToAddress(generatePrivateKey()).toLowerCase();
  beforeEach(() => {
    rpc.reads.set("inviteOf(7)", [key, 2_000_000_000n, false]);
    rpc.reads.set("clock(7)", 1_000_000_000n);
  });
  const create = (
    who = owner,
    body: Record<string, unknown> = { accountId: "7", inviteKey: key, trustedName: "Mama" },
  ) => post(createInviteRoute, who, "invite.create", 7n, body);

  it("is idempotent for one key and returns the public shape", async () => {
    const r = await create();
    const { inviteId } = r.json as { inviteId: string };
    expect(inviteId).toMatch(/^[0-9a-f]{32}$/);
    expect((await create()).json).toEqual({ inviteId });
    await post(saveProfileRoute, owner, "profile.save", 7n, {
      accountId: "7",
      name: "Raka Pratama",
    });
    const pub = await call(readInviteRoute, { params: { inviteId } });
    expect(pub.json).toEqual({
      accountId: "7",
      studentName: "Raka Pratama",
      trustedName: "Mama",
      inviteKey: key,
      state: "open",
    });
    expect(pub.res.headers.get("cache-control")).toBe("no-store");
    expect((await get(latestRoute, trusted, "invite.latest", 7n)).json).toEqual({
      inviteId,
      trustedName: "Mama",
      state: "open",
    });
  });
  it("refuses keys not on chain, used invites, other signers and bad names", async () => {
    rpc.reads.set("inviteOf(7)", ["0x0000000000000000000000000000000000000001", 0n, false]);
    expect(errCode((await create()).json)).toBe("invite_not_on_chain");
    rpc.reads.set("inviteOf(7)", [key, 2_000_000_000n, true]);
    expect(errCode((await create()).json)).toBe("invite_used");
    rpc.reads.set("inviteOf(7)", [key, 2_000_000_000n, false]);
    expect(errCode((await create(trusted)).json)).toBe("not_owner");
    expect(
      errCode((await create(owner, { accountId: "8", inviteKey: key, trustedName: "Mama" })).json),
    ).toBe("wrong_account");
    expect(
      errCode(
        (await create(owner, { accountId: "7", inviteKey: key, trustedName: "a".repeat(61) })).json,
      ),
    ).toBe("name_invalid");
    expect(
      errCode(
        (await create(owner, { accountId: "7", inviteKey: key, trustedName: "Mama", x: 1 })).json,
      ),
    ).toBe("bad_input");
  });
  it("stores a markup name unchanged", async () => {
    const { inviteId } = (
      await create(owner, {
        accountId: "7",
        inviteKey: key,
        trustedName: "<script>alert(1)</script>",
      })
    ).json as { inviteId: string };
    expect((await call(readInviteRoute, { params: { inviteId } })).json).toMatchObject({
      trustedName: "<script>alert(1)</script>",
    });
  });
  it("answers 404 for malformed and unknown ids, and when there is no invite", async () => {
    expect(errCode((await call(readInviteRoute, { params: { inviteId: "nope" } })).json)).toBe(
      "invite_not_found",
    );
    expect(
      errCode((await call(readInviteRoute, { params: { inviteId: "0".repeat(32) } })).json),
    ).toBe("invite_not_found");
    expect(errCode((await get(latestRoute, owner, "invite.latest", 7n)).json)).toBe(
      "invite_not_found",
    );
    expect(errCode((await get(latestRoute, stranger, "invite.latest", 7n)).json)).toBe(
      "not_allowed",
    );
  });
});

describe.skipIf(!hasAnvil)("invite states on Anvil", () => {
  let stack: AnvilStack;
  beforeAll(async () => {
    stack = await startAnvil(8557);
  });
  afterAll(() => {
    stack.stop();
  });

  it("reads open, used, replaced and expired from the contract", async () => {
    setChain(
      new Chain({
        rpc: createServerRpc(31337, stack.url, stack.url),
        chainId: 31337,
        contract: stack.contract,
        token: stack.token,
        settlement: privateKeyToAccount(anvilKey(3)).address,
        accounts: {
          treasury: privateKeyToAccount(anvilKey(1)),
          cardService: privateKeyToAccount(anvilKey(2)),
          feeSponsor: privateKeyToAccount(anvilKey(4)),
        },
        demo: true,
      }),
    );
    const test = createTestClient({ chain: foundry, mode: "anvil", transport: http(stack.url) });
    const wallet = (pk: `0x${string}`) =>
      createWalletClient({
        chain: foundry,
        transport: http(stack.url),
        account: privateKeyToAccount(pk),
      }).extend(publicActions);
    const studentPk = generatePrivateKey();
    const mamaPk = generatePrivateKey();
    const student = wallet(studentPk);
    const mama = wallet(mamaPk);
    for (const a of [student.account.address, mama.account.address])
      await test.setBalance({ address: a, value: parseEther("1") });
    const write = async (w: typeof student, functionName: string, args: unknown[]) => {
      const hash = await w.writeContract({
        address: stack.contract,
        abi: ABI,
        functionName,
        args,
      });
      await w.waitForTransactionReceipt({ hash });
    };
    await write(student, "register", [[40, 15, 15, 20, 10]]);
    const accountId = 1n;
    const studentAuth = privateKeyToAccount(studentPk);
    const mamaAuth = privateKeyToAccount(mamaPk);
    const invite = async () => {
      const k = generatePrivateKey();
      const addr = privateKeyToAddress(k).toLowerCase() as Address;
      await write(student, "createInvite", [addr]);
      const r = await post(createInviteRoute, studentAuth, "invite.create", accountId, {
        accountId: "1",
        inviteKey: addr,
        trustedName: "Mama",
      });
      return { k, inviteId: (r.json as { inviteId: string }).inviteId };
    };
    const state = async (inviteId: string) =>
      ((await call(readInviteRoute, { params: { inviteId } })).json as { state: string }).state;

    const first = await invite();
    expect(await state(first.inviteId)).toBe("open");
    const second = await invite();
    expect(await state(first.inviteId)).toBe("replaced");
    const sig = await privateKeyToAccount(second.k).signTypedData({
      domain: {
        name: "AmplopEnvelopes",
        version: "1",
        chainId: 31337,
        verifyingContract: stack.contract,
      },
      types: {
        AcceptInvite: [
          { name: "accountId", type: "uint256" },
          { name: "trusted", type: "address" },
        ],
      },
      primaryType: "AcceptInvite",
      message: { accountId, trusted: mama.account.address },
    });
    await write(mama, "acceptInvite", [accountId, sig]);
    expect(await state(second.inviteId)).toBe("used");
    expect((await get(latestRoute, mamaAuth, "invite.latest", accountId)).json).toMatchObject({
      trustedName: "Mama",
      state: "used",
    });

    await write(student, "removeTrusted", []);
    for (let i = 0; i < 3; i++) await write(student, "skipDays", [1]);
    await write(student, "finishRemoveTrusted", [accountId]);
    const third = await invite();
    for (let i = 0; i < 4; i++) await write(student, "skipDays", [2]);
    expect(await state(third.inviteId)).toBe("expired");
  });
});
