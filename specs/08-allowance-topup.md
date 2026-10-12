# 08. Allowance top-up

Status: Ready · PRD sources: 2 (rupiah top-up, money shown), 3 (rupiah payment, conversion), 4 (R2, R3, R4 to R8), 5 (boards 1.2, 1.3, 1.4, 2.1 and the "payment received, sending" state), 8 (topup and webhook endpoints, `orders`), 10 (whole section), 12 (Simulate payment), 14 (cases C1 to C17, server tests, rule 3), 15 (Midtrans threat row, security tests), 16 (cut order: Midtrans before Simulate), 17 (faucet check) · Depends on: 03, 05, 06, 10

## Goal

Mama pays rupiah by bank virtual account (Midtrans sandbox), or taps Simulate payment in test mode. Once the payment is proven, the treasury deposits the matching AUSD into Raka's account exactly once, at the rate locked when the order was made. Mama sees the order move from Waiting to Sent with a transaction link, and Raka sees Allowance arrived.

## In scope

- Boards 1.2 Send allowance, 1.3 Waiting for payment (with its unseen states), 1.4 Allowance sent, 2.1 Allowance arrived.
- `POST /api/topup`, `GET /api/topup/[orderId]`, `POST /api/topup/[orderId]/simulate`, `POST /api/midtrans/webhook`, `GET /api/cron/deposits`.
- Midtrans Core API bank-transfer charge, notification check, status fetch.
- The order state machine and the single deposit path shared by webhook, Simulate and polls.
- Retries with backoff, treasury balance and allowance, faucet refill.
- Cases C1 to C17; the PRD 14 and PRD 15 server tests for top-ups.

## Out of scope

- The contract's split and release maths (03). This spec calls `deposit` and shows what the contract did.
- The demo banner and the rule that hides demo buttons in a non-demo build (15). This spec renders the Simulate button through 15's helper.
- Parent home (14), student home (11), indexer `Deposit` entity (16).
- Real rupiah, a licensed conversion partner (PRD 18).

## Requirements

### A. Who may send

**S08-1. Trusted person only (R2, C17).** Only the account's trusted person can open boards 1.2 to 1.4 and call the top-up endpoints. On the client, `/app/parent/send` and `/app/parent/send/[order]` check the signed-in address with `accountInfo(accountId).trusted`; anyone else is sent to `/app` with no request made. On the server, `POST /api/topup`, `GET /api/topup/[orderId]` and the simulate route are `signed:trusted` for that account (05 S05-11). The student signing gets 403 `not_trusted`; an unlinked person gets 403 `not_trusted`. No order row is created in either case.

### B. Board 1.2 Send allowance (`/app/parent/send`)

**S08-2. Layout and copy.** Parent screen (17 px base, design SPEC). Exact copy, with "Raka" replaced by the student's name from `GET /api/profile/[accountId]` (07):

| Element         | Copy and behaviour                                                                                                                                                      |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Top bar         | Back chevron to `/app/parent` (aria-label "Back"), title "Send allowance"                                                                                               |
| Field label     | "Amount for Raka"                                                                                                                                                       |
| Input           | `inputmode="numeric"`, shows rupiah as typed with dot thousands: `Rp16.500.000`. Prefilled with the last amount this device sent for this account, else `Rp16.500.000`. |
| Result row      | "Raka receives" and the dollar amount, for example `$1.000,00`                                                                                                          |
| Small lines     | "Sample rate $1 = Rp16.500" and "Fee Rp0"                                                                                                                               |
| Split heading   | "Split, set by Raka · released in four weekly shares"                                                                                                                   |
| Rows 0 to 3     | "Food · 40%", "$100,00 every Monday", "$400,00" (same pattern for Transport, Study, Everyday)                                                                           |
| Row 4, lock on  | "Emergency · 10%", "Locked · you can open it for Raka", "$100,00" (arrives whole and locked, R7)                                                                        |
| Row 4, lock off | "Emergency · 10%", "Goes to Everyday · the lock is off", "$100,00"                                                                                                      |
| Primary button  | "Continue to pay Rp16.500.000" (amount follows the input)                                                                                                               |
| Footnote        | "Bank transfer by virtual account. Test mode: no real money moves."                                                                                                     |

**S08-3. Amount rules (PRD 10, C10, C11).** The input keeps digits only; letters and symbols are dropped as typed or pasted. Continue is off when the field is empty, when the amount is below Rp100.000 or above Rp50.000.000. Under the input, below the minimum: "The smallest amount is Rp100.000."; above the maximum: "The largest amount is Rp50.000.000." Empty shows no message. Limits are inclusive: Rp100.000 and Rp50.000.000 are allowed.

**S08-4. Preview maths.** All preview numbers use `packages/shared/src/money.ts` (reuse if spec 06 already created them):

- `rupiahToUnits(rupiah: bigint, decimals: number, rateIdrPerUsd: bigint): bigint = rupiah × 10^decimals / rateIdrPerUsd` (integer division, rounds down; 01 §8).
- `splitParts(units, split: uint8[5]): bigint[5]`: `parts[i] = units × split[i] / 100` rounded down, then the leftover units go to Everyday (R4). Must match spec 03 exactly; a shared test vector file in `packages/shared/test/vectors/split.json` is checked by both Vitest and Foundry.
- `weeklyShares(part): bigint[4]`: three shares of `part / 4` rounded down, the last share takes the rest (R5).

The split shown is the one the contract will use for a deposit now: `pendingSplit` if a pending split exists and `pendingSplitStartsAt ≤ clock(accountId)`, otherwise `split` (R21, C15). "every Monday" shows `weeklyShares(part)[0]`. The rate comes from `NEXT_PUBLIC_SAMPLE_RATE_IDR_PER_USD` (01 §7); the server's own rate decides the real amount. Decimals come from the AUSD `decimals()` read (01 §1).

**S08-5. Continue.** Tapping Continue calls `POST /api/topup` with `{accountId, rupiah}` and goes to `/app/parent/send/<orderId>`. While waiting, the button shows "Creating payment…" and is off. On error the screen stays and shows the error `message` under the button with Try again (PRD 5 shared states).

**S08-6. Open orders on this device (C3, C13).** The client keeps `localStorage["amplop.openOrders"]` (01 §9): at most 5 entries `{accountId, orderId, rupiah, createdAt}` across all accounts, newest first, wrapped in try/catch. Each screen reads only the entries for its account. An entry is removed once its status is `sent`, `expired` or `failed`. On `/app/parent/send`:

- Without `?change=1`, if exactly one entry is `waiting` or `received`, redirect to it (C3: reopening returns to the same order).
- Otherwise show, above the form, one line per open entry: "Earlier payment still open · Rp16.500.000 · Pay before 23:59" with an "Open" link. A changed amount never cancels an earlier order (PRD 14 rule 3).

`useOpenOrders(accountId)` is exported for spec 14, which may show the same line on Parent home.

### C. Board 1.3 Waiting for payment (`/app/parent/send/[order]`)

**S08-7. Waiting state copy.**

| Element          | Copy and behaviour                                                                                                                                                                                                                                                                                                                              |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Title            | "Waiting for payment"                                                                                                                                                                                                                                                                                                                           |
| Amount           | `Rp16.500.000`, then "Allowance for Raka"                                                                                                                                                                                                                                                                                                       |
| Row              | "Virtual account number": the number in groups of 4 (`8808 0812 3456 7890`), and an icon button (aria-label "Copy number") that copies the digits without spaces and shows "Copied" for 2 s                                                                                                                                                     |
| Row              | "Bank": `BCA` (from `bank`, upper-cased)                                                                                                                                                                                                                                                                                                        |
| Row              | "Pay before": "Today at 23:59" if `expiresAt` is today in the device's time zone, else "Sun, 11 Oct at 14:05"                                                                                                                                                                                                                                   |
| Row              | "Status": "Not received yet · checked 14:02" (`lastCheckedAt`, device time)                                                                                                                                                                                                                                                                     |
| Info box         | "Transfer the exact amount from your banking app. Once it arrives, the money splits into Raka's envelopes. After 23:59 this number expires and you start again." (time as in "Pay before")                                                                                                                                                      |
| Test-mode box    | "Test mode: no real money moves. Tap Simulate payment to pretend the transfer was made." and the button "Simulate payment (test mode)". Shown only when spec 15's `DEMO` flag (`lib/client/demo.ts`, S15-1) is true; the button is 15's `SimulatePaymentButton` (S15-5). Without demo mode the box reads only "Test mode: no real money moves." |
| Secondary button | "Check payment status": polls now                                                                                                                                                                                                                                                                                                               |
| Text link        | "Change amount": to `/app/parent/send?change=1`, keeping this order open                                                                                                                                                                                                                                                                        |

Times here are real time, not the account clock: a bank's expiry does not move with Skip time.

**S08-8. Polling.** While the screen is visible and the status is `waiting` or `received`, the client calls `GET /api/topup/[orderId]` every 5 s (each call signed, 05). It stops when the tab is hidden and polls once at once when it becomes visible again. It stops for good at `sent`, `expired` or `failed`.

**S08-9. The other states on the same route.**

| Status                          | What the screen shows                                                                                                                     |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `received`                      | Status row: "Payment received, sending to Raka" with a small spinner. Simulate, Check payment status and Change amount are hidden.        |
| `sent`                          | Board 1.4 (S08-10).                                                                                                                       |
| `expired`                       | Instead of the card: "This number has expired" and the primary button "Start again" to `/app/parent/send` with the same amount prefilled. |
| `failed`                        | "The payment did not go through", then "Nothing was deposited.", and "Start again" as above.                                              |
| `waiting` but `now > expiresAt` | Shown as `expired` (the server confirms on its next Midtrans check).                                                                      |
| Offline                         | A line under Status: "No connection. We'll check again when you're back online." The last known state stays.                              |
| Poll error                      | "Couldn't check just now · checked 14:02". Polling continues.                                                                             |

**S08-10. Board 1.4 Allowance sent.** Shown when status is `sent`.

| Element     | Copy and source                                                                                                                                                                                                                   |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Title       | "Allowance sent" (result-screen style, approved colours)                                                                                                                                                                          |
| Sentence    | "Rp16.500.000 arrived as $1.000,00 and split into Raka's 5 envelopes." (`rupiah`, `dollars`)                                                                                                                                      |
| Rows 0 to 3 | Envelope name, "$100,00 every Monday" (`weeklyShares(parts[i])[0]`), total `$400,00` (`parts[i]`)                                                                                                                                 |
| Row 4       | "Emergency", "Locked", `$100,00` (`parts[4]`, whole and locked, R7). When the account's lock is off, "Went to Everyday · the lock is off" with the Emergency percentage of the amount, matching how spec 03 records it in `parts` |
| Detail box  | Heading "Detail"; "Digital dollar value" `1.000,00 AUSD`; "Confirmed in" `0,6 seconds` (`confirmMs / 1000`, one decimal, comma; row hidden when `confirmMs` is absent)                                                            |
| Link        | "View transaction proof": `NEXT_PUBLIC_EXPLORER_TX_URL + depositTx`, new tab, `rel="noopener noreferrer"`. Hidden if `depositTx` is absent.                                                                                       |
| Button      | "Back to home" to `/app/parent`                                                                                                                                                                                                   |

`parts` come from the `Deposited` event in the receipt of `depositTx`, read by the client from the chain (PRD 5: "C: deposit"). The screen does no split maths of its own beyond `weeklyShares`.

### D. Board 2.1 Allowance arrived (`/app/arrived/[deposit]`)

**S08-11. Route parameter.** `[deposit]` is the deposit's `paymentId` (`^0x[0-9a-f]{64}$`, lowercase), which is also the indexer's `Deposit` id; the query `?tx=` carries the deposit transaction hash when known (01 §9). The page gets the `Deposited` event, in this order: from the receipt of `tx`, the one `Deposited` log whose indexed `paymentId` matches (05 `findEvent` rules, client version in 06); else from the indexer (`DepositByIdQuery`, 16) and its `txHash`; else from `getLogs` for `Deposited` with that `paymentId` topic over the latest 100 blocks. It checks the event's `accountId` equals the signed-in student's account. Otherwise: "This allowance could not be found." with "See my envelopes".

**S08-12. Copy.**

| Element     | Copy and source                                                                                                             |
| ----------- | --------------------------------------------------------------------------------------------------------------------------- |
| Title       | "Allowance arrived"                                                                                                         |
| Amount      | `$1.000,00` (`amount`)                                                                                                      |
| Line        | "From Mama · Rp16.500.000 · Mon, 28 Sep"                                                                                    |
| Table head  | "Envelope" and "Available now"                                                                                              |
| Rows 0 to 3 | Name, "$300,00 more, weekly" (`parts[i] − weeklyShares(parts[i])[0]`), right column `$100,00` (`weeklyShares(parts[i])[0]`) |
| Row 4       | "Emergency", "$100,00 locked" (`parts[4]`), right column `$0,00`                                                            |
| Button      | "See my envelopes" to `/app`                                                                                                |

- "Mama" is the trusted person's name from spec 10's `useTrustedName(accountId)`; if it is not available, "From your trusted person".
- The rupiah figure is `round(amount × NEXT_PUBLIC_SAMPLE_RATE_IDR_PER_USD / 10^decimals)` to the nearest rupiah. Because the server rounds down by less than one unit, this gives back the exact rupiah of any order made at the current rate. The student never reads the `orders` table.
- The date is the event's `startDay` (an account-clock day number) formatted as "Mon, 28 Sep" (PRD 12: dates follow the account clock).

**S08-13. When Raka sees it.** `useArrivedDeposit(accountId)` (exported for spec 11's home) finds the newest `Deposit` for the account from the indexer (16). If the indexer does not answer, it reads `Deposited` logs filtered by the `accountId` topic over the latest 100 blocks. If the newest deposit's `paymentId` differs from the entry for this account in `localStorage["amplop.seenDeposit"]` (01 §9), it navigates once to `/app/arrived/<paymentId>?tx=<hash>` and stores the `paymentId`. Balances never depend on this (PRD 11).

### E. Creating an order: `POST /api/topup`

**S08-14. Contract.** Auth `signed:trusted`, action `topup.create`. Body (strict): `{ accountId: zAccountId, rupiah: string ^[1-9][0-9]{0,10}$ }`. The account resolver returns `body.accountId`. Response 200:

```json
{
  "orderId": "<32 hex>",
  "vaNumber": "812785002530231",
  "bank": "bca",
  "expiresAt": "<ISO>",
  "rupiah": "16500000",
  "dollars": "1000000000",
  "rate": 16500
}
```

`rupiah` and `dollars` are decimal strings (`dollars` in token units), `rate` an integer.

**S08-15. Checks, in order, after 05's pipeline.**

1. `100000 ≤ rupiah ≤ 50000000`, else 400 `amount_out_of_range`, "Send between Rp100.000 and Rp50.000.000."
2. At most 10 orders for this account created in the last 24 hours, else 429 `too_many_orders`, "You've started many payments today. Please use one of them or try again tomorrow."

**S08-16. Rate lock (PRD 10 step 2).** `rate = SAMPLE_RATE_IDR_PER_USD` from the server env, `decimals = AUSD decimals()` (read once per instance and cached, since it never changes), `dollars_units = rupiahToUnits(rupiah, decimals, rate)`. Both are stored on the order and never recomputed: the deposit always uses `dollars_units` (sample check: Rp16.500.000 gives 1 000 000 000 units).

**S08-17. Order row first.** Insert into `orders`: `order_id = randomHex16()`, `account_id`, `rupiah`, `dollars_units`, `rate_idr_per_usd`, `status = 'waiting'`, `payment_id = keccak256(toBytes("midtrans:" + orderId))` as `0x` hex (01 §5), `attempts = 0`, `last_checked_at = now()`. Then charge (S08-18). On success update `va_number`, `bank`, `expires_at`. On failure set `status = 'failed'`, `last_error = 'charge_failed:<http status or timeout>'` and return 502 `midtrans_unavailable`, "The bank service is not answering. Please try again."

**S08-18. Midtrans Core API charge (decision: fills a PRD gap).** PRD 10 needs our own waiting screen with the VA number and expiry; Snap does not return a VA number to the server. So the primary path is the Core API, same sandbox keys and same webhook:

- `POST {MIDTRANS_API_BASE}/v2/charge`, `MIDTRANS_API_BASE` = `https://api.sandbox.midtrans.com` (or `MIDTRANS_API_BASE_URL`, S08-36).
- Headers: `Accept: application/json`, `Content-Type: application/json`, `Authorization: Basic base64(MIDTRANS_SERVER_KEY + ":")`. Timeout 8 s.
- Body, exactly:

```json
{
  "payment_type": "bank_transfer",
  "transaction_details": { "order_id": "<orderId>", "gross_amount": 16500000 },
  "bank_transfer": { "bank": "bca" }
}
```

No customer details, names or item names are sent. Expiry is Midtrans' default for bank transfer, 24 hours.

- Success: HTTP 200 or 201 with `status_code` `"201"`, `transaction_status` `"pending"`, and `va_numbers[0].va_number`. Then `bank = va_numbers[0].bank`. `expires_at` = `expiry_time` if present, else `transaction_time` + 24 h, else `now()` + 24 h. Midtrans times (`YYYY-MM-DD HH:mm:ss`) are read as Western Indonesian Time, UTC+7.
- Anything else is a charge failure (S08-17).

**S08-19. Snap as an alternative.** If the builder prefers Midtrans' own page: create the order with `POST https://app.sandbox.midtrans.com/snap/v1/transactions` (same body without `payment_type` and `bank_transfer`), store the returned `redirect_url`, and on 1.3 replace the VA rows with a button "Open payment page" that goes to it (redirect, not the embedded `snap.js`, so the CSP does not change). `vaNumber`, `bank` and `expiresAt` are then empty until the first notification. The webhook, status fetch and deposit path below are unchanged. Record the switch under Decisions if taken.

### F. Reading an order: `GET /api/topup/[orderId]`

**S08-20. Contract.** Auth `signed:trusted`, action `topup.read`. Params `{ orderId: zHex32 }`. The account resolver loads the order; if it does not exist, or `order.account_id ≠ Account`, it throws 404 `not_found` (05 S05-12; the id is never confirmed). Response 200:

```json
{ "orderId", "status": "waiting|received|sent|expired|failed", "rupiah", "dollars",
  "vaNumber", "bank", "expiresAt", "depositTx"?, "lastCheckedAt", "confirmMs"? }
```

`confirmMs` is the time from broadcast to receipt (01 §9). `vaNumber`, `bank`, `expiresAt` are `null` when the charge failed.

**S08-21. Polls drive the work.** Before answering, the handler:

1. If `status = 'waiting'` and (`last_checked_at` is more than 10 s old, or `now() > expires_at`): fetch the Midtrans status (S08-27) and apply it (S08-28). A Midtrans failure here is logged and ignored: the answer shows the old state and the old `lastCheckedAt`.
2. If `status = 'received'` and `next_attempt_at ≤ now()`: run `runDeposit(orderId)` (S08-30) and wait for it.
3. Read the row again and answer.

### G. The order state machine

**S08-22. States and moves (PRD 10 states table).**

| From                           | To         | Only when                                                                                                                         |
| ------------------------------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------- |
| (new)                          | `waiting`  | order created                                                                                                                     |
| `waiting`                      | `failed`   | charge failed (S08-17), or Midtrans status `cancel`, `deny`, `failure`                                                            |
| `waiting`                      | `expired`  | Midtrans status `expire`                                                                                                          |
| `waiting`, `expired`, `failed` | `received` | a verified payment: Midtrans status `settlement` with matching amount (S08-26, S08-28), or Simulate (from `waiting` only, S08-29) |
| `received`                     | `sent`     | the `Deposited` event for this `paymentId` is in a finalized block                                                                |

No other move exists. `received` never goes back, and never to `expired` or `failed`: money that arrived is always deposited (PRD 14 rule 3, "nothing is lost"). `sent` is final. Every move is one guarded statement, for example:

```sql
UPDATE orders SET status = 'received', updated_at = now(), last_checked_at = now(), next_attempt_at = now()
WHERE order_id = $1 AND status IN ('waiting','expired','failed') RETURNING *
```

Zero rows means another request already moved it; the caller reads the row and carries on from its current state.

**S08-23. What the parent sees per state** is S08-9 and matches PRD 10's table: Waiting "Not received yet" and the last check time; Received "Payment received, sending to Raka"; Sent Allowance sent; Expired "This number has expired" with Start again; Failed "The payment did not go through" with Start again.

### H. Midtrans notifications: `POST /api/midtrans/webhook`

**S08-24. Schema.** Auth `midtrans`. The body is parsed with a strict zod schema (PRD 15 "Inputs"). Required strings: `order_id`, `status_code`, `gross_amount`, `signature_key`, `transaction_status`. Optional strings: `transaction_id`, `transaction_time`, `settlement_time`, `expiry_time`, `status_message`, `payment_type`, `merchant_id`, `fraud_status`, `currency`, `approval_code`, `permata_va_number`, `bill_key`, `biller_code`, `channel_response_code`, `channel_response_message`, `reference_id`, `transaction_type`, `issuer`, `acquirer`. Optional arrays: `va_numbers: [{ bank, va_number }]` and `payment_amounts: [{ paid_at, amount }]`, each item strict. An unknown field gives 400 `bad_input`, and the log lists the unknown **key names** only. Midtrans then retries, and the poll and cron paths (S08-21, S08-34) still find the payment, so a new Midtrans field can delay a deposit but never lose it.

**S08-25. Signature (PRD 10 step 5, PRD 15 threat row).** `expected = sha512_hex(order_id + status_code + gross_amount + MIDTRANS_SERVER_KEY)`, using the three strings exactly as received (no reformatting of `"16500000.00"`). Compare `expected` with `signature_key.toLowerCase()` using `crypto.timingSafeEqual` on equal-length buffers (different lengths fail without comparing). Failure: 401 `bad_signature`, "Not allowed.", no database write, no Midtrans call, log `webhook_bad_signature` with `orderId` only.

**S08-26. After a good signature, in order.**

1. `order_id` must match `zHex32` and exist in `orders`. Otherwise answer 200 `{ok: true}` and log `webhook_unknown_order` (Midtrans dashboard test notifications land here; a 200 stops retries).
2. Notification `gross_amount` must equal the order's rupiah: parse with `^([0-9]+)(\.00)?$` to a `bigint` and compare. Mismatch: 400 `amount_mismatch`, "The payment amount does not match the order.", log at `error`, alert `amount_mismatch`, order unchanged.
3. Fetch the status from Midtrans (S08-27). If it fails: 502 `midtrans_unavailable` (Midtrans retries; polls also cover it).
4. The status response's `order_id` must equal the order's id and its `gross_amount` must equal the order's rupiah (same parse). Mismatch: 400 `amount_mismatch` as in step 2.
5. Apply the **status response's** `transaction_status` (S08-28), never the notification's own.
6. Answer 200 `{ok: true}`. If the order moved to `received`, start `runDeposit(orderId, { force: true })` with `after()`, so Midtrans gets its answer fast. A failed deposit attempt never changes the webhook's answer; the retry is ours (S08-31).

**S08-27. Status fetch.** `GET {MIDTRANS_API_BASE}/v2/{order_id}/status`, Basic auth as in S08-18, timeout 8 s. The response is an upstream answer, not a request to us: it is parsed with a zod schema that requires `order_id`, `transaction_status`, `gross_amount`, `status_code` and allows other fields. Every fetch sets `last_checked_at = now()`.

**S08-28. Status mapping.**

| Midtrans `transaction_status`                                                              | Effect                                                                                                                                                               |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pending`                                                                                  | none (stays `waiting`)                                                                                                                                               |
| `settlement`                                                                               | verified payment: if `payment_type` is `bank_transfer`, move to `received` (S08-22) and deposit. Any other `payment_type`: log `unexpected_payment_type`, no change. |
| `capture`                                                                                  | log `capture_ignored`, no change (card payments are not offered)                                                                                                     |
| `expire`                                                                                   | `waiting` → `expired`                                                                                                                                                |
| `cancel`, `deny`, `failure`                                                                | `waiting` → `failed`                                                                                                                                                 |
| `refund`, `partial_refund`, `chargeback`, `partial_chargeback`, `authorize`, anything else | log, no change                                                                                                                                                       |

Deposit happens only on `settlement` (PRD 15).

### I. Simulate payment: `POST /api/topup/[orderId]/simulate`

**S08-29. Contract.** Auth `demo` (signed:trusted), action `topup.simulate`, body `{}` (strict, empty), params `{ orderId: zHex32 }`. With `DEMO_MODE` off: 404 before anything else (05 S05-31). Account resolver as in S08-20. Behaviour:

- `waiting`: move to `received` (guarded statement, S08-22), then `await runDeposit(orderId, { force: true })`, then answer with the GET shape (S08-20). Usually the answer already says `sent`.
- `received` or `sent`: no change, answer with the GET shape (C6: a second tap makes no second deposit).
- `expired` or `failed`: 409 `order_closed`, "This payment can no longer be used. Start again."

Simulate never calls Midtrans. A later real Midtrans `expire` notification for that VA finds the order already `received` or `sent` and changes nothing (S08-22).

### J. The deposit path (shared by webhook, Simulate, polls and cron)

**S08-30. `runDeposit(orderId, { force = false })`** in `lib/server/topup/deposit.ts`:

1. Open a transaction and take `pg_try_advisory_xact_lock(hashtextextended('order:' || orderId, 0))`. Not taken: return `busy` (another worker has it).
2. Load the order. If `status ≠ 'received'`, return.
3. If not `force` and `next_attempt_at > now()`, return `not_due`.
4. **Resolve earlier attempts first.** For each hash in `sent_hashes` (`deposit_tx` is the newest), get its receipt. A successful receipt containing `Deposited` with this `paymentId` (05 `findEvent`): wait for finality (05 S05-41 step 11), set `status = 'sent'`, `deposit_tx` = that hash, `last_error = null`, and return. If the newest hash has no receipt and was broadcast less than 60 s ago: return `in_flight` (never send a second transaction while one may still land).
5. Read `paymentUsed(paymentId)`. If true and step 4 found nothing: alert `deposit_unmatched`, set `status = 'sent'` with `deposit_tx` unchanged, log `error`, return. (Only the treasury can deposit and every hash is stored before broadcast, so this should never happen.)
6. Treasury checks (S08-32). If AUSD is short: `last_error = 'treasury_low'`, schedule the next attempt (S08-31), start a refill with `after()` (S08-33), return.
7. `sendContractTx("treasury", deposit(accountId, dollars_units, paymentId), { beforeBroadcast: hash => UPDATE orders SET deposit_tx = hash, sent_hashes = array_append(sent_hashes, hash), updated_at = now() }, { finalized: true })`.
8. Outcome:

| Outcome                                                           | Row update                                                                                                   |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Receipt success with `Deposited` for this `paymentId` (finalized) | `status = 'sent'`, `deposit_tx = hash`, `confirm_ms`, `attempts + 1`, `last_error = null`                    |
| `receipt: null` (timeout)                                         | `attempts + 1`, `last_error = 'unconfirmed'`, `next_attempt_at = now() + 5 s` (step 4 resolves it next time) |
| `ChainRevert` with the contract's "payment already used" error    | go to step 4 with the stored hashes                                                                          |
| `ChainRevert` other                                               | `attempts + 1`, `last_error = 'revert:<errorName>'`, backoff                                                 |
| `ChainUnavailable`, `chain_busy`                                  | `attempts + 1`, `last_error = '<code>'`, backoff                                                             |

9. After a success, start the treasury floor check with `after()` (S08-33).

The contract also refuses a repeated `paymentId` (PRD 10 step 6), so even a bug here cannot deposit twice.

**S08-31. Retries and backoff (PRD 10 "retries the deposit until it succeeds").** After a failed attempt `n` (1-based): `next_attempt_at = now() + min(5 s × 2^(n−1), 10 min)`, so 5 s, 10 s, 20 s, 40 s, 80 s, 160 s, 320 s, then every 10 min. There is no last attempt: an order stays `received` until it is `sent`. At `attempts = 5` send alert `deposit_stuck` (05 dedupes it hourly). Attempts are started by, in order of speed: the webhook's `after()` or Simulate (at once), each status poll (S08-21), and the daily cron (S08-34). Correctness never depends on cron (05 S05-48).

**S08-32. Treasury balance and allowance.** Before sending: read `balanceOf(treasury)` and `allowance(treasury, contract)` on AUSD. If `balance < dollars_units`: short (S08-30 step 6). If `allowance < dollars_units`: send `approve(contract, maxUint256)` from the treasury through `sendContractTx` first, then continue. (Spec 04's deploy script may also approve once; this makes it self-healing.)

**S08-33. Treasury floor and faucet (PRD 10).** `TREASURY_FLOOR = 20000 × 10^decimals` units. `ensureTreasuryFloor()` runs after each successful deposit, when a deposit finds the treasury short, and in the cron. If `balanceOf(treasury) < TREASURY_FLOOR`:

1. Take the rate-limit bucket `faucet` with limit 1 per minute (05 S05-16). If it is used up, stop: the faucet allows one request a minute.
2. Call `requestFaucet()` in `lib/server/topup/faucet.ts`. Each call asks once for 10 000 AUSD; reaching the floor can take several minutes of calls.
3. Alert `treasury_low` with the balance in whole dollars.

**Day-one check:** confirm how the Agora faucet is called (PRD 17: `requestFunds`, 10 000 per request, once a minute, from other teams' notes) and record it here. If it is a contract function, `requestFaucet` sends it from the treasury key with `sendContractTx`. If it needs a browser or captcha, `requestFaucet` returns `{ ok: false, reason: "manual" }` and the alert asks for a refill by hand. Either way C9 still completes, because deposits retry until the balance is back.

**Day-one result (12 Oct 2026):** the Agora testnet faucet (`0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C`, a proxy) is a contract. `requestFunds(address recipient)` sends 10 000 AUSD to `recipient`, at most once a minute; a call from the treasury simulates cleanly. `requestFaucet` sends it from the treasury key when `AUSD_FAUCET_ADDRESS` (01 §7) is set; unset, it returns `manual`.

**S08-34. Cron backstop: `GET /api/cron/deposits`.** Auth `cron`. In one run, at most 50 items, oldest first, stopping new work after 50 s:

1. Every `received` order: `runDeposit(orderId, { force: true })`.
2. Every `waiting` order whose `last_checked_at` is more than 10 minutes old: fetch and apply the Midtrans status (catches missed notifications).
3. `ensureTreasuryFloor()`.

Response `{ "retried": <number of runDeposit calls that sent or resolved a transaction> }`.

### K. Configuration, privacy and limits

**S08-35. Fixed values (PRD 10).** Minimum Rp100.000, maximum Rp50.000.000 per allowance; sample rate $1 = Rp16.500 from `SAMPLE_RATE_IDR_PER_USD`, labelled "Sample rate" on 1.2; fee Rp0, shown as "Fee Rp0". `MIDTRANS_IS_PRODUCTION` must be `false` (05 env loader refuses anything else).

**S08-36. Test base URL.** `MIDTRANS_API_BASE_URL` (01 §7) replaces `https://api.sandbox.midtrans.com` for Core API calls. It is accepted only if its host is `localhost`, `127.0.0.1`, or ends with `.midtrans.com`; anything else stops the server at start. Spec 19's Midtrans stub implements `POST /v2/charge`, `GET /v2/{id}/status`, and a test-only control to set an order's status; the end-to-end test signs its own notifications with the sandbox server key (PRD 14 "Bank").

**S08-37. Privacy and logs.** Midtrans receives only the order id and amount. Logs carry `orderId`, `accountId`, `status`, `attempts`, `txHash`, error codes; never `va_number`, `signature_key`, the server key or any name (05 S05-46 redacts them anyway).

**S08-38. Contract-driven cases.** These follow from spec 03 and need nothing extra here beyond showing the contract's results; their expected results are listed so this spec's end-to-end tests cover them:

| Case                                     | Why it works                                                                                                                                         |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| C9 treasury short                        | S08-30 step 6, S08-31, S08-33; `paymentId` makes the late deposit happen once                                                                        |
| C12 uneven amount                        | `rupiahToUnits` rounds down once; the contract's split sends leftover units to Everyday (R4)                                                         |
| C13 old order paid after a change        | S08-6 and S08-22: a changed amount never cancels an order; any verified payment is deposited                                                         |
| C14 second allowance in week 2           | each allowance keeps its own four shares (R8); allowances in different weeks are separate schedule records, same-week ones merge exactly (03 S03-10) |
| C15 deposit while a new split is pending | the contract uses the split in force at arrival (R21); 1.2 shows that split (S08-4)                                                                  |
| C16 deposit after lock-off               | the contract sends the Emergency share to Everyday (R20); 1.2 and 1.4 show it (S08-2, S08-10)                                                        |

## Interfaces used

| Kind              | Items                                                                                                                                                                                                                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Endpoints (owned) | `POST /api/topup`, `GET /api/topup/[orderId]`, `POST /api/topup/[orderId]/simulate`, `POST /api/midtrans/webhook`, `GET /api/cron/deposits`                                                                                                                                                       |
| Endpoints (used)  | `GET /api/auth/nonce` (05), `GET /api/profile/[accountId]` (07)                                                                                                                                                                                                                                   |
| Tables            | `orders` (including `next_attempt_at`, `sent_hashes`, `confirm_ms`), `rate_limits` (bucket `faucet`)                                                                                                                                                                                              |
| Contract writes   | `deposit(accountId, amount, paymentId)` (treasury)                                                                                                                                                                                                                                                |
| Contract reads    | `accountInfo`, `clock`, `paymentUsed`, `envelopes` (via home); AUSD `decimals`, `balanceOf`, `allowance`, `approve`                                                                                                                                                                               |
| Events            | `Deposited(accountId, paymentId, amount, parts, startDay)`                                                                                                                                                                                                                                        |
| Env               | `MIDTRANS_SERVER_KEY`, `MIDTRANS_IS_PRODUCTION`, `SAMPLE_RATE_IDR_PER_USD`, `TREASURY_PRIVATE_KEY`, `NEXT_PUBLIC_AUSD_ADDRESS`, `NEXT_PUBLIC_CONTRACT_ADDRESS`, `NEXT_PUBLIC_EXPLORER_TX_URL`, `CRON_SECRET`, `ALERT_WEBHOOK_URL`, `MIDTRANS_API_BASE_URL`, `NEXT_PUBLIC_SAMPLE_RATE_IDR_PER_USD` |
| Platform (05)     | `defineRoute`, `sendContractTx`, `findEvent`, `rateLimit`, `sendAlert`, `log`, `randomHex16`, `isDemo`, `verifyCron`                                                                                                                                                                              |
| Other specs       | 06 formatters and client contract reads; 10 `useTrustedName`; 15 `DEMO` and `SimulatePaymentButton`; 16 `Deposit` entity                                                                                                                                                                          |

## Screens

| Board                   | Route                      | Requirements     |
| ----------------------- | -------------------------- | ---------------- |
| 1.2 Send allowance      | `/app/parent/send`         | S08-1 to S08-6   |
| 1.3 Waiting for payment | `/app/parent/send/[order]` | S08-7 to S08-9   |
| 1.4 Allowance sent      | same route, `sent`         | S08-10           |
| 2.1 Allowance arrived   | `/app/arrived/[deposit]`   | S08-11 to S08-13 |

Design tokens, type sizes and components come from the design SPEC and spec 06. Where a mock-up says "Ibu", the screen says "Mama" (the trusted person's own name, S08-12).

## Errors and edge cases

| Status | Code                   | Message                                                                           | When                                                     |
| ------ | ---------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 400    | `amount_out_of_range`  | Send between Rp100.000 and Rp50.000.000.                                          | S08-15                                                   |
| 400    | `amount_mismatch`      | The payment amount does not match the order.                                      | S08-26                                                   |
| 401    | `bad_signature`        | Not allowed.                                                                      | S08-25                                                   |
| 403    | `not_trusted`          | Only the trusted person can do this.                                              | S08-1 (05)                                               |
| 404    | `not_found`            | Not found.                                                                        | unknown or other account's order; simulate with demo off |
| 409    | `order_closed`         | This payment can no longer be used. Start again.                                  | S08-29                                                   |
| 429    | `too_many_orders`      | You've started many payments today. Please use one of them or try again tomorrow. | S08-15                                                   |
| 502    | `midtrans_unavailable` | The bank service is not answering. Please try again.                              | S08-17, S08-26 step 3                                    |

Edge cases:

- **Webhook before the charge response is stored.** The order row exists before the charge (S08-17), so the notification finds it.
- **Settlement for an order already `expired` locally.** Deposited anyway (S08-22).
- **Midtrans down all day.** Simulate still works (PRD 17 risk); polls show the last check time; cron catches up.
- **Parent closes the app mid-deposit.** Nothing depends on the screen: `after()`, the next poll from any device, or the cron finish it.
- **Account's trusted person replaced after payment.** The deposit still goes to the order's account; only reading the order needs the current trusted person.
- **Treasury and card service share a wallet in the first days.** The per-key lock (05) serialises them; nothing else changes.

## Security

| PRD 15 item                                                                                                                                                                                      | Requirement                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Threat "Fake or replay a payment notification": SHA-512 signature, constant-time compare, status from the Midtrans API, deposit only on `settlement`, only on matching amount, once per order id | S08-25 to S08-28, S08-22, S08-30 (lock, guarded moves, `paymentId` unique in `orders` and on the contract) |
| Threat "Use test-only tools on a real deployment": Simulate 404 when `DEMO_MODE` is off                                                                                                          | S08-29 (05 S05-31)                                                                                         |
| Threat "Read another parent's order by guessing its id": random ids, scoped reads                                                                                                                | `randomHex16` order ids; S08-20 returns 404 for any order not in the signer's account                      |
| Threat "Flood the server": per-IP and per-account limits                                                                                                                                         | 05 limits plus S08-15's 10 orders a day                                                                    |
| Security test "correct signature but a different amount is refused"                                                                                                                              | T08-4                                                                                                      |
| Security test "a `pending` status deposits nothing"                                                                                                                                              | T08-5                                                                                                      |
| Security test "with `DEMO_MODE` off, Simulate payment returns 404"                                                                                                                               | T08-9                                                                                                      |

## Tests

### Unit and server (Vitest, `FakeChain`, Midtrans stubbed at the HTTP layer)

| Id     | Test                                                                                                                                                                                                                                                                         | Requirements            | PRD                  |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | -------------------- |
| T08-1  | **Wrong signature refused:** notification with one changed character in `signature_key`: 401 `bad_signature`, no row change, no status fetch, no send                                                                                                                        | S08-25                  | 14 server test, C4   |
| T08-2  | **Three deliveries, one deposit:** the same valid settlement notification sent three times in a row, then three at once: exactly one `deposit` send, status `sent`                                                                                                           | S08-22, S08-26, S08-30  | 14 server test, C5   |
| T08-3  | **Chain failure retried, one deposit:** `FakeChain` fails the first two sends with `ChainUnavailable`; status stays `received` with `attempts = 2`; the next due poll sends again and reaches `sent`; exactly one successful deposit                                         | S08-30, S08-31          | 14 server test       |
| T08-4  | **Correct signature, different amount, refused:** a notification correctly signed over `gross_amount = "16500001.00"` for a Rp16.500.000 order: 400 `amount_mismatch`, no deposit. Also: notification amount matches but the status API returns another amount: refused      | S08-26                  | 15 security test     |
| T08-5  | **Pending deposits nothing:** signed `pending` notification, status API `pending`: 200, status `waiting`, no send                                                                                                                                                            | S08-28                  | 15 security test, C7 |
| T08-6  | Mapping: `expire` gives `expired`; `cancel`, `deny`, `failure` give `failed`; `capture` and `refund` change nothing; `settlement` with `payment_type` other than `bank_transfer` changes nothing                                                                             | S08-28                  | C7, C8               |
| T08-7  | Settlement on an `expired` order moves it to `received` and deposits                                                                                                                                                                                                         | S08-22                  | rule 3               |
| T08-8  | Unknown order id with a good signature: 200 and no change; unknown field in the body: 400 and the log holds the key name, not the value                                                                                                                                      | S08-24, S08-26          | 15 Inputs            |
| T08-9  | Simulate: `DEMO_MODE` off gives 404 with no database query; on, two concurrent calls give one deposit; on an `expired` order gives 409 `order_closed`                                                                                                                        | S08-29                  | 15 security test, C6 |
| T08-10 | Create: Rp99.999 and Rp50.000.001 give 400; Rp100.000 and Rp50.000.000 pass; the student's signature and a stranger's give 403 with no row; the charge body equals S08-18 exactly; a charge timeout gives 502 and a `failed` row; the 11th order in 24 h gives 429           | S08-14 to S08-18, S08-1 | 10, C10, C17         |
| T08-11 | Rate lock: an order created at 16 500 keeps its `dollars_units` after the env rate changes; the deposit sends the stored value                                                                                                                                               | S08-16                  | 10                   |
| T08-12 | GET: another account's order gives 404; a `waiting` order checked 11 s ago triggers one status fetch, one checked 5 s ago does not; a Midtrans failure leaves `lastCheckedAt` unchanged and answers 200                                                                      | S08-20, S08-21          | C3                   |
| T08-13 | `runDeposit`: lock held elsewhere gives `busy` and no send; a stored hash with a successful receipt marks `sent` without a new send; a "payment already used" revert resolves from `sent_hashes`; a hash broadcast 30 s ago with no receipt is not re-sent; after 60 s it is | S08-30                  | 14                   |
| T08-14 | Backoff values for attempts 1 to 9 are 5, 10, 20, 40, 80, 160, 320, 600, 600 s; `deposit_stuck` alert at attempt 5                                                                                                                                                           | S08-31                  | 10                   |
| T08-15 | Treasury short: no send, `last_error = 'treasury_low'`, one faucet call; a second refill within the minute makes no faucet call; after the balance is restored the next poll deposits once                                                                                   | S08-30, S08-32, S08-33  | C9                   |
| T08-16 | Allowance short: `approve` is sent before `deposit`                                                                                                                                                                                                                          | S08-32                  | 10                   |
| T08-17 | Cron: no bearer gives 401; with bearer it retries `received` orders even when not due, re-checks stale `waiting` orders, handles at most 50, returns `{retried}`                                                                                                             | S08-34                  | 05 S05-48            |
| T08-18 | Money: `rupiahToUnits` gives 1 000 000 000 for Rp16.500.000, 74 822 242 for Rp1.234.567, 6 060 606 for Rp100.000 (6 decimals); `splitParts` on 74 822 242 with 40/15/15/20/10 sums to 74 822 242 and gives Everyday the 2 spare units; the shared vector file passes         | S08-4                   | 15 Money, C12        |
| T08-19 | Logs from the whole suite contain no VA number, no `signature_key`, no server key                                                                                                                                                                                            | S08-37                  | 15 Logs              |

### Chain suite (Vitest against Anvil, 05)

| Id     | Test                                                                                                                                                                                                                  | PRD       |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| T08-20 | Simulate path on the real contract: one `Deposited` with `paymentId = keccak256("midtrans:" + orderId)`, `amount = dollars_units`, parts summing to the amount; the order is `sent` only after the block is finalized | C1, C12   |
| T08-21 | Two deposits for one order id (forced by calling the send twice): the second reverts on the contract, the order stays `sent` with the first hash                                                                      | 10 step 6 |

### End-to-end cases (PRD 14, owned here)

Run by spec 19's harness: Playwright, Raka and Mama profiles, Anvil with the real contract in demo mode, Midtrans stub (S08-36). "Every money case" checks at the end (PRD 14) apply to each.

| ID  | Kind   | Case                                                                 | Expected                                                                                                                              | Tier | Requirements                    |
| --- | ------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------------------------------- |
| C1  | Normal | Mama sends Rp16.500.000 with Simulate payment                        | $1.000,00 arrives split 400 / 150 / 150 / 200 / 100; first shares 100 / 37,50 / 37,50 / 50 are available; Raka sees Allowance arrived | 1    | S08-2 to S08-13, S08-29, S08-30 |
| C2  | Normal | Same amount through a signed sandbox webhook                         | Same result as C1                                                                                                                     | 1    | S08-24 to S08-28, S08-30        |
| C3  | Normal | Mama closes the app while waiting, then reopens                      | Returns to the same order in its current state                                                                                        | 2    | S08-6, S08-8, S08-21            |
| C4  | Edge   | Webhook with a wrong signature                                       | Refused; no deposit                                                                                                                   | 1    | S08-25                          |
| C5  | Edge   | The same webhook delivered three times                               | One deposit                                                                                                                           | 1    | S08-22, S08-30                  |
| C6  | Edge   | Simulate payment tapped twice quickly                                | One deposit                                                                                                                           | 1    | S08-29, S08-30                  |
| C7  | Edge   | Webhook says pending, expired or cancelled                           | Status updates; no deposit                                                                                                            | 2    | S08-28                          |
| C8  | Edge   | Order left past its expiry                                           | "This number has expired" with Start again                                                                                            | 2    | S08-9, S08-28                   |
| C9  | Edge   | Treasury has too little AUSD when the payment lands                  | "Payment received, sending"; after a refill it completes once                                                                         | 2    | S08-30 to S08-33                |
| C10 | Edge   | Amount below Rp100.000 or above Rp50.000.000                         | Continue is off, with the limit shown                                                                                                 | 2    | S08-3, S08-15                   |
| C11 | Edge   | Letters or an empty amount                                           | Continue is off                                                                                                                       | 3    | S08-3                           |
| C12 | Edge   | Rp1.234.567, which does not divide evenly                            | The five parts add up to the dollar total exactly; spare cents are in Everyday                                                        | 1    | S08-4, S08-16, S08-38           |
| C13 | Edge   | Change amount after an order exists, then the old order is paid      | The old payment is still deposited and shown; nothing is lost                                                                         | 3    | S08-6, S08-22                   |
| C14 | Normal | A second allowance in week 2 of the first                            | Each envelope shows the sum; both schedules keep their own Mondays                                                                    | 1    | S08-38 (03)                     |
| C15 | Edge   | A deposit lands while a new split is still waiting                   | The old split is used                                                                                                                 | 2    | S08-4, S08-38 (03)              |
| C16 | Edge   | A deposit lands after the Emergency lock is off                      | The Emergency share goes to Everyday                                                                                                  | 2    | S08-2, S08-10, S08-38 (03)      |
| C17 | Edge   | Raka opens a parent address; an unlinked person opens Send allowance | Both are sent away; nothing is created                                                                                                | 2    | S08-1                           |

How the harness does the less obvious ones: C2 creates the order through the UI (the stub answers the charge), sets the stub status to `settlement`, then posts a notification signed with the sandbox key. C7 and C8 set the stub status to `pending`, `expire` or `cancel` and post the matching notification. C9 moves the stand-in AUSD out of the treasury before Simulate, checks the "Payment received, sending to Raka" line, mints it back, and checks one `Deposited` event. C13 creates order A, taps Change amount, creates order B, then simulates A. C15 saves a new split, simulates before Skip 48 hours. C16 runs lock-off and Skip 48 hours first.

The two-phone script (PRD 14) runs C1 once with Simulate payment and once through the real Midtrans sandbox simulator (pay the BCA VA number at the sandbox simulator page).

## Acceptance checklist

- [ ] Boards 1.2, 1.3, 1.4 and 2.1 match the copy tables, with the student's and trusted person's real names.
- [ ] A sandbox order shows a real BCA VA number and expiry; paying it in the Midtrans sandbox simulator ends in Allowance sent with a working proof link.
- [ ] Simulate payment does the same in a demo deployment and returns 404 with `DEMO_MODE` off.
- [ ] The Midtrans notification URL in the sandbox dashboard is `https://<host>/api/midtrans/webhook`.
- [ ] T08-1 to T08-21 pass; Tier 1 cases C1, C2, C4, C5, C6, C12, C14 pass on Anvil and once on Monad testnet.
- [ ] With Midtrans unreachable, Simulate still works and polls still answer.
- [ ] The treasury holds at least 20 000 AUSD, and the faucet day-one result is written in S08-33.
- [ ] Logs from a C1 run contain no VA number, names or keys.

## Skills to use

From MONSKILLS pinned to `3f8efd2`, starting with `monskill`. PRD and this spec win on conflict.

- `concepts`: finality (`finalized` block tag before marking an order `sent`), asynchronous execution and receipts.
- `gas`: deposit and approve go through 05's `sendContractTx` (limit by the 01 §9 rule).
- `tooling-and-infra`: RPC fallback and `eth_getLogs` range limits (S08-13's 100-block fallback read).
- `addresses`: check the AUSD address against Agora's own docs before setting `NEXT_PUBLIC_AUSD_ADDRESS` (PRD 6).

## Decisions made here

1. **Core API bank-transfer charge, not Snap (fills a PRD gap).** PRD 2 and 10 say "Midtrans Snap", but PRD 8 and 10 also need the VA number and expiry on our own waiting screen. Snap shows Midtrans' page and does not return a VA number to our server; the Core API `POST /v2/charge` with `payment_type: bank_transfer`, bank `bca`, does. Same sandbox keys, same webhook, same signature. Snap stays documented as the alternative (S08-19).
2. **Bank BCA, default 24-hour expiry,** no custom expiry and no customer details sent.
3. **Verified settlement always deposits**, whatever the local status except `sent` (`expired` and `failed` can move to `received`). This makes PRD 14 rule 3 ("nothing is lost") hold even for a late notification.
4. **Strict webhook schema with every documented bank-transfer field.** An unknown field is refused as PRD 15 requires, and the poll and cron paths make sure the payment is still found.
5. **Unknown order with a good signature answers 200,** so Midtrans stops retrying test notifications.
6. **`sent` only after finality.** Deposits are value settlement, so the order waits for the `finalized` block tag (about one more second on Monad); card decisions (09) answer on the first receipt.
7. **Backoff 5 s doubling to 10 minutes, never giving up;** alert at the fifth attempt.
8. **At most 10 orders per account per 24 hours** to keep Midtrans sandbox use bounded.
9. **Polling every 5 s, Midtrans re-check at most every 10 s per order.**
10. **Open orders remembered on the device** (`localStorage` `amplop.openOrders`, 5 entries) for C3 and C13, since 01 has no "list my orders" endpoint.
11. **2.1's route parameter is the deposit's `paymentId`** (with `?tx=`), and its rupiah figure is recomputed from the amount at the sample rate, so the student never needs the parent's order.
12. **Faucet once a minute through a `faucet` rate-limit bucket;** a faucet that cannot be called by a server falls back to an alert and a manual refill.
13. **Prefilled amount Rp16.500.000** on 1.2 when this device has no earlier amount, to keep the judge's path short.
14. **The newest closed entry stays in `amplop.openOrders`** (S08-6 says closed entries are removed). It is the prefill for "the last amount this device sent" and is never shown as open; every other closed entry is removed. "Start again" passes the amount as `?amount=`.
15. **`SimulatePaymentButton` is built with this spec** in `components/demo/DemoControls.tsx`, ahead of the rest of 15, since board 1.3 needs it. Parent home gets a plain "Send allowance" button until 14 builds board 1.1.

## Additions to 01 (status)

1. `orders` columns `next_attempt_at`, `sent_hashes`, `confirm_ms`: Merged into 01 (section 5).
2. `confirmMs` in the top-up responses: Merged into 01 (section 9).
3. Env `MIDTRANS_API_BASE_URL`: Merged into 01 (section 7).
4. Error codes: Not merged; per 01 section 9 each spec lists its own codes (`amount_out_of_range`, `amount_mismatch`, `bad_signature`, `order_closed`, `too_many_orders`, `midtrans_unavailable`). `bad_signature` here means a bad Midtrans signature only; signed-request failures use 05's `auth_*` codes.
5. Rate-limit bucket `faucet`: Not merged; server-internal.
6. `/app/arrived/[deposit]` as the transaction hash: Not merged. 01 section 9 settled it as the `paymentId` with `?tx=`, and S08-11 follows that.
7. `NEXT_PUBLIC_SAMPLE_RATE_IDR_PER_USD` and decimal-string JSON: Merged into 01 (sections 7 and 9).
8. `localStorage` keys `amplop.openOrders` and `amplop.seenDeposit`: Merged into 01 (section 9).
9. Env `AUSD_FAUCET_ADDRESS` (server, optional) for S08-33: Merged into 01 (section 7).
