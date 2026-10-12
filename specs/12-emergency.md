# 12. Emergency

Status: Ready · PRD sources: R7, R11, R16–R19; sections 5, 7, 8, 9, 11, 13 (video 2:25–2:50), 14 (G1–G15, G18, rule 6), 15 (reason limit, private text) · Depends on: 03, 05, 06, 10, 11 (home tile)

## Goal

Let the student ask to open the Emergency envelope with an amount and a reason. The trusted person reads the reason and can approve with their passkey, which opens it at once. They cannot refuse. If nobody approves, it opens by itself 48 hours after the request (R17, R19). Opened money moves to Everyday and can be spent straight away (R18).

The request, approval, cancel and opening are contract transactions. The reason text lives on the server. The contract holds its fingerprint, so the text cannot be changed later.

## In scope / Out of scope

**In scope**

- Board 3.1 Ask to open Emergency, 3.2 Waiting and 3.5 Emergency with no trusted person, all at `/app/emergency`.
- Board 3.3 Approval and 3.4 Emergency opened at `/approve/[linkId]`.
- `POST /api/reason` and `GET /api/reason/[linkId]`.
- `requestEmergency`, `approveEmergency`, `finalizeEmergency`, `cancelEmergency` from the app.
- The student auto-finish hook (finalize when the student opens the app after `opensAt`, G2).
- Countdown from the student's account clock.
- WhatsApp sharing of the approval link, and "Message Raka first" (G18).
- E2E cases G1–G15 and G18.

**Out of scope**

- The Emergency tile on the student home: spec 11 (S11-9). This spec tests it in G15.
- Emergency lock-off (R20, G16, G17): spec 13.
- Linking, replacing and removing the trusted person: spec 10.
- The parent's "Emergency requested" alert: spec 14.
- Contract behaviour: spec 03. Indexer `EmergencyRequest` entity: spec 16.
- Passkey sign-in, contract client, signed API client, formats, shared states: spec 06. Signed-request checks and rate limits: spec 05.

## Requirements

### Student: `/app/emergency`

**S12-1. Reads.** The page reads `accountInfo(accountId)`, `envelopes(accountId)` (Emergency `locked`), `emergency(accountId)`, `pending(accountId, LockOff)` and `clock(accountId)` from the contract. It re-reads every 10 seconds while visible and after each transaction. It does not need the indexer.

**S12-2. Which screen shows.** Check in this order:

| Condition                                                                 | Screen                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lockOn` is false                                                         | Lock-off notice: "The Emergency lock is off. Emergency money goes straight to Everyday." and a "Back to envelopes" button.                                                                                                                         |
| `emergency.status = Open`                                                 | 3.2 Waiting (S12-7). Never the form while a request is open (R16, G8).                                                                                                                                                                             |
| `status = Opened` and this `requestSeq` is not marked seen on this device | Opened notice (S12-10).                                                                                                                                                                                                                            |
| `pending(LockOff).active`                                                 | Lock-off notice: "The Emergency lock is switching off, so you can't ask to open Emergency while that change waits. Cancel it in Settings to ask instead." and a "Go to Settings" button (01 §9: a request cannot start while lock-off is waiting). |
| `locked = 0`                                                              | Empty notice: "Your Emergency envelope is empty, so there is nothing to open." and "Back to envelopes" (G15).                                                                                                                                      |
| `trusted` is the zero address                                             | 3.5 form (S12-4).                                                                                                                                                                                                                                  |
| Otherwise                                                                 | 3.1 form (S12-3).                                                                                                                                                                                                                                  |

**S12-3. Board 3.1 form (has a trusted person).** Top bar: back to `/app`, title "Ask to open Emergency".

- A red Emergency card: lock icon, "Emergency", "Locked", and the `locked` amount (mock-up `$100,00`).
- Field "Amount requested" (`<label for="amount">`, `inputmode="decimal"`, placeholder "$0,00"). Below it, live: "The rest, <locked − amount>, stays locked." (mock-up: "The rest, $30,00, stays locked."). Show that line only while the amount is valid.
- Field "Reason" (`<textarea id="reason" rows="3">`). Below it on the left: "<trustedName> will read this reason." (mock-up: "Mama will read this reason."). On the right a counter "<n>/280". The counter turns red (`#A51F1E`) above 280. Do not set `maxlength`, so a longer reason shows the limit instead of being cut (G7).
- Info box (clock icon): "<trustedName> can open it sooner. If <trustedName> doesn't answer, it opens automatically after 48 hours. The money then moves to your Everyday envelope."
- Primary button: "Send request to <trustedName>" (mock-up: "Send request to Mama").

**S12-4. Board 3.5 form (no trusted person, R19).** Same as S12-3 except:

- Reason helper: "Kept with the request, for your own record."
- Info box: "You have no trusted person, so nobody can open it sooner. It opens automatically after 48 hours. The money then moves to your Everyday envelope."
- Primary button: "Start the 48-hour wait". Under it, a text link "Invite a trusted person instead" to `/app/invite` (spec 10).

**S12-5. Validation.** The send button is enabled only when all are true:

- The amount parses with spec 06's money input rules: comma is the decimal mark, dots are thousand separators, an optional leading "$", at most 2 decimals.
- `0 < amount ≤ locked` in token units (G6).
- The reason, with leading and trailing white space removed, has 1 to 280 Unicode code points (`[...text].length`, PRD 14 rule 6, G7).

**S12-6. Sending a request.** On tap:

1. Disable the button and show spec 06's pending state.
2. `reason` = the trimmed text. `reasonHash` = `keccak256(toBytes(reason))` (UTF-8, 01 section 3).
3. Send `requestEmergency(amountUnits, reasonHash)` through spec 06's contract client (fee check included). Wait for the receipt.
4. Read `requestSeq` from the `EmergencyRequested` log in the receipt.
5. `POST /api/reason` with `{ accountId, requestSeq, reason }` (S12-13). On a 409 `request_not_found` (the server's node has not seen the block yet) or a 502, retry up to 5 times, 2 seconds apart.
6. Keep `linkId` in memory for this page. Another device, a reload or a recovered account gets it from `GET /api/reason/current` (S12-15).
7. Show 3.2.

If step 3 fails, nothing was requested. Show the mapped error with Try again; the form keeps its values. If step 5 still fails after the retries, 3.2 shows "The reason did not save yet." with Try again. The WhatsApp button stays disabled until a `linkId` exists. The request itself stands.

**S12-7. Board 3.2 Waiting.** Top bar: back to `/app`, title "Emergency request".

Status card:

| With a trusted person                               | No trusted person        |
| --------------------------------------------------- | ------------------------ |
| "Waiting for <trustedName>"                         | "Waiting"                |
| "Or opens automatically in"                         | "Opens automatically in" |
| Countdown (S12-8), large, for example "47 h 12 min" | same                     |
| `opensAt` as "Fri, 9 Oct at 14:05"                  | same                     |

Timeline. Each step has an icon: done (check), current (ring) or future (empty).

| #   | With a trusted person                                                                                                                                                | No trusted person                                            |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 1   | Done: "Request sent" · `requestedAt` ("Wed, 7 Oct at 14:05")                                                                                                         | Done: "Request sent" · `requestedAt`                         |
| 2   | Before the first share tap, current: "Send the link to <trustedName>" · "Tap the button below". After it, done: "Link sent to <trustedName>" · "Shared on WhatsApp". | Current: "48-hour wait" · "Opens automatically on <opensAt>" |
| 3   | Current: "Waiting for <trustedName>'s approval" · "<trustedName> approves with a passkey"                                                                            | Future: "<amount> moves to Everyday" · the reason            |
| 4   | Future: "<amount> moves to Everyday" · the reason                                                                                                                    | —                                                            |

Buttons at the bottom, trusted person only:

- Before the first share tap, primary: "Send the link to <trustedName> on WhatsApp". After it, secondary: "Send the link again on WhatsApp". Both run S12-11. Record the tap as `sharedSeq = requestSeq` for this account in `localStorage` `amplop.emergency.v1` (01 §9), wrapped in try/catch.
- Text button in red (`#A51F1E`): "Cancel request" (S12-9). This also shows when there is no trusted person.

The reason text comes from `GET /api/reason/[linkId]` using the `linkId` this page saved. Without one (another device, a reload, or after a recovery), use `GET /api/reason/current` (S12-15). If neither works, leave the reason line out. If no `linkId` can be found, hide the WhatsApp buttons.

**S12-8. Countdown.** Remaining seconds = `opensAt − studentClock`. `studentClock` = the last `clock(accountId)` read plus the wall-clock seconds since that read. Re-read the clock every 30 seconds. Format:

- 1 hour or more: "<h> h <m> min" (minutes rounded down).
- Under 1 hour: "<m> min".
- Under 1 minute: "less than a minute".

When it reaches 0, the auto-finish hook (S12-12) runs. All times use the student's account clock, including after a demo skip (spec 15). Dates and times are formatted by spec 06 in the viewer's time zone.

**S12-9. Cancel.** "Cancel request" opens a confirm sheet:

- Title: "Cancel this request?"
- Body: "Nothing moves, and <trustedName>'s link will say it was cancelled." With no trusted person: "Nothing moves."
- Buttons: "Cancel request" (danger) and "Keep waiting".

Confirming sends `cancelEmergency()`. On success, show the form with the toast "Request cancelled. Nothing was moved." The locked balance is unchanged (G9).

**S12-10. Opened notice.** When the latest request is `Opened` (R18: the opened money is in Everyday and can be spent at once; the rest stays locked):

- Green success icon, title "Emergency opened".
- "<amount> moved to your Everyday envelope. You can spend it now."
- A row "Still locked" with the remaining `locked`.
- "View transaction proof" when the opening transaction is known: from this device's finalize receipt, or the indexer `EmergencyRequest.closedTx` when its `status` is `Opened` (16). Otherwise no link.
- Primary "Back to envelopes" marks this `requestSeq` seen (`seenSeq` for this account in `amplop.emergency.v1`, 01 §9) and goes to `/app`.
- When `locked > 0`, a text button "Ask again" marks it seen and shows the form (G4).

### Sharing and opening by time

**S12-11. WhatsApp share.** Build the approval link as `https://<host>/approve/<linkId>` (01 section 6). Open `https://wa.me/?text=<encodeURIComponent(text)>` with `window.open(url, "_blank", "noopener")` inside the tap handler, so the browser keeps the user gesture. Text: "Hi <trustedName>, I asked to open my Emergency envelope in Amplop. Please have a look: <link>". If the window does not open, copy the link to the clipboard and show "Link copied. Paste it into WhatsApp."

**S12-12. Student auto-finish hook (G2).** `useStudentAutoFinish()` runs in the student layout, on every `/app` student route. On mount and after each contract read:

- If `emergency.status = Open` and `studentClock ≥ opensAt`, and this device has not sent a finalize for this `requestSeq` in this session, send `finalizeEmergency(accountId)` through spec 06's contract client. No confirm step is shown.
- On success, re-read everything and show the toast "Your Emergency money is in Everyday now."
- On a revert, re-read silently. Someone else may already have opened it.
- Spec 13 adds `finishLockOff` and the new phone's `finishRecovery` belongs to 13's `/recover` page. Spec 10's `useTrustedHousekeeping` (S10-24) runs beside this hook for `finishRemoveTrusted`.

### Server: reason text

**S12-13. `POST /api/reason`** (01 section 4). Auth `signed:owner`, action `reason.save`. Handler at `app/api/reason/route.ts`, logic in `lib/server/reason/`.

Body (strict zod, unknown fields rejected):

```
{ "accountId": "<decimal string>", "requestSeq": "<decimal string>", "reason": "<string>" }
```

Steps, in order:

1. Spec 05 checks the signature, nonce and that the signer is the current owner of the message's `Account`. Then `body.accountId` must equal `Account`, else 403 `wrong_account` (05's account resolver, S05-12).
2. `reason` must have 1 to 280 code points and not be only white space, else 400 `reason_invalid` ("The reason must be 1 to 280 characters."). The server does not trim or normalise. It hashes exactly what it received.
3. Read `emergency(accountId)` from the chain at the latest block:
   - `requestSeq` on chain lower than the body's: 409 `request_not_found` ("We could not find this request yet. Try again.").
   - `requestSeq` on chain higher than the body's: 409 `request_not_current`.
   - `status = None`: 409 `request_not_found`.
   - `keccak256(utf8(reason)) ≠ reasonHash`: 409 `reason_mismatch` ("This reason does not match the request.").
4. If a row exists for (`accountId`, `requestSeq`), return its `linkId` (200). The hash check above means the text is the same.
5. Otherwise insert `reasons` (`link_id` = `crypto.randomBytes(16)` as 32 lowercase hex, `account_id`, `request_seq`, `text`, `created_at`) and return `200 { "linkId": "<32 hex>" }`.

**S12-14. `GET /api/reason/[linkId]`.** Auth `signed:either`, action `reason.read`.

1. `linkId` must match `^[0-9a-f]{32}$`, else 404 `reason_not_found`.
2. Spec 05 checks the signature and nonce, and that the signer is the owner or the current trusted person of the message's `Account` (read from the contract now, so a replaced trusted person fails, G14).
3. Load the row. Missing, or `row.account_id ≠ Account`: 404 `reason_not_found` (the link id is never confirmed to another account, 05 S05-12).
4. Return `200 { "accountId": "<decimal>", "requestSeq": "<decimal>", "reason": "<text>" }` with `Cache-Control: no-store`.

**S12-15. `GET /api/reason/current`** (01 §4). Auth `signed:either`, action `reason.current`, account from the signed message. Reads `emergency(Account).requestSeq` and returns `200 { "linkId", "requestSeq", "reason" }` for that row, or 404 `reason_not_found`. Used by S12-7 and by the parent home (spec 14) to find the approval link. Next.js matches the static `current` segment before `[linkId]`. Link ids are 32 hex, so they never collide with it.

**S12-16. Logging and limits.** Never log the reason text, the hash input or signatures. The rate limits from 01 section 4 apply. The 280-code-point limit is enforced on the server (PRD 15).

### Trusted person: `/approve/[linkId]`

**S12-17. Loading.** The page is outside `/app` and uses the parent screen style (17px base, 56px primary buttons).

1. If no passkey session (spec 06): show "Emergency request", "Sign in with your passkey to see this request.", and spec 06's "Sign in with passkey" button. If the device has no passkey for this site, add: "This link is for the trusted person. Open it on the phone where you accepted the invite."
2. Signed in as address `A`: `T = trustedAccountOf(A)`, `O = accountOf(A)`.
3. Call `GET /api/reason/[linkId]` signed with `Account = T` if `T ≠ 0`, else `O`.
   - 403 or no account: the not-for-you state (S12-19).
   - 404: "This link is not valid or not for you."
4. With `accountId` from the response, read `emergency`, `clock`, `envelopes`, `accountInfo` and the student's name (`GET /api/profile/[accountId]`, spec 07).
5. If the signer is the owner (`O = accountId`), show the request read-only with the line "This page is for <trustedName>. Only they can approve." There is no approve button. In demo mode spec 15 adds "View as <trustedName>".

**S12-18. Board 3.3 Approval.** Shown when `status = Open`, the on-chain `requestSeq` equals the link's, and `studentClock < opensAt`.

- Kicker: "Emergency request". Heading: "<Name> is asking you to open the Emergency envelope" (mock-up: "Raka is asking you to open the Emergency envelope").
- Card: "Amount requested", the amount (mock-up `$70,00`), and "of <locked> in the Emergency envelope · about Rp<amount × 16.500>" (mock-up: "of $100,00 in the Emergency envelope · about Rp1.155.000").
- "<Name>'s reason" and the reason as plain text. "Sent" and `requestedAt` ("Wed, 7 Oct at 14:05").
- Info box: "You can open it sooner, but you cannot block it. It opens automatically on <opensAt>."
- Primary: "Approve with passkey" (fingerprint icon). Helper: "Your phone will ask for your fingerprint, face or screen lock."
- Text button: "Message <Name> first" (S12-21).

There is no refuse or block button (R17).

**S12-19. Other states.**

| Condition                                                               | Title                      | Body                                                                                                                            | Buttons        |
| ----------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| Signer is not the owner or current trusted person (G12, G14 old person) | "This link is not for you" | "Only the trusted person on this account can see this request and approve it." No reason, amount or name.                       | none           |
| `status = Open`, same `requestSeq`, `studentClock ≥ opensAt`            | "Already opened"           | "The 48 hours have passed, so it opens by itself. <amount> moves to <Name>'s Everyday envelope when <Name> next opens the app." | "Back to home" |
| `status = Opened`, same `requestSeq`, approved from this page just now  | Board 3.4 (S12-20)         |                                                                                                                                 |                |
| `status = Opened`, same `requestSeq`, any other time (G10)              | "Already opened"           | "This request has already been opened. <amount> moved to <Name>'s Everyday envelope."                                           | "Back to home" |
| `status = Cancelled`, same `requestSeq` (G9)                            | "Request cancelled"        | "<Name> cancelled this request. Nothing was moved."                                                                             | "Back to home" |
| On-chain `requestSeq` is higher than the link's                         | "This request is closed"   | "<Name> has made a newer request. Open the newest link <Name> sent."                                                            | "Back to home" |

"Back to home" goes to `/app/parent`. If the indexer is up and its `EmergencyRequest` for this `requestSeq` has `openedBy = Approval` and this person approved it, the "already opened" row may show 3.4 instead. That is optional.

**S12-20. Approve (R17, R18).** "Approve with passkey" sends `approveEmergency(accountId, requestSeq)`, with the `requestSeq` of the request shown on the page (audit change SA-01), from the trusted person's passkey account through spec 06's contract client (fee check included). The button ignores taps while pending (G11). Record the time from send to receipt. On success, show board 3.4:

- Green icon, title "Emergency envelope opened".
- "<amount> moved to <Name>'s Everyday envelope. <Name> will see it in the app." (mock-up: "$70,00 moved to Raka's Everyday envelope.")
- Rows: "Opened" with the amount; "Still locked" with the new `locked` and a lock icon; "Approved by" with "You, with a passkey".
- Detail box: "Digital dollar value" with the amount as "70,00 AUSD"; "Confirmed in" with "<seconds, one decimal> seconds" (mock-up: "0,6 seconds"); the link "View approval proof" to the transaction (spec 06).
- Primary: "Back to home" to `/app/parent`.

On a revert, re-read the contract. If the request is now opened, show "Already opened". If the signer is not trusted, show "This link is not for you". Otherwise show the mapped error with Try again. The contract checks the student account's clock for this action, not the trusted person's own (spec 15).

**S12-21. Message <Name> first (G18).** Opens `https://wa.me/?text=<encoded "Hi <Name>, I saw your Emergency request in Amplop.">` in a new window from the tap handler. No transaction and no server call. The page stays as it was, and the request is unchanged.

**S12-22. Polling.** While 3.3 is shown, re-read `emergency(accountId)` every 10 seconds. If it changes (cancelled, opened by time and finalised), switch to the matching S12-19 state.

## Interfaces used

| Kind                | Names (from 01 unless marked)                                                                                                                              |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contract writes     | `requestEmergency(uint256 amount, bytes32 reasonHash)`, `approveEmergency(uint256 accountId, uint64 requestSeq)`, `finalizeEmergency(uint256 accountId)`, `cancelEmergency()` |
| Contract reads      | `emergency`, `envelopes`, `accountInfo`, `clock`, `accountOf`, `trustedAccountOf`                                                                          |
| Enums and constants | `EmergencyStatus`, `OpenedBy`, `WAIT`                                                                                                                      |
| Events              | `EmergencyRequested` (decoded from the receipt), `EmergencyOpened`, `EmergencyCancelled`                                                                   |
| Server              | `POST /api/reason`, `GET /api/reason/[linkId]` (owned here), `GET /api/reason/current`, `GET /api/profile/[accountId]` (07), `GET /api/auth/nonce` (05)    |
| Database            | `reasons` (`link_id` pk, (`account_id`, `request_seq`) unique, `text`, `created_at`)                                                                       |
| Indexer (optional)  | `EmergencyRequest` (16)                                                                                                                                    |
| Routes              | `/app/emergency`, `/approve/<linkId>`, `/app/invite` (10), `/app/parent` (14)                                                                              |
| Env                 | `NEXT_PUBLIC_CONTRACT_ADDRESS`, `NEXT_PUBLIC_EXPLORER_TX_URL`                                                                                              |

## Screens

| Board                     | Route                           | File                                       |
| ------------------------- | ------------------------------- | ------------------------------------------ |
| 3.1 Ask to open Emergency | `/app/emergency`                | `design/boards/EmergencyRequest.dc.html`   |
| 3.2 Waiting               | `/app/emergency` (open request) | `design/boards/EmergencyWaiting.dc.html`   |
| 3.3 Approval              | `/approve/[linkId]`             | `design/boards/Approval.dc.html`           |
| 3.4 Emergency opened      | `/approve/[linkId]`, done state | `design/boards/ApprovalDone.dc.html`       |
| 3.5 No trusted person     | `/app/emergency`                | `design/boards/EmergencyNoTrusted.dc.html` |

Where a board says "Mama" or "Ibu", use the trusted person's display name (spec 10). Where it says "Raka", use the student's name. Follow `design/SPEC.md` for tokens, sizes and 44px tap targets.

## Errors and edge cases

| Case                                                   | Behaviour                                                                                                                                                                                |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Amount above locked, 0 or empty (G6)                   | Send stays off.                                                                                                                                                                          |
| Reason empty, only spaces, or over 280 (G7)            | Send stays off. The counter shows "<n>/280" in red above 280.                                                                                                                            |
| Second request while one is open (G8)                  | 3.2 shows instead of the form. The contract also refuses.                                                                                                                                |
| Request transaction fails                              | Mapped message with Try again. Nothing on chain, nothing saved.                                                                                                                          |
| Reason save fails after the request                    | 3.2 shows "The reason did not save yet." with Try again. The request stands.                                                                                                             |
| Trusted person opens the link with no reason saved yet | 3.3 shows "<Name>'s reason has not arrived yet." in place of the reason. Approve still works.                                                                                            |
| Approve tapped twice (G11)                             | One transaction. The button is disabled while pending.                                                                                                                                   |
| Link opened after it opened by itself (G10)            | "Already opened". No transaction is offered.                                                                                                                                             |
| Trusted person replaced while a request is open (G14)  | The new person gets the link from "Send the link again" and can approve. The old one gets "This link is not for you", and the contract refuses them.                                     |
| Lock-off and a request at the same time                | They exclude each other (01 §9). While lock-off waits, S12-2 shows the lock-off notice instead of the form; while a request is open, Settings keeps the lock switch disabled (13 S13-8). |
| Indexer down                                           | Every Emergency flow works. Only the optional 3.4-on-reload detail and the proof link on the opened notice may be missing.                                                               |

## Security

- The reason is private text. Only the owner and the current trusted person can read it (`signed:either` plus the account check, G12, G14). Every link id is a random 128-bit value (PRD 15).
- The server stores a reason only when its keccak256 equals the on-chain `reasonHash`, so it can never be swapped later.
- The 280 limit is checked on the server too.
- The reason renders as plain text. A reason with `<script>` or `"><img src=x onerror=alert(1)>` shows literally and causes no policy violation (PRD 15 security test).
- Approve is a passkey-signed transaction. The contract checks that the caller is the trusted person. The page hiding the button is not the control.
- Logs never contain the reason, names or signatures.

## Tests

### Unit (Vitest)

- Amount parsing: "70", "70,00", "$70,00", "1.000,50" parse; "70,001", "-5", "abc" and "" do not.
- Reason checks: 280 code points with emoji passes; 281 fails; " " fails; the hash of "Laptop broke, needs repair before next week's exams." equals viem's `keccak256(toBytes(...))`.
- Countdown format: 169,920 s → "47 h 12 min"; 3,599 s → "59 min"; 59 s → "less than a minute".
- Approval page state picker: one test per S12-19 row.

### Server (Vitest)

- `POST /api/reason`: valid → `{linkId}` with 32 hex; same body again → same `linkId`; hash mismatch → 409 `reason_mismatch`; 281 code points → 400; only spaces → 400; trusted person's signature → 403; `accountId` different from `Account` → 403; `requestSeq` not current → 409; no signature → 401; replayed nonce → 409.
- `GET /api/reason/[linkId]`: owner 200; trusted 200; another account's trusted person → 404 `reason_not_found`; trusted person after replacement → 403; unknown id → 404; malformed id → 404; the response has `Cache-Control: no-store`.
- `GET /api/reason/current`: returns the current request's row; 404 when none.
- Logs captured during these tests contain no reason text.

### End to end (PRD 14, owned here)

| ID  | Case                                                           | Expected                                                                   | Tier |
| --- | -------------------------------------------------------------- | -------------------------------------------------------------------------- | ---- |
| G1  | Raka asks for $70 with a reason; Mama approves                 | $70,00 moves to Everyday at once; $30,00 stays locked; both phones show it | 1    |
| G2  | Raka asks; nobody answers; Skip 48 hours; Raka opens the app   | It opens by itself and the money is in Everyday                            | 1    |
| G3  | Opened money is spent at the cinema straight away              | Approved from Everyday                                                     | 2    |
| G4  | A second request for the remaining $30 after the first is done | Works the same way; Emergency shows $0,00                                  | 2    |
| G5  | No trusted person: start the 48-hour wait, then skip           | Opens after 48 hours; no approval step is shown                            | 1    |
| G6  | Amount above the locked balance, or 0                          | Send stays off                                                             | 1    |
| G7  | Reason left empty, or longer than 280 characters               | Send stays off; the counter shows the limit                                | 3    |
| G8  | A second request while one is open                             | The waiting screen is shown instead of the form                            | 2    |
| G9  | Raka cancels the request                                       | Locked balance is unchanged; Mama's link says it was cancelled             | 2    |
| G10 | Mama opens the link after it opened by itself                  | "Already opened"; no second transfer                                       | 2    |
| G11 | Approve tapped twice quickly                                   | One approval                                                               | 2    |
| G12 | Someone who is not the trusted person opens the approval link  | The reason is not shown and approving is refused                           | 1    |
| G13 | Skip 47 hours only                                             | Still locked                                                               | 2    |
| G14 | The trusted person is replaced while a request is open         | The new one can approve; the old one cannot                                | 3    |
| G15 | Emergency share is 0%                                          | The home shows nothing to open                                             | 3    |
| G18 | Mama taps Message Raka first                                   | WhatsApp opens; the request is unchanged                                   | 3    |

How each is checked:

- **G1:** Raka's profile sends the request. The test reads the approval link from the WhatsApp URL it intercepts. Mama's profile opens it and approves. Then Raka's home Everyday has +$70,00 and Emergency reads $30,00. Mama's parent home totals match. The 3.4 proof link opens the transaction.
- **G2:** after the request, Raka's Settings → "Skip 48 hours" (spec 15). Reload `/app`. The hook sends `finalizeEmergency`, and Everyday shows +$70,00.
- **G5:** a student with no trusted person sees the 3.5 copy and "Start the 48-hour wait". The 3.2 timeline has no approval step. After a 48-hour skip and reload, it opens.
- **G9:** cancel, then Mama's profile opens the link and sees "Request cancelled". Locked is still $100,00.
- **G10:** after G2's opening, Mama opens the link and sees "Already opened". There is no approve button. The token balance of the contract is unchanged by the visit.
- **G11:** double-click "Approve with passkey". The chain has exactly one `EmergencyOpened` for that `requestSeq`.
- **G12:** a third profile (neither owner nor trusted) opens the link. The GET returns 403, the page shows "This link is not for you", and no reason text is in the DOM. A direct `approveEmergency` from that profile reverts.
- **G13:** the harness moves block time forward 47 hours with Anvil `evm_increaseTime(169200)` and one mined block (the one exception in 19 S19-10; whole-day skips cannot make 47 hours). Still locked, and the countdown reads "59 min" (under an hour left, minutes rounded down). The hook sends nothing.
- **G14:** with a request open, Raka replaces Mama (spec 10), skips 48 hours, and the new person accepts. The old person's link → "This link is not for you". The new person's link from "Send the link again" → approve succeeds.
- **G15:** a student with split Emergency 0% receives an allowance. The home tile reads "Nothing to open" and is not a link. `/app/emergency` shows the empty notice.
- **G18:** stub `window.open` and assert the `wa.me` URL. `emergency()` is unchanged before and after.

Every money case ends with the PRD 14 cross-check (student amounts, parent totals and contract figures agree; every proof link opens a real transaction).

## Acceptance checklist

- [ ] `/app/emergency` shows the right screen for every S12-2 row.
- [ ] A request sends one transaction and saves the reason, and the approval link opens on Mama's profile.
- [ ] Approval opens Emergency in one transaction and shows 3.4 with a working proof link.
- [ ] Opening by time works through the auto-finish hook after a skip.
- [ ] `POST`/`GET /api/reason` pass every server test, including the hash check and the 280 limit.
- [ ] The not-for-you state shows no private text.
- [ ] G1, G2, G5, G6, G12 automated and green (Tier 1). Tier 2 automated or run by hand on 12 Oct. Tier 3 run by hand once.
- [ ] The whole Emergency flow works with the indexer stopped.

## Skills to use

MONSKILLS, pinned to plugin version 0.7.2 (commit `3f8efd2`). Start with `monskill`.

- `concepts`: block time and finality (why 3.4 can wait for the receipt and show "Confirmed in"), and reading logs from a receipt.
- `gas`: limits for the four Emergency writes follow 01 §9 through 06's helper. Fees are charged on the limit.
- `indexer`: only for the optional `EmergencyRequest` details.

The PRD wins on conflict. Never use `wallet-integration` (Para) or `wallet`. Amplop signs with Mera passkeys (spec 06).

## Decisions made here

1. **Transaction first, reason second.** The server can only check the hash after the request is on chain, so the app sends `requestEmergency` and then `POST /api/reason`, with retries.
2. **The WhatsApp share is a tap, not automatic.** Browsers block pop-ups after an async transaction. 3.2 shows "Send the link to <trustedName> on WhatsApp" first, then "Send the link again on WhatsApp". The "Link sent" step completes on the first tap.
3. **No trusted person still saves the reason** (board 3.5: "Kept with the request, for your own record"). The reason is still required (PRD 14 rule 6).
4. **Character count** is Unicode code points, on the client and the server. The client trims. The server hashes exactly what it gets.
5. **Mama's page never sends `finalizeEmergency`.** After `opensAt` it shows "Already opened" and the student's app finalises (G2). This avoids an unexpected transaction on the parent's phone.
6. **Opened notice for the student** (not drawn): it shows once per request, then the form returns.
7. **"Message Raka first"** uses `wa.me/?text=` because no phone numbers are stored. Mama picks Raka in WhatsApp.
8. **Gender-neutral copy:** "<Name> will see it in the app" in place of "in his app".
9. **Body ids are decimal strings** (`accountId`, `requestSeq`), like other uint values in JSON (01 section 9).
10. **Signing in on `/approve/[linkId]` uses the shell's unlock sheet** (06 S06-10), as every other signed-in route does, in place of S12-17 step 1's own copy.
11. **A signer whose own account is a different one gets "This link is not valid or not for you."** The server answers 404 for a link of another account (S12-14 step 3), so the page cannot tell it apart from an unknown link. No reason, amount or name is shown either way.
12. **A small shared toast** (`showToast`, `Toaster` in the shell) carries "Request cancelled. Nothing was moved." and "Your Emergency money is in Everyday now."

## Additions to 01 (status)

1. Endpoint `GET /api/reason/current`: Merged into 01 (section 4).
2. Error codes: Not merged; per 01 section 9 each spec lists its own codes (`reason_invalid`, `request_not_found`, `request_not_current`, `reason_mismatch`, `reason_not_found`). `account_mismatch` is dropped for 05's `wrong_account`, and a reason row of another account answers 404 `reason_not_found` instead of reusing 05's `not_allowed`.
3. `accountId` and `requestSeq` as decimal strings: Merged into 01 (section 9).
4. Indexer `EmergencyRequest` fields: Not merged as proposed. 16 owns the names (S16-9: `closedAt`, `closedTx`, common `accountClock`, `txHash`); S12-10 uses them.
5. `useStudentAutoFinish` hook: Not merged; it is app-internal, owned here and extended by 13.
6. `localStorage` key `amplop.emergency.v1`: Merged into 01 (section 9).
