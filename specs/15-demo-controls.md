# 15. Demo controls

Status: Ready · PRD sources: section 12 (all), section 3 ("Time"), 14 (K1–K4, D7), 15 (threat row "Use test-only tools on a real deployment", security test "With DEMO_MODE off…") · Depends on: 03 (`skipDays`, `demoMode`), 05 (`demo` auth kind, server demo flag), 06 (View as mechanism, contract client), 08 (simulate endpoint, board 1.3), 09 (collect endpoint, board 2.6), 11 (board 2.10, release maths)

## Goal

A weekly release and a 48-hour wait cannot be shown in a 3-minute video or tried by a judge in one sitting. The demo deployment adds four clearly labelled controls: Simulate payment, View as Mama / View as Raka, Skip time and Collect now. A banner says so on every app screen. A real deployment has none of them. Its routes answer "not found" and its contract refuses to skip. Hiding a button is never the control (PRD 15).

## In scope / Out of scope

**In scope**

- The demo flag on the client, its link to the server flag and the contract switch, and a build guard.
- The demo banner.
- The Simulate payment button on board 1.3.
- The View as buttons on boards 4.1 and 1.1 (and the approval page, spec 12).
- Skip time on board 4.1: "Skip to next Monday" and "Skip 48 hours".
- The Collect now button on boards 2.6 and 2.10.
- The demo-off build (K4) and the PRD 15 security test.
- E2E cases K1–K4.

**Out of scope**

- What happens when a payment is simulated (`POST /api/topup/[orderId]/simulate`, C6): spec 08.
- What happens on collect (`POST /api/card/collect`, E4, E15): spec 09.
- How two passkey profiles live on one phone and how switching signs in: spec 06.
- `skipDays` behaviour and its Foundry tests: spec 03. Deploying with `demoMode`: spec 04.
- The server-side `demo` auth kind and 404 handling: spec 05. This spec states what must be true and tests it.
- D7 is owned by spec 11. This spec defines the tap queue that D7 relies on.
- README wording about real and demo values: spec 18.

## Requirements

### The demo flag

**S15-1. One flag per side.**

| Side     | Source                                                                                                    | Meaning                                                                                                                                      |
| -------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser  | `NEXT_PUBLIC_DEMO_MODE === "true"`, read once in `apps/web/src/lib/client/demo.ts` as the constant `DEMO` | Shows demo controls and the banner. Inlined at build time, so with `false` every demo component is dead code and is dropped from the bundle. |
| Server   | `DEMO_MODE === "true"`, through spec 05's demo flag helper                                                | Demo routes work. When off, they answer 404 (01 section 4, auth kind `demo`).                                                                |
| Contract | Immutable `demoMode` set at deploy (01 section 3), read through the `demoMode()` getter                   | `skipDays` works. When off, it always reverts.                                                                                               |

**S15-2. Build guard.** A `prebuild` script in `apps/web` fails the build with a clear message when `NEXT_PUBLIC_DEMO_MODE` and `DEMO_MODE` disagree. Both must be `"true"`, or both must be unset or `"false"`. This stops a build that shows buttons whose routes 404.

**S15-3. Contract check.** On first load, the app reads `demoMode()` once and caches it for the session. The Skip time row renders only when `DEMO` is true and `demoMode()` is true. On the server, spec 05's start-up check logs `demo_mismatch` at level `error` and sends the alert of the same name when `DEMO_MODE` and `demoMode()` disagree (S05-32).

### Demo banner (K2)

**S15-4. Banner.** While `DEMO` is true, every app screen shows a thin banner at the very top, above the page's own top bar:

- Text exactly: "Demo mode: payments are simulated and time can be skipped"
- Bahasa Indonesia: "Mode demo: pembayaran disimulasikan dan waktu bisa dilompati" (spec 06 i18n key `demo.banner`).
- Style and placement: spec 06's `DemoBanner` (S06-41). Not dismissible.
- "Every app screen" means every route under `/app`, plus `/invite/[inviteId]`, `/approve/[linkId]`, `/recover` and `/recover/[linkId]`, including loading, error and not-found states. The landing page `/` does not show it (it has its own test-mode footer line, spec 17).
- Put it in the shared app layout from spec 06, so no screen can forget it.

### Simulate payment (board 1.3)

**S15-5.** On board 1.3, while the order status is `waiting` and `DEMO` is true, spec 08's screen renders the `SimulatePaymentButton` from this spec:

- An info box: "Test mode: no real money moves. Tap Simulate payment to pretend the transfer was made."
- A button: "Simulate payment (test mode)".

A tap sends `POST /api/topup/[orderId]/simulate` with `{}` as a signed request (action `topup.simulate`, signed by the trusted person). The button ignores taps while the request is pending. On success it hands the response (same shape as `GET /api/topup/[orderId]`) to spec 08's screen, which moves to "Payment received, sending to Raka" and then Allowance sent. On error it shows the message from the error body with Try again. Spec 08 makes double taps deposit once (C6).

### View as (boards 4.1, 1.1)

**S15-6. Where.**

| Place                                                    | Control                                                                                                                       | Shown when                                                        |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 4.1 Settings, card 2 (spec 13)                           | Row: "View as <trustedName>" (mock-up: "View as Mama"), second line "Demo only: try both roles on one phone", button "Switch" | `DEMO` and spec 06 reports another passkey profile on this device |
| 4.1, no other profile yet                                | Same row, second line "Demo only: open the invite link on this phone to add <trustedName>", no button                         | `DEMO` and there is no other profile                              |
| 1.1 Parent home (spec 14 S14-7)                          | Text button under "Send allowance": "Demo only: view as <Name>" (mock-up: "Demo only: view as Raka")                          | `DEMO` and another profile exists                                 |
| `/approve/[linkId]` opened by the owner (spec 12 S12-17) | Secondary button "View as <trustedName>"                                                                                      | `DEMO` and another profile exists                                 |

**S15-7. What it does.** The control calls spec 06's profile switch for the other profile on this device. Spec 06 signs in with that profile's own passkey, so each profile is a real, separate account (PRD 12). Afterwards, the app goes to that profile's home: `/app` for a student, `/app/parent` for a trusted person. On the approval page, it stays on the same `/approve/<linkId>` URL and reloads as the new profile. If the passkey prompt is cancelled, nothing changes and the current profile stays signed in. Spec 06's switch must refuse to run when `DEMO` is false.

### Skip time (board 4.1)

**S15-8. Row.** In card 2 of 4.1, shown per S15-3: "Skip time", second line "Demo only: jump to next Monday or 48 hours ahead", button "Skip". Only the student's Settings has it. The parent home has no Skip, because only an account owner can skip (01 section 3).

**S15-9. Sheet.** "Skip" opens a bottom sheet:

- Title: "Skip time".
- "Now: <account clock as 'Wed, 7 Oct at 14:05'>".
- Button "Skip to next Monday" with a second line "<target date as 'Mon, 12 Oct'>".
- Button "Skip 48 hours" with a second line "<target as 'Fri, 9 Oct at 14:05'>".
- Muted text: "Only your account's clock moves. The real app has no skip."
- Text button "Close".

The sheet stays open after a skip, so the student can skip again. "Now" updates after each skip.

**S15-10. How many days.** `today = dayNumber(clock(accountId))` (spec 11 S11-1).

- "Skip to next Monday": `numDays = 7 − weekdayIndex(today)`. This is 1 to 7. On a Monday it is 7, the next Monday. The time of day is kept: Wed 14:05 becomes Mon 14:05. That is after Monday 00:00 UTC, so the Monday share is released.
- "Skip 48 hours": `numDays = 2`.

Then call `skipDays(numDays)`. `numDays` is always between 1 and 7, inside the contract's limit of 1 to `MAX_SKIP_DAYS_PER_CALL` (14).

**S15-11. One skip per tap (D7).** Each tap adds one job to a queue. Jobs run one at a time:

1. Read `clock(accountId)` fresh.
2. Compute `numDays` (S15-10) from that fresh clock.
3. Send `skipDays(numDays)` through spec 06's contract client (fee check included). Wait for the receipt.
4. Re-read, update "Now", and tell the app to refresh its contract reads. Spec 12's auto-finish hook then runs, which may finalise an Emergency or finish a lock-off.

While jobs remain, the tapped button shows "Skipping…" and a count "1 more queued". Two quick taps on "Skip to next Monday" from Wednesday give two transactions and end on the Monday after next. A tap never sends two transactions, and a tap is never dropped. Releases are computed from the clock on read, so a release cannot be counted twice. If a job fails, the queue stops, the sheet shows the mapped error with Try again, and later jobs are dropped with the line "Skips after the failed one were not sent."

**S15-12. Whose clock moves (K3).**

- `skipDays` adds whole days to the caller's own account clock (`skipSeconds[accountId]`). Other accounts' dates and releases do not move.
- Skipping a student's clock does not move the trusted person's own account clock, if they have one.
- When the trusted person acts on the student's account (`approveEmergency`, `approveRecovery`), the contract uses the student account's clock. The trusted person's screens about the student (spec 12 countdowns, spec 13 "Moves on", spec 14 alerts) read `clock(studentAccountId)`.
- During a recovery, only the old passkey's profile can skip the account's clock (spec 13).

### Collect now (boards 2.6, 2.10)

**S15-13. Button.** A secondary button "Demo only: collect now" (board 2.6 copy) shows when `DEMO` is true, the purchase's contract state is `Held`, and `clock(accountId) < createdAt + HOLD_PERIOD` (collect works only before the hold period ends, 01 §9; after it, spec 09's sweep releases the hold):

- On board 2.6 (spec 09's Approved screen), under the hold explanation.
- On board 2.10 (spec 11's purchase detail), in the slot under the status card.

A tap sends `POST /api/card/collect` with `{ "purchaseId": "<32 hex>" }` as a signed request (action `card.collect`, signed by the owner, auth `demo`). The button ignores taps while pending. On success, the status badge becomes "Collected" and a "View transaction proof" link for the returned `txHash` appears. The button disappears once the state is no longer `Held`. Spec 09 decides how much is collected and what happens to any difference.

### Demo-off build (K4)

**S15-14. With demo off** (`NEXT_PUBLIC_DEMO_MODE` and `DEMO_MODE` unset or `"false"`, contract deployed with `demoMode = false`):

| Control          | Required result                                                                                                                                                                     |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Banner           | Not rendered.                                                                                                                                                                       |
| Simulate payment | No button. `POST /api/topup/[orderId]/simulate` answers 404 to every caller, signed or not.                                                                                         |
| Collect now      | No button. `POST /api/card/collect` with an owner signature answers 404. The cron path (`Authorization: Bearer <CRON_SECRET>`) still works, because it is the real timer (spec 09). |
| Skip time        | No row. `skipDays` reverts on the contract for every caller and every value.                                                                                                        |
| View as          | No row or link. Spec 06's switch refuses. There is no server route for View as.                                                                                                     |

**S15-15. Bundle check.** `apps/web/scripts/check-demo-off-bundle.mjs` runs after the demo-off build that K4 uses (19 S19-8) and searches its browser bundle for these strings, failing if any are found: "Demo mode: payments are simulated", "Simulate payment (test mode)", "Demo only:", "Skip to next Monday".

## Interfaces used

| Kind     | Names (from 01 unless marked)                                                                                                                                |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Contract | `skipDays(uint16 numDays)`, `clock(uint256)`, `MAX_SKIP_DAYS_PER_CALL`, `DaysSkipped` event, `demoMode()`                                                    |
| Server   | `POST /api/topup/[orderId]/simulate` (08, auth `demo`, action `topup.simulate`), `POST /api/card/collect` (09, auth `demo` or `cron`, action `card.collect`) |
| Env      | `NEXT_PUBLIC_DEMO_MODE`, `DEMO_MODE`, `CRON_SECRET`                                                                                                          |
| Web app  | Profile switch (06), contract client (06), shared app layout (06), `dayNumber` and `weekdayIndex` (11), auto-finish hook (12)                                |
| Boards   | 1.3 `TopUpWaiting.dc.html`, 2.6 `Approved.dc.html`, 2.10 `PurchaseDetail.dc.html`, 4.1 `Settings.dc.html`, 1.1 `ParentHome.dc.html`                          |

## Screens

This spec adds controls to other specs' screens. It owns no route.

| Control          | Board            | Copy                                                                                                                      |
| ---------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Banner           | every app screen | "Demo mode: payments are simulated and time can be skipped"                                                               |
| Simulate payment | 1.3              | "Test mode: no real money moves. Tap Simulate payment to pretend the transfer was made." / "Simulate payment (test mode)" |
| View as          | 4.1, 1.1         | "View as Mama" / "Demo only: try both roles on one phone" / "Switch"; "Demo only: view as Raka"                           |
| Skip time        | 4.1              | "Skip time" / "Demo only: jump to next Monday or 48 hours ahead" / "Skip"; sheet: "Skip to next Monday", "Skip 48 hours"  |
| Collect now      | 2.6, 2.10        | "Demo only: collect now"                                                                                                  |

## Errors and edge cases

| Case                                                   | Behaviour                                                                                       |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Skip while the fee balance is low                      | Spec 06's fee check tops up first and shows "Getting ready", then the skip goes through.        |
| Skip on a Monday                                       | 7 days, to the next Monday.                                                                     |
| Contract deployed without demo but `DEMO` true         | The Skip row is hidden (S15-3). The server logs and alerts `demo_mismatch`.                     |
| Simulate on an expired or paid order                   | The button is not shown outside `waiting`. If raced, spec 08's response decides the state.      |
| Collect now on a purchase whose hold was just released | The server refuses (E17, spec 09). The button shows the message and disappears after a re-read. |
| View as when the other passkey prompt is cancelled     | No change. The current profile stays signed in.                                                 |
| Two tabs skipping at once                              | Each tap sends one skip. The clock moves once per transaction (L8).                             |

## Security

- Hiding a button is never the control. With `DEMO_MODE` off, the demo routes return 404 (spec 05), and the contract was deployed with `demoMode = false`, which cannot change later (PRD 15).
- The demo-off bundle contains no demo components (S15-15), so no hidden button can be re-enabled from the browser.
- `skipDays` can move only the caller's own account clock, and only while `demoMode` is true. It cannot change another account's waits.
- Simulate and Collect now are signed requests with a single-use nonce, like every private action (01 section 4).

## Tests

### Unit and component (Vitest)

- `numDays` for "Skip to next Monday": Monday → 7, Tuesday → 6, Wednesday → 5, Sunday → 1. "Skip 48 hours" → 2.
- The skip queue: two taps give two jobs that run in order, each reading a fresh clock. A failure stops the queue.
- Banner: rendered in the app layout when `DEMO` is true, absent when false, absent on `/`.
- Each control renders only under its S15-6, S15-8 and S15-13 conditions.

### Server (Vitest)

- The PRD 15 security test: with `DEMO_MODE` off, `POST /api/topup/[orderId]/simulate` returns 404 (no signature, and a valid trusted signature), and `POST /api/card/collect` with a valid owner signature returns 404. With `DEMO_MODE` off, `POST /api/card/collect` with the cron bearer still returns 200 for a held purchase.

### Contract (Foundry, run here as a cross-check; owned by 03)

- With `demoMode = false`, `skipDays(1)` reverts.
- `skipDays` by one owner leaves another account's `clock()` unchanged.

### Build

- The `prebuild` guard fails when the two flags disagree.
- The bundle search finds none of the S15-15 strings in a demo-off build.

### End to end (PRD 14, owned here)

| ID  | Case                                            | Expected                                                                                                              | Tier |
| --- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---- |
| K1  | View as Mama, then View as Raka, on one profile | Each switch signs in as the other real account                                                                        | 1    |
| K2  | The demo banner                                 | Shown on every app screen while demo controls exist                                                                   | 3    |
| K3  | Skip time by one account                        | Another account's dates and releases do not move                                                                      | 2    |
| K4  | A build with demo mode off                      | No Simulate, Skip, Collect now or View as buttons; their addresses answer "not found"; skipping fails on the contract | 2    |

How each is checked:

- **K1:** in one browser profile holding both passkeys (B1 done on the same profile), Settings → "Switch". The signed-in address is Mama's and `/app/parent` shows. "Demo only: view as Raka" → the address is Raka's and `/app` shows. Each signed request after a switch recovers to that profile's own address.
- **K2:** visit every app route in its main state (and one error state) and assert the exact banner text is the first text in the page. Run once by hand on both phones.
- **K3:** two students, A and B, each with an allowance. A skips to next Monday. A's available grows by one share. B's `clock()`, header date, "Next release" and amounts are unchanged. A trusted person linked to A sees A's new date in A's countdowns.
- **K4:** a second build and deployment on Anvil with both flags off and the contract deployed with `demoMode = false`. No banner, no Simulate, no Skip row, no Collect now, no View as. The two demo API routes return 404. A direct `skipDays(1)` from the student reverts.

The PRD 15 security test ("With `DEMO_MODE` off, Simulate payment and Collect now return 404, and `skipDays` reverts") is the server test above plus the K4 contract call.

## Acceptance checklist

- [ ] The banner shows on every app screen in demo mode and nowhere in a demo-off build.
- [ ] Simulate payment, View as, Skip time and Collect now work in demo mode with the exact board copy.
- [ ] "Skip to next Monday" lands on the next Monday at the same time of day, and two taps give two skips.
- [ ] The build fails when the two flags disagree.
- [ ] The demo-off build has no demo controls, the demo routes 404, and `skipDays` reverts.
- [ ] K1 automated and green (Tier 1). K3, K4 automated or run by hand on 12 Oct. K2 run by hand once.

## Skills to use

MONSKILLS, pinned to plugin version 0.7.2 (commit `3f8efd2`). Start with `monskill`.

- `concepts`: block time versus the account clock, and why each skip waits for its receipt before the next one reads the clock.
- `gas`: the `skipDays` gas limit follows 01 §9 through 06's helper.
- `tooling-and-infra`: Anvil time control for the K3 and K4 runs, and the second demo-off deployment.

The PRD wins on conflict. Never use `wallet-integration` (Para) or `wallet`. Amplop uses Mera passkeys (spec 06).

## Decisions made here

1. **"Skip to next Monday" keeps the time of day.** It adds `7 − weekdayIndex` whole days, so it lands on Monday at the current time, after the 00:00 UTC release. On a Monday it goes a full week.
2. **One skip per tap, queued.** Taps are never dropped and never doubled. Each job reads a fresh clock (D7).
3. **The Skip row also needs the contract's `demoMode()`.** A mismatched build hides it instead of showing a button that always fails.
4. **A build guard** refuses a build where the browser and server flags disagree.
5. **The banner covers every route outside the landing page**, including the invite, approval and recovery pages, and their loading and error states.
6. **Collect now also shows on board 2.6.** The board draws it there as well as on purchase detail (PRD 12).
7. **View as with no second profile** shows a hint row in Settings instead of a dead button.
8. **Demo-off Collect now** returns 404 only for the signed owner call. The cron call keeps working, because it is the real collection timer.

## Additions to 01 (status)

1. Contract read `demoMode()`: Merged into 01 (section 3).
2. Build guard (`NEXT_PUBLIC_DEMO_MODE` must equal `DEMO_MODE`): Not merged; it is this spec's `prebuild` check (S15-2), and no other spec reads it.
3. i18n key `demo.banner`: Not merged; app-internal (06 owns the message files, S06-34).
4. Server log event `demo_mode_mismatch`: Not merged. 05 already logs and alerts the same condition as `demo_mismatch` (S05-32), and this spec now uses that name.
