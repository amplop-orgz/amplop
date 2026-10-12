// Account rows: creation, invite, trusted link and skipped days (16 S16-10).
import { AmplopEnvelopes } from "generated";
import { getAccount, lower } from "./common";

AmplopEnvelopes.AccountCreated.handler(async ({ event, context }) => {
  context.Account.set({
    id: event.params.accountId.toString(),
    accountId: event.params.accountId,
    owner: lower(event.params.owner),
    trusted: undefined,
    trustedSince: undefined,
    split: event.params.split.map(Number),
    pendingSplit: undefined,
    pendingSplitStartsAt: undefined,
    lockOn: true,
    skipSeconds: 0n,
    inviteKey: undefined,
    inviteExpiresAt: undefined,
    openAlertSplit: undefined,
    openAlertRemoval: undefined,
    openAlertLockOff: undefined,
    openAlertRecovery: undefined,
    openAlertEmergency: undefined,
    createdAt: BigInt(event.block.timestamp),
    createdBlock: event.block.number,
    createdTx: lower(event.transaction.hash),
  });
});

AmplopEnvelopes.InviteCreated.handler(async ({ event, context }) => {
  const a = await getAccount(context, event.params.accountId);
  context.Account.set({
    ...a,
    inviteKey: lower(event.params.inviteKey),
    inviteExpiresAt: event.params.expiresAt,
  });
});

AmplopEnvelopes.TrustedLinked.handler(async ({ event, context }) => {
  const a = await getAccount(context, event.params.accountId);
  context.Account.set({
    ...a,
    trusted: lower(event.params.trusted),
    trustedSince: BigInt(event.block.timestamp),
  });
});

AmplopEnvelopes.DaysSkipped.handler(async ({ event, context }) => {
  const a = await getAccount(context, event.params.accountId);
  context.Account.set({ ...a, skipSeconds: event.params.skipSeconds });
});
