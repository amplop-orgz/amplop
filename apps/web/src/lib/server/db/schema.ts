// Every table of 01 section 5 (05 S05-34). Status columns are text with a CHECK, not enums.
// No `server-only` import here: drizzle-kit loads this file outside Next.js, where that import throws.
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

const tz = (name: string) => timestamp(name, { withTimezone: true });
const big = (name: string) => bigint(name, { mode: "bigint" });

export const nonces = pgTable(
  "nonces",
  {
    nonce: text("nonce").primaryKey(),
    expiresAt: tz("expires_at").notNull(),
    usedAt: tz("used_at"),
  },
  (t) => [index("nonces_expires_at_idx").on(t.expiresAt)],
);

export const rateLimits = pgTable(
  "rate_limits",
  {
    bucket: text("bucket").notNull(),
    windowStart: tz("window_start").notNull(),
    count: integer("count").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.bucket, t.windowStart] }),
    index("rate_limits_window_start_idx").on(t.windowStart),
  ],
);

export const profiles = pgTable("profiles", {
  accountId: big("account_id").primaryKey(),
  name: text("name").notNull(),
  updatedAt: tz("updated_at").notNull().defaultNow(),
});

export const cards = pgTable(
  "cards",
  {
    cardToken: text("card_token").primaryKey(),
    accountId: big("account_id").notNull(),
    last4: text("last4").notNull(),
    createdAt: tz("created_at").notNull().defaultNow(),
  },
  (t) => [
    unique("cards_account_id_key").on(t.accountId),
    check("cards_last4_check", sql`${t.last4} ~ '^[0-9]{4}$'`),
  ],
);

export const orders = pgTable(
  "orders",
  {
    orderId: text("order_id").primaryKey(),
    accountId: big("account_id").notNull(),
    rupiah: big("rupiah").notNull(),
    dollarsUnits: big("dollars_units").notNull(),
    rateIdrPerUsd: integer("rate_idr_per_usd").notNull(),
    status: text("status").notNull(),
    vaNumber: text("va_number"),
    bank: text("bank"),
    expiresAt: tz("expires_at"),
    paymentId: text("payment_id").notNull(),
    depositTx: text("deposit_tx"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: tz("next_attempt_at"),
    lastError: text("last_error"),
    lastCheckedAt: tz("last_checked_at"),
    sentHashes: text("sent_hashes")
      .array()
      .notNull()
      .default(sql`'{}'`),
    confirmMs: integer("confirm_ms"),
    createdAt: tz("created_at").notNull().defaultNow(),
    updatedAt: tz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    unique("orders_payment_id_key").on(t.paymentId),
    index("orders_status_updated_at_idx").on(t.status, t.updatedAt),
    index("orders_account_id_created_at_idx").on(t.accountId, t.createdAt),
    check(
      "orders_status_check",
      sql`${t.status} in ('waiting', 'received', 'sent', 'expired', 'failed')`,
    ),
    check("orders_payment_id_check", sql`${t.paymentId} ~ '^0x[0-9a-f]{64}$'`),
  ],
);

export const purchases = pgTable(
  "purchases",
  {
    purchaseId: text("purchase_id").primaryKey(),
    accountId: big("account_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    merchantName: text("merchant_name").notNull(),
    merchantCity: text("merchant_city").notNull(),
    currency: text("currency").notNull(),
    amountMinor: big("amount_minor").notNull(),
    mcc: integer("mcc").notNull(),
    amountUnits: big("amount_units").notNull(),
    result: text("result").notNull(),
    envelope: smallint("envelope"),
    everydayStepIn: boolean("everyday_step_in").notNull().default(false),
    declineReason: text("decline_reason"),
    holdState: text("hold_state"),
    txHash: text("tx_hash"),
    settleTx: text("settle_tx"),
    sentHashes: text("sent_hashes")
      .array()
      .notNull()
      .default(sql`'{}'`),
    confirmMs: integer("confirm_ms"),
    createdAt: tz("created_at").notNull().defaultNow(),
    updatedAt: tz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    unique("purchases_idempotency_key_key").on(t.idempotencyKey),
    index("purchases_account_id_created_at_idx").on(t.accountId, t.createdAt),
    index("purchases_hold_state_created_at_idx").on(t.holdState, t.createdAt),
    check("purchases_currency_check", sql`${t.currency} in ('EUR', 'USD', 'IDR')`),
    check("purchases_mcc_check", sql`${t.mcc} between 0 and 9999`),
    check(
      "purchases_result_check",
      sql`${t.result} in ('pending', 'approved', 'declined', 'error')`,
    ),
    check("purchases_decline_reason_check", sql`${t.declineReason} in ('blocked', 'not_enough')`),
    check(
      "purchases_hold_state_check",
      sql`${t.holdState} in ('held', 'collected', 'released', 'refunded')`,
    ),
  ],
);

export const invites = pgTable(
  "invites",
  {
    inviteId: text("invite_id").primaryKey(),
    accountId: big("account_id").notNull(),
    inviteKey: text("invite_key").notNull(),
    trustedName: text("trusted_name").notNull(),
    createdAt: tz("created_at").notNull().defaultNow(),
  },
  (t) => [index("invites_account_id_idx").on(t.accountId)],
);

export const reasons = pgTable(
  "reasons",
  {
    linkId: text("link_id").primaryKey(),
    accountId: big("account_id").notNull(),
    requestSeq: big("request_seq").notNull(),
    text: text("text").notNull(),
    createdAt: tz("created_at").notNull().defaultNow(),
  },
  (t) => [unique("reasons_account_id_request_seq_key").on(t.accountId, t.requestSeq)],
);

export const recoveries = pgTable("recoveries", {
  linkId: text("link_id").primaryKey(),
  newOwner: text("new_owner").notNull(),
  dismissedAt: tz("dismissed_at"),
  createdAt: tz("created_at").notNull().defaultNow(),
});

export const funding = pgTable("funding", {
  address: text("address").primaryKey(),
  day: date("day", { mode: "string" }).notNull(),
  countToday: integer("count_today").notNull(),
  lastFundedAt: tz("last_funded_at").notNull(),
  totalWei: numeric("total_wei", { precision: 78, scale: 0 }).notNull(),
});

export const fundingDaily = pgTable("funding_daily", {
  day: date("day", { mode: "string" }).primaryKey(),
  weiSent: numeric("wei_sent", { precision: 78, scale: 0 }).notNull(),
});

export const signerNonces = pgTable("signer_nonces", {
  address: text("address").primaryKey(),
  nextNonce: big("next_nonce").notNull(),
  updatedAt: tz("updated_at").notNull(),
});
