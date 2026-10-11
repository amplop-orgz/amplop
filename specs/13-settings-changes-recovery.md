# 13. Settings, rule changes and recovery

Status: Ready · PRD sources: R20, R21, R23, R24 (R22 entry point only); sections 5, 7, 8, 9, 12, 14 (H1–H6, I1–I9, G16, G17, rules 7 and 8), 15, 16 (cut order) · Depends on: 03, 05, 06, 07 (board 0.3, `/api/fund`), 10, 12 (auto-finish hook, countdown)

## Goal

Give the student one place to change the rules and see changes that are waiting. Board 4.1 Settings shows the trusted person, the Emergency lock, the split, blocked categories, the demo section and the passkey. Every change except a split before the first allowance waits 48 hours on the account clock, shows a countdown, and can be cancelled (R24).

Give a student who lost their passkey a way back (R23). They create a new passkey on a new phone (board 4.2), and the trusted person approves (board 4.3). After a 48-hour safety wait the account moves to the new passkey. The old passkey can cancel during the wait.

## In scope / Out of scope

**In scope**

- Board 4.1 Settings at `/app/settings`.
- Split change (R21) through board 0.3 in edit mode: immediate before the first allowance (H1), 48 hours after (H2), replace and restart (H4), cancel (H5).
- Emergency lock-off (R20): start, countdown, cancel, finish (G16, G17).
- The "Change" entry point for the trusted person (the flow is spec 10's) and cancelling a pending removal.
- Pending-change display with countdowns, and `cancelPending` for each `PendingKind`.
- Recovery: board 4.2 at `/recover`, board 4.3 at `/recover/[linkId]`, `POST /api/recovery`, `GET /api/recovery/[linkId]`, `POST /api/recovery/[linkId]/dismiss`, `approveRecovery`, `finishRecovery`, cancel by the old passkey.
- Where the demo section sits in Settings (its controls are spec 15's).
- E2E cases H1–H6, I1–I9, G16 and G17.

**Out of scope**

- Board 0.3's base screen and first-time `register`: spec 07. This spec only adds the edit mode.
- Inviting, replacing and removing the trusted person, `finishRemoveTrusted`, B10 and B11: spec 10.
- The parent's alerts for these changes (H6 wording): spec 14.
- View as and Skip time controls: spec 15. Language switch, passkey details and Sign out: spec 06.
- Contract behaviour: spec 03.

**Cut order (PRD 16).** If the schedule slips, cut in this order:

1. The recovery screens: S13-15 to S13-30 (`/recover`, `/recover/[linkId]`, the recovery endpoints, the old-passkey card and banner). Keep the contract functions and their Foundry tests (spec 03). If cut, `/recover` shows only the start-state text and info box from S13-16 plus "Recovery screens are not available in this preview.", with no button. The Settings info box then reads "Keep your passkey synced with your phone's password manager. Recovery screens are not available in this preview." The I cases are then covered by the contract tests only.
2. Lock-off (S13-8 to S13-10) and the trusted-person Change entry (S13-3). The lock row then shows "Locked" with no switch.

Never cut the split change.

## Requirements

### Board 4.1 Settings (`/app/settings`)

**S13-1. Reads.** Student only. Read `accountInfo(accountId)`, `clock(accountId)`, `emergency(accountId)` and `pending(accountId, k)` for all four `PendingKind` values. Re-read every 15 seconds while visible and after each transaction. Read `trustedName` per spec 10. A trusted person who opens this route goes to `/app/parent`.

**S13-2. Layout** (board 4.1, top to bottom). Top bar: back to `/app`, title "Settings".

1. The pending-recovery card (S13-21), only while a recovery is pending.
2. Card 1, rules: Trusted person (S13-3), Emergency lock (S13-8), Envelope split (S13-4), Blocked categories (a row "Blocked categories" with "Gambling" on the right; no action).
3. Card 2, demo and language: "View as <trustedName>" and "Skip time" rows, both from spec 15 and shown only in demo mode; then "Language" with the current language (spec 06).
4. Card 3: "Passkey" with "This phone" (spec 06). The board's "created 28 Sep" is left out: profiles store no date (01 §9).
5. Info box (S13-14).
6. Text button "Sign out" (spec 06).

**S13-3. Trusted person row.** Spec 10's `TrustedPersonRow` (S10-21 to S10-23) with its states, copy, Change sheet and Cancel change. This spec only places it first in card 1.

### Split change (R21)

**S13-4. Split row (R21).** First line "Envelope split". Second line: the split in force as "Food 40 · Transport 15 · Study 15 · Everyday 20 · Emergency 10". "Edit" links to `/app/setup?edit=1`.

| `pending(Split)`          | Extra line under the split                                                    | Action                                                     |
| ------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Not active                | none                                                                          | —                                                          |
| Active, `clock < readyAt` | "New split from <readyAt>: Food 50 · Transport 10 · …" and "<countdown> left" | Red text button "Cancel" sends `cancelPending(Split)` (H5) |
| Active, `clock ≥ readyAt` | none. The second line shows `pendingSplit` as the split in force.             | —                                                          |

`readyAt` comes from `pending(accountId, Split).readyAt`, which equals `accountInfo.pendingSplitStartsAt`. The new split from `accountInfo.pendingSplit`.

**S13-5. Board 0.3 in edit mode** (`/app/setup?edit=1`). Spec 07's screen with these changes:

- The top bar back link goes to `/app/settings`.
- The steppers start from `pendingSplit` when a split is waiting, otherwise from the split in force.
- Keep the intro line exactly: "Choose how each allowance is split. Changes take 48 hours, apply to future allowances only, and show in your trusted person's app."
- Hide the Emergency lock switch. The lock is changed in Settings (S13-8).
- The button reads "Save split" in place of "Continue". It is disabled when the total is not 100% (spec 07 rules) or when the values equal the split that would apply next (the pending split if one waits, else the split in force).
- One line above the button, depending on state:
  - `everDeposited` is false: "No allowance has arrived yet, so this applies at once." (H1)
  - A split is waiting: "This replaces the split waiting to start and restarts the 48 hours." (H4, PRD 14 rule 7)
  - Otherwise: "This starts on <clock + 48 hours>."

**S13-6. Saving.** "Save split" sends `saveSplit(uint8[5])` through spec 06's contract client. On success, go back to `/app/settings` with a toast:

- Immediate (`SplitSaved.immediate` is true): "Split saved. It applies from the first allowance."
- Waiting: "Split saved. It starts on <startsAt>."

The contract applies the split by time. There is no finish call. Money already in envelopes is never re-divided (R21, H3). The UI never moves balances.

**S13-7. Which split a deposit uses.** The deposit uses the split in force when it arrives (R4, C15). This is the contract's job. Settings only displays it per S13-4.

### Emergency lock-off (R20)

**S13-8. Lock row (R20).** First line "Emergency lock". A switch (`role="switch"`, `aria-label="Emergency lock"`).

| State                                                        | Switch        | Second line                                                                                                                                                | Action                                                        |
| ------------------------------------------------------------ | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| On, an Emergency request is open (`emergency.status = Open`) | On, disabled  | "You have an open Emergency request. You can switch the lock off after it ends." (01 §9)                                                                   | none                                                          |
| On, nothing pending                                          | On, enabled   | "Switching it off takes 48 hours and shows in <trustedName>'s app" (mock-up: "…shows in Mama's app"). No trusted person: "Switching it off takes 48 hours" | Tapping it opens S13-9                                        |
| Lock-off pending, `clock < readyAt`                          | On, disabled  | "Switches off on <readyAt>, <countdown> left"                                                                                                              | Red text button "Cancel" sends `cancelPending(LockOff)` (G17) |
| Lock-off ready, not finished                                 | On, disabled  | "Switching off now…"                                                                                                                                       | The auto-finish hook (S13-10)                                 |
| Off (`lockOn` is false)                                      | Off, disabled | "Off. Emergency money goes to Everyday."                                                                                                                   | none                                                          |

There is no way to switch the lock back on in this version. The contract has no function for it.

**S13-9. Confirm sheet.**

- Title: "Switch the Emergency lock off?"
- Body: "After 48 hours, all Emergency money moves to Everyday, and later Emergency shares arrive unlocked. <trustedName> will see this in the app. You can cancel during the wait." Without a trusted person, leave out the middle sentence.
- Buttons: "Switch off in 48 hours" (primary), which sends `startLockOff()`, and "Keep it locked" (text), which closes the sheet.

**S13-10. Finishing.** Add to spec 12's `useStudentAutoFinish` hook: when `pending(LockOff).active` and `clock ≥ readyAt`, send `finishLockOff(accountId)` once per session. On success show the toast "The Emergency lock is off. <moved> moved to Everyday." (`moved` from the `LockOffDone` log), and re-read. On a revert, re-read silently.

### Pending changes and cancel (R24)

**S13-11. Shared pending helper.** `usePending(accountId)` returns, for each `PendingKind`: `none`, `waiting` (`active` and `clock < readyAt`) or `ready` (`active` and `clock ≥ readyAt`), plus `readyAt` and `data`. The clock is the S12-8 ticking student clock. The countdown text is spec 12's format ("47 h 12 min").

**S13-12. Cancel actions (R24).** Every cancel sends `cancelPending(kind)` from the owner's passkey. No confirm sheet, because cancelling is safe. After success, toast and re-read.

| Kind             | Where                                     | Button            | Toast                                                                                 |
| ---------------- | ----------------------------------------- | ----------------- | ------------------------------------------------------------------------------------- |
| `Split`          | Split row                                 | "Cancel"          | "New split cancelled. The current split stays."                                       |
| `TrustedRemoval` | Trusted person row                        | "Cancel change"   | Spec 10's copy (S10-23): "Change cancelled. <trustedName> stays your trusted person." |
| `LockOff`        | Lock row                                  | "Cancel"          | "The Emergency lock stays on."                                                        |
| `Recovery`       | Pending-recovery card and its home banner | "Cancel recovery" | "Recovery cancelled. Your account stays on this passkey."                             |

A cancel shows only while the kind is `waiting`. If the contract reverts because the wait already ended, re-read and show the new state.

**S13-13. Dates.** Every date and countdown uses the student's account clock (`clock(accountId)`), so a demo skip (spec 15) moves them. The trusted person's own clock is never used.

### Settings info box

**S13-14. Info box.** With a trusted person: "Keep your passkey synced with your phone's password manager. If it is lost, <trustedName> can approve a new one for you. That takes 48 hours." (board copy). Without one: "Keep your passkey synced with your phone's password manager. With no trusted person, a lost passkey cannot be recovered."

### Recovery: new phone, `/recover` (board 4.2)

**S13-15. Entry (R23).** Spec 07's Welcome link "Lost your phone? Recover your account" goes to `/recover`. The page keeps its state in `localStorage` key `amplop.recovery` (01 §9) as `{ linkId, newOwner, createdAt, approvedAccountId? }`. Wrap every storage call in try/catch.

**S13-16. Start state** (no stored recovery). Top bar: back to `/app`, title "Recover your account".

- Text: "Lost your passkey? Create a new one on this phone. Your trusted person approves it. After a 48-hour safety wait, your envelopes move here."
- Info box: "Recovery needs the trusted person linked to your account. With no trusted person, a lost passkey cannot be recovered, and you would need to start a new account." (I8)
- Line: "Is your passkey synced with your password manager? Then just sign in." and a link "Sign in with passkey" (spec 06; I2).
- Primary: "Create a new passkey".

**S13-17. Creating the request.** On "Create a new passkey":

1. Create a passkey account with spec 06. Its address is `newOwner`.
2. If `accountOf(newOwner) ≠ 0` or `trustedAccountOf(newOwner) ≠ 0`, stop and show: "This passkey already belongs to an account, so it cannot take over another one. Sign in with it instead, or create a different passkey." (I9, PRD 14 rule 8)
3. `POST /api/fund` for `newOwner` (spec 07), so it can later send `finishRecovery`.
4. `POST /api/recovery` with `{ newOwner }`, signed by `newOwner` (S13-24). Store the result.
5. Show the waiting state.

**S13-18. Waiting state** (board 4.2). Top bar: back to `/app`, title "Recover your account". The new phone does not know whose account it is until approval, so the copy says "your trusted person".

Status card: icon, "Waiting for your trusted person", "After they approve, there is a 48-hour safety wait. Then your envelopes move to this phone."

Timeline:

| #   | Title                                                                                                                           | Second line                                   | State              |
| --- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ------------------ |
| 1   | "New passkey created on this phone"                                                                                             | `createdAt` ("Mon, 12 Oct at 09:12")          | done               |
| 2   | Before the first share tap: "Send the recovery link to your trusted person". After: "Recovery link sent to your trusted person" | "Shared on WhatsApp" after the tap            | done after the tap |
| 3   | "Waiting for approval"                                                                                                          | "They approve with their passkey"             | current            |
| 4   | "48-hour safety wait"                                                                                                           | "Your old passkey can cancel during the wait" | future             |
| 5   | "Envelopes move to this phone"                                                                                                  | "The old passkey stops working"               | future             |

Line: "Your card stays paused on this phone until the move is done. Money in your envelopes is not touched."

Buttons:

- Before the first tap, primary: "Send the recovery link on WhatsApp". After it, secondary: "Send the link again on WhatsApp". The link is `https://<host>/recover/<linkId>`, opened as in S12-11 with the text "I lost my Amplop passkey. Please approve my new one: <link>".
- Red text button "Cancel recovery": clears `amplop.recovery` and returns to the start state. No server call.

**S13-19. Watching for approval.** Every 10 seconds read `recoveryAccountOf(newOwner)` from the contract (01 §3).

- When it returns an account id `A ≠ 0`: store `approvedAccountId = A`. Read `pending(A, Recovery)` and `clock(A)`. Step 3 becomes done ("Approved by your trusted person"). Step 4 becomes current: "Moves on <readyAt>, <countdown> left". Replace "Cancel recovery" with the line "Changed your mind? Cancel from your old passkey's Settings."
- In demo mode, add: "Demo: use Skip 48 hours in Settings on the old passkey's profile." (Only the owner can skip, spec 15.)

**S13-20. Finishing on the new phone.**

- When `clock(A) ≥ readyAt`, send `finishRecovery(A)` from `newOwner` once per session.
- When `accountOf(newOwner) = A`, the move is done. Clear `amplop.recovery`, tell spec 06 that `newOwner` is now the student profile, show the toast "Your account is on this phone now.", and go to `/app`. Every balance, hold and open request is unchanged (I1).
- On load, if `accountOf(newOwner) = A` already, go straight to `/app`.
- If `approvedAccountId` is set but `recoveryAccountOf(newOwner)` returns 0 and `accountOf(newOwner)` is 0, show: title "Recovery cancelled", body "The old passkey cancelled this recovery. Nothing moved." and the button "Start again", which clears local state (I3).
- If 7 days pass from `createdAt` with no approval, show "This recovery link has expired." and "Start again".

### Recovery: old passkey

**S13-21. Pending-recovery card (Settings, I3).** Shown at the top of 4.1 while `pending(Recovery)` is `waiting` or `ready`. Red-tinted card (`#FFE7E4` background, `#A51F1E` title):

- Title: "Your account is set to move to a new passkey"
- Body: "<trustedName> approved a recovery. Your envelopes move to the new passkey on <readyAt> (<countdown> left). If this was not you, cancel now."
- Button (secondary, red text): "Cancel recovery" sends `cancelPending(Recovery)`. Shown while `waiting` only.

**S13-22. Home banner.** While a recovery is pending, board 2.2 (spec 11 slot S11-10) shows one line in the same red tint: "Your account moves to a new passkey on <readyAt>." with a "Review" link to `/app/settings`.

**S13-23. After the move (I4).** The old passkey's `accountOf` is 0. Spec 06 shows its "No account for this passkey" state on every `/app` route. Every `signed:owner` request from it fails with 403 (spec 05), including checkout (spec 09, PRD 14 rule 4).

### Recovery: server

**S13-24. `POST /api/recovery`.** Auth `signed:address`, action `recovery.create`. Body `{ "newOwner": "0x…" }` (strict zod, a 20-byte hex address). Handler at `app/api/recovery/route.ts`, logic in `lib/server/recovery/`.

1. Spec 05 verifies the signature and nonce. `newOwner` (lowercased) must equal the message `Address`, else 403 `address_mismatch`. The message `Account` must be `0`, else 400 `bad_input`.
2. `accountOf(newOwner) = 0` and `trustedAccountOf(newOwner) = 0`, else 409 `recovery_new_owner_has_account` ("This passkey already belongs to an account."). (I9)
3. If a `recoveries` row exists for `newOwner` with `dismissed_at` null and `created_at` within 7 days, return its `linkId`.
4. Otherwise insert `{ link_id: randomBytes(16) hex, new_owner, created_at }` and return `200 { "linkId": "<32 hex>" }`.
5. Rate limit: at most 3 new rows per `newOwner` per day (`rate_limits` bucket `recovery:<address>`), else 429.

**S13-25. `GET /api/recovery/[linkId]`.** Auth `signed:trusted`, action `recovery.read`.

1. `linkId` must match `^[0-9a-f]{32}$`, else 404 `recovery_not_found`.
2. Spec 05 checks that the signer is the trusted person of the message `Account` (`trustedAccountOf(signer) = Account ≠ 0`). Anyone else gets 403 (I6). The link is not tied to an account on the server, because the server cannot know whose account a new passkey belongs to.
3. Missing row: 404 `recovery_not_found`. Older than 7 days: 404 `recovery_expired`.
4. Return `200 { "newOwner", "createdAt": "<ISO>", "dismissed": <bool> }` with `Cache-Control: no-store`.

**S13-26. `POST /api/recovery/[linkId]/dismiss`.** Auth `signed:trusted`, action `recovery.dismiss`, body `{}`. Same checks as S13-25. Set `dismissed_at = now()` if it is null (idempotent). Return `200 { "ok": true }`.

### Recovery: trusted person, `/recover/[linkId]` (board 4.3)

**S13-27. Loading.** Parent screen style.

1. No passkey session: spec 06's sign-in prompt, with "Account recovery" above it.
2. Signer `S`. `T = trustedAccountOf(S)`. If `T = 0`: title "This link is not for you", body "Only a trusted person can approve a recovery." No other details. (I6)
3. `GET /api/recovery/[linkId]` signed with `Account = T`. A 403 gives the same not-for-you state. A 404 gives "This link is not valid or has expired."
4. Read `pending(T, Recovery)`, `pending(T, TrustedRemoval)`, `clock(T)`, `accountOf(newOwner)`, `trustedAccountOf(newOwner)`, `recoveryAccountOf(newOwner)` and the student's name (spec 07 profile). If `recoveryAccountOf(newOwner)` is another account, the approve button is replaced by "This new passkey is waiting for another recovery. Ask <Name> to create a fresh one."

**S13-28. States** (checked in this order).

| Condition                                                          | Title                         | Body                                                                                                                                                           | Buttons                                            |
| ------------------------------------------------------------------ | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `dismissed` (I7)                                                   | "Dropped"                     | "You said this was not <Name>. Nothing changes on <Name>'s account."                                                                                           | "Back to home"                                     |
| `accountOf(newOwner) = T`                                          | "Done"                        | "<Name>'s account has moved to the new passkey."                                                                                                               | "Back to home"                                     |
| `accountOf(newOwner) ≠ 0` or `trustedAccountOf(newOwner) ≠ 0` (I9) | "This passkey cannot be used" | "This new passkey already belongs to an account, so it cannot take over <Name>'s. Ask <Name> to create a fresh passkey."                                       | "Back to home"                                     |
| `pending(T, TrustedRemoval)` active                                | "Not possible right now"      | "<Name> is changing the trusted person, so a recovery can't be approved until that ends." (01 §9)                                                              | "Back to home"                                     |
| `pending(T, Recovery)` active with `data` = `newOwner`             | "Approved"                    | "<Name>'s account moves to the new passkey on <readyAt>, unless <Name> cancels from the old passkey. If this was not <Name>, tell them to cancel in Settings." | "View approval proof" (when known), "Back to home" |
| Otherwise                                                          | Board 4.3 (S13-29)            |                                                                                                                                                                |                                                    |

"Back to home" goes to `/app/parent`.

**S13-29. Board 4.3.**

- Kicker: "Account recovery". Heading: "<Name> is asking to move their account to a new phone".
- Rows: "Asked from" with "A new passkey"; "Sent" with `createdAt` ("Mon, 12 Oct at 09:12"); "If you approve" with "Moves on <clock(T) + 48 hours>" ("Wed, 14 Oct at 09:20").
- When another recovery is already pending for a different new owner, add a row: "This replaces another recovery you approved earlier." (A second approval replaces the first and restarts the wait, 01.)
- Warning box: "Only approve if you have spoken to <Name> yourself. Whoever holds the new passkey will control <Name>'s envelopes."
- Line: "After you approve there is a 48-hour wait. <Name> can cancel it from the old phone if this was not them."
- Primary: "Approve with passkey". Helper: "Your phone will ask for your fingerprint, face or screen lock."
- Secondary: "Call <Name> first". It opens `https://wa.me/?text=<encoded "Hi <Name>, did you ask to recover your Amplop account?">` (no phone numbers are stored).
- Red text button: "This was not <Name>". It sends S13-26 and then shows "Dropped". The request is dropped (I7).

**S13-30. Approve.** Sends `approveRecovery(T, newOwner)` from the trusted person's passkey through spec 06's contract client. The button ignores taps while pending. On success, show the "Approved" state with "View approval proof". On a revert, re-read and show the matching state, or the mapped error with Try again.

## Interfaces used

| Kind                | Names (from 01 unless marked)                                                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contract writes     | `saveSplit`, `startLockOff`, `finishLockOff`, `approveRecovery`, `finishRecovery`, `cancelPending`                                                            |
| Contract reads      | `accountInfo`, `pending`, `clock`, `emergency`, `accountOf`, `trustedAccountOf`, `recoveryAccountOf`                                                          |
| Enums and constants | `PendingKind { Split, TrustedRemoval, LockOff, Recovery }`, `WAIT`                                                                                            |
| Events              | `SplitSaved`, `LockOffStarted`, `LockOffDone`, `RecoveryApproved`, `RecoveryDone`, `PendingCancelled`                                                         |
| Server              | `POST /api/recovery`, `GET /api/recovery/[linkId]`, `POST /api/recovery/[linkId]/dismiss` (owned here); `POST /api/fund`, `GET /api/profile/[accountId]` (07) |
| Database            | `recoveries` (`link_id` pk, `new_owner`, `dismissed_at`, `created_at`), `rate_limits`                                                                         |
| Web app             | `useStudentAutoFinish` (12), countdown format (12), board 0.3 component (07), change-trusted flow (10), View as and Skip time rows (15)                       |
| Routes              | `/app/settings`, `/app/setup`, `/recover`, `/recover/<linkId>`, `/app/invite`, `/app/parent`                                                                  |

## Screens

| Board                | Route               | File                                    |
| -------------------- | ------------------- | --------------------------------------- |
| 4.1 Settings         | `/app/settings`     | `design/boards/Settings.dc.html`        |
| 0.3 in edit mode     | `/app/setup?edit=1` | `design/boards/Setup.dc.html`           |
| 4.2 Recover          | `/recover`          | `design/boards/Recover.dc.html`         |
| 4.3 Approve recovery | `/recover/[linkId]` | `design/boards/RecoverApproval.dc.html` |

Where a board says "Mama" or "Ibu", use `trustedName`. The PRD wins over the old mock-up line that said a lost passkey cannot be recovered: recovery exists (R23). Follow `design/SPEC.md` for tokens, 44px tap targets and the switch style.

## Errors and edge cases

| Case                                                    | Behaviour                                                                                                                                                                              |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Split saved with total ≠ 100                            | Save stays off (spec 07 rules). The contract also refuses.                                                                                                                             |
| Second split while one waits (H4)                       | Replaces it. The countdown restarts from the new save.                                                                                                                                 |
| Lock-off and an open Emergency request                  | They exclude each other (01 §9): the lock switch is disabled while a request is open (S13-8), and `/app/emergency` shows a notice instead of the form while lock-off waits (12 S12-2). |
| Cancel tapped just after the wait ended                 | The contract refuses. Re-read and show the finished state.                                                                                                                             |
| Old passkey cancels the recovery (I3)                   | The new phone shows "Recovery cancelled". The old passkey keeps the account.                                                                                                           |
| Trusted person never approves (I5)                      | The new phone waits. Skipping time changes nothing, because no wait has started.                                                                                                       |
| Link opened by someone who is not a trusted person (I6) | "This link is not for you". The GET is refused with 403.                                                                                                                               |
| New passkey already owns an account (I9)                | Refused on the new phone (S13-17), on the server (409) and on the approval page. The contract also reverts.                                                                            |
| No trusted person (I8)                                  | The start screen explains it. Nobody can approve.                                                                                                                                      |
| Recovery approved for a passkey Mama did not mean       | She cannot cancel on chain. The "Approved" state tells her to have the student cancel from the old passkey.                                                                            |
| Indexer down                                            | Settings, split, lock-off and recovery all work from contract reads.                                                                                                                   |
| Recovery and trusted-person removal at once             | They exclude each other (01 §9): Change is disabled while a recovery waits (10 S10-21), and the approval page refuses while a removal waits (S13-28).                                  |

## Security

- Every change is a passkey-signed transaction from the owner. Approvals come from the trusted person. The contract enforces who may call (PRD 7, rule 5). Hidden buttons are never the control.
- The 48-hour wait protects against a stolen phone and against a false recovery. The old passkey can cancel during the wait (R23, R24).
- `POST /api/recovery` must be signed by the new address itself (`signed:address`). Recovery links are random 128-bit ids. They can be read only by a trusted person (`signed:trusted`).
- The new passkey must not own an account or be a trusted person (PRD 14 rule 8), checked in the app, on the server and in the contract.
- Names render as plain text. Logs never include names, addresses paired with names, or signatures.

## Tests

### Unit and component (Vitest)

- `usePending`: `none`, `waiting` and `ready` from mocked reads and clock.
- Split row: shows the pending split and its countdown while waiting, and the new split as current once ready.
- Edit-mode notes: the H1, H4 and default lines each appear in the right state. Save is disabled for an unchanged split.
- Lock row: all five S13-8 states.
- `/recover`: start, waiting, approved, cancelled and expired states from mocked reads.
- `/recover/[linkId]`: every S13-28 row.

### Server (Vitest)

- `POST /api/recovery`: valid → `{linkId}`; repeat → same `linkId`; `newOwner` different from the signer → 403; signer owns an account → 409; signer is a trusted person → 409; no signature → 401; replayed nonce → 409; fourth link in a day → 429.
- `GET /api/recovery/[linkId]`: trusted person of any account → 200; owner or stranger → 403; unknown → 404; older than 7 days → 404 `recovery_expired`.
- `POST …/dismiss`: trusted → `{ok:true}` and `dismissed` becomes true; second call still 200; stranger → 403.

### End to end (PRD 14, owned here)

| ID  | Case                                                                         | Expected                                                                                   | Tier |
| --- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---- |
| H1  | Change the split before any allowance has arrived                            | Takes effect at once                                                                       | 2    |
| H2  | Change the split after an allowance; Skip 48 hours; send another             | The first allowance keeps its old split; the second uses the new one                       | 1    |
| H3  | Money already in envelopes after a split change                              | Not re-divided                                                                             | 2    |
| H4  | A second change while one is waiting                                         | Replaces the first and restarts the 48 hours                                               | 3    |
| H5  | Change cancelled during the wait                                             | The old split stays                                                                        | 3    |
| H6  | Mama's app during the wait                                                   | An alert says a new split was saved and when it starts                                     | 2    |
| I1  | New profile, new passkey, recovery link to Mama, she approves, Skip 48 hours | The new passkey controls the account; every balance, hold and open request is unchanged    | 1    |
| I2  | The same passkey used from a new profile, as a synced passkey would be       | Signs straight in; no recovery is needed                                                   | 3    |
| I3  | The old passkey cancels during the wait                                      | The old passkey keeps the account; the new one gets nothing                                | 1    |
| I4  | The old passkey after the move                                               | Refused everywhere, including checkout                                                     | 2    |
| I5  | Mama never approves                                                          | Nothing happens, however much time is skipped                                              | 2    |
| I6  | Someone other than the trusted person opens the recovery link                | Refused                                                                                    | 2    |
| I7  | Mama taps This was not Raka                                                  | The request is dropped                                                                     | 3    |
| I8  | No trusted person                                                            | The recover screen says recovery is not possible and why                                   | 3    |
| I9  | The new passkey already owns another account                                 | Refused                                                                                    | 3    |
| G16 | Switch the Emergency lock off, Skip 48 hours                                 | The whole balance moves to Everyday; the next allowance's Emergency share arrives unlocked | 2    |
| G17 | Lock-off cancelled during the wait                                           | Emergency stays locked                                                                     | 3    |

How each is checked:

- **H1:** a new account edits the split to 50/10/10/20/10 before any deposit. `accountInfo.split` equals it and no pending exists. Settings shows it.
- **H2:** after C1, save 50/10/10/20/10. Settings shows "New split from …". Skip 48 hours and send another Rp16.500.000. The first schedule's parts are 400/150/150/200; the second's are 500/100/100/200, with Emergency $100,00.
- **H3:** the five home amounts are identical just before and just after the save, and after the wait.
- **H4:** save split A, skip 1 day, save split B. `readyAt` = the clock at B's save + 48 hours. `pendingSplit` = B.
- **H5:** cancel. No pending. After a 48-hour skip and a deposit, the old split is used.
- **H6:** Mama's parent home shows spec 14's split alert with the start time.
- **I1:** Raka's second profile opens `/recover`, creates a passkey and posts the link. Mama's profile opens `/recover/<linkId>` and approves. Raka's original profile uses Skip 48 hours. The new profile finishes, lands on `/app`, and every envelope amount, held purchase and open Emergency request is unchanged.
- **I2:** a second browser profile with the same virtual-authenticator credential signs in to the same account. `/recover` is never needed.
- **I3:** after Mama approves, the original profile's Settings shows the pending-recovery card. "Cancel recovery" succeeds. After a 48-hour skip the new profile shows "Recovery cancelled" and `accountOf(newOwner)` is 0.
- **I4:** after I1, the old profile sees "No account for this passkey". A signed `card/authorize` from it returns 403.
- **I5:** without approval, skip 14 days on the old profile. `accountOf(newOwner)` stays 0. The new phone still waits.
- **I6:** a stranger profile opens the link: "This link is not for you", and the GET returned 403.
- **I7:** Mama taps "This was not Raka". The page shows "Dropped". A reload shows "Dropped". The GET returns `dismissed: true`.
- **I8:** `/recover` shows the I8 info box text.
- **I9:** a profile that already owns an account starts recovery and is refused in the app. A direct `POST /api/recovery` returns 409.
- **G16:** switch the lock off and confirm. Settings shows the countdown. Skip 48 hours and reload: the hook finishes lock-off, Everyday gains the whole Emergency balance and Emergency shows $0,00. The next allowance's Emergency share goes to Everyday (C16 behaviour).
- **G17:** cancel during the wait. After a 48-hour skip, `lockOn` is still true and Emergency is unchanged.

Every money case ends with the PRD 14 cross-check.

## Acceptance checklist

- [ ] Settings matches board 4.1 and shows every pending change with a countdown and a Cancel.
- [ ] Split edit saves at once before the first allowance and waits 48 hours after it.
- [ ] Lock-off starts, counts down, cancels, and finishes through the auto-finish hook.
- [ ] Recovery works end to end on two profiles, including cancel by the old passkey.
- [ ] Recovery endpoints pass every server test.
- [ ] H2, I1, I3 automated and green (Tier 1). Tier 2 automated or run by hand on 12 Oct. Tier 3 run by hand once.

## Skills to use

MONSKILLS, pinned to plugin version 0.7.2 (commit `3f8efd2`). Start with `monskill`.

- `concepts`: how waits use block time plus the skip, and reading `pending` right after a receipt.
- `gas`: set limits for `saveSplit`, `startLockOff`, `cancelPending`, `approveRecovery` and `finishRecovery` by the 01 §9 rule through 06's helper.

The PRD wins on conflict. Never use `wallet-integration` (Para) or `wallet`. Amplop uses Mera passkeys (spec 06).

## Decisions made here

1. **Split edit reuses board 0.3** at `/app/setup?edit=1`, so no new route is needed. The lock switch is hidden there and lives in Settings.
2. **The lock cannot be switched back on.** No contract function exists for it.
3. **Lock-off finishes through the auto-finish hook** when the student opens the app, like Emergency.
4. **The new phone says "your trusted person"**, not "Mama", because it cannot know the account before approval.
5. **The new phone learns of the approval from the contract** through `recoveryAccountOf(newOwner)`. The server cannot know the account.
6. **"Cancel recovery" on the new phone** only forgets the request locally before approval. After approval, only the old passkey can cancel (R23).
7. **"Call Raka first"** opens WhatsApp, because no phone numbers are stored.
8. **Recovery links last 7 days**, like invites. A new passkey gets at most 3 links a day.
9. **Demo skip for recovery** comes from the old passkey's profile, because only an owner can skip (spec 15). The new phone shows a demo hint.
10. **Only a pending recovery shows on the home screen** (security). Other pending changes show in Settings.
11. **Gender-neutral copy:** "move their account", "if this was not them".
12. **The Passkey row shows "This phone" without a date.** Local profiles hold no creation date (01 §9), so the board's "created 28 Sep" is not shown.
13. **The trusted-person row is spec 10's `TrustedPersonRow`**, so Settings and 10 cannot drift apart.

## Additions to 01 (status)

1. Contract read for a pending recovery's account: Merged into 01 (sections 3 and 9) as `recoveryAccountOf(address)`, not `recoveryOf`; 03 defines it (S03-44 to S03-46).
2. Board 0.3 edit mode at `/app/setup?edit=1`: Merged into 01 (section 9).
3. Error codes: Not merged; per 01 section 9 each spec lists its own codes (`recovery_new_owner_has_account`, `recovery_not_found`, `recovery_expired`). `address_mismatch` is 07's code with the same meaning.
4. Recovery link lifetime of 7 days and 3 links a day: Not merged; server rules owned here (S13-24, S13-25).
5. `useStudentAutoFinish` entry for `finishLockOff`: Not merged; app-internal, between 12 and this spec.
6. `localStorage` key `amplop.recovery`: Merged into 01 (section 9).
