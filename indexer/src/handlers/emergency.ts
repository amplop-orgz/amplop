// Emergency requests and their alert (16 S16-9, S16-10). The reason text stays on the server.
import { AmplopEnvelopes } from "generated";
import { addAlert, closeAlert, getAccount, lower, origin } from "./common";

const requestId = (accountId: bigint, seq: bigint) => `${accountId.toString()}-${seq.toString()}`;

AmplopEnvelopes.EmergencyRequested.handler(async ({ event, context }) => {
  const a = await getAccount(context, event.params.accountId);
  context.EmergencyRequest.set({
    id: requestId(event.params.accountId, event.params.requestSeq),
    accountId: event.params.accountId,
    requestSeq: event.params.requestSeq,
    amount: event.params.amount,
    reasonHash: lower(event.params.reasonHash),
    opensAt: event.params.opensAt,
    status: "Open",
    openedBy: undefined,
    openedAmount: undefined,
    closedAt: undefined,
    closedTx: undefined,
    ...origin(event, a),
  });
  const id = addAlert(context, event, a, "EmergencyRequested", {
    amount: event.params.amount,
    requestSeq: event.params.requestSeq,
    readyAt: event.params.opensAt,
  });
  context.Account.set({ ...a, openAlertEmergency: id });
});

AmplopEnvelopes.EmergencyOpened.handler(async ({ event, context }) => {
  const a = await getAccount(context, event.params.accountId);
  const r = await context.EmergencyRequest.getOrThrow(
    requestId(event.params.accountId, event.params.requestSeq),
  );
  context.EmergencyRequest.set({
    ...r,
    status: "Opened",
    openedBy: Number(event.params.openedBy) === 0 ? "Approval" : "Time",
    openedAmount: event.params.amount,
    closedAt: BigInt(event.block.timestamp),
    closedTx: lower(event.transaction.hash),
  });
  await closeAlert(context, a.openAlertEmergency, "Done", event);
  context.Account.set({ ...a, openAlertEmergency: undefined });
});

AmplopEnvelopes.EmergencyCancelled.handler(async ({ event, context }) => {
  const a = await getAccount(context, event.params.accountId);
  const r = await context.EmergencyRequest.getOrThrow(
    requestId(event.params.accountId, event.params.requestSeq),
  );
  context.EmergencyRequest.set({
    ...r,
    status: "Cancelled",
    closedAt: BigInt(event.block.timestamp),
    closedTx: lower(event.transaction.hash),
  });
  await closeAlert(context, a.openAlertEmergency, "Cancelled", event);
  context.Account.set({ ...a, openAlertEmergency: undefined });
});
