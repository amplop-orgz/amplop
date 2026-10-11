# 11. Home, envelopes, activity and moves

Status: Ready · PRD sources: R5, R6, R8, R9, R10, R13, R15, R27; sections 5, 7, 8, 11, 12, 14 (D1–D7, F1–F11, rule 5) · Depends on: 03, 05, 06, 09, 16

## Goal

Show the student where their money is and where it went. Board 2.2 (home) shows each envelope's available money, what is still to come, and the next release. Board 2.3 (envelope detail) shows one envelope's release schedule and this week's spending. Board 2.9 (Activity) lists everything newest first. Board 2.10 (purchase detail) lets the student move an Everyday purchase to the envelope it belongs to (R15).

Balances, the schedule and the move always come from the contract. Only the history lists come from the indexer. When the indexer is down, home, card and Emergency keep working, and Activity says "History is catching up".

## In scope / Out of scope

**In scope**

- Board 2.2 Student home at `/app` (after the first allowance).
- Board 2.3 Envelope detail at `/app/envelope/[id]`.
- Board 2.9 Activity at `/app/activity`.
- Board 2.10 Purchase detail and Move a purchase at `/app/activity/[id]`.
- `GET /api/purchases` (signed:owner, action `purchases.read`).
- Shared pure functions for the weekly release display (week counter, next release, this week's share, pace).
- The home Emergency tile (its states; the Emergency screens are spec 12).
- "History is catching up" (F10, F11).
- E2E cases D1–D7 and F1–F11.

**Out of scope**

- Boards 0.6 and 0.7 (home before the first allowance): spec 07.
- Board 2.1 Allowance arrived and deposits: spec 08.
- Boards 2.4–2.8, card authorise, collect, holds: spec 09.
- Emergency screens 3.1–3.5: spec 12. Pending-change banner content: spec 13 (this spec reserves its slot on 2.2).
- The Collect now button on 2.10: spec 15 (this spec reserves its slot).
- The parent's alert for a moved purchase: spec 14.
- Indexer schema and handlers: spec 16. Passkeys, contract client, signed API client, formatters, shared states, tab bar: spec 06.

## Requirements

### Shared release maths (packages/shared)

**S11-1.** Add `packages/shared/src/schedule.ts` with these pure functions. All inputs are integers; token amounts are `bigint`. Day numbers and Monday numbers follow 01 section 1. `schedules` is the list returned by the contract read `schedules(accountId)` (01 section 3): each record is `{ startMonday, sharesOut, base[4], part[4] }` for Food, Transport, Study and Everyday. Allowances that arrived in the same week share one record, and a finished record (`sharesOut = 4`) stays in the list until the next deposit folds it (03 S03-10). `M` below is `mondayNumber(today)`.

| Function                                                                                        | Returns                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `dayNumber(clock: bigint): number`                                                              | `clock / 86400`                                                                                                                                                                                                                            |
| `mondayNumber(day: number): number`                                                             | `floor((day + 3) / 7)`                                                                                                                                                                                                                     |
| `mondayDay(m: number): number`                                                                  | `7 × m − 3` (the day number of Monday number `m`)                                                                                                                                                                                          |
| `weekdayIndex(day: number): number`                                                             | `(day + 3) mod 7`; Monday = 0, Sunday = 6                                                                                                                                                                                                  |
| `shareAmount(r, e, k: 1\|2\|3\|4): bigint`                                                      | `k ≤ 3`: `r.base[e]`; `k = 4`: `r.part[e] − 3n × r.base[e]` (R5: spare units in the last share; 01 section 3)                                                                                                                              |
| `releaseDay(r, k): number`                                                                      | `k = 1`: `mondayDay(r.startMonday)`, the Monday of the arrival week (the record keeps no arrival day); `k ≥ 2`: `mondayDay(r.startMonday + k − 1)`                                                                                         |
| `sharesOutAt(r, today): number`                                                                 | `min(4, 1 + M − r.startMonday)`; equals the contract's `sharesOut` when `today` is the clock it was read at                                                                                                                                |
| `weekCounter(schedules, today): number \| null`                                                 | For the record with the largest `startMonday`: `w = 1 + M − startMonday`. Returns `w` when `1 ≤ w ≤ 4`, else `null`. `null` when the list is empty.                                                                                        |
| `thisWeekShare(schedules, today, e): bigint`                                                    | Defined in S11-2.                                                                                                                                                                                                                          |
| `nextRelease(schedules, today): { day: number, perEnvelope: bigint[4], total: bigint } \| null` | Records with `sharesOutAt(r, today) < 4` release share `k = sharesOutAt + 1` next Monday, so `day = mondayDay(M + 1)` and `perEnvelope[e]` = the sum of `shareAmount(r, e, k)` over those records. `null` when no record has a share left. |
| `pace(schedules, today): { periodStart: number, periodEnd: number } \| null`                    | Defined in S11-3.                                                                                                                                                                                                                          |
| `barPercent(available, share): number \| null`                                                  | `share = 0n`: `null`; else `min(100, floor(available × 100 / share))`                                                                                                                                                                      |
| `isSpendingFast(available, share, pace, today): boolean`                                        | Defined in S11-3.                                                                                                                                                                                                                          |

**S11-2. This week's share.** For envelope `e` (Food, Transport, Study or Everyday) on account-clock day `today`, `thisWeekShare` is the sum over every record `r` of `shareAmount(r, e, k)` with `k = 1 + M − r.startMonday`, counting only records where `1 ≤ k ≤ 4`. In words: every share of every allowance released during the current Monday-to-Sunday week, including a first share that arrived mid-week (share `k` of a record is released in week `startMonday + k − 1`). Emergency has no weekly share. Spec 14 uses the same function for the low-envelope alert.

**S11-3. Pace.** The pace tick shows how much of this week's share should still be left at the end of today.

- `periodEnd` = `mondayDay(M + 1)` (next Monday); `periodStart` = `mondayDay(M)` (this Monday). The period is always the whole week, because a record does not keep the day a mid-week first share arrived. If `thisWeekShare` is 0 for every envelope, `pace` returns `null`.
- Tick position (0–1) = `(periodEnd − today − 1) / 7`.
- `isSpendingFast` is true when `share > 0`, `pace` is not null, and `available × 7 < share × (periodEnd − today − 1)` (integer maths, no floats).

Check with the mock-up data (Wed 7 Oct, week released Mon 5 Oct): tick = (12 − 7 − 1) / 7 = 57%. Food $59,00 of $100,00 = 59%, on plan. Everyday $9,00 of $50,00 = 18%, spending fast.

### Board 2.2 Student home (`/app`)

**S11-4. When it shows.** `/app` shows board 2.2 to a signed-in student whose `accountInfo(accountId).everDeposited` is true. Otherwise spec 07's boards 0.6 or 0.7 show. A signed-in trusted person goes to `/app/parent` (spec 06 routing).

**S11-5. Reads.** On load, read from the contract in one batch (parallel calls grouped by 06's JSON-RPC batching; no Multicall, 06 S06-21): `accountInfo(accountId)`, `envelopes(accountId)`, `clock(accountId)`, `schedules(accountId)`, `emergency(accountId)`. Read the student's name with `GET /api/profile/[accountId]` (spec 07) and the trusted person's display name per spec 10 (`trustedName`; if unknown, "your trusted person"). Re-read every 15 seconds while the page is visible, on `visibilitychange` to visible, and right after any transaction this app sends. Nothing on 2.2 reads the indexer.

**S11-6. Header.** Line 1: "Hi, <first word of the student's name>" (20px bold). Line 2: "<today> · week <w> of 4", where `<today>` is the account clock formatted by spec 06 as "Wed, 7 Oct" and `w = weekCounter(...)`. When `weekCounter` is `null`, line 2 is only "<today>" (D6: never "week 5 of 4"). A 44×44 round Settings link (`aria-label="Settings"`) goes to `/app/settings`.

**S11-7. Summary card.**

| Line          | Content                                                                                                                                                                          |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Label         | "Available this week"                                                                                                                                                            |
| Amount (32px) | Sum of `available` for Food, Transport, Study and Everyday. Emergency is excluded. Mock-up: `$124,25`.                                                                           |
| Rupiah        | "About Rp<amount × 16.500, rounded to the nearest Rp500>". Mock-up: "About Rp2.050.000". Use spec 06's rupiah-reference formatter.                                               |
| Release       | If `nextRelease(...)` is not null: "Next release <day as 'Mon, 12 Oct'> · <total>". Mock-up: "Next release Mon, 12 Oct · $225,00". If it is null: "No more shares are due" (D6). |

The release date shown is `envelopes(...).nextReleaseDay` when it is non-zero. If it differs from `nextRelease(...).day`, show the contract's day and log a warning (no user message).

**S11-8. Weekly envelope tiles (Food, Transport, Study, Everyday).** One tile per envelope, in that order, each a link to `/app/envelope/<index>` (0–3). Layout and colours exactly as board 2.2 (Theme A envelope colours, guilloche lines, white text).

| Part         | Content                                                                                                                                                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Top row      | Envelope icon and name (16px bold); `available` (20px bold, tabular).                                                                                                                                                           |
| Bar          | 8px track. Fill width = `barPercent(available, thisWeekShare)`. A 2×16px ink (`#111B33`) pace tick at the S11-3 position. When `barPercent` or `pace` is null, hide the bar.                                                    |
| Footer left  | Spending fast: "Spending fast · <unreleased> later". Not fast and `unreleased > 0`: "<unreleased> not released yet". Not fast and `unreleased = 0`: "All shares released". Spending fast and `unreleased = 0`: "Spending fast". |
| Footer right | Four 8px dots, `aria-label="Week <w> of 4"`. The first `w` dots are filled, the rest outlined. Hidden when `weekCounter` is null.                                                                                               |

Mock-up check: Food "$59,00", bar 59%, "$200,00 not released yet". Everyday "$9,00", bar 18%, "Spending fast · $100,00 later".

**S11-9. Emergency tile.** The fifth tile is red (`#B5302A`), one row: lock icon, "Emergency", a second line, and an amount on the right. Spec 12 uses this tile for G15.

| State (checked in this order)                | Second line                                                         | Amount                            | Tap              |
| -------------------------------------------- | ------------------------------------------------------------------- | --------------------------------- | ---------------- |
| `lockOn` is false                            | "Lock is off · goes to Everyday"                                    | `locked + available` of Emergency | Not a link       |
| `emergency.status = Open`                    | "Waiting · opens in <countdown>" (countdown format from spec 12)    | `locked`                          | `/app/emergency` |
| `locked = 0`                                 | "Nothing to open"                                                   | `$0,00`                           | Not a link (G15) |
| No trusted person (`trusted` = zero address) | "Opens 48 hours after you ask"                                      | `locked`                          | `/app/emergency` |
| Otherwise                                    | "Needs <trustedName>'s approval" (mock-up: "Needs Mama's approval") | `locked`                          | `/app/emergency` |

**S11-10. Slots.** Between the header and the summary card, 2.2 renders the pending-recovery banner from spec 13 (S13-22). It renders nothing when no recovery is pending. The demo banner from spec 15 is above everything. The student tab bar (spec 06) shows Envelopes (selected), Card and Activity.

### Board 2.3 Envelope detail (`/app/envelope/[id]`)

**S11-11. Route.** `id` is the envelope index as a decimal: `0` Food, `1` Transport, `2` Study, `3` Everyday. `4` redirects to `/app/emergency`. Anything else shows spec 06's not-found state with a link home. Top bar: back chevron to `/app` and the title "<Envelope> envelope" (for example "Food envelope").

**S11-12. Hero card** in the envelope's colour:

- "Available this week", `available` (32px), "About Rp<…>" as in S11-7.
- The bar and pace tick from S11-8.
- One line under the bar: on plan: "You're on plan. The dark line shows where you should be today." Spending fast: "Spending fast. The dark line shows where you should be today." No bar (no share this week): "No share was released this week. Unspent money stays in the envelope."

**S11-13. Release schedule** (from the contract, never the indexer). Heading "Release schedule". For every record `r` in `schedules(accountId)` and every share `k` in 1 to 4, one row with the day `releaseDay(r, k)` and the amount `shareAmount(r, e, k)`, oldest first. Rows on the same day from two records are added together (R8). Each row: the day ("Mon, 28 Sep"), the amount, and a badge: "Released" (green, `k ≤ sharesOutAt(r, today)`) or "Not yet" (grey lock style). Rows of a folded record are gone after the next deposit; they were all released. Under the list: "Unspent money stays in the envelope." (R6). If there are no schedule rows: one row "No more shares are due" and the same footnote.

**S11-14. Spent this week** (from the indexer). Heading "Spent this week". Rows are this envelope's purchases with `status` `Held`, `Collected` or `Refunded` (16 `EnvelopePurchasesQuery`) and an `accountClock` inside the current Monday week, newest first. Each row: shop name (15px bold); "<day> · <shop amount in shop currency>" (for example "Tue, 6 Oct · €6,32"; omit the second part when the currency is USD); and "−<dollar amount>" on the right. Empty: "Nothing spent this week." When the indexer is down or behind (S11-20): "History is catching up." in place of the list.

### Board 2.9 Activity (`/app/activity`)

**S11-15. Sources.** Activity is built in the browser from:

1. The indexer (spec 16): `Purchase`, `Deposit` and `EmergencyRequest` entities for this `accountId`, newest 100 first, with a "Show older" button that loads the next 100.
2. `GET /api/purchases` for shop names, merged by `purchaseId` (S11-27, S11-28). The indexer never holds shop names (R27).
3. Synthetic release rows computed from each `Deposit` (`startDay`, `parts`, R5: share = `floor(part / 4)`, the last share takes the spare units) and the account clock.

**S11-16. Rows.**

| Kind                                                                   | Title                          | Second line                                                                                                                                           | Amount (right)                                                                                |
| ---------------------------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Purchase, Held                                                         | Shop name                      | Envelope name + "On hold" badge (amber)                                                                                                               | "−$X" ink                                                                                     |
| Purchase, Collected                                                    | Shop name                      | Envelope name + "Collected" badge (green)                                                                                                             | "−$<collected>" ink (the hold was taken from the matching envelope or Everyday, R9, R10, R13) |
| Purchase, Released                                                     | Shop name                      | Envelope name + "Released" badge (green)                                                                                                              | "$0,00" muted                                                                                 |
| Purchase, Refunded                                                     | Shop name                      | Envelope name + "Refunded" badge (green)                                                                                                              | "−$<collected − refunded>" ink, or "$0,00" muted when fully refunded                          |
| Purchase, declined, not enough                                         | Shop name                      | Envelope it maps to + "Declined" badge (red)                                                                                                          | "$0,00" muted                                                                                 |
| Purchase, declined, blocked (R12)                                      | Shop name                      | "Declined" badge, then "<trustedName> can see this" (mock-up: "Mama can see this"). Omit that text when there is no trusted person. No envelope name. | "$0,00" muted                                                                                 |
| Moved purchase (any state above)                                       | Shop name                      | Current envelope + " · moved" + state badge                                                                                                           | as its state                                                                                  |
| Deposit                                                                | "Allowance from <trustedName>" | "Split into 5 envelopes"                                                                                                                              | "+$<amount>" green (`#0D6332`)                                                                |
| Weekly release (share k = 2, 3 or 4 of a deposit, release day ≤ today) | "Week <k> share released"      | "Food, Transport, Study and Everyday"                                                                                                                 | "+$<sum of the four shares>" green                                                            |
| Emergency opened                                                       | "Emergency opened"             | "Moved to Everyday"                                                                                                                                   | "+$<amount>" green                                                                            |

- The envelope for a declined "not enough" purchase is `shopEnvelope(accountId, shopType).envelope`, read once per distinct `shopType` and cached for the session.
- Status badges use the colours in `design/SPEC.md`.
- Amounts use spec 06's formatter. The minus sign is U+2212.
- A purchase row links to `/app/activity/<purchaseId>`. A deposit row links to board 2.1 (`/app/arrived/<paymentId>?tx=<txHash>`, from the `Deposit` entity's id and `txHash`; 01 section 9). Other rows are not links.

**S11-17. Order and grouping.** Newest first by the entity's `sortKey` (16 S16-7: block number and log index). Synthetic release rows sort by their release day on the account clock among the others. Rows are grouped under day headings in account-clock days, from each row's `accountClock` (16): "Today", "Yesterday", then "Tue, 6 Oct". The tab bar shows Activity selected.

**S11-18. Shop name fallback.** When `GET /api/purchases` fails or has no row for a purchase, the title is the shop-kind label for its `shopType` from the shared MCC table (S11-30), for example "Bookshop". When the code is unknown: "Card purchase".

**S11-19. Empty.** No rows and the indexer is up to date: "Nothing here yet. Purchases and allowances will show here."

**S11-20. History is catching up.** Show the line "History is catching up" (info box style) at the top of Activity when either is true:

- the indexer query fails or takes more than `INDEXER_TIMEOUT_MS` (4 seconds) (down), or
- the indexer is not ready, or its last processed block is more than `INDEXER_MAX_LAG_BLOCKS` (30) behind the chain head from `getBlockNumber()` (behind). 06's `useIndexerHealth` (S06-52) applies this rule with 16's progress query (S16-14).

While down, show the last list loaded in this session under the line, if any. Otherwise show only the line plus "Your balances on the home screen are up to date." Retry every 10 seconds. When the indexer is back and current, remove the line and reload. The indexer replays from the chain, so rows from while it was off appear (F11). Home, card and Emergency never wait for the indexer (F10).

### Board 2.10 Purchase detail and move (`/app/activity/[id]`)

**S11-21. Route and reads.** `id` is the purchase id as 32 lowercase hex characters (the API form from 01 section 5). Anything else shows "We can't find this purchase." with a link to Activity. The chain id is `bytes32`: the 16 bytes left-padded with zeros. Reads:

- `purchase(purchaseIdBytes32)` from the contract (authoritative for state, envelope, `amount`, `held`, `collected`, `refunded`, `moved`, `createdAt`, `everydayStepIn`).
- If the contract state is `None` (declined purchases are only in events), the indexer `Purchase` entity.
- The shop name, city, currency and shop amount from `GET /api/purchases`.
- `envelopes(accountId)` and `clock(accountId)` for the move rules.

If `purchase().accountId` is not the signed-in account, show "This purchase is not on your account." If neither the contract nor the indexer knows the id, show "We can't find this purchase yet." plus the S11-20 line.

**S11-22. Layout** (board 2.10). Top bar: back to `/app/activity`, title "Purchase". Centred: "<Shop name> · <City>" (16px bold), "−<dollar amount>" (32px), "<shop amount> · <day>" (for example "€18,00 · Tue, 6 Oct"). A list card with "Paid from" and an envelope chip, and "Status" with the state badge. A declined purchase shows "Status: Declined" and one line: blocked: "Blocked category. No money was taken."; not enough: "Not enough in <envelope> or Everyday. No money was taken." When the indexer has the authorise transaction, show "View transaction proof" (spec 06 link). Below the status card is the Collect now slot (spec 15; held purchases only).

**S11-23. Move eligibility.** The section "Move to another envelope" shows only when all of these are true (R15, PRD 14 rule 5):

1. The move amount `m` is above 0, where `m = held` for a Held purchase and `m = collected − refunded` for a Collected or Refunded one (03 S03-32). Declined and Released purchases are not movable (F8).
2. `envelope` is Everyday (F6).
3. `moved` is false (F5).
4. `clock(accountId) < createdAt + 7 days` (account clock, F7).

Otherwise the section is absent: no heading, no options, no button.

**S11-24. Move form.**

- Heading "Move to another envelope". Help line: "A purchase paid from Everyday can be moved to the envelope it belongs to."
- A radio group (`role="radiogroup"`) with rows Food, Transport, Study, and Everyday marked "current" (not selectable).
- A target is enabled only when its `available ≥ m` (S11-23). A disabled target shows "Only <available> available" in muted text (F4).
- Preselect Study when `shopType` is 5942 (bookshop) and Study is enabled. Otherwise nothing is selected and the button is disabled with the label "Choose an envelope".
- Under the group: "<Plural shop kind> will use <Target> from now on. <trustedName> will see in the app that a purchase was moved, not the shop." Mock-up: "Bookshops will use Study from now on. Mama will see in her app that a purchase was moved, not the shop." Use "This kind of shop" when the code has no plural label. Leave out the second sentence when there is no trusted person.
- Primary button: "Move to <Target>".

**S11-25. Move action.** The button sends `movePurchase(purchaseIdBytes32, target)` with the student's passkey account through spec 06's contract client (fee check included). While pending, the button shows spec 06's pending state and ignores taps. On success the move section is replaced by: a green badge "Moved from Everyday to <Target>", "View transaction proof", and a "Done" button to `/app/activity`. Everyday `available` rises by `m` and the target falls by it (R15). On a revert, show spec 06's mapped sentence. For the "target short" error: "<Target> does not have enough available right now." Show Try again. Nothing changes.

**S11-26. After a move.** The contract sets the account's override for that shop type. Later purchases of that kind use the target without asking (F3). The parent's alert (envelope names only) is spec 14's.

### `GET /api/purchases`

**S11-27. Contract.** As 01 section 4: `GET /api/purchases`, auth `signed:owner`, action `purchases.read`, no body, account from the signed message's `Account`. Response:

```
200 { "items": [ { "purchaseId": "<32 hex>", "merchantName": "Supermarket", "merchantCity": "Amsterdam", "currency": "EUR", "amount": "1250", "result": "approved" } ] }
```

`amount` is the shop amount in the shop currency's minor units, as a decimal string (`purchases.amount_minor`). `result` is `approved` or `declined` (01 §4).

**S11-28. Behaviour.**

- Handler at `apps/web/src/app/api/purchases/route.ts`. Logic in `lib/server/card/purchases.ts`.
- Rows: `purchases` where `account_id = Account` and `result IN ('approved','declined')`, newest `created_at` first, at most 500.
- Spec 05 rejects bad signatures (401), used nonces (409), and signers that are not the current `owner` of `Account` on the contract (403). After a recovery the new owner sees the names and the old one is refused (I4).
- `Cache-Control: no-store`. Never log merchant names or cities.
- The client fetches once per Activity or detail visit, caches in memory for the session, and refetches at most once every 10 seconds when the indexer shows a `purchaseId` it does not have.

### Shared states

**S11-29.** Each screen uses spec 06's shared states: loading (skeleton tiles plus "Loading"), no connection (a line with Try again), transaction failed (a plain sentence with Try again). Reloading any of these routes, or opening it directly, restores the same screen and state (L7).

### Shared MCC table

**S11-30.** `packages/shared/src/mcc.ts` exports `code → { label, plural, category }`, used here (fallback labels, move help text) and by 14 (category word in alerts). The codes and envelopes are 01 section 3's; this table adds the words.

| Code       | label           | plural           | category         |
| ---------- | --------------- | ---------------- | ---------------- |
| 5411       | Supermarket     | Supermarkets     | groceries        |
| 5812       | Restaurant      | Restaurants      | restaurant       |
| 5814       | Canteen         | Canteens         | canteen          |
| 4111       | Tram and train  | Trams and trains | public transport |
| 4121       | Taxi            | Taxis            | ride-hailing     |
| 5541, 5542 | Fuel station    | Fuel stations    | fuel             |
| 5943       | Stationery shop | Stationery shops | stationery       |
| 7338       | Print shop      | Print shops      | printing         |
| 8299       | Course          | Courses          | course fees      |
| 5942       | Bookshop        | Bookshops        | bookshop         |
| 7832       | Cinema          | Cinemas          | cinema           |
| 7995       | Gambling site   | Gambling sites   | gambling         |
| other      | Card purchase   | (none)           | other            |

## Interfaces used

| Kind                 | Names (from 01 unless marked)                                                                                                                                   |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contract reads       | `envelopes`, `accountInfo`, `clock`, `purchase`, `emergency`, `shopEnvelope`, `schedules`                                                                       |
| Contract writes      | `movePurchase(bytes32 purchaseId, Envelope to)`                                                                                                                 |
| Enums                | `Envelope`, `PurchaseState`, `DeclineReason`, `EmergencyStatus`                                                                                                 |
| Constants            | `MOVE_PERIOD` (7 days)                                                                                                                                          |
| Events (via indexer) | `Deposited`, `PurchaseApproved`, `PurchaseDeclined`, `PurchaseCollected`, `HoldReleased`, `PurchaseRefunded`, `PurchaseMoved`, `EmergencyOpened`, `DaysSkipped` |
| Server               | `GET /api/purchases` (owned here), `GET /api/profile/[accountId]` (07)                                                                                          |
| Indexer              | `Purchase`, `Deposit`, `EmergencyRequest`, progress query (16)                                                                                                  |
| Env                  | `NEXT_PUBLIC_INDEXER_URL`, `NEXT_PUBLIC_CONTRACT_ADDRESS`, `NEXT_PUBLIC_EXPLORER_TX_URL`, `SAMPLE_RATE_IDR_PER_USD` (via spec 06 config)                        |
| Formats              | 01 section 8: `$1.000,00`, `€12,50`, `Rp2.050.000`                                                                                                              |

## Screens

| Board                | Route                | File                                   | Notes            |
| -------------------- | -------------------- | -------------------------------------- | ---------------- |
| 2.2 Student home     | `/app`               | `design/boards/Main.dc.html`           | S11-4 to S11-10  |
| 2.3 Envelope detail  | `/app/envelope/[id]` | `design/boards/Envelope.dc.html`       | S11-11 to S11-14 |
| 2.9 Activity         | `/app/activity`      | `design/boards/Activity.dc.html`       | S11-15 to S11-20 |
| 2.10 Move a purchase | `/app/activity/[id]` | `design/boards/PurchaseDetail.dc.html` | S11-21 to S11-26 |

Copy quoted in the requirements is exact. Where a board says "Ibu", use the trusted person's name ("Mama" in samples). Follow `design/SPEC.md` for tokens, 44px tap targets, 13px minimum text and tabular numbers.

## Errors and edge cases

| Case                                             | Behaviour                                                                                                                                               |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Indexer down                                     | Home, envelope schedule, purchase detail (for approved purchases) and move work. Activity and "Spent this week" show "History is catching up" (S11-20). |
| `/api/purchases` fails                           | Rows show the S11-18 fallback labels. No error banner.                                                                                                  |
| Two allowances overlap (C14)                     | Tiles show the summed `available` and `unreleased`. The schedule adds rows on the same day. The week counter follows the newest allowance.              |
| After the fourth share (D6)                      | "No more shares are due". The week counter is hidden once the week after share 4 begins.                                                                |
| Skip of 3 days, not a Monday (D5)                | The next-release date and amounts are unchanged. They are computed from the clock.                                                                      |
| Move target short (F4)                           | Target disabled with "Only $X available". If the contract still reverts, show the S11-25 sentence.                                                      |
| Move raced by a second tab (L8)                  | The contract refuses the second move. The detail reloads and the section is gone.                                                                       |
| Purchase id from another account                 | "This purchase is not on your account." Nothing is shown.                                                                                               |
| Held purchase collected while the detail is open | The next 15-second read updates the badge. The move rules re-evaluate.                                                                                  |

## Security

- Shop names go only to the account owner (`signed:owner`, R27). The parent never calls `GET /api/purchases`. J4 is tested in spec 14.
- Names and cities render as plain text. No `dangerouslySetInnerHTML` (PRD 15).
- The move is signed by the owner's passkey. The contract enforces every rule (Everyday only, once, 7 days, enough in the target). The UI checks are convenience only.
- Server logs never contain merchant names, cities or signatures.

## Tests

### Unit (Vitest, `packages/shared`)

- `shareAmount`: a record with part $400,00 and base $100,00 → four shares of $100,00; part 10 units, base 2 → 2, 2, 2, 4 (the last share carries the spare units); two same-week allowances merged into one record give the sum of their shares (C14); the four shares always add up to `part` (fuzz 1,000 values).
- `releaseDay`: record started in a Monday week; a Sunday arrival (share 2 on the next day, D3); share 1 shows the arrival week's Monday.
- `sharesOutAt` and `weekCounter`: weeks 1–4 return 1–4; the week after share 4 returns `null` (D6).
- `thisWeekShare`: one allowance in week 2 = one share; overlapping allowances add up (C14); mid-week first share counts.
- `nextRelease`: board data gives Mon 12 Oct and $225,00; after share 4 gives `null`.
- `pace` and `isSpendingFast`: board data gives a 57% tick, Food on plan, Everyday spending fast; Sunday gives a 0 tick.
- `barPercent`: caps at 100; `null` when the share is 0.

### Server (Vitest)

- `GET /api/purchases`: valid owner signature returns only that account's rows, newest first; no signature → 401; replayed nonce → 409; trusted person's signature → 403; old owner after recovery → 403; response never includes `tx_hash`, `mcc` or `idempotency_key`.

### Component (Vitest + Testing Library)

- Home renders board data exactly (amounts, "week 2 of 4", "Next release Mon, 12 Oct · $225,00", "Spending fast · $100,00 later").
- Emergency tile: each S11-9 state.
- Move section hidden for each ineligible case; disabled target text; preselected Study for 5942.

### End to end (PRD 14, owned here)

| ID  | Case                                                    | Expected                                                                             | Tier |
| --- | ------------------------------------------------------- | ------------------------------------------------------------------------------------ | ---- |
| D1  | After C1, Skip to next Monday three times               | Available grows by 225 each time; after the fourth share nothing more is added       | 1    |
| D2  | Nothing is spent in week 1                              | Week 2 shows both shares; unspent money carries over                                 | 1    |
| D3  | Allowance arrives on a Sunday                           | Share 2 is released the next day                                                     | 2    |
| D4  | An envelope amount that does not divide by 4            | Three equal shares; the last one carries the spare cents                             | 2    |
| D5  | Skip 3 days, which is not a Monday                      | Nothing is released; the next-release date is unchanged                              | 2    |
| D6  | After the fourth share                                  | Home says no more shares are due; the week counter does not read "week 5 of 4"       | 3    |
| D7  | Skip tapped twice quickly                               | Time moves once per tap; no double release                                           | 3    |
| F1  | Open Activity after E1, E7 and D1                       | Newest first; each row has the right envelope, status and amount; shop names show    | 1    |
| F2  | Move a bookshop purchase from Everyday to Study         | Everyday gets the amount back; Study pays; Mama's alert names the two envelopes only | 1    |
| F3  | Buy at a bookshop again after F2                        | Study pays without asking                                                            | 2    |
| F4  | Move when the target envelope is short                  | Refused, with the reason                                                             | 2    |
| F5  | Move the same purchase a second time                    | No move option is offered                                                            | 2    |
| F6  | Purchase paid from Food, Transport or Study             | No move option is offered                                                            | 2    |
| F7  | Purchase older than 7 days                              | No move option is offered                                                            | 3    |
| F8  | Declined purchase                                       | No move option is offered                                                            | 3    |
| F9  | Purchase that Everyday paid because Food was short (E3) | It can be moved to Food once Food has enough                                         | 3    |
| F10 | Indexer switched off                                    | Activity says "History is catching up"; home, card and Emergency still work          | 1    |
| F11 | Indexer switched back on                                | Activity fills in, including what happened while it was off                          | 2    |

How each is checked:

- **D1:** after C1 the summary reads $225,00 available. After each "Skip to next Monday" (spec 15) it rises by exactly $225,00 if nothing is spent. After the third skip, home reads "No more shares are due". A fourth skip adds nothing.
- **D2:** after one skip, Food reads $200,00 and the schedule shows two "Released" rows.
- **D3:** from the Anvil start (Mon 09:00), tap "Skip 48 hours" three times to reach Sunday 09:00 (19 S19-10), then send the allowance. Tap "Skip 48 hours" once: share 2 was released at Monday 00:00.
- **D4:** deposit an amount whose Food part is not divisible by 4 units. The schedule shows three equal rows; the last row is larger by the spare units. The rows add up to the Food part.
- **D5:** after C1 on Monday, tap "Skip 48 hours" once (Wednesday, no Monday crossed; the UI has no 3-day skip, and 03's `test_R5_skipThreeDaysReleasesNothing` covers exactly 3 days). The amounts and "Next release" are unchanged.
- **D6:** after three skips, line 2 of the header is the date only. The dots are hidden.
- **D7:** double-tap "Skip to next Monday" (spec 15 queues one skip per tap). The final clock is two Mondays later. Food available grew by exactly two shares, never three.
- **F2:** checks Everyday +$20,72 and Study −$20,72 on home. Mama's alert text comes from spec 14 and contains "Everyday" and "Study" and no shop name.
- **F4:** the target row is disabled with "Only $X available".
- **F9:** the Food option is disabled while Food is short. After a skip that releases Food, it is enabled and the move succeeds.
- **F10:** stop the indexer container. Activity shows the line within 5 seconds (4 s timeout). Home shows correct amounts. A card purchase (spec 09) and an Emergency request (spec 12) both succeed.
- **F11:** restart the indexer. Rows created while it was off appear and the line disappears.

Every money case ends with the PRD 14 cross-check: the five student amounts, the five parent totals and the contract figures agree, and every transaction link opens a real transaction.

## Acceptance checklist

- [ ] `schedule.ts` functions exist with unit tests, including board-data checks.
- [ ] 2.2 matches the board at 390×844 with live data, and shows "No more shares are due" after share 4.
- [ ] Emergency tile shows all five S11-9 states.
- [ ] 2.3 shows the contract schedule with the indexer down.
- [ ] 2.9 lists newest first with shop names merged, and shows "History is catching up" when the indexer is off.
- [ ] 2.10 offers a move only when S11-23 allows. The move sends one transaction and shows its proof link.
- [ ] `GET /api/purchases` passes its server tests.
- [ ] D1, F1, F2, F10 automated and green (Tier 1). Tier 2 automated or run by hand on 12 Oct. Tier 3 run by hand once.

## Skills to use

MONSKILLS, pinned to plugin version 0.7.2 (commit `3f8efd2`). Start with `monskill`.

- `concepts`: block time and finality for the 15-second refresh and "behind" threshold, and why reads after a receipt are current.
- `gas`: the `movePurchase` gas limit follows 01 §9 through 06's helper (Monad charges on the limit).
- `indexer`: Envio queries, progress and lag detection for S11-20.

The PRD wins on conflict. Never use `wallet-integration` (Para) or `wallet`; Amplop uses Mera passkeys (spec 06).

## Decisions made here

1. **"This week's share"** is every share released during the current Monday week (S11-2). The bar fill is `available / thisWeekShare`, capped at 100%. This reproduces the mock-up (59%, 70%, 80%, 18%).
2. **Pace tick** = the share of the week left after today (S11-3). It reproduces the 57% tick on Wednesday. "Spending fast" means the fill is below the tick.
3. **Week counter** follows the newest allowance and is hidden from the week after its fourth share (D6).
4. **"Available this week"** excludes Emergency (mock-up sum $124,25).
5. **Rupiah reference** rounds to the nearest Rp500 (matches "About Rp2.050.000" and "About Rp973.500").
6. **Envelope route id** is the index 0–3. 4 redirects to `/app/emergency`.
7. **Purchase route id** is the 32-hex API form of the purchase id.
8. **Collected purchases are movable** within 7 days (the board moves a collected one). Held purchases are movable (PRD 14 rule 5). The amount moved is 03's `m` (held, or collected minus refunded); Released and fully refunded ones are not movable.
9. **Declined "not enough" rows** show the envelope the shop maps to now (`shopEnvelope`). The decline event carries no envelope.
10. **Activity rows** for weekly releases are computed from `Deposit` entities. Emergency openings are listed. Lock-off moves are not.
11. **Indexer "behind"** follows 01 section 9 and 16 S16-14: more than 30 blocks behind the chain head, not ready, or no answer within 4 seconds.
12. **Share 1's row** in the release schedule shows the Monday of its arrival week, because same-week allowances share one record and the contract keeps no arrival day. Shares 2 to 4 show their exact Monday.
13. **The pace period is the whole Monday week**, for the same reason.

## Additions to 01 (status)

1. Contract read `schedules` as `{ startDay, parts[4] }` per allowance: Not merged. 01 section 3 uses 03's `ScheduleView { startMonday, sharesOut, base[4], part[4] }`, with same-week allowances merged, and S11-1 to S11-3 and S11-13 now use that shape.
2. `envelopes().nextReleaseDay`, 0 when no share is due: Merged into 01 (section 3).
3. `PurchaseInfo.amount` as the amount currently charged: Not merged. In 01 and 03, `amount` is the approved amount and never changes; the move amount is `held` or `collected − refunded` (S11-23).
4. Routes `/app/envelope/<0–3>` and `/app/activity/<purchaseId>`: Merged into 01 (section 9).
5. Shared MCC table: Merged into 01 (section 2 names `mcc.ts` and this spec as owner); the table itself is S11-30.
6. Indexer fields: Not merged as proposed. 16 owns the names (S16-7 to S16-9; 01 section 9 records `accountClock`, `sortKey`, `txHash`); this spec now uses them (`status`, `collected`, `refunded`, `movedFrom`, `movedTo`, `declineReason`).
