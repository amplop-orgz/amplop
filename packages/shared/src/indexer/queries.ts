// The GraphQL documents the app sends to the Envio indexer (16 S16-12), with their result types.
// Envio serves a Hasura-style API: BigInt fields take `numeric` variables as decimal strings. They come
// back as strings or JSON numbers depending on the server setting, so they are typed `Big` and read with
// `toBig`; every value here fits a safe integer (sortKey is about 7e12).

export type EnvelopeName = "Food" | "Transport" | "Study" | "Everyday" | "Emergency";
export type PurchaseStatus = "Held" | "Collected" | "Released" | "Refunded" | "Declined";
export type AlertKind =
  | "EmergencyRequested"
  | "PurchaseBlocked"
  | "PurchaseMoved"
  | "SplitSaved"
  | "LockOffStarted"
  | "TrustedRemovalStarted"
  | "RecoveryApproved";
export type AlertStatus = "Active" | "Done" | "Cancelled" | "Replaced";

export type Big = string | number;

export const toBig = (v: Big): bigint => BigInt(String(v));

/** S16-7: every row's origin. */
export type Origin = {
  blockNumber: number;
  logIndex: number;
  sortKey: Big;
  timestamp: Big;
  accountClock: Big;
  txHash: string;
};

export type DepositRow = Origin & {
  id: string;
  accountId: Big;
  paymentId: string;
  amount: Big;
  parts: Big[];
  startDay: Big;
};

export type PurchaseRow = Origin & {
  id: string;
  accountId: Big;
  status: PurchaseStatus;
  envelope: EnvelopeName | null;
  originalEnvelope: EnvelopeName | null;
  amount: Big;
  held: Big;
  collected: Big;
  returned: Big;
  refunded: Big;
  shopType: number;
  everydayStepIn: boolean;
  declineReason: "Blocked" | "NotEnough" | null;
  moved: boolean;
  movedFrom: EnvelopeName | null;
  movedTo: EnvelopeName | null;
  collectedTx: string | null;
  releasedTx: string | null;
  refundedTx: string | null;
  movedTx: string | null;
  updatedAt: Big;
};

export type EmergencyRow = Origin & {
  id: string;
  accountId: Big;
  requestSeq: Big;
  amount: Big;
  opensAt: Big;
  status: "Open" | "Opened" | "Cancelled";
  openedBy: "Approval" | "Time" | null;
  openedAmount: Big | null;
  closedAt: Big | null;
  closedTx: string | null;
};

export type AlertRow = Origin & {
  id: string;
  accountId: Big;
  trusted: string;
  kind: AlertKind;
  status: AlertStatus;
  statusAt: Big | null;
  statusTx: string | null;
  amount: Big | null;
  requestSeq: Big | null;
  shopType: number | null;
  fromEnvelope: EnvelopeName | null;
  toEnvelope: EnvelopeName | null;
  split: number[] | null;
  readyAt: Big | null;
};

const ORIGIN = "blockNumber logIndex sortKey timestamp accountClock txHash";
const DEPOSIT = `id accountId paymentId amount parts startDay ${ORIGIN}`;
const PURCHASE = `id accountId status envelope originalEnvelope amount held collected returned refunded shopType everydayStepIn declineReason moved movedFrom movedTo collectedTx releasedTx refundedTx movedTx updatedAt ${ORIGIN}`;
const EMERGENCY = `id accountId requestSeq amount opensAt status openedBy openedAmount closedAt closedTx ${ORIGIN}`;
const ALERT = `id accountId trusted kind status statusAt statusTx amount requestSeq shopType fromEnvelope toEnvelope split readyAt ${ORIGIN}`;

/** 2.9 Activity: three lists the app merges by sortKey, newest first. */
export const ActivityQuery = `query Activity($accountId: numeric!, $limit: Int!) {
  Deposit(where: { accountId: { _eq: $accountId } }, order_by: { sortKey: desc }, limit: $limit) { ${DEPOSIT} }
  Purchase(where: { accountId: { _eq: $accountId } }, order_by: { sortKey: desc }, limit: $limit) { ${PURCHASE} }
  EmergencyRequest(where: { accountId: { _eq: $accountId } }, order_by: { sortKey: desc }, limit: $limit) { ${EMERGENCY} }
}`;
export type ActivityResult = {
  Deposit: DepositRow[];
  Purchase: PurchaseRow[];
  EmergencyRequest: EmergencyRow[];
};

/** 2.3 Envelope detail: what the envelope paid for. */
export const EnvelopePurchasesQuery = `query EnvelopePurchases($accountId: numeric!, $envelope: envelope!, $limit: Int!) {
  Purchase(
    where: { accountId: { _eq: $accountId }, envelope: { _eq: $envelope }, status: { _in: [Held, Collected, Refunded] } }
    order_by: { sortKey: desc }
    limit: $limit
  ) { ${PURCHASE} }
}`;
export type EnvelopePurchasesResult = { Purchase: PurchaseRow[] };

/** 2.10 Move a purchase. */
export const PurchaseByIdQuery = `query PurchaseById($id: String!) { Purchase_by_pk(id: $id) { ${PURCHASE} } }`;
export type PurchaseByIdResult = { Purchase_by_pk: PurchaseRow | null };

/** 2.1 Allowance arrived. */
export const DepositByIdQuery = `query DepositById($id: String!) { Deposit_by_pk(id: $id) { ${DEPOSIT} } }`;
export type DepositByIdResult = { Deposit_by_pk: DepositRow | null };

/** 3.2 Emergency history. */
export const EmergencyHistoryQuery = `query EmergencyHistory($accountId: numeric!, $limit: Int!) {
  EmergencyRequest(where: { accountId: { _eq: $accountId } }, order_by: { sortKey: desc }, limit: $limit) { ${EMERGENCY} }
}`;
export type EmergencyHistoryResult = { EmergencyRequest: EmergencyRow[] };

/** 1.1 Parent home: the alerts addressed to this trusted person (J6). */
export const AlertsForTrustedQuery = `query AlertsForTrusted($accountId: numeric!, $trusted: String!, $limit: Int!) {
  Alert(where: { accountId: { _eq: $accountId }, trusted: { _eq: $trusted } }, order_by: { sortKey: desc }, limit: $limit) { ${ALERT} }
}`;
export type AlertsForTrustedResult = { Alert: AlertRow[] };

/** Diagnostics only: the app finds accounts with the contract's accountOf. */
export const AccountByOwnerQuery = `query AccountByOwner($owner: String!) {
  Account(where: { owner: { _eq: $owner } }) { id accountId owner trusted lockOn skipSeconds }
}`;

/** S16-14 lag check. */
export const IndexerMetaQuery = `query IndexerMeta { _meta { chainId progressBlock sourceBlock isReady } }`;
export type IndexerMetaResult = {
  _meta: { chainId: number; progressBlock: number; sourceBlock: number; isReady: boolean }[];
};
