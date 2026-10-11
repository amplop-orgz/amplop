CREATE TABLE "cards" (
	"card_token" text PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"last4" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cards_account_id_key" UNIQUE("account_id"),
	CONSTRAINT "cards_last4_check" CHECK ("cards"."last4" ~ '^[0-9]{4}$')
);
--> statement-breakpoint
CREATE TABLE "funding" (
	"address" text PRIMARY KEY NOT NULL,
	"day" date NOT NULL,
	"count_today" integer NOT NULL,
	"last_funded_at" timestamp with time zone NOT NULL,
	"total_wei" numeric(78, 0) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "funding_daily" (
	"day" date PRIMARY KEY NOT NULL,
	"wei_sent" numeric(78, 0) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"invite_id" text PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"invite_key" text NOT NULL,
	"trusted_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nonces" (
	"nonce" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"order_id" text PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"rupiah" bigint NOT NULL,
	"dollars_units" bigint NOT NULL,
	"rate_idr_per_usd" integer NOT NULL,
	"status" text NOT NULL,
	"va_number" text,
	"bank" text,
	"expires_at" timestamp with time zone,
	"payment_id" text NOT NULL,
	"deposit_tx" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"last_error" text,
	"last_checked_at" timestamp with time zone,
	"sent_hashes" text[] DEFAULT '{}' NOT NULL,
	"confirm_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_payment_id_key" UNIQUE("payment_id"),
	CONSTRAINT "orders_status_check" CHECK ("orders"."status" in ('waiting', 'received', 'sent', 'expired', 'failed')),
	CONSTRAINT "orders_payment_id_check" CHECK ("orders"."payment_id" ~ '^0x[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"account_id" bigint PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"purchase_id" text PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"idempotency_key" text NOT NULL,
	"merchant_name" text NOT NULL,
	"merchant_city" text NOT NULL,
	"currency" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"mcc" integer NOT NULL,
	"amount_units" bigint NOT NULL,
	"result" text NOT NULL,
	"envelope" smallint,
	"everyday_step_in" boolean DEFAULT false NOT NULL,
	"decline_reason" text,
	"hold_state" text,
	"tx_hash" text,
	"settle_tx" text,
	"sent_hashes" text[] DEFAULT '{}' NOT NULL,
	"confirm_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchases_idempotency_key_key" UNIQUE("idempotency_key"),
	CONSTRAINT "purchases_currency_check" CHECK ("purchases"."currency" in ('EUR', 'USD', 'IDR')),
	CONSTRAINT "purchases_mcc_check" CHECK ("purchases"."mcc" between 0 and 9999),
	CONSTRAINT "purchases_result_check" CHECK ("purchases"."result" in ('pending', 'approved', 'declined', 'error')),
	CONSTRAINT "purchases_decline_reason_check" CHECK ("purchases"."decline_reason" in ('blocked', 'not_enough')),
	CONSTRAINT "purchases_hold_state_check" CHECK ("purchases"."hold_state" in ('held', 'collected', 'released', 'refunded'))
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"bucket" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer NOT NULL,
	CONSTRAINT "rate_limits_bucket_window_start_pk" PRIMARY KEY("bucket","window_start")
);
--> statement-breakpoint
CREATE TABLE "reasons" (
	"link_id" text PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"request_seq" bigint NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reasons_account_id_request_seq_key" UNIQUE("account_id","request_seq")
);
--> statement-breakpoint
CREATE TABLE "recoveries" (
	"link_id" text PRIMARY KEY NOT NULL,
	"new_owner" text NOT NULL,
	"dismissed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signer_nonces" (
	"address" text PRIMARY KEY NOT NULL,
	"next_nonce" bigint NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "invites_account_id_idx" ON "invites" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "nonces_expires_at_idx" ON "nonces" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "orders_status_updated_at_idx" ON "orders" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "orders_account_id_created_at_idx" ON "orders" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "purchases_account_id_created_at_idx" ON "purchases" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "purchases_hold_state_created_at_idx" ON "purchases" USING btree ("hold_state","created_at");--> statement-breakpoint
CREATE INDEX "rate_limits_window_start_idx" ON "rate_limits" USING btree ("window_start");