// Waiting changes and their alerts: split, trusted removal, lock-off, recovery (16 S16-10, S16-11).
import { AmplopEnvelopes } from "generated";
import { addAlert, closeAlert, getAccount, lower } from "./common";

AmplopEnvelopes.SplitSaved.handler(async ({ event, context }) => {
  const a = await getAccount(context, event.params.accountId);
  const split = event.params.split.map(Number);
  if (event.params.immediate) {
    context.Account.set({ ...a, split, pendingSplit: undefined, pendingSplitStartsAt: undefined });
    return;
  }
  // PRD 14 rule 7: a second waiting split replaces the first.
  await closeAlert(context, a.openAlertSplit, "Replaced", event);
  const id = addAlert(context, event, a, "SplitSaved", { split, readyAt: event.params.startsAt });
  context.Account.set({
    ...a,
    pendingSplit: split,
    pendingSplitStartsAt: event.params.startsAt,
    openAlertSplit: id,
  });
});

AmplopEnvelopes.TrustedRemovalStarted.handler(async ({ event, context }) => {
  const a = await getAccount(context, event.params.accountId);
  const id = addAlert(context, event, a, "TrustedRemovalStarted", {
    readyAt: event.params.readyAt,
  });
  context.Account.set({ ...a, openAlertRemoval: id });
});

AmplopEnvelopes.TrustedRemoved.handler(async ({ event, context }) => {
  const a = await getAccount(context, event.params.accountId);
  await closeAlert(context, a.openAlertRemoval, "Done", event);
  context.Account.set({ ...a, trusted: undefined, openAlertRemoval: undefined });
});

AmplopEnvelopes.LockOffStarted.handler(async ({ event, context }) => {
  const a = await getAccount(context, event.params.accountId);
  const id = addAlert(context, event, a, "LockOffStarted", { readyAt: event.params.readyAt });
  context.Account.set({ ...a, openAlertLockOff: id });
});

AmplopEnvelopes.LockOffDone.handler(async ({ event, context }) => {
  const a = await getAccount(context, event.params.accountId);
  await closeAlert(context, a.openAlertLockOff, "Done", event);
  context.Account.set({ ...a, lockOn: false, openAlertLockOff: undefined });
});

AmplopEnvelopes.RecoveryApproved.handler(async ({ event, context }) => {
  const a = await getAccount(context, event.params.accountId);
  await closeAlert(context, a.openAlertRecovery, "Replaced", event);
  // Never the new owner's address on the alert (S16-9).
  const id = addAlert(context, event, a, "RecoveryApproved", { readyAt: event.params.readyAt });
  context.Account.set({ ...a, openAlertRecovery: id });
});

AmplopEnvelopes.RecoveryDone.handler(async ({ event, context }) => {
  const a = await getAccount(context, event.params.accountId);
  await closeAlert(context, a.openAlertRecovery, "Done", event);
  context.Account.set({ ...a, owner: lower(event.params.newOwner), openAlertRecovery: undefined });
});

// PendingKind (01 section 3): 0 Split, 1 TrustedRemoval, 2 LockOff, 3 Recovery.
AmplopEnvelopes.PendingCancelled.handler(async ({ event, context }) => {
  const a = await getAccount(context, event.params.accountId);
  switch (Number(event.params.kind)) {
    case 0:
      await closeAlert(context, a.openAlertSplit, "Cancelled", event);
      context.Account.set({
        ...a,
        pendingSplit: undefined,
        pendingSplitStartsAt: undefined,
        openAlertSplit: undefined,
      });
      return;
    case 1:
      await closeAlert(context, a.openAlertRemoval, "Cancelled", event);
      context.Account.set({ ...a, openAlertRemoval: undefined });
      return;
    case 2:
      await closeAlert(context, a.openAlertLockOff, "Cancelled", event);
      context.Account.set({ ...a, openAlertLockOff: undefined });
      return;
    case 3:
      await closeAlert(context, a.openAlertRecovery, "Cancelled", event);
      context.Account.set({ ...a, openAlertRecovery: undefined });
      return;
    default:
      throw new Error(`unknown pending kind ${String(event.params.kind)}`);
  }
});
