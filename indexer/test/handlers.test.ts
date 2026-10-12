// Handler tests U1 to U19 (16 S16-10, S16-11) with simulated events; U20 is in config.test.ts.
import { createTestIndexer } from "generated";
import { describe, expect, it } from "vitest";

const BASE = 70_137_800; // after config.yaml's start_block
const T = 1_791_936_000;
const OWNER = "0x00000000000000000000000000000000000000AA";
const MAMA = "0x00000000000000000000000000000000000000BB";
const DEWI = "0x00000000000000000000000000000000000000CC";
const NEW_OWNER = "0x00000000000000000000000000000000000000DD";
const ID = 1n;
const P1 = `0x${"01".repeat(32)}`;
const P2 = `0x${"02".repeat(32)}`;

let n = 0;
/** One event in its own block, so ids and sortKey follow feed order. */
function ev(event: string, params: Record<string, unknown>) {
  n++;
  return {
    contract: "AmplopEnvelopes" as const,
    event,
    block: { number: BASE + n, timestamp: T + n },
    transaction: { hash: `0x${n.toString(16).padStart(64, "0")}` },
    params: { accountId: ID, ...params },
  };
}

const created = () => ev("AccountCreated", { owner: OWNER, split: [40n, 15n, 15n, 20n, 10n] });
const linked = (who = MAMA) => ev("TrustedLinked", { trusted: who });

async function run(events: ReturnType<typeof ev>[]) {
  const indexer = createTestIndexer();
  // The simulate list is typed per event; these helpers build valid items by name.
  await indexer.process({ chains: { 10143: { simulate: events as never } } });
  return indexer;
}

describe("accounts and changes", () => {
  it("U1: AccountCreated", async () => {
    const ix = await run([created()]);
    expect(await ix.Account.getOrThrow("1")).toMatchObject({
      owner: OWNER.toLowerCase(),
      split: [40, 15, 15, 20, 10],
      trusted: undefined,
      lockOn: true,
      skipSeconds: 0n,
    });
  });

  it("U2: linked, removal started, removed", async () => {
    const ix = await run([
      created(),
      linked(),
      ev("TrustedRemovalStarted", { trusted: MAMA, readyAt: 999n }),
      ev("TrustedRemoved", { trusted: MAMA }),
    ]);
    const alerts = await ix.Alert.getAll();
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      kind: "TrustedRemovalStarted",
      trusted: MAMA.toLowerCase(),
      status: "Done",
      readyAt: 999n,
    });
    expect((await ix.Account.getOrThrow("1")).trusted).toBeUndefined();
  });

  it("U3: days skipped move the account clock on later rows", async () => {
    const ix = await run([
      created(),
      ev("DaysSkipped", { numDays: 2n, skipSeconds: 172_800n }),
      ev("Deposited", {
        paymentId: P1,
        amount: 1000n,
        parts: [400n, 150n, 150n, 200n, 100n],
        startDay: 20_738n,
      }),
    ]);
    const d = await ix.Deposit.getOrThrow(P1);
    expect(d.parts).toEqual([400n, 150n, 150n, 200n, 100n]);
    expect(d.startDay).toBe(20_738n);
    expect(d.accountClock).toBe(d.timestamp + 172_800n);
    expect(d.sortKey).toBe(BigInt(d.blockNumber) * 100_000n + BigInt(d.logIndex));
  });

  it("U10: an immediate split changes the account and alerts nobody", async () => {
    const ix = await run([
      created(),
      linked(),
      ev("SplitSaved", { split: [50n, 10n, 10n, 20n, 10n], startsAt: 0n, immediate: true }),
    ]);
    expect((await ix.Account.getOrThrow("1")).split).toEqual([50, 10, 10, 20, 10]);
    expect(await ix.Alert.getAll()).toHaveLength(0);
  });

  it("U11: a second waiting split replaces the first; cancel ends it", async () => {
    const ix = await run([
      created(),
      linked(),
      ev("SplitSaved", { split: [50n, 10n, 10n, 20n, 10n], startsAt: 10n, immediate: false }),
      ev("SplitSaved", { split: [30n, 20n, 20n, 20n, 10n], startsAt: 20n, immediate: false }),
      ev("PendingCancelled", { kind: 0n }),
    ]);
    const alerts = (await ix.Alert.getAll()).sort((a, b) => Number(a.sortKey - b.sortKey));
    expect(alerts.map((a) => a.status)).toEqual(["Replaced", "Cancelled"]);
    expect(alerts[1]?.split).toEqual([30, 20, 20, 20, 10]);
    expect((await ix.Account.getOrThrow("1")).pendingSplit).toBeUndefined();
  });

  it("U12: lock-off started then done", async () => {
    const ix = await run([
      created(),
      linked(),
      ev("LockOffStarted", { readyAt: 5n }),
      ev("LockOffDone", { moved: 100n }),
    ]);
    expect((await ix.Alert.getAll()).map((a) => [a.kind, a.status])).toEqual([
      ["LockOffStarted", "Done"],
    ]);
    expect((await ix.Account.getOrThrow("1")).lockOn).toBe(false);
  });

  it("U15: two recovery approvals, then done", async () => {
    const ix = await run([
      created(),
      linked(),
      ev("RecoveryApproved", { newOwner: NEW_OWNER, readyAt: 5n }),
      ev("RecoveryApproved", { newOwner: NEW_OWNER, readyAt: 6n }),
      ev("RecoveryDone", { oldOwner: OWNER, newOwner: NEW_OWNER }),
    ]);
    const alerts = (await ix.Alert.getAll()).sort((a, b) => Number(a.sortKey - b.sortKey));
    expect(alerts.map((a) => a.status)).toEqual(["Replaced", "Done"]);
    expect(
      JSON.stringify(alerts, (_k, v: unknown) => (typeof v === "bigint" ? String(v) : v)),
    ).not.toContain(NEW_OWNER.slice(2).toLowerCase());
    expect((await ix.Account.getOrThrow("1")).owner).toBe(NEW_OWNER.toLowerCase());
  });

  it("U16: invite created", async () => {
    const ix = await run([created(), ev("InviteCreated", { inviteKey: DEWI, expiresAt: 77n })]);
    expect(await ix.Account.getOrThrow("1")).toMatchObject({
      inviteKey: DEWI.toLowerCase(),
      inviteExpiresAt: 77n,
    });
    expect(await ix.Alert.getAll()).toHaveLength(0);
  });

  it("U17: a replaced trusted person keeps old alerts; the new one gets new ones", async () => {
    const ix = await run([
      created(),
      linked(MAMA),
      ev("LockOffStarted", { readyAt: 5n }),
      ev("TrustedRemoved", { trusted: MAMA }),
      linked(DEWI),
      ev("EmergencyRequested", {
        requestSeq: 1n,
        amount: 70n,
        reasonHash: `0x${"ab".repeat(32)}`,
        opensAt: 9n,
      }),
    ]);
    const alerts = (await ix.Alert.getAll()).sort((a, b) => Number(a.sortKey - b.sortKey));
    expect(alerts.map((a) => [a.kind, a.trusted, a.status])).toEqual([
      ["LockOffStarted", MAMA.toLowerCase(), "Active"],
      ["EmergencyRequested", DEWI.toLowerCase(), "Active"],
    ]);
  });
});

describe("purchases", () => {
  const approved = (id: string, envelope = 0n, amount = 1000n) =>
    ev("PurchaseApproved", {
      purchaseId: id,
      envelope,
      amount,
      shopType: 5411n,
      everydayStepIn: false,
    });

  it("U4: a partial collect", async () => {
    const ix = await run([
      created(),
      approved(P1),
      ev("PurchaseCollected", { purchaseId: P1, amount: 900n, returned: 100n }),
    ]);
    const p = await ix.Purchase.getOrThrow(P1);
    expect(p).toMatchObject({ status: "Collected", collected: 900n, returned: 100n, held: 0n });
    expect(p.txHash).not.toBe(p.collectedTx);
    expect(p.collectedTx).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("U5: released, and collected then refunded", async () => {
    const ix = await run([
      created(),
      approved(P1),
      ev("HoldReleased", { purchaseId: P1, amount: 1000n }),
      approved(P2),
      ev("PurchaseCollected", { purchaseId: P2, amount: 1000n, returned: 0n }),
      ev("PurchaseRefunded", { purchaseId: P2, amount: 250n }),
    ]);
    expect(await ix.Purchase.getOrThrow(P1)).toMatchObject({ status: "Released", held: 0n });
    expect(await ix.Purchase.getOrThrow(P2)).toMatchObject({ status: "Refunded", refunded: 250n });
  });

  it("U6: a blocked decline alerts the category only", async () => {
    const ix = await run([
      created(),
      linked(),
      ev("PurchaseDeclined", { purchaseId: P1, amount: 2000n, shopType: 7995n, reason: 1n }),
    ]);
    expect(await ix.Purchase.getOrThrow(P1)).toMatchObject({
      status: "Declined",
      declineReason: "Blocked",
    });
    const alerts = await ix.Alert.getAll();
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ kind: "PurchaseBlocked", shopType: 7995, amount: undefined });
    expect(
      JSON.stringify(alerts, (_k, v: unknown) => (typeof v === "bigint" ? String(v) : v)),
    ).not.toContain(P1.slice(2));
  });

  it("U7: a blocked decline with no trusted person stores the purchase and no alert", async () => {
    const ix = await run([
      created(),
      ev("PurchaseDeclined", { purchaseId: P1, amount: 2000n, shopType: 7995n, reason: 1n }),
    ]);
    expect((await ix.Purchase.getOrThrow(P1)).status).toBe("Declined");
    expect(await ix.Alert.getAll()).toHaveLength(0);
  });

  it("U8: not enough never alerts", async () => {
    const ix = await run([
      created(),
      linked(),
      ev("PurchaseDeclined", { purchaseId: P1, amount: 2000n, shopType: 5411n, reason: 2n }),
    ]);
    expect((await ix.Purchase.getOrThrow(P1)).declineReason).toBe("NotEnough");
    expect(await ix.Alert.getAll()).toHaveLength(0);
  });

  it("U9: a move alerts envelope names only", async () => {
    const ix = await run([
      created(),
      linked(),
      approved(P1, 3n),
      ev("PurchaseMoved", { purchaseId: P1, from: 3n, to: 2n, shopType: 5411n }),
    ]);
    expect(await ix.Purchase.getOrThrow(P1)).toMatchObject({
      envelope: "Study",
      originalEnvelope: "Everyday",
      moved: true,
    });
    const [a] = await ix.Alert.getAll();
    expect(a).toMatchObject({
      kind: "PurchaseMoved",
      fromEnvelope: "Everyday",
      toEnvelope: "Study",
      amount: undefined,
      shopType: undefined,
    });
  });

  it("U18: an event for an account never created fails loudly", async () => {
    await expect(run([approved(P1)])).rejects.toThrow();
  });
});

describe("emergency", () => {
  const requested = (seq: bigint) =>
    ev("EmergencyRequested", {
      requestSeq: seq,
      amount: 70n,
      reasonHash: `0x${"AB".repeat(32)}`,
      opensAt: 172_800n,
    });

  it("U13: requested then approved", async () => {
    const ix = await run([
      created(),
      linked(),
      requested(1n),
      ev("EmergencyOpened", { requestSeq: 1n, amount: 70n, openedBy: 0n }),
    ]);
    expect(await ix.EmergencyRequest.getOrThrow("1-1")).toMatchObject({
      status: "Opened",
      openedBy: "Approval",
      openedAmount: 70n,
      reasonHash: `0x${"ab".repeat(32)}`,
    });
    const [a] = await ix.Alert.getAll();
    expect(a).toMatchObject({ amount: 70n, readyAt: 172_800n, requestSeq: 1n, status: "Done" });
  });

  it("U14: opened by time; another cancelled", async () => {
    const ix = await run([
      created(),
      linked(),
      requested(1n),
      ev("EmergencyOpened", { requestSeq: 1n, amount: 70n, openedBy: 1n }),
      requested(2n),
      ev("EmergencyCancelled", { requestSeq: 2n }),
    ]);
    expect((await ix.EmergencyRequest.getOrThrow("1-1")).openedBy).toBe("Time");
    expect((await ix.EmergencyRequest.getOrThrow("1-2")).status).toBe("Cancelled");
    const alerts = (await ix.Alert.getAll()).sort((a, b) => Number(a.sortKey - b.sortKey));
    expect(alerts.map((a) => a.status)).toEqual(["Done", "Cancelled"]);
  });
});

it("U19: the J2 sequence gives five alerts, newest first", async () => {
  const ix = await run([
    created(),
    linked(),
    ev("PurchaseApproved", {
      purchaseId: P2,
      envelope: 3n,
      amount: 10n,
      shopType: 5411n,
      everydayStepIn: false,
    }),
    ev("PurchaseDeclined", { purchaseId: P1, amount: 2000n, shopType: 7995n, reason: 1n }),
    ev("PurchaseMoved", { purchaseId: P2, from: 3n, to: 2n, shopType: 5411n }),
    ev("EmergencyRequested", {
      requestSeq: 1n,
      amount: 70n,
      reasonHash: `0x${"ab".repeat(32)}`,
      opensAt: 9n,
    }),
    ev("SplitSaved", { split: [50n, 10n, 10n, 20n, 10n], startsAt: 10n, immediate: false }),
    ev("RecoveryApproved", { newOwner: NEW_OWNER, readyAt: 5n }),
  ]);
  const alerts = (await ix.Alert.getAll()).sort((a, b) => Number(b.sortKey - a.sortKey));
  expect(alerts.map((a) => a.kind)).toEqual([
    "RecoveryApproved",
    "SplitSaved",
    "EmergencyRequested",
    "PurchaseMoved",
    "PurchaseBlocked",
  ]);
});
