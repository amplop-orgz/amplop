# 14. Parent view and alerts

Status: Ready · PRD sources: R2, R25, R26, R27; sections 2 ("Parent's view"), 5, 11, 13 (wording: "the parent sees totals, not shops"), 14 (J1–J7) · Depends on: 06, 10, 11 (shared release maths, MCC table), 12 (approval page, `GET /api/reason/current`), 16

## Goal

Show the trusted person how much is left in each of the student's envelopes, and tell them what changed. Board 1.1 shows five totals (available plus not yet released, R25) and a short list of alerts (R26). It never shows a shop or a list of purchases (J5). It links to Send allowance and to the Emergency approval page.

Totals and the open Emergency request come from the contract, so they work when the indexer is down. Past alerts come from the indexer. The low-envelope alert is computed in the app.

## In scope / Out of scope

**In scope**

- Board 1.1 Parent home at `/app/parent`.
- Totals per envelope from `totals(accountId)`.
- Alerts: their sources, exact wording, order and taps.
- The low-envelope alert computed from contract reads.
- The empty state before the first allowance (J7), and the not-linked state (J6).
- E2E cases J1–J7.

**Out of scope**

- Send allowance, boards 1.2–1.4: spec 08. This spec only links to it.
- The approval pages `/approve/[linkId]` (spec 12) and `/recover/[linkId]` (spec 13).
- The "Demo only: view as Raka" control: spec 15 (this spec reserves its place).
- The indexer `Alert` entity and its handlers: spec 16. This spec states the fields it needs.
- Sign-in and role routing: spec 06.

## Requirements

### Access

**S14-1. Who sees it.** `/app/parent` is for a signed-in address `A` with `trustedAccountOf(A) = T ≠ 0`.

- If `accountOf(A) ≠ 0` (a student), redirect to `/app`.
- If `T = 0`, show the not-linked state and nothing else: title "You are not linked to a student", body "When a student invites you, open the link they sent to see their envelopes here." No contract reads for any student, no profile call, and no indexer query (J6).

**S14-2. Reads.** For `T`, read from the contract in one batch: `totals(T)`, `envelopes(T)`, `accountInfo(T)`, `clock(T)`, `schedules(T)`, `emergency(T)` and `pending(T, TrustedRemoval)`. Read the student's name with `GET /api/profile/[T]` (spec 07, `signed:either`). Re-read the contract every 15 seconds while visible and on return to the tab. Query the indexer every 30 seconds.

**S14-3. Never shown (J5, R25, R27).** The parent app never calls `GET /api/purchases`, never queries indexer `Purchase` entities, and never puts a shop name, a shop city, a purchase amount or a purchase id on screen or in a URL. Alerts carry envelope names and categories only.

### Board 1.1 layout

**S14-4. Header.** Heading (h1): "<Name>'s allowance" (mock-up: "Raka's allowance"). Below it: "<Month YYYY> · week <w> of 4" (mock-up: "October 2026 · week 2 of 4"). The month comes from the student's account clock. `w` = `weekCounter(...)` from spec 11. When `w` is null, show only the month.

**S14-5. Notifications card.** Heading "Notifications". Rows are 60px or taller, separated by 1px lines. Each row has an icon, a title (bold) and a second line (muted). Content and order are in S14-9 to S14-14.

**S14-6. Totals card.** Heading "Left in each envelope". Five rows in envelope order: a 12px square in the envelope colour, the envelope name, and the total from `totals(T)[e]`, right aligned, tabular. The Emergency row has a lock icon after its name while `lockOn` is true.

Mock-up after the supermarket purchase: Food $244,61; Transport $101,25; Study $105,00; Everyday $109,00; Emergency $100,00.

Each total is available plus not yet released. Emergency is locked plus available (01 section 3, R25). The app shows the contract's number as it is and does no arithmetic on it.

Under the rows:

- "About <rupiah total> in total at the sample rate." The rupiah total = sum of the five totals × 16.500. Format: Rp1.000.000 or more: "Rp<millions with one decimal> million" (mock-up: "Rp10,9 million"). Under that: "Rp<rounded to the nearest Rp1.000>". In Bahasa Indonesia, "juta" replaces "million" (spec 06 i18n).
- "You see each envelope's total. Only <Name> sees individual purchases."

**S14-7. Actions.** At the bottom:

- Primary (56px): "Send allowance" to `/app/parent/send` (spec 08).
- Below it, the spec 15 slot for "Demo only: view as <Name>" (demo mode only).

**S14-8. Before the first allowance (J7).** When `accountInfo(T).everDeposited` is false, the totals all read `$0,00` and a prompt card shows above the totals card:

- Title: "No allowance yet"
- Body: "Send the first one and it splits into <Name>'s envelopes."
- Primary button: "Send the first allowance" to `/app/parent/send`.

The bottom "Send allowance" button stays.

### Alerts (R26)

**S14-9. Sources (R26).**

1. **Indexer `Alert` entities** from 16's `AlertsForTrustedQuery` (`accountId = T` and `trusted` = the signed-in address), newest first by `sortKey`, first 20. Fields used: `kind`, `status`, `accountClock`, `readyAt`, `amount`, `requestSeq`, `shopType`, `fromEnvelope`, `toEnvelope` (16 S16-9). An alert with `status = Replaced` is not shown; the newer alert of its kind stands for it.
2. **The open Emergency request from the contract.** When `emergency(T).status = Open`, the app builds this row itself from `emergency(T)`, so it shows even when the indexer is down. If the indexer also has an `EmergencyRequested` alert with the same `requestSeq`, show only one row.
3. **A pending trusted-person removal from the contract.** While `pending(T, TrustedRemoval).active`, the app builds the "Trusted removal started" row itself, so the trusted person sees it with the indexer down (10 S10-27). If the indexer also has an active `TrustedRemovalStarted` alert, show only one row.
4. **Low-envelope alerts computed in the app** (S14-11). They are not stored (PRD 11).

**S14-10. Wording.** `<Name>` is the student's name. `<when>` is the alert's `accountClock` (for a contract-built row, the request or start time on the account clock): "Today 14:05", "Yesterday 09:10", or "Tue, 6 Oct 13:42". "Today" and "Yesterday" are relative to the student's current account clock. The time of day is in the viewer's time zone (spec 06 formatter). Dates in second lines ("Fri, 9 Oct at 14:05") use the same formatter.

| Alert                              | Built from                                                                                                | Icon          | Title                                                                                                                            | Second line                                                                             | Tap                          |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------- |
| Emergency requested, still open    | Contract `emergency(T)` or `EmergencyRequested` alert with the current `requestSeq` and `status = Active` | lock, amber   | "<Name> asks to open Emergency"                                                                                                  | "<when> · tap to answer"                                                                | `/approve/<linkId>` (S14-12) |
| Emergency requested, opened        | Same alert with `status = Done` (after `EmergencyOpened`)                                                 | lock, green   | "<Name> asks to open Emergency"                                                                                                  | "<when> · opened"                                                                       | none                         |
| Emergency requested, cancelled     | Same alert with `status = Cancelled` (after `EmergencyCancelled`)                                         | lock, grey    | "<Name> asks to open Emergency"                                                                                                  | "<when> · cancelled"                                                                    | none                         |
| Blocked purchase declined          | `PurchaseBlocked` alert (`PurchaseDeclined` with reason `Blocked`)                                        | circle-x, red | "A <category> purchase was declined" (mock-up: "A gambling purchase was declined")                                               | "<when> · no money was taken"                                                           | none                         |
| Low envelope                       | Computed (S14-11)                                                                                         | alert, amber  | "<Envelope> has <p>% left this week" (mock-up: "Everyday has 18% left this week"). When `p = 0`: "<Envelope> is empty this week" | "Next release <day>" (mock-up: "Next release Mon, 12 Oct"), or "No more shares are due" | none                         |
| Purchase moved                     | `PurchaseMoved`                                                                                           | arrows, grey  | "<Name> moved a purchase from <From> to <To>"                                                                                    | "<when>"                                                                                | none                         |
| Split saved, waiting               | `SplitSaved` alert (16 stores one only when `immediate` is false)                                         | sliders, grey | "<Name> saved a new split"                                                                                                       | "<when> · starts <readyAt>"                                                             | none                         |
| Lock-off started                   | `LockOffStarted`                                                                                          | lock, amber   | "<Name> is switching the Emergency lock off"                                                                                     | "<when> · takes effect <readyAt>"                                                       | none                         |
| Trusted removal started            | `TrustedRemovalStarted` alert, or the contract's pending removal (S14-9)                                  | person, amber | "<Name> asked to remove you as trusted person"                                                                                   | "<when> · takes effect <readyAt>"                                                       | none                         |
| Recovery asked (approved, waiting) | `RecoveryApproved`                                                                                        | key, amber    | "<Name>'s account is moving to a new passkey"                                                                                    | "<when> · moves <readyAt>"                                                              | none                         |

- `<category>` is the `category` word for the alert's `shopType` from the shared MCC table (11 S11-30). Code 7995 gives "gambling". A blocked code not in the table gives the title "A blocked purchase was declined". The shop name is never used.
- `<From>` and `<To>` are envelope names (Food, Transport, Study, Everyday). No shop, shop type or amount.
- When a split, lock-off, removal or recovery alert has `status = Cancelled` (a later `PendingCancelled` of the same kind, 16 S16-10), its second line becomes "<when> · cancelled". `status = Done` keeps the row as written.
- The split alert does not list the percentages (H6 asks only that it was saved and when it starts).
- Not-enough declines, collections, releases, refunds, deposits, a split saved before the first allowance (immediate) and the end of a wait create no alert (16 S16-11).

**S14-11. Low-envelope alert (computed, J3).** For each of Food, Transport, Study and Everyday:

- `share = thisWeekShare(schedules(T), today, e)` (spec 11 S11-2): the sum of every share of every allowance released during the current Monday-to-Sunday week on the student's account clock. That includes a first share that arrived mid-week.
- `available = envelopes(T)[e].available`.
- Show the alert when `share > 0` and `available × 5 < share` (under 20%).
- `p = floor(available × 100 / share)`. The mock-up has $9,00 of $50,00, which gives 18%.
- The next-release date comes from `envelopes(T).nextReleaseDay` when it is not 0. Otherwise the second line is "No more shares are due".

The check runs on every contract read. The alert goes away by itself when the condition stops being true, for example after the next Monday's share is released (J3). Emergency never gets this alert.

**S14-12. The Emergency tap.** To link the open-request row to `/approve/<linkId>`, call `GET /api/reason/current` (01 §4, spec 12) signed with `Account = T`. If it fails, the row is not a link and its second line reads "<when> · open the link <Name> sent".

**S14-13. Order and length.**

1. The open Emergency request first, because it needs an answer.
2. Then the contract-built removal row and the indexer alerts, newest first (indexer rows by `sortKey` descending).
3. Then low-envelope alerts, in envelope order.

Show at most 5 rows. If there are more, show the button "Show older", which reveals 20 at a time (loading more from the indexer as needed). With no rows at all: "No notifications yet."

**S14-14. Indexer down or behind.** Use 06's `useIndexerHealth` (S06-52; 01 §9: no answer within 4 seconds, not ready, or more than 30 blocks behind). The card still shows the open Emergency request and low-envelope alerts. It adds the muted line "Older notifications are catching up." The totals card is unaffected.

## Interfaces used

| Kind                 | Names (from 01 unless marked)                                                                                                                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contract reads       | `totals`, `envelopes`, `accountInfo`, `clock`, `emergency`, `pending`, `accountOf`, `trustedAccountOf`, `schedules`                                                                                                                   |
| Enums                | `Envelope`, `DeclineReason`, `EmergencyStatus`, `PendingKind`                                                                                                                                                                         |
| Events (via `Alert`) | `EmergencyRequested`, `EmergencyOpened`, `EmergencyCancelled`, `PurchaseDeclined`, `PurchaseMoved`, `SplitSaved`, `LockOffStarted`, `TrustedRemovalStarted`, `RecoveryApproved`, `PendingCancelled`, `DaysSkipped` (for account time) |
| Server               | `GET /api/profile/[accountId]` (07), `GET /api/reason/current` (12)                                                                                                                                                                   |
| Shared code          | `thisWeekShare`, `weekCounter` (11 S11-1), MCC table (11 S11-30), `useIndexerHealth` (06 S06-52)                                                                                                                                      |
| Routes               | `/app/parent`, `/app/parent/send` (08), `/approve/<linkId>` (12)                                                                                                                                                                      |
| Env                  | `NEXT_PUBLIC_INDEXER_URL`, `NEXT_PUBLIC_CONTRACT_ADDRESS`                                                                                                                                                                             |

## Screens

| Board           | Route         | File                               |
| --------------- | ------------- | ---------------------------------- |
| 1.1 Parent home | `/app/parent` | `design/boards/ParentHome.dc.html` |

Parent screens use the 17px base and 56px primary buttons (`design/SPEC.md`). Where the board says "Ibu", the parent is "Mama". Raka is the student's name from the profile.

## Errors and edge cases

| Case                                               | Behaviour                                                                                                                                                                   |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Indexer down                                       | Totals, the open Emergency row and low-envelope alerts show. "Older notifications are catching up."                                                                         |
| Profile name fails to load                         | Use "Your student" in titles and "your student" mid-sentence.                                                                                                               |
| Student has no allowance yet                       | J7 prompt. No low-envelope alerts (no share).                                                                                                                               |
| Blocked purchase with no trusted person (E8)       | No alert is shown, because nobody is linked. Nothing fails.                                                                                                                 |
| Trusted person replaced (J6, B10)                  | The old person gets the not-linked state. The new person sees the account, including older alerts (they are public chain data).                                             |
| Week with no share released (after share 4)        | No low-envelope alert.                                                                                                                                                      |
| Two allowances overlap (C14)                       | `thisWeekShare` adds both shares. Totals add both.                                                                                                                          |
| Emergency request opened by time before Mama looks | The row reads "opened" after the indexer sees `EmergencyOpened`. Until then the contract row shows "tap to answer", and the approval page shows "Already opened" (spec 12). |

## Security

- The parent never receives a shop name. `GET /api/purchases` is `signed:owner`, so the trusted person's signature is refused (J4). The parent app never asks for it.
- Alerts contain only envelope names, categories and times. They are built from public chain events, so showing them reveals nothing the chain does not already show (R27). The app shows them only to the current trusted person (`trustedAccountOf`).
- Names render as plain text (PRD 15).
- The docs and copy say "the parent sees totals, not shops". Never "private" (PRD 13).

## Tests

### Unit and component (Vitest)

- Alert wording: one test per S14-10 row, including the cancelled variants, a `Replaced` alert (hidden) and the unknown blocked code.
- Low-envelope: $9,00 of $50,00 gives "Everyday has 18% left this week"; $10,00 of $50,00 gives no alert (exactly 20%); $0,00 gives "Everyday is empty this week"; a week with no share gives no alert.
- Order: the open Emergency row first, then newest-first indexer rows, then low-envelope rows; 7 rows show 5 plus "Show older".
- Rupiah total: $659,86 gives "About Rp10,9 million in total at the sample rate."; $50,00 gives "About Rp825.000 in total at the sample rate."
- Not-linked state makes no contract or indexer calls (mocked clients record zero calls).

### Server (Vitest)

- J4 at the API level: `GET /api/purchases` signed by the trusted person with `Account = T` → 403; with `Account = 0` → 403; no item is returned in either case.

### End to end (PRD 14, owned here)

| ID  | Case                                                 | Expected                                                          | Tier |
| --- | ---------------------------------------------------- | ----------------------------------------------------------------- | ---- |
| J1  | Parent home after C1, E1 and G1                      | Each total equals available plus not yet released                 | 1    |
| J2  | Alerts after E7, F2, G1, H2 and I1                   | One alert for each, newest first, with the right wording          | 2    |
| J3  | An envelope falls under 20% of this week's share     | A low-envelope alert appears; it goes away after the next release | 2    |
| J4  | Mama's profile asks the server for Raka's shop names | Refused                                                           | 1    |
| J5  | Mama's app                                           | No screen or address shows a shop name or a list of purchases     | 2    |
| J6  | A replaced trusted person signs in                   | Sees nothing of Raka's account                                    | 2    |
| J7  | Mama opens before any allowance                      | Totals are $0,00 with a prompt to send the first one              | 3    |

How each is checked:

- **J1:** after C1, E1 and G1, for each envelope the shown total equals `available + unreleased` from `envelopes(T)` (Emergency: `locked + available`). Food reads $385,61 ($400,00 minus $14,39 on hold), Transport and Study read $150,00, Everyday reads $270,00 ($200,00 + $70,00), Emergency reads $30,00. The PRD 14 cross-check against Raka's home also passes.
- **J2:** run E7, F2, G1, H2 and I1 in that order. The notifications card (after "Show older" if needed), filtered to `data-alert-kind` other than `low`, reads newest first: "Raka's account is moving to a new passkey" (I1 approval), "Raka saved a new split", "Raka asks to open Emergency" with "opened", "Raka moved a purchase from Everyday to Study", "A gambling purchase was declined". There is exactly one row of each kind. No row contains "Bookshop" or "Gambling site".
- **J3:** spend Everyday down to under 20% of its share with cinema purchases. The row "Everyday has <p>% left this week" appears within one read. Skip to next Monday on Raka's profile. The row is gone.
- **J4:** from Mama's profile, the test calls `GET /api/purchases` through the signed client. It gets 403 and the body has no `items`.
- **J5:** after E1, E7 and F2, visit every parent route (`/app/parent`, `/app/parent/send`, `/approve/<linkId>`). Assert that no merchant name or city stored for Raka appears in the page text or the URL. The network log shows no `GET /api/purchases` and no indexer query on `Purchase`.
- **J6:** Raka replaces Mama (spec 10) and the removal finishes after a 48-hour skip. Mama's profile opens `/app/parent` and sees "You are not linked to a student". There is no name, total or alert, and no indexer request.
- **J7:** right after B1, Mama's parent home shows five "$0,00" totals and the "No allowance yet" prompt with "Send the first allowance".

## Acceptance checklist

- [ ] Board 1.1 matches the mock-up with live data at 390×844.
- [ ] Totals come straight from `totals()` and match the student's home.
- [ ] Every alert kind renders with the exact wording, newest first, with the open Emergency request pinned first and tappable.
- [ ] The low-envelope alert appears under 20% and clears after the next release.
- [ ] With the indexer stopped, totals and the open Emergency request still show.
- [ ] No parent route shows a shop name or a purchase list.
- [ ] J1, J4 automated and green (Tier 1). Tier 2 automated or run by hand on 12 Oct. Tier 3 run by hand once.

## Skills to use

MONSKILLS, pinned to plugin version 0.7.2 (commit `3f8efd2`). Start with `monskill`.

- `indexer`: the Envio GraphQL query for `Alert` (filter by `accountId` and `trusted`, order by `sortKey`, paging), and the progress query for "catching up". This query and a screenshot of the alerts beside it are part of the Envio bounty entry (PRD 11).
- `concepts`: reading several views in one batch, block time for the refresh intervals.

The PRD wins on conflict. Never use `wallet-integration` (Para) or `wallet`. Amplop uses Mera passkeys (spec 06).

## Decisions made here

1. **"This week's share"** is every share released in the current Monday week on the student's clock (spec 11 S11-2). "Under 20%" means `available × 5 < share`. The percentage is rounded down. This reproduces "Everyday has 18% left this week".
2. **The open Emergency request is read from the contract and pinned first.** It needs an answer and must work without the indexer.
3. **Low-envelope alerts go after the timed alerts.** They describe the present, not an event (matches the board's order).
4. **"Recovery asked"** is the `RecoveryApproved` event. The server cannot tell which account a recovery link is for until the trusted person approves, so there is no earlier event to alert on.
5. **Cancelled changes** keep their alert with "cancelled" in place of the date it would have taken effect. Replaced alerts are hidden.
6. **No alert** for not-enough declines, deposits, collections, an immediate split before the first allowance, or the end of a wait. R26 does not list them, and 16 stores none.
7. **Rupiah total** is shown in millions with one decimal at Rp1.000.000 or more ("Rp10,9 million").
8. **J7 prompt** copy: "No allowance yet" / "Send the first one and it splits into <Name>'s envelopes." / "Send the first allowance".
9. **The route guard lets a signed-in person with no role open `/app/parent`** (a change to 06 S06-8's table), so a replaced trusted person sees "You are not linked to a student" (S14-1, J6) instead of being sent to Welcome. A student is still sent to `/app`.
10. **`<when>` uses 06's relative formatter**, which writes older days as "Tue, 6 Oct at 13:42" (with "at"), like every other date-time in the app.
11. **The contract-built removal row sorts by its start time** (`readyAt` minus 48 hours) among the indexer alerts.

## Additions to 01 (status)

1. Indexer `Alert` entity fields: Not merged as proposed. 16 owns the entity (S16-9; 01 section 9 records the names): `accountClock` in place of `accountTime`, `status` (`Active`, `Done`, `Cancelled`, `Replaced`) in place of `emergencyStatus` and `cancelled`, `readyAt` in place of `effectiveAt`, id `<blockNumber>-<logIndex>`. S14-9 and S14-10 now use those names.
2. The MCC table's `category` column: Merged into 01 (section 2 names `mcc.ts`); the table is 11 S11-30.
3. `GET /api/reason/current`: Merged into 01 (section 4).
