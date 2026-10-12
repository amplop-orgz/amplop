// Deposits (16 S16-9). Weekly release rows have no event; the app computes them from parts.
import { AmplopEnvelopes } from "generated";
import { getAccount, lower, origin } from "./common";

AmplopEnvelopes.Deposited.handler(async ({ event, context }) => {
  const a = await getAccount(context, event.params.accountId);
  const paymentId = lower(event.params.paymentId);
  context.Deposit.set({
    id: paymentId,
    accountId: event.params.accountId,
    paymentId,
    amount: event.params.amount,
    parts: event.params.parts,
    startDay: event.params.startDay,
    ...origin(event, a),
  });
});
