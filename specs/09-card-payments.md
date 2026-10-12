# 09. Card payments

Status: Ready · PRD sources: 2 (card), 3 (card decision, card and shop), 4 (R3, R9 to R15, R27), 5 (boards 2.4 to 2.8), 6 ("the Approved screen can wait for the chain"), 7 (`authorize`, `collect`, `releaseHold`, `refund`), 8 (card endpoints, authorisation message, shop codes), 12 (Collect now), 14 (cases E1 to E22, rule 4), 15 (card threat row, security tests) · Depends on: 03, 05, 06

## Goal

Raka pays at a simulated shop with a demo card. The server turns the shop's price into dollars at the sample rate, asks the contract to decide, and waits for the chain's answer, which arrives in about a second. The contract picks the envelope, holds the money, or records a decline. The shop later collects the hold (a timer, or Collect now in demo mode). Shop names stay on the server and are shown only to Raka.

## In scope

- Boards 2.4 Card, 2.5 Simulated checkout, 2.6 Approved, 2.7 Declined blocked, 2.8 Declined empty.
- `POST /api/card/issue`, `POST /api/card/authorize`, `POST /api/card/collect`, `GET /api/cron/collect`.
- The issuer-shaped authorisation message, the demo shop list, currency conversion, idempotency, `purchaseId`.
- Holds: collect, the collect policy, releasing expired holds, refunds as a server function.
- Cases E1 to E22; the PRD 15 card security tests.

## Out of scope

- The envelope decision itself (R9, R10, R11, R12) and hold accounting (03).
- The Collect now button's visibility and the demo banner (15). This spec owns the endpoint the button calls.
- Activity, purchase detail and moving a purchase (11), and `GET /api/purchases` (11).
- The parent's alerts for blocked purchases (14, 16).
- A real issuer and its HMAC (PRD 18).

## Requirements

### A. The card

**S09-1. `POST /api/card/issue`.** Auth `signed:owner`, action `card.issue`. Body (strict) `{ accountId: zAccountId }`; the account resolver returns it. If `cards` has a row for the account, return it. Otherwise insert `card_token = randomHex16()` and `last4` = four random digits (`crypto.randomInt(0, 10000)`, zero-padded), with `ON CONFLICT (account_id) DO NOTHING`, then select the row (two concurrent calls give one card). Response 200 `{ "cardToken": "<32 hex>", "last4": "4821" }`. After answering, run `sweepHolds({ accountId })` with `after()` (S09-27).

**S09-2. Card token rules (PRD 15 card threat row).** The card token is a random 128-bit value from `randomHex16()`, never the address, the account id, or anything derived from them. `last4` is random and is not part of the token. The token alone is not enough to pay: every authorisation also needs the owner's signature (S09-9). The client keeps the token in memory only (React state), never in `localStorage`, and gets it again from `card.issue` (idempotent) when the Card screen opens. After a recovery the new owner gets the same card; the old passkey can no longer use it (S09-9, E22).

### B. Board 2.4 Card (`/app/card`)

**S09-3. Demo shop list.** One constant, `DEMO_SHOPS` in `apps/web/src/lib/client/card/shops.ts`:

| Slug          | Label on Card screen | Merchant name  | City      | MCC  | Shop type label  | Currency | Default amount (minor units) | On Card screen                           |
| ------------- | -------------------- | -------------- | --------- | ---- | ---------------- | -------- | ---------------------------- | ---------------------------------------- |
| `supermarket` | Supermarket          | Supermarket    | Amsterdam | 5411 | Groceries        | EUR      | 1250 (€12,50)                | yes                                      |
| `tram`        | Tram and train       | Tram and train | Amsterdam | 4111 | Public transport | EUR      | 340 (€3,40)                  | yes                                      |
| `bookshop`    | Bookshop             | Bookshop       | Amsterdam | 5942 | Bookshop         | EUR      | 1800 (€18,00)                | yes                                      |
| `cinema`      | Cinema               | Cinema         | Amsterdam | 7832 | Cinema           | EUR      | 1100 (€11,00)                | yes                                      |
| `gambling`    | Gambling site        | Gambling site  | Online    | 7995 | Gambling         | EUR      | 2000 (€20,00)                | yes                                      |
| `webshop`     | Web shop             | Web shop       | Online    | 5999 | Online shop      | USD      | 500 ($5,00)                  | no, only at `/app/card/pay?shop=webshop` |

The first five are PRD 8's table. `webshop` covers E19 (5999 is not in the shop-type table, so Everyday pays) and E20 (priced in dollars). The server does not check merchant names or codes against this list: a real issuer can send any shop.

**S09-4. Card screen copy.**

| Element     | Copy and source                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Title       | "Card"                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Demo card   | Design SPEC "Demo card", with the on-dark Kiriman logo lockup (`design/logo/svg/amplop-logo-on-dark.svg`) in place of the old envelope icon and text, pill "Demo card", `•••• •••• •••• 4821` (`last4`), the student's name upper-cased (`RAKA PRATAMA`, from `GET /api/profile/[accountId]`, 07). No card-network marks.                                                                                                                                      |
| Text        | "The card picks the right envelope. If that one is short, Everyday pays instead."                                                                                                                                                                                                                                                                                                                                                                              |
| Heading     | "Try a purchase"                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Rows        | One per shop with "On Card screen = yes": label, and a chip with the envelope from `shopEnvelope(accountId, mcc)` read live from the contract ("Food", "Transport", "Study", "Everyday", in that envelope's colour; "Blocked" in the declined style when `blocked` is true). Each row links to `/app/card/pay?shop=<slug>`. The Bookshop chip says "Everyday" until Raka moves a bookshop purchase, then "Study" (R9, R15; the mock-up shows the moved state). |
| Footer line | With a trusted person: "Mama sees blocked purchases in her app, without the shop name." (trusted person's name from spec 10's `useTrustedName`). With none: no line.                                                                                                                                                                                                                                                                                           |
| Tab bar     | Envelopes, Card (selected), Activity (06)                                                                                                                                                                                                                                                                                                                                                                                                                      |

While `card.issue` is loading, the card shows `•••• •••• •••• ••••`. If it fails, the shared failed state with Try again (06).

### C. Board 2.5 Simulated checkout (`/app/card/pay?shop=<slug>`)

**S09-5. Copy.** An unknown or missing `shop` redirects to `/app/card`.

| Element          | Copy and source                                                                                                       |
| ---------------- | --------------------------------------------------------------------------------------------------------------------- |
| Top bar          | Back chevron to `/app/card` (aria-label "Back"), title "Pay at a shop"                                                |
| Pill             | "Simulation"                                                                                                          |
| Text             | "This screen stands in for the shop's card machine. With a real card you would just tap."                             |
| Row              | "Shop": "Supermarket · Amsterdam" (merchant name · city)                                                              |
| Row              | "Shop type": "Groceries"                                                                                              |
| Field            | Label "Amount"; input prefilled with the default amount, shown with its currency sign: `€12,50`, `$5,00`, `Rp16.500`  |
| Line under field | "About $14,39." (S09-12 conversion of the typed amount, display rounded half up to cents); for USD the line is hidden |
| Row              | "Paying with": "Amplop demo card", `•••• 4821`                                                                        |
| Info             | "You don't pick an envelope. Amplop chooses it from the shop type."                                                   |
| Primary button   | "Pay with card"                                                                                                       |
| Small line       | "The answer comes back in about a second."                                                                            |

**S09-6. Amount rules (E12).** EUR and USD: digits, an optional comma, and at most two digits after it; dots are thousands separators added as the user types. IDR: digits only. The sign is fixed by the shop and is not typed. "Pay with card" is off when the field is empty, parses to 0, contains a minus sign (from paste), or has three or more decimals. With three decimals, the line under the field reads "Use at most 2 decimals." The amount is sent as minor units: `"12,50"` EUR gives `"1250"`; IDR whole rupiah are the minor unit (S09-11).

**S09-7. Idempotency key on the client.** When the checkout screen opens, the client makes `idempotencyKey = 32 random lowercase hex` (Web Crypto). It sends the same key for every tap and every Try again on this screen, so a double tap or a retry can never pay twice (E13, E21). It makes a new key only after a final result (approved or declined) has been shown and the user comes back to checkout.

**S09-8. Waiting and errors on screen.** On tap the button turns off and reads "Checking…". The client calls `POST /api/card/authorize` (S09-9). Then:

| Answer                                                  | Screen                                                                                                                      |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 200                                                     | Go to `/app/card/result/<purchaseId>?tx=<txHash>&ms=<confirmMs>` (S09-21) and render from the response at once.             |
| 502 `chain_unavailable` or `chain_busy`                 | Stay. Under the button: "Nothing was charged." and the `message`, with "Try again" (same key).                              |
| 502 `payment_unconfirmed` or 409 `purchase_in_progress` | Stay. "Still checking this payment…"; retry automatically after 2 s, up to 5 times, with the same key; then show Try again. |
| 403 `not_owner`                                         | "This passkey no longer controls this account." with no retry (E22).                                                        |
| other errors                                            | The `message` with Try again.                                                                                               |

### D. Authorisation: `POST /api/card/authorize`

**S09-9. The issuer-shaped message (PRD 8).** Auth `signed:owner`, action `card.authorize`. Body (strict):

| Field            | Rule                                                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cardToken`      | `zHex32`                                                                                                                                          |
| `amount`         | string `^[1-9][0-9]{0,11}$`, minor units of `currency` (01 §4)                                                                                    |
| `currency`       | `"EUR" \| "USD" \| "IDR"`                                                                                                                         |
| `merchantName`   | `zPlainText(1, 60)`                                                                                                                               |
| `merchantCity`   | `zPlainText(1, 40)`                                                                                                                               |
| `mcc`            | string `^[0-9]{4}$` (four-digit merchant category code, as issuers send it); stored as an integer and passed to the contract as `uint16 shopType` |
| `idempotencyKey` | `zHex32`                                                                                                                                          |

These are the fields a real issuer sends, so swapping in a real issuer later is a server change only (PRD 8). Swapping the owner signature for the issuer's HMAC is the only auth change (PRD 15).

**S09-10. Checks before any chain transaction (PRD 15 security test, PRD 14 rule 4, E22, I4).** On top of 05's pipeline, in this order:

| #   | Check                                                                                     | Fails with           | Chain access so far |
| --- | ----------------------------------------------------------------------------------------- | -------------------- | ------------------- |
| 1   | Signed headers present and valid (05 S05-8)                                               | 401                  | none                |
| 2   | Nonce unused (05 S05-10)                                                                  | 409 `nonce_invalid`  | none                |
| 3   | Account resolver: `cards` row for `cardToken` exists                                      | 404 `card_not_found` | none                |
| 4   | The card's `account_id` equals the message's `Account`                                    | 403 `wrong_account`  | none                |
| 5   | Role: `accountInfo(Account).owner == Address` (05 S05-11), read at `latest`, never cached | 403 `not_owner`      | one read            |
| 6   | Per-card rate limit (S09-20)                                                              | 429 `rate_limited`   | one read            |

So a request with no signature, or signed by another account for its own account, is refused with no chain access at all; a request signed by someone who is not the current owner of the card's account (the old passkey after a recovery, or the trusted person) is refused after one read and before any transaction. The old passkey is refused at checkout exactly like everywhere else (I4).

**S09-11. Conversion to token units (R14, 01 §8).** One pure function per currency in `packages/shared/src/money.ts`, integers only, rounding down to the unit (PRD 15 "Money"). `d` = AUSD `decimals()` (read once per instance, cached).

| Currency | Formula                                                                                                                            | Sample                                           |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| EUR      | `units = euroMinor × num × 10^d / (den × 100)` with `num / den` parsed from `SAMPLE_RATE_USD_PER_EUR` (`1.1511` → `11511 / 10000`) | €12,50 (`1250`) → 14 388 750 units, shown $14,39 |
| USD      | `units = cents × 10^d / 100` (no conversion, E20)                                                                                  | $5,00 (`500`) → 5 000 000                        |
| IDR      | `units = rupiah × 10^d / SAMPLE_RATE_IDR_PER_USD` (IDR minor unit = one rupiah, as Midtrans uses)                                  | Rp16.500 → 1 000 000                             |

The server converts at approval time with its own env values (R14); the client's "About $14,39." uses the same functions with the `NEXT_PUBLIC_` rates (01 §7), for display only.

**S09-12. Amount limits.** After conversion: `units = 0` gives 400 `amount_too_small`, "This amount is too small."; `units > 10 000 × 10^d` ($10.000,00) gives 400 `amount_too_large`, "This is above the demo card's limit of $10.000,00."

**S09-13. Idempotency (E13).** In one statement:

```sql
INSERT INTO purchases (purchase_id, account_id, idempotency_key, merchant_name, merchant_city,
  currency, amount_minor, mcc, amount_units, result, created_at, updated_at)
VALUES ($newId, ..., 'pending', now(), now())
ON CONFLICT (idempotency_key) DO NOTHING RETURNING purchase_id
```

- A row is returned: this request owns the new purchase. Continue at S09-15.
- No row: load the existing row by `idempotency_key`. If its `account_id`, `merchant_name`, `merchant_city`, `currency`, `amount_minor` or `mcc` differ from this request: 409 `idempotency_conflict`, "This payment was already sent with different details." Otherwise:
  - `approved` or `declined`: answer with the stored result (same `purchaseId`, same `txHash`); nothing is sent.
  - `pending` or `error`: try `pg_try_advisory_xact_lock(hashtextextended('purchase:' || purchaseId, 0))`. Not taken (another request is working on it): re-read the row every 250 ms for up to 12 s and answer as soon as it is final; still not final gives 409 `purchase_in_progress`, "This payment is still being checked. Please wait a moment." Taken: resume at S09-17.

**S09-14. `purchaseId`.** `purchase_id = randomHex16()` (32 hex), made by the server, never by the client. On chain it is `bytes32` of those 16 bytes left-padded with zeros (01 §5): viem `pad("0x" + purchaseId, { size: 32 })`. The JSON `purchaseId` is the 32-hex form.

**S09-15. Ask the contract and wait for the chain (PRD 6).** Inside the purchase lock:

```
sendContractTx("cardService",
  authorize(accountId, purchaseIdBytes32, Number(mcc), amountUnits),
  { beforeBroadcast: hash => UPDATE purchases SET tx_hash = hash,
      sent_hashes = array_append(sent_hashes, hash), updated_at = now() WHERE purchase_id = $id })
```

It waits for the first receipt (no finality wait: a card decision is final in about a second, and the screen waits for it instead of guessing). Then, from the receipt (05 `findEvent`, matching `purchaseId`), exactly one of:

| Event                                                                                 | Row update                                                                                                                                                                                                                 | Response fields                                                                             |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `PurchaseApproved(accountId, purchaseId, envelope, amount, shopType, everydayStepIn)` | `result = 'approved'`, `envelope`, `everyday_step_in`, `hold_state = 'held'`, `confirm_ms`                                                                                                                                 | `result: "approved"`, `envelope` (paying envelope), `everydayStepIn`                        |
| `PurchaseDeclined(accountId, purchaseId, amount, shopType, reason)` with `Blocked`    | `result = 'declined'`, `decline_reason = 'blocked'`, `confirm_ms`                                                                                                                                                          | `result: "declined"`, `reason: "blocked"`, `everydayStepIn: false`, no `envelope`           |
| `PurchaseDeclined` with `NotEnough`                                                   | `result = 'declined'`, `decline_reason = 'not_enough'`, `envelope` = matched envelope from `shopEnvelope(accountId, shopType)` read at the receipt's block (at `latest` if the node cannot serve that block), `confirm_ms` | `result: "declined"`, `reason: "not_enough"`, `envelope` (matched), `everydayStepIn: false` |

The event's `amount` must equal `amountUnits`; a mismatch is logged at `error` and alerted (`authorize_mismatch`). Zero or two matching events: row `error`, alert, 500 `authorize_failed`.

**S09-16. Response (01 §4).** 200:

```json
{
  "purchaseId": "<32 hex>",
  "result": "approved",
  "envelope": "food",
  "everydayStepIn": false,
  "amountUnits": "14388750",
  "txHash": "0x…",
  "confirmMs": 612
}
```

`envelope` is one of `food`, `transport`, `study`, `everyday` (01 §9 JSON values; Emergency never pays, R11). `reason` is `blocked` or `not_enough`. `confirmMs` is the time from broadcast to receipt (01 §9). The response never contains the merchant name or city.

**S09-17. Failures (E21) and safe retry.**

| Failure                                                                         | Row                | Response                                                                                                              |
| ------------------------------------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Simulate or estimate fails on transport after 05's fallback (nothing signed)    | `result = 'error'` | 502 `chain_unavailable`, "Nothing was charged. Please try again."                                                     |
| Key lock timeout or fee above cap (nothing signed)                              | `result = 'error'` | 502 `chain_busy`, "Nothing was charged. Please try again."                                                            |
| Simulate reverts with any other custom error (for example a misconfigured role) | `result = 'error'` | 500 `authorize_failed`, "Nothing was charged. Please try again later."                                                |
| Hash stored, then broadcast throws, or receipt timeout (`receipt: null`)        | stays `pending`    | 502 `payment_unconfirmed`, "We couldn't confirm this payment yet. Try again in a moment; you won't be charged twice." |
| Receipt `reverted` (a reverted transaction changes no state)                    | `result = 'error'` | 500 `authorize_failed`                                                                                                |

"Nothing was charged" is said only when no transaction can have been included. A retry with the same `idempotencyKey` resumes (S09-13) like this, under the purchase lock:

1. For each hash in `sent_hashes`: a successful receipt is decoded as in S09-15 and answered. Reverted ones are skipped.
2. If the newest hash has no receipt and `updated_at` is less than 60 s old: 409 `purchase_in_progress`.
3. Otherwise read `purchaseUsed(purchaseIdBytes32)` (01 §3). If it is false, no earlier hash landed: send again with the **same** `purchaseId` (S09-15). If it is true, an earlier hash landed (approved or declined): re-check step 1 once, then search `PurchaseApproved` and `PurchaseDeclined` logs with this `purchaseId` topic over the latest 100 blocks (05 S05-43); if still nothing, row `error`, alert `authorize_unmatched`, 500 `authorize_failed`. A simulate that reverts `PurchaseIdUsed` is handled the same way.

Because the contract refuses a reused `purchaseId` (01 §3), at most one authorisation per checkout can ever happen.

**S09-18. Two purchases at once (E14).** Two checkouts with different keys at the same moment are both sent. 05 serialises sends from the card-service key, and the contract decides each against the balance left by the one before, so one is approved and the other declined with `not_enough`. No envelope goes below zero (PRD 7 invariant 3); the server adds no check of its own.

**S09-19. Result never depends on the indexer.** The result comes from the receipt, and the result screens read the contract and the receipt, so card payments work with the indexer off (PRD 11, F10).

**S09-20. Rate limit per card (PRD 15).** `extraLimits` adds the bucket `card:<first 32 hex of sha256(cardToken)>` with 10 a minute, after the role check (so only the owner can use up their card's budget). This is on top of 05's 60 a minute per IP and 30 a minute per account.

### E. Result screens (`/app/card/result/[id]`)

**S09-21. Route and data.** `[id]` is the `purchaseId`. Query: `tx` (the authorisation transaction hash) and optional `ms` (`confirmMs`). Right after checkout the page renders from the authorize response it was handed. On reload or direct open (L7) it rebuilds the same content with no new endpoint:

- From the chain: the receipt of `tx`, decoded for `PurchaseApproved` or `PurchaseDeclined` with this `purchaseId` (envelope, amount, shop type, step-in, reason); for approved purchases the live `purchase(purchaseIdBytes32).state`; `envelopes(accountId)` for "left this week"; `shopEnvelope(accountId, shopType)` for the matched envelope.
- From the server: merchant name, city, currency and amount from `GET /api/purchases` (11), found by `purchaseId`.

If `tx` is missing or does not hold this purchase: "This payment could not be found." with "Back to card".

**S09-22. Board 2.6 Approved.**

| Element                                                                                               | Copy and source                                                                                                                                     |
| ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Header                                                                                                | 72 px circle with check, title "Approved" (approved colours)                                                                                        |
| Amount                                                                                                | `$14,39` (token units, display rounded half up to cents)                                                                                            |
| Line                                                                                                  | "€12,50 at Supermarket · Amsterdam" (shop amount in its currency, merchant name · city)                                                             |
| Row                                                                                                   | "From envelope": chip `Food` (paying envelope)                                                                                                      |
| Step-in line (E3)                                                                                     | When `everydayStepIn`: "Food was short, so Everyday paid." (matched envelope named)                                                                 |
| Row                                                                                                   | "Food left this week": `$44,61` (`available` of the paying envelope, read after the result)                                                         |
| Row                                                                                                   | "Status": badge from the purchase state: Held "On hold", Collected "Collected", Released "Released", Refunded "Refunded" (design SPEC badge styles) |
| Info, Held only                                                                                       | "$14,39 is on hold until the shop collects it. If the shop has not collected after 7 days, the hold is released."                                   |
| Demo button, Held only and before the hold period ends (`clock(accountId) < createdAt + HOLD_PERIOD`) | "Demo only: collect now" (spec 15 decides when it shows; it calls `POST /api/card/collect` and the badge becomes "Collected")                       |
| Detail box                                                                                            | "Detail"; "Digital dollar value" `14,39 AUSD`; "Confirmed in" `0,6 seconds` (`ms / 1000`, one decimal, comma; hidden without `ms`)                  |
| Link                                                                                                  | "View transaction proof": `NEXT_PUBLIC_EXPLORER_TX_URL + tx`, new tab, `rel="noopener noreferrer"`                                                  |
| Button                                                                                                | "Done" to `/app/activity`                                                                                                                           |

**S09-23. Board 2.7 Declined, blocked (R12, E7, E8).**

| Element                      | Copy                                                                                                                                                                         |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Header                       | 72 px circle with x, title "Declined" (declined colours)                                                                                                                     |
| Main line                    | "This card can't be used for gambling." The category word comes from the shop type: 7995 "gambling". Any other blocked code: "This card can't be used at this kind of shop." |
| Line                         | "No money was taken from any envelope."                                                                                                                                      |
| Line, trusted person linked  | "Mama will see in her app that a gambling purchase was declined. The shop name is not shown."                                                                                |
| Line, no trusted person (E8) | "This decline is recorded with its category only."                                                                                                                           |
| Buttons                      | "Back to card" (`/app/card`), "View in Activity" (`/app/activity`)                                                                                                           |

**S09-24. Board 2.8 Declined, envelope empty (R10, E5, E6, E10, E11).** "Matched" is the envelope from the response (or `shopEnvelope` on reload).

| Element                                        | Copy and source                                                                                                                                                                                                 |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Header                                         | 72 px circle with x, title "Declined"                                                                                                                                                                           |
| Main line, matched is Everyday                 | "Your Everyday envelope doesn't have enough this week."                                                                                                                                                         |
| Main line, matched is Food, Transport or Study | "Your Food envelope and Everyday don't have enough this week."                                                                                                                                                  |
| Line                                           | "€11,00 at Cinema · Amsterdam · $12,66"                                                                                                                                                                         |
| Rows                                           | "Needed" `$12,66`; "Everyday has" `$9,00` (matched envelope's `available`); when matched is not Everyday, also "Everyday has" with Everyday's `available` after the matched row                                 |
| Row                                            | "Next share": "Mon, 12 Oct · $50,00" for the matched envelope, from `nextReleaseDay` (account clock) and `nextRelease(schedules, today).perEnvelope[matched]` (11 S11-1); "None due" when no share is left (D6) |
| Line                                           | "No money was taken."                                                                                                                                                                                           |
| Line, matched is Everyday                      | "Food, Transport and Study can't pay for this. Each one is kept for its own purpose."                                                                                                                           |
| Line, matched is another envelope              | "Other envelopes can't pay for this. Each one is kept for its own purpose."                                                                                                                                     |
| Buttons                                        | "Back to card"; "It's an emergency" to `/app/emergency`, shown only when the Emergency lock is on and `locked > 0`                                                                                              |

No screen offers Emergency as a payer: Emergency never pays a shop (R11, E10).

### F. Holds, collect and refunds

**S09-25. `POST /api/card/collect`.** Auth `demo-or-cron` (01: "demo (signed:owner) or cron"), action `card.collect`. Body (strict) `{ purchaseId: zHex32, amountUnits?: zUnits }` (01 §4; `amountUnits` lets a shop collect less than the hold, E15). With `DEMO_MODE` off and no valid cron bearer: 404 (05 S05-31). On the signed path the account resolver loads the purchase; a missing purchase, or one whose `account_id ≠ Account`, is 404. It calls `collectPurchase(purchaseId, amountUnits?)`:

1. Take the purchase lock (S09-13).
2. Read `purchase(purchaseIdBytes32)`.
   - `Collected`: answer 200 `{ "state": "collected", "txHash": <stored settle_tx> }` with no new send (a retried tap is safe).
   - `Released`, `Refunded` or `None`: update `hold_state` to match, 409 `not_held`, "This purchase is no longer on hold." Nothing moves (E17).
   - `Held` but `clock(accountId) ≥ createdAt + HOLD_PERIOD`: collect is no longer possible (01 §9, 03 S03-29), so send `releaseHold` instead (S09-27), set `hold_state = 'released'`, and answer 409 `not_held`.
3. `amount = amountUnits ?? held`. `amount > held`: 400 `amount_above_hold`, "The shop can't collect more than the hold." `amount = 0`: 400 `bad_input`.
4. `sendContractTx("cardService", collect(purchaseIdBytes32, amount), { beforeBroadcast: store settle_tx })`. On a receipt with `PurchaseCollected`: `hold_state = 'collected'`, answer 200 `{ "state": "collected", "txHash" }`. The contract sends `amount` to the settlement address and returns `held − amount` to the envelope (R13, E4, E15). Receipt timeout: 502 `payment_unconfirmed`; a retry finds the state on chain at step 2.

`state` values in JSON: `held`, `collected`, `released`, `refunded` (01 §9).

**S09-26. Collect policy (decision: fills a PRD gap).** PRD 8 says "a timer on the server" collects but not when. One pure function, `holdAction(p, now)` in `lib/server/card/holds.ts`, where `p` has `createdAtReal` (the row's `created_at`), `createdAtClock` (`PurchaseInfo.createdAt`, account clock) and `accountClock` (`clock(accountId)`):

| Condition (checked in this order)                        | Action                                                                          |
| -------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `accountClock ≥ createdAtClock + 7 days` (`HOLD_PERIOD`) | `release`: the shop missed its window, the hold goes back to its envelope (R13) |
| `now − createdAtReal ≥ 24 hours` (real time)             | `collect` the full held amount (a real shop usually collects within a day)      |
| otherwise                                                | `none`                                                                          |

Release wins over collect, because R13 says an uncollected hold is released after 7 days, and Skip time moves only the account clock.

**S09-27. Sweeping holds without depending on cron.** `sweepHolds({ accountId?, limit })` selects purchases with `result = 'approved'` and `hold_state = 'held'` (for one account if given), oldest first, up to `limit`. For each, under its purchase lock: read the chain state; if it is no longer `Held`, copy it to `hold_state`; otherwise apply `holdAction`: `release` sends `releaseHold(purchaseIdBytes32)`, `collect` sends `collect(purchaseIdBytes32, held)`, both from the card-service key, storing `settle_tx` and the new `hold_state`. Triggers:

| Trigger                                                                 | Scope        | Limit |
| ----------------------------------------------------------------------- | ------------ | ----- |
| `after()` following each `card.issue` (the Card screen opening)         | that account | 20    |
| `after()` following each successful `card.authorize` and `card.collect` | that account | 20    |
| `GET /api/cron/collect` (daily backstop, 05 S05-48)                     | all accounts | 50    |

So after Skip 7 days, opening the Card screen releases the hold within seconds (E16). Spec 11 may also call `sweepHolds({ accountId })` with `after()` when Activity loads. An expired hold stays held in `envelopes()` until `releaseHold` runs (03 S03-30), so the sweep always sends it.

**S09-28. `GET /api/cron/collect`.** Auth `cron`. Runs `sweepHolds({ limit: 50 })`, stops starting new items after 50 s, answers `{ "collected": <number of collect transactions> }`, and logs the number of releases.

**S09-29. Refunds (R13, E18).** Server function only, no HTTP route and no screen: `refundPurchase(purchaseId, amountUnits?)` in `lib/server/card/refund.ts`. Under the purchase lock it reads the purchase; it must be `Collected`, else it throws `not_collected`. `amount = amountUnits ?? (PurchaseInfo.collected − PurchaseInfo.refunded)`. It sends `refund(purchaseIdBytes32, amount)` from the card-service key; the contract pulls it from the settlement wallet (which approved the contract once, spec 04) back into the envelope that paid. It sets `hold_state = 'refunded'` and `settle_tx`. A CLI wraps it: `npm run -w apps/web card:refund -- --purchase <id> [--amount <units>]`, reading the same server env. Tests and the hand-run E18 use it.

### G. Shop names stay on the server

**S09-30. R27.** `merchant_name` and `merchant_city` are stored only in `purchases`. They are never sent to the chain (`authorize` takes only the shop type and amount), never put in an event, a log line (05 S05-46 redacts `merchantName`, `merchantCity` and `cardToken`), an alert or the indexer, and never returned by any endpoint except to the account owner (`GET /api/purchases`, 11). The authorize response carries no shop name. The chain records the envelope, the amount, the time and the shop type, which anyone can read; the docs say so (18).

## Interfaces used

| Kind                           | Items                                                                                                                                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Endpoints (owned)              | `POST /api/card/issue`, `POST /api/card/authorize`, `POST /api/card/collect`, `GET /api/cron/collect`                                                                                                                     |
| Endpoints (used)               | `GET /api/auth/nonce` (05), `GET /api/profile/[accountId]` (07), `GET /api/purchases` (11)                                                                                                                                |
| Tables                         | `cards`; `purchases` (01 §5)                                                                                                                                                                                              |
| Contract writes (card service) | `authorize(accountId, purchaseId, shopType, amount)`, `collect(purchaseId, amount)`, `releaseHold(purchaseId)`, `refund(purchaseId, amount)`                                                                              |
| Contract reads                 | `accountInfo`, `purchase`, `purchaseUsed`, `clock`, `shopEnvelope`, `envelopes`, AUSD `decimals`                                                                                                                          |
| Events                         | `PurchaseApproved`, `PurchaseDeclined`, `PurchaseCollected`, `HoldReleased`, `PurchaseRefunded`                                                                                                                           |
| Enums                          | `Envelope`, `PurchaseState`, `DeclineReason` (01 §3)                                                                                                                                                                      |
| Env                            | `CARD_SERVICE_PRIVATE_KEY`, `SAMPLE_RATE_USD_PER_EUR`, `SAMPLE_RATE_IDR_PER_USD`, `NEXT_PUBLIC_EXPLORER_TX_URL`, `DEMO_MODE`, `CRON_SECRET`, `NEXT_PUBLIC_SAMPLE_RATE_USD_PER_EUR`, `NEXT_PUBLIC_SAMPLE_RATE_IDR_PER_USD` |
| Platform (05)                  | `defineRoute`, `sendContractTx`, `findEvent`, `readContract`, `rateLimit`, `sendAlert`, `log`, `randomHex16`, `isDemo`, `verifyCron`                                                                                      |
| Other specs                    | 06 formatters and contract client; 10 `useTrustedName`; 11 next-share helper and `GET /api/purchases`; 15 Collect now button                                                                                              |

## Screens

| Board                  | Route                             | Requirements   |
| ---------------------- | --------------------------------- | -------------- |
| 2.4 Card               | `/app/card`                       | S09-1 to S09-4 |
| 2.5 Simulated checkout | `/app/card/pay?shop=<slug>`       | S09-5 to S09-8 |
| 2.6 Approved           | `/app/card/result/[id]?tx=…&ms=…` | S09-21, S09-22 |
| 2.7 Declined, blocked  | same route                        | S09-21, S09-23 |
| 2.8 Declined, empty    | same route                        | S09-21, S09-24 |

Student screens: 16 px base, design SPEC tokens, components from 06. Where a mock-up says "Ibu", the screen says the trusted person's name ("Mama").

## Errors and edge cases

| Status | Code                   | Message                                                                                              | When                                                   |
| ------ | ---------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 400    | `amount_too_small`     | This amount is too small.                                                                            | S09-12                                                 |
| 400    | `amount_too_large`     | This is above the demo card's limit of $10.000,00.                                                   | S09-12                                                 |
| 400    | `amount_above_hold`    | The shop can't collect more than the hold.                                                           | S09-25                                                 |
| 403    | `wrong_account`        | This request is for a different account.                                                             | S09-10 step 4                                          |
| 403    | `not_owner`            | Only the account owner can do this. (checkout shows "This passkey no longer controls this account.") | S09-10 step 5                                          |
| 404    | `card_not_found`       | This card is not active.                                                                             | S09-10 step 3                                          |
| 404    | `not_found`            | Not found.                                                                                           | collect: unknown or other account's purchase; demo off |
| 409    | `idempotency_conflict` | This payment was already sent with different details.                                                | S09-13                                                 |
| 409    | `purchase_in_progress` | This payment is still being checked. Please wait a moment.                                           | S09-13, S09-17                                         |
| 409    | `not_held`             | This purchase is no longer on hold.                                                                  | S09-25                                                 |
| 429    | `rate_limited`         | Too many requests. Please wait a moment.                                                             | S09-20 (05)                                            |
| 500    | `authorize_failed`     | Nothing was charged. Please try again later.                                                         | S09-15, S09-17                                         |
| 502    | `chain_unavailable`    | Nothing was charged. Please try again.                                                               | S09-17                                                 |
| 502    | `chain_busy`           | Nothing was charged. Please try again.                                                               | S09-17                                                 |
| 502    | `payment_unconfirmed`  | We couldn't confirm this payment yet. Try again in a moment; you won't be charged twice.             | S09-17, S09-25                                         |

Edge cases:

- **Purchase before any allowance (E11).** The contract declines with `NotEnough`; 2.8 shows the matched envelope at $0,00 and "None due" or the next share.
- **Amount exactly equal to available (E9).** Approved; "left this week" shows $0,00.
- **Bookshop after a move (F3).** `shopEnvelope` returns Study; the Card chip and the result follow the contract.
- **Trusted person or card service down.** Card service down is E21. The trusted person plays no part in card payments.
- **Same account in two tabs (L8).** Two checkouts have two keys; each is one purchase.
- **Hold collected by cron while Raka watches 2.6.** The badge reads the live state on reload and shows "Collected".

## Security

| PRD 15 item                                                                                                                                                          | Requirement                                                                                         |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Threat "Spend a student's money by calling the card endpoint with their card": owner's signature (demo), random 128-bit token never the address, rate limit per card | S09-2, S09-9, S09-10, S09-20                                                                        |
| Threat "Replay a signed request seen once" (card)                                                                                                                    | 05 nonce rules apply to `card.authorize`, `card.issue`, `card.collect`; plus S09-13 idempotency     |
| Threat "Use test-only tools on a real deployment": Collect now 404 when `DEMO_MODE` is off                                                                           | S09-25 (05 S05-31)                                                                                  |
| Security test "a card authorisation with a valid card but no signature, or another account's signature, is refused before any chain call"                            | S09-10, T09-1, T09-2                                                                                |
| Security test "with `DEMO_MODE` off, Collect now returns 404"                                                                                                        | T09-10                                                                                              |
| R3: the card service can only approve, collect, release or refund                                                                                                    | All card-service sends go through `sendContractTx("cardService", …)` with only those four functions |
| R27 and PRD 15 "Logs"                                                                                                                                                | S09-30, T09-15                                                                                      |

## Tests

### Unit and server (Vitest, `FakeChain`, real Postgres; 05 coverage floor applies)

| Id     | Test                                                                                                                                                                                                                                                                                                     | Requirements   | PRD                            |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------------------------ |
| T09-1  | **No signature refused before any chain call:** a valid card token with no auth headers gives 401; `FakeChain` records zero reads and zero sends; no `purchases` row                                                                                                                                     | S09-10         | 15 security test               |
| T09-2  | **Another account's signature refused before any chain call:** Sari (owner of account 2) signs with `Account: 2` and Raka's token: 403 `wrong_account`, zero reads, zero sends. Mama signs with `Account: 1` (Raka's): 403 `not_owner` after one read and zero sends                                     | S09-10         | 15 security test, J4           |
| T09-3  | Old owner after recovery: `FakeChain` swaps the owner; the old passkey's signed checkout gives 403 `not_owner`; the new owner's works                                                                                                                                                                    | S09-10         | E22, I4, rule 4                |
| T09-4  | Conversion: EUR `1250` → 14 388 750; EUR `1` → 11 511; USD `500` → 5 000 000; IDR `16500` → 1 000 000; IDR `1` → 0 gives `amount_too_small`; $10.000,01 gives `amount_too_large`; display of 14 388 750 is `$14,39`                                                                                      | S09-11, S09-12 | R14, 15 Money                  |
| T09-5  | Idempotency: the same key twice in a row gives the same `purchaseId` and one send; ten concurrent requests with one key give one send and ten identical answers; the same key with another amount gives 409 `idempotency_conflict`; the same key from another account gives 409                          | S09-13         | E13                            |
| T09-6  | Result from the event: approved from Food; approved from Everyday with `everydayStepIn: true`; declined `blocked` with no `envelope`; declined `not_enough` with the matched envelope; stored row matches the response                                                                                   | S09-15, S09-16 | E1, E3, E5, E7                 |
| T09-7  | **Chain unreachable (E21):** `FakeChain` fails simulate on transport: 502 `chain_unavailable` with "Nothing was charged", row `error`, no send. Retry with the same key after the chain is back: approved, exactly one send, same `purchaseId`                                                           | S09-17         | E21                            |
| T09-8  | Receipt timeout: 502 `payment_unconfirmed`, row `pending` with `tx_hash`; a retry within 60 s gives 409 `purchase_in_progress`; once the receipt exists a retry answers `approved` with no new send; with no receipt after 60 s a retry sends again with the same `purchaseId`                           | S09-17         | E21                            |
| T09-9  | Per-card limit: the 11th authorisation in a minute gives 429; another card of another account is not affected                                                                                                                                                                                            | S09-20         | 15                             |
| T09-10 | Collect: signed with `DEMO_MODE` off gives 404 (and no database query); cron bearer works with demo off; chain state `Released` gives 409 `not_held`; `Collected` gives 200 with the stored hash and no send; `amountUnits` above held gives 400; partial `amountUnits` sends `collect` with that amount | S09-25         | 15 security test, E4, E15, E17 |
| T09-11 | `holdAction`: 23 h 59 min real and clock under 7 days gives `none`; 24 h gives `collect`; clock at exactly 7 days gives `release` even if 24 h also passed; clock 7 days minus 1 s gives `collect` or `none` by real time                                                                                | S09-26         | R13                            |
| T09-12 | Sweep: `card.issue` triggers a sweep for that account only; cron sweeps at most 50; a purchase already `Collected` on chain gets `hold_state` updated with no send                                                                                                                                       | S09-27, S09-28 | E16                            |
| T09-13 | Refund: refused unless `Collected`; sends `refund` with the given or full amount; `hold_state = 'refunded'`                                                                                                                                                                                              | S09-29         | E18                            |
| T09-14 | Card issue: idempotent per account; two concurrent calls make one card; token matches `^[0-9a-f]{32}$` and differs from the account's address digits; `last4` matches `^[0-9]{4}$`                                                                                                                       | S09-1, S09-2   | 15 card threat                 |
| T09-15 | Logs from the whole suite contain no merchant name, city or card token (search for "Supermarket", "Amsterdam" and the test token)                                                                                                                                                                        | S09-30         | R27, 15 Logs                   |
| T09-16 | Strict body: an unknown field, `mcc: "54111"`, `currency: "GBP"`, `amount: "12.50"`, `amount: "0"`, `amount: "-5"` each give 400                                                                                                                                                                         | S09-9          | 15 Inputs, E12                 |

### Chain suite (Vitest against Anvil with the real contract, 05)

| Id     | Test                                                                                                                                                                   | PRD      |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| T09-17 | After a $1.000 deposit, €12,50 at 5411 is approved from Food for 14 388 750 units; Food's available drops by that amount; the purchase is `Held`                       | E1       |
| T09-18 | Two concurrent authorisations for the last $10 of Everyday: one `PurchaseApproved`, one `PurchaseDeclined(NotEnough)`; Everyday is $0 or the remainder, never negative | E14      |
| T09-19 | Collect 10 000 000 of a 14 388 750 hold: settlement receives 10 000 000, Food gets 4 388 750 back                                                                      | E15      |
| T09-20 | Skip 7 days, then `card.issue`: the sweep sends `releaseHold`, Food gets the hold back, state `Released`; a later collect gives 409 `not_held`                         | E16, E17 |
| T09-21 | Collect then `refundPurchase`: the paying envelope gets the amount back from settlement                                                                                | E18      |

### End-to-end cases (PRD 14, owned here)

Run by spec 19's harness (Playwright, Raka and Mama profiles, Anvil with the real contract in demo mode). "Every money case" checks at the end (PRD 14) apply to each.

| ID  | Kind   | Case                                                             | Expected                                                                         | Tier | Requirements                   |
| --- | ------ | ---------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---- | ------------------------------ |
| E1  | Normal | Supermarket, 12,50 euro                                          | Approved, $14,39 from Food, on hold; Food shows $14,39 less                      | 1    | S09-5, S09-11, S09-15, S09-22  |
| E2  | Normal | Tram and train; cinema with enough in Everyday                   | Approved from Transport; approved from Everyday                                  | 1    | S09-3, S09-15, S09-22          |
| E3  | Normal | Food is short, Everyday has enough                               | Approved from Everyday; the result says Food was short                           | 1    | S09-15, S09-22                 |
| E4  | Normal | Collect now on a held purchase                                   | Status becomes Collected; the amount leaves for the settlement address           | 1    | S09-25, S09-22                 |
| E5  | Edge   | Matching envelope and Everyday are both short                    | Declined, "not enough"; no balance changes                                       | 1    | S09-15, S09-24                 |
| E6  | Edge   | Cinema when Everyday itself is short                             | Declined; Food, Transport and Study are untouched                                | 1    | S09-24                         |
| E7  | Edge   | Gambling site                                                    | Declined; no balance changes; Mama's alert shows the category and never the shop | 1    | S09-23, S09-30 (alert: 14, 16) |
| E8  | Edge   | Gambling site with no trusted person                             | Declined; no alert is created and nothing fails                                  | 2    | S09-23                         |
| E9  | Edge   | Amount exactly equal to what is available                        | Approved; the envelope shows $0,00                                               | 2    | S09-15, S09-22                 |
| E10 | Edge   | Every weekly envelope is empty, Emergency holds money            | Declined; Emergency is untouched                                                 | 1    | S09-24                         |
| E11 | Edge   | Purchase before any allowance has arrived                        | Declined, "not enough"                                                           | 2    | S09-24                         |
| E12 | Edge   | Amount of 0, empty, negative, or with three decimals             | Pay stays off                                                                    | 2    | S09-6                          |
| E13 | Edge   | Pay tapped twice quickly                                         | One purchase                                                                     | 1    | S09-7, S09-13                  |
| E14 | Edge   | Two purchases at the same moment for the last dollars            | One approved, one declined; the envelope never goes below zero                   | 2    | S09-18                         |
| E15 | Edge   | Shop collects less than was held                                 | The difference returns to the envelope                                           | 2    | S09-25                         |
| E16 | Edge   | Hold not collected; Skip 7 days                                  | The hold is released back to the same envelope                                   | 2    | S09-26, S09-27                 |
| E17 | Edge   | Collect after the hold was released                              | Refused; nothing moves                                                           | 3    | S09-25                         |
| E18 | Edge   | Refund of a collected purchase                                   | The money returns to the envelope that paid                                      | 2    | S09-29                         |
| E19 | Edge   | A kind of shop the table does not know                           | Everyday pays                                                                    | 2    | S09-3 (`webshop`, 5999)        |
| E20 | Edge   | Shop priced in dollars                                           | No conversion; the dollar amount is charged as is                                | 3    | S09-3, S09-11                  |
| E21 | Edge   | Card service cannot reach the chain                              | "Nothing was charged"; no hold exists; a retry is safe                           | 2    | S09-8, S09-17                  |
| E22 | Edge   | Checkout from a session whose passkey no longer owns the account | Refused                                                                          | 2    | S09-10, S09-8                  |

How the harness does the less obvious ones: E3 first spends Food down with supermarket purchases. E13 double-clicks Pay and checks one `PurchaseApproved` and one `purchases` row. E14 opens checkout in two pages of Raka's profile and clicks both Pay buttons in the same tick. E15 calls `POST /api/card/collect` from the page with `amountUnits`. E16 taps Skip time for 7 days (15), opens the Card screen, and waits up to 10 s for Food to get the hold back. E18 runs the `card:refund` CLI against the test env. E19 and E20 open `/app/card/pay?shop=webshop`. E21 switches off spec 19's RPC proxy for the server only, pays, checks "Nothing was charged" and no new purchase on chain, switches it back, taps Try again, and checks one approved purchase. E22 runs I1 first, then pays from the old profile.

## Acceptance checklist

- [ ] Boards 2.4 to 2.8 match the copy tables; the Card screen chips come from the contract.
- [ ] On Monad testnet a supermarket payment is approved from Food and the Approved screen shows "Confirmed in" about a second, with a working proof link.
- [ ] Gambling is declined with "This card can't be used for gambling." and nothing leaves any envelope.
- [ ] Double-tapping Pay makes one purchase (E13).
- [ ] With the server's RPC switched off, checkout says "Nothing was charged" and a retry after it is back makes exactly one purchase (E21).
- [ ] Collect now works in demo mode and returns 404 with `DEMO_MODE` off.
- [ ] Skip 7 days, then opening the Card screen, releases an uncollected hold (E16).
- [ ] `npm run -w apps/web card:refund` refunds a collected purchase into the envelope that paid.
- [ ] T09-1 to T09-21 pass; Tier 1 cases E1 to E7, E10, E13 pass on Anvil and once on Monad testnet.
- [ ] Logs from an E1 to E7 run contain no shop name, city or card token.

## Skills to use

From MONSKILLS pinned to `3f8efd2`, starting with `monskill`. PRD and this spec win on conflict.

- `concepts`: about one-second finality and receipts on the `latest` tag, which is why the Approved screen waits for the receipt (PRD 6); asynchronous execution (why a receipt can time out and must be resolved, not resent blindly).
- `gas`: `authorize` has two paths with different gas; the `GAS_FLOOR` (01 §9) for `authorize`, `collect`, `releaseHold` and `refund` comes from the gas report so a limit set on the decline path never runs out on the approve path.
- `tooling-and-infra`: the RPC fallback that E21 and L5 exercise; reading state at a recent block for `shopEnvelope`.
- Skip `wallet` and `wallet-integration` (PRD 6).

## Decisions made here

1. **Collect policy (fills a PRD gap).** PRD 8 names "a timer on the server" without saying when it collects. Holds are collected 24 hours after the purchase in real time; a hold whose 7-day window has passed on the account clock is released instead (S09-26).
2. **Holds are swept on request, cron is the backstop.** Opening the Card screen (`card.issue`), each authorisation and each collect sweep that account's holds with `after()`, so E16 works without waiting for the once-a-day cron.
3. **A hidden sixth shop, `webshop` (MCC 5999, USD),** covers E19 and E20 without changing the five-shop Card screen.
4. **MCC is a four-digit string** in the request, as issuers send it.
5. **IDR minor unit is one rupiah** (exponent 0), as Midtrans and everyday use treat it, not ISO 4217's two decimals.
6. **Demo card limit $10.000,00** per purchase; anything converting to 0 units is refused.
7. **Result screens rebuild from the chain plus `GET /api/purchases`** using `?tx=` in the URL, so no extra "read one purchase" endpoint is needed.
8. **"Nothing was charged" only when nothing can have been included.** A stored hash with no receipt answers `payment_unconfirmed`, and the same idempotency key resolves it later.
9. **The matched envelope for a not-enough decline** is `shopEnvelope` at the receipt's block, so 2.8 can name it (the event has no envelope).
10. **The card token lives in memory on the client** and is fetched again from the idempotent `card.issue`.
11. **Refunds have no HTTP route;** a CLI runs the server function for tests and E18.
12. **The trusted-person lines use no pronoun.** The board says "Mama sees … in her app", but the trusted person can be anyone, so the screens say "{name} sees blocked purchases, without the shop name." and "{name} will see that a gambling purchase was declined. The shop name is not shown."
13. **`GET /api/purchases` (11 S11-27) is built with this spec,** because the result screens rebuild from it on reload (S09-21).
14. **`amount_too_small` cannot happen with 6 decimals:** the smallest amounts are €0,01 = 11 511 units and Rp1 = 60 units. The check stays as a guard for a token with fewer decimals; T09-4's "IDR 1 gives `amount_too_small`" holds only below 5 decimals.
15. **The fund and card sends run inside the caller's transaction** (05 `sendContractTx` `opts.tx`), so a request holding the purchase lock never needs a second pooled connection.

## Additions to 01 (status)

1. `purchases.result` value `pending`: Merged into 01 (section 5).
2. `purchases` columns: Merged into 01 (section 5).
3. `confirmMs` in the authorise response: Merged into 01 (section 9).
4. Optional `amountUnits` on `POST /api/card/collect`: Merged into 01 (section 4).
5. JSON enum values: Merged into 01 (section 9).
6. `GET /api/purchases` returns approved and declined purchases with `result`: Merged into 01 (section 4).
7. Error codes: Not merged; per 01 section 9 each spec lists its own codes (table under "Errors and edge cases").
8. Route queries `/app/card/result/[id]?tx=` and `/app/card/pay?shop=`: Merged into 01 (section 9).
