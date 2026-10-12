// Card purchases: approve, decline, collect, release, refund and move (16 S16-9, S16-10).
import { AmplopEnvelopes, type HandlerContext, type Purchase } from "generated";
import { addAlert, envelope, getAccount, lower, origin } from "./common";

function getPurchase(context: HandlerContext, id: string) {
  return context.Purchase.getOrThrow(lower(id), `Purchase ${id} was never seen`);
}

const fresh = {
  held: 0n,
  collected: 0n,
  returned: 0n,
  refunded: 0n,
  moved: false,
  movedFrom: undefined,
  movedTo: undefined,
  collectedTx: undefined,
  releasedTx: undefined,
  refundedTx: undefined,
  movedTx: undefined,
} satisfies Partial<Purchase>;

AmplopEnvelopes.PurchaseApproved.handler(async ({ event, context }) => {
  const a = await getAccount(context, event.params.accountId);
  const id = lower(event.params.purchaseId);
  const env = envelope(event.params.envelope);
  context.Purchase.set({
    id,
    purchaseId: id,
    accountId: event.params.accountId,
    status: "Held",
    envelope: env,
    originalEnvelope: env,
    amount: event.params.amount,
    shopType: Number(event.params.shopType),
    everydayStepIn: event.params.everydayStepIn,
    declineReason: undefined,
    updatedAt: BigInt(event.block.timestamp),
    ...fresh,
    held: event.params.amount,
    ...origin(event, a),
  });
});

AmplopEnvelopes.PurchaseDeclined.handler(async ({ event, context }) => {
  const a = await getAccount(context, event.params.accountId);
  const id = lower(event.params.purchaseId);
  const blocked = Number(event.params.reason) === 1;
  context.Purchase.set({
    id,
    purchaseId: id,
    accountId: event.params.accountId,
    status: "Declined",
    envelope: undefined,
    originalEnvelope: undefined,
    amount: event.params.amount,
    shopType: Number(event.params.shopType),
    everydayStepIn: false,
    declineReason: blocked ? "Blocked" : "NotEnough",
    updatedAt: BigInt(event.block.timestamp),
    ...fresh,
    ...origin(event, a),
  });
  // R26: the category only, never the amount or the purchase id. Not enough never alerts.
  if (blocked)
    addAlert(context, event, a, "PurchaseBlocked", { shopType: Number(event.params.shopType) });
});

AmplopEnvelopes.PurchaseCollected.handler(async ({ event, context }) => {
  const p = await getPurchase(context, event.params.purchaseId);
  context.Purchase.set({
    ...p,
    status: "Collected",
    collected: event.params.amount,
    returned: event.params.returned,
    held: 0n,
    collectedTx: lower(event.transaction.hash),
    updatedAt: BigInt(event.block.timestamp),
  });
});

AmplopEnvelopes.HoldReleased.handler(async ({ event, context }) => {
  const p = await getPurchase(context, event.params.purchaseId);
  context.Purchase.set({
    ...p,
    status: "Released",
    held: 0n,
    releasedTx: lower(event.transaction.hash),
    updatedAt: BigInt(event.block.timestamp),
  });
});

AmplopEnvelopes.PurchaseRefunded.handler(async ({ event, context }) => {
  const p = await getPurchase(context, event.params.purchaseId);
  context.Purchase.set({
    ...p,
    status: "Refunded",
    refunded: p.refunded + event.params.amount,
    refundedTx: lower(event.transaction.hash),
    updatedAt: BigInt(event.block.timestamp),
  });
});

AmplopEnvelopes.PurchaseMoved.handler(async ({ event, context }) => {
  const a = await getAccount(context, event.params.accountId);
  const p = await getPurchase(context, event.params.purchaseId);
  const from = envelope(event.params.from);
  const to = envelope(event.params.to);
  context.Purchase.set({
    ...p,
    envelope: to,
    moved: true,
    movedFrom: from,
    movedTo: to,
    movedTx: lower(event.transaction.hash),
    updatedAt: BigInt(event.block.timestamp),
  });
  addAlert(context, event, a, "PurchaseMoved", { fromEnvelope: from, toEnvelope: to });
});
