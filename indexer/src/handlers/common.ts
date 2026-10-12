// Shared helpers for every handler (16 S16-7, S16-10, S16-11): where a row came from, enum names
// and the alert rules.
import type { Account, Alert, HandlerContext } from "generated";

export type Envelope = NonNullable<Alert["fromEnvelope"]>;
type Kind = Alert["kind"];
type Status = Alert["status"];

/** The block, log and transaction fields every handler receives. */
export type Evt = {
  logIndex: number;
  block: { number: number; timestamp: number };
  transaction: { hash: string };
};

const ENVELOPES: readonly Envelope[] = ["Food", "Transport", "Study", "Everyday", "Emergency"];

export function envelope(i: bigint): Envelope {
  const e = ENVELOPES[Number(i)];
  if (!e) throw new Error(`unknown envelope ${String(i)}`);
  return e;
}

export const lower = (s: string): string => s.toLowerCase();

/** S16-7: the common fields; `accountClock` follows the account's skipped days (01 section 1). */
export function origin(event: Evt, account: Pick<Account, "skipSeconds">) {
  const timestamp = BigInt(event.block.timestamp);
  return {
    blockNumber: event.block.number,
    logIndex: event.logIndex,
    sortKey: BigInt(event.block.number) * 100_000n + BigInt(event.logIndex),
    timestamp,
    accountClock: timestamp + account.skipSeconds,
    txHash: lower(event.transaction.hash),
  };
}

/** A missing account means `start_block` is wrong: fail loudly (S16-10). */
export function getAccount(context: HandlerContext, accountId: bigint): Promise<Account> {
  return context.Account.getOrThrow(
    accountId.toString(),
    `Account ${accountId.toString()} was never created; check start_block`,
  );
}

type AlertFields = Partial<
  Pick<
    Alert,
    "amount" | "requestSeq" | "shopType" | "fromEnvelope" | "toEnvelope" | "split" | "readyAt"
  >
>;

/** S16-11 rule 1 and 2: only with a trusted person, addressed to that person. Returns the id. */
export function addAlert(
  context: HandlerContext,
  event: Evt,
  account: Account,
  kind: Kind,
  fields: AlertFields = {},
): string | undefined {
  if (!account.trusted) return undefined;
  const id = `${String(event.block.number)}-${String(event.logIndex)}`;
  context.Alert.set({
    id,
    accountId: account.accountId,
    trusted: account.trusted,
    kind,
    status: "Active",
    statusAt: undefined,
    statusTx: undefined,
    amount: undefined,
    requestSeq: undefined,
    shopType: undefined,
    fromEnvelope: undefined,
    toEnvelope: undefined,
    split: undefined,
    readyAt: undefined,
    ...fields,
    ...origin(event, account),
  });
  return id;
}

/** Ends an alert that is still Active; a missing id is fine (no trusted person at the time). */
export async function closeAlert(
  context: HandlerContext,
  id: string | undefined,
  status: Status,
  event: Evt,
): Promise<void> {
  if (!id) return;
  const alert = await context.Alert.get(id);
  if (alert?.status !== "Active") return;
  context.Alert.set({
    ...alert,
    status,
    statusAt: BigInt(event.block.timestamp),
    statusTx: lower(event.transaction.hash),
  });
}
