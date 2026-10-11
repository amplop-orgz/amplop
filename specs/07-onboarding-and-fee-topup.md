# 07. Onboarding and fee top-up

Status: Ready · Source: PRD 2, 5 (boards 0.1, 0.2, 0.2b, 0.3, 0.6, 0.7), 6, 8, 9, 14 (A1 to A17), 15, 17 · Depends on: 03, 05, 06

## Goal

A new student opens the app, creates a passkey, types a name, sets the split and lands on a home screen with five envelopes, with a registered account on the chain and enough test MON for about 20 actions. They never see MON, a fee or a wallet prompt. This spec also builds the fee top-up endpoint every account uses later, and the profile endpoints that keep the student's name off the chain.

## In scope / Out of scope

**In scope**

- Boards 0.1 Open in browser, 0.2 Welcome, 0.2b Your name, 0.3 Set up envelopes, 0.6 Home waiting, 0.7 Home nobody invited.
- The sign-up order, the onboarding draft, and resuming after a reload (A13).
- The split editor (shared with 13).
- Registration with `register(split)`, and `saveSplit(split)` before any allowance has arrived.
- `POST /api/fund` with every server rule, and its tables.
- `POST /api/profile` and `GET /api/profile/[accountId]`.
- The "Getting ready" waits (A15, A16).
- End-to-end cases A1 to A17, the fund server tests, and the PRD 15 fund security test.

**Out of scope**

- Passkey, profile storage, write helper, signed client and gate detection mechanics (06).
- The invite screen and linking (10). The "Skip for now" on 0.4 belongs to 10 and lands on this spec's 0.7.
- Student home after an allowance arrives, board 2.2 (11).
- Changing the split after an allowance has arrived, which is pending for 48 hours (13). This spec builds the editor that 13 reuses.
- Sign out (13 places the button in Settings; it calls 06's `signOut`).
- Recovery from Welcome's "Lost your phone?" link (13).

## Requirements

### A. Sign-up order

- **S07-1** The steps run in this order (PRD 9):
  1. Welcome: "Create a passkey" calls `createPasskeyAccount("student")` (06). 06 saves a local profile with the label "Amplop student".
  2. Straight away, without waiting, the app starts `ensureFunded(address)` (06), which calls `POST /api/fund`. The promise is kept in the onboarding store in memory. Navigation does not wait for it (PRD 9 step 5: the top-up lands while the user is on set-up).
  3. Go to `/app/name`. The student types a name. Continue saves it in the draft (S07-3) and goes to `/app/setup`.
  4. Set-up: the student sets the split. Continue waits for funding (S07-20), then sends `register(split)` with `sendUserTx` (06).
  5. When the receipt arrives, read `accountId` from the `AccountCreated` event in the receipt. Call `POST /api/profile` with the name. Update the local profile label to `shortName(name)`. Delete the draft.
  6. Go to `/app/invite` (10). From there the student invites someone, or taps "Skip for now" and lands on 0.7.
- **S07-2** A new trusted person never goes through this flow. They sign up on the invite page (10), and type nothing (PRD 9).
- **S07-3** The onboarding draft is kept in `sessionStorage` key `amplop.onboarding.<credentialId>` as `{ name?: string, split?: [n, n, n, n, n] }`. It holds no key or address. It is written on every Continue and on every split change, read when a step loads, and deleted after step 5. Going Back through the steps keeps every typed value (A14).

### B. Resuming at the right step (A13)

- **S07-4** When `/app`, `/app/name` or `/app/setup` loads, the step is chosen by this table. A missing session first shows 06's unlock sheet on the same route.

| Session      | Account and name               | Draft            | Result                                                                                                                                                                                                        |
| ------------ | ------------------------------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Role none    | no account                     | no name in draft | `/app/name` (from `/app/setup`, redirect there)                                                                                                                                                               |
| Role none    | no account                     | name in draft    | `/app/name` and `/app/setup` both allowed; `/app` shows Welcome in its "Finish setting up" state (S07-9)                                                                                                      |
| Student      | `GET /api/profile` returns 404 | any              | `/app/name` in account mode: Continue saves the name straight away with `POST /api/profile`, then goes to `/app/invite` if the account has no trusted person and `inviteOf` shows no invite ever, else `/app` |
| Student      | name saved                     | any              | `/app` (home). `/app/name` redirects to `/app`. `/app/setup` opens in edit mode (S07-17).                                                                                                                     |
| Trusted only | any                            | any              | `/app/parent` (06 guard)                                                                                                                                                                                      |

- **S07-5** A reload after the passkey and before the name shows the unlock sheet on `/app/name`. After the passkey prompt the student is back on the name step, not on Welcome (A13).

### C. Board 0.1 Open in browser

- **S07-6** Shown in place of any shell route when 06's `isChatAppBrowser` is true (PRD 9; 06 S06-49). Layout and copy exactly as `Gate.dc.html`:
  - A 64px white circle with a globe icon.
  - Heading "Open in Chrome or Safari to continue".
  - Body "This link opened inside a chat app. Amplop's passkey only works in your phone's browser."
  - A list card of three numbered rows: "Copy the link with the button below.", "Open Chrome or Safari.", "Paste the link in the address bar."
  - At the bottom, a primary button with a copy icon, "Copy link". It copies `location.href` exactly, including any `#k=` fragment, with 06's `copyText`, then reads "Link copied" for 3 s (A6). If copying fails, the full address is shown in a read-only field that is selected on tap.
  - Below it, a text button "Try here anyway" (06 S06-49).

### D. Board 0.2 Welcome

- **S07-7** Shown at `/app` when there is no session, or the session has role none. Layout and copy as `Welcome.dc.html`:
  - Top row: the colour logo, 28px tall, `role="img" aria-label="Amplop"`; on the right, `LanguageToggle` "EN" / "ID" (06).
  - Heading "Allowance that arrives every week, not gone in the first one."
  - Line "For students studying far from home, and the parents who send the money."
  - Three solid tiles: Food colour "Money splits into envelopes for each purpose."; Transport colour "A new share is released every Monday."; Emergency colour "The Emergency envelope opens with a trusted person."
  - Primary button with a fingerprint icon: "Create a passkey". Under it: "Use your fingerprint, face or screen lock. No password."
  - Secondary button "Sign in with passkey".
  - Muted line "Invited by someone? Open the link they sent you."
  - Text link "Lost your phone? Recover your account" → `/recover` (13).
- **S07-8** Button behaviour:

| Action               | While running                                    | Success                                                                          | Failure                                                                                                                                                                 |
| -------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create a passkey     | label "Creating your passkey…", both buttons off | S07-1 steps 2 and 3                                                              | cancelled: `InlineMessage` "The passkey prompt was closed. Try again when you're ready." and the button works again (A4); unsupported or failed: the 06 S06-36 sentence |
| Sign in with passkey | label "Signing in…"                              | student → `/app` home; trusted only → `/app/parent`; role none → S07-9 card (A7) | as above                                                                                                                                                                |

- **S07-9** Welcome with a session but role none replaces the two buttons with a card:
  - If this credential has an onboarding draft, or was created in this tab: title "Finish setting up", line "Your passkey is ready. Add your name and envelopes to finish.", primary "Continue" (→ `/app/name`, or `/app/setup` if the draft has a name), text button "Use a different passkey".
  - Otherwise (A7): title "No account for this passkey", line "Set up a new account with it, or open the invite link you were sent.", primary "Set up a new account" (→ `/app/name` with this session), text button "Use a different passkey".
  - "Use a different passkey" calls `signOut()`, then `signInWithPasskey()` with the browser's chooser.
- **S07-10** Passkey support (A5). When 06's `checkPasskeySupport` is not ok, "Create a passkey" and "Sign in with passkey" are disabled, and a line under them reads: "This browser can't create a passkey. Open Amplop in Chrome on Android or Safari on iPhone (iOS 18 or later)." The check runs when the page loads, before any tap (PRD 9).
- **S07-11** Language (A17). The toggle switches every string on the screen at once and stores the choice (06 S06-34). Money formats stay `$1.000,00` and `Rp16.500.000` in both languages.

### E. Board 0.2b Your name

- **S07-12** Route `/app/name`. Layout and copy as `Name.dc.html`:
  - `TopBar` with Back (→ `/app`) and the title "Your name".
  - Heading "What should we call you?"
  - `TextField` with label "Your name", `autocomplete="name"`, `autocapitalize="words"`, `enterkeyhint="next"`. Value from the draft, or from the saved profile in account mode.
  - Help text "Shown on your card and on the invite you send. Nothing else is asked."
  - "On your card": a `DemoCard` preview with `last4` "••••" and the typed name in capitals. While the field is empty, the card shows "YOUR NAME" at 60% opacity. A long name is cut with an ellipsis on one line (A9).
  - Primary "Continue".
- **S07-13** Validation uses `normalizeName` from `packages/shared` (06 S06-31): 1 to 60 grapheme clusters after trimming, any script, plain text.
  - Continue is off while the result is `empty`, including spaces only (A8).
  - `too_long` shows "Use 60 characters or fewer." under the field, and Continue is off.
  - `bad_chars` shows "Remove the hidden formatting characters." and Continue is off.
  - When more than 50 graphemes are typed, a counter "{n}/60" shows under the field.

  The name is stored as the normalised value, exactly as typed otherwise (A9: saved in full). It is never put on the chain (PRD 8).

### F. Board 0.3 Set up envelopes, and the split editor

- **S07-14** Route `/app/setup`. Layout and copy as `Setup.dc.html`:
  - `TopBar` with Back (→ `/app/name` during sign-up; → `/app/settings` in edit mode) and the title "Set up your envelopes".
  - Line "Choose how each allowance is split. Changes take 48 hours, apply to future allowances only, and show in your trusted person's app."
  - A list card with five rows in envelope order. Each row has a 12px square in the envelope colour, the name, a sub line, and a `Stepper` with the value between. Sub lines: Food, Transport, Study "Released weekly"; Everyday "Other shops · backup if another runs short"; Emergency "Locked".
  - A "Total" row with the sum.
  - An "Emergency lock" row with a `Switch` and the sub line "Opens with your trusted person's approval, or after 48 hours".
  - A "Blocked" row with "Gambling" on the right.
  - Primary "Continue".
- **S07-15** Split editor rules (R4, PRD 14):
  - Start values: the draft's split; else the account's current split in edit mode; else the default 40 / 15 / 15 / 20 / 10.
  - Each tap changes a value by 5.
  - Minus is disabled at 0%. Plus is disabled when the value is 100% or the total is 100% or more (A11). No value can go below 0 or above 100.
  - 0% is allowed for any envelope, Emergency included, and 100% is allowed for one envelope (A12).
  - The total is the sum of the five values. When it is not 100, the total turns `#A51F1E` and a line under it reads "Must add up to 100%. Now {sum}%." (`aria-live="polite"`), and Continue is off (A10). A total of 105% cannot be reached with the buttons (A11). It can come only from a changed draft, and is handled the same way.
  - Steppers have the accessible names "Less Food", "More Food" and so on (06 S06-39).
- **S07-16** The Emergency lock switch is shown on and disabled during sign-up (`aria-checked="true"`, `aria-disabled="true"`), with a second sub line "You can switch it off later in Settings. That takes 48 hours." `register` takes no lock setting, and the lock starts on (R7, R20). Switching it off is 13's job.
- **S07-17** Continue:

| Mode                                                                | Contract call                                             | After the receipt                                    |
| ------------------------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------- |
| Sign-up (role none)                                                 | `register(split)`                                         | S07-1 step 5, then `/app/invite`                     |
| Edit, no allowance ever arrived (`accountInfo.everDeposited` false) | `saveSplit(split)`. It takes effect at once (R21, 01 §3). | Back to `/app/settings` with the line "Split saved." |
| Edit, an allowance has arrived                                      | 13 owns this path: pending for 48 hours, its own copy     | 13                                                   |

Button labels while running: "Getting ready…" during funding, "Creating your account…" (sign-up) or "Saving…" (edit) during sending and confirming.

- **S07-18** If `register` fails in simulation with the "already has an account" error (a second tab, or a lost receipt that actually landed), the app re-reads `accountOf(address)`. If it is above 0, it carries on with step 5 as if the send had succeeded (L8, L4). If `POST /api/profile` fails after a successful `register`, the screen shows "Your name wasn't saved. Try again." with Try again, which repeats only the profile call. The draft is kept until it succeeds. A reload resumes through S07-4's "404" row.

### G. Boards 0.6 and 0.7, home before the first allowance

- **S07-19** At `/app`, for a student whose `accountInfo.everDeposited` is false. Data:
  - From the contract: `accountInfo` (split, trusted, lockOn, everDeposited), `inviteOf(accountId)`, `clock(accountId)`.
  - From the server: `GET /api/profile/[accountId]` for the name, and `GET /api/invite/latest` (10) for the trusted person's name T. If no name is known, T is "your trusted person".

  Layout as `HomeEmpty.dc.html` and `HomeNoTrusted.dc.html`:
  - Header "Hi, {shortName}" with the muted line "No allowance yet". A 44px round Settings link (`aria-label="Settings"`, → `/app/settings`).
  - A white card titled "Waiting for the first allowance", with a body and a button that depend on the state:

| State                                                                           | Board | Body                                                                                                      | Button                                                                                                          |
| ------------------------------------------------------------------------------- | ----- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Trusted person linked (`trusted ≠ 0`)                                           | 0.6   | "{T} is linked. When money arrives it splits into your envelopes."                                        | Secondary, WhatsApp icon: "Send top-up link to {T}". An `<a>` to `whatsappUrl` (not secret) with S07-22's text. |
| No trusted person, invite open (`inviteKey ≠ 0`, not used, `clock < expiresAt`) | 0.6   | "{T} has been invited. When money arrives it splits into your envelopes."                                 | Secondary "Send a new invite link" → `/app/invite`. 10 makes a new invite, which replaces the old one (B7).     |
| No trusted person, no open invite                                               | 0.7   | "Nobody is invited yet. Invite a parent or another trusted person so they can send your first allowance." | Primary "Invite a trusted person" → `/app/invite`                                                               |

- Five `EnvelopeTile`s, 64px tall, in envelope order. The name is on the left. On the right are two lines: the available amount `$0,00` (bold, tabular) and the share of each allowance: "40% of each allowance" for Food, then the bare percentage for the others ("15%"). Emergency reads "{n}% · locked" while `lockOn` is true, "{n}%" otherwise.
- `TabBar` with "Envelopes" selected.
- **S07-20** While the state is "invited" or "nobody", the home refetches `accountInfo` and `inviteOf` every 10 s and when the window regains focus. So "{T} is linked" appears soon after the trusted person accepts (B1, owned by 10).
- **S07-21** When `everDeposited` becomes true, `/app` shows 11's board 2.2 instead.
- **S07-22** Top-up link share text (no secret, so `wa.me`):
  - English: "Hi {T}, you can send my allowance in Amplop here: {origin}/app/parent/send"
  - Bahasa Indonesia: "Halo {T}, kirim uang sakuku lewat Amplop di sini: {origin}/app/parent/send"

### H. Getting ready (A15, A16)

- **S07-23** The register step awaits the funding promise started in S07-1 step 2 (06's `ensureFunded` is single-flight, so no second call is made). While it waits:
  - The button reads "Getting ready…".
  - After 2 s, the line "Getting your account ready. This takes a few seconds." appears under it.
  - If the fund call failed with `502` or a network error, 06 retries it up to 3 times (1 s, 3 s, 9 s). If it then works, the step goes through without the student doing anything (A15).
- **S07-24** If funding finally fails, the step stops with an `InlineMessage` and a Try again button. It never fails silently (A16). Sentences by code:

| Code                                                                         | Sentence                                                                                               |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `fund_limit_address`, `fund_limit_device`, `fund_limit_ip`, `fund_daily_cap` | "Amplop can't get new accounts ready right now because today's limit was reached. Try again tomorrow." |
| `fund_unavailable`, network failure after retries                            | "We can't get your account ready right now. Try again in a few minutes."                               |

### I. `POST /api/fund`

- **S07-25** Contract (01 §4): auth `signed:address`, action `fund`. Body `{ address }` parsed with strict zod (`address`: 05's `zAddress`, lowercase). Response `200 { status: "sent", txHash }` or `200 { status: "not_needed" }`. The client also sends the header `Amplop-Device: <32 lowercase hex>`. It is generated once with `crypto.getRandomValues` and kept in `localStorage` key `amplop.device`; if storage is blocked, a new value is made per tab. A missing or malformed header returns `400 bad_device` (01 §9).
- **S07-26** The handler in `app/api/fund/route.ts` stays thin. The logic is a pure function `decideFund(input) → decision` in `lib/server/fund/decide.ts`, plus a runner in `lib/server/fund/run.ts`. Steps, in order:
  1. 05 checks the signature, nonce, time and the global per-IP POST limit. Failures return `401` or `409` before this code runs.
  2. `lowercase(body.address)` must equal the signed `Address`. If not: `403 address_mismatch`. This is the PRD 15 rule "the address being funded must sign the request".
  3. Read fees with the server chain client (05): `estimateFeesPerGas()` gives `maxFeePerGas`. `unit = TYPICAL_ACTION_GAS × maxFeePerGas` (01 §9).
  4. Read `balance` of the address. If `balance ≥ 3 × unit`, return `200 { status: "not_needed" }`. No counter changes.
  5. `amount = 20 × unit − balance` (top up to about 20 actions' worth).
  6. Open a database transaction and take `pg_advisory_xact_lock(hashtext('amplop:fund'))`, so checks, the send and the counters are one serial step and the fee sponsor's nonce never clashes. Then check, in this order:

| Check                                                                                                          | Limit                 | Refusal                                               |
| -------------------------------------------------------------------------------------------------------------- | --------------------- | ----------------------------------------------------- |
| Per IP (client IP as 05 extracts it), bucket `fund:ip:<ip>`, window = current UTC day                          | 30 top-ups            | `429 fund_limit_ip`                                   |
| Per address, from `funding` (`day`, `count_today`)                                                             | 5 top-ups per UTC day | `429 fund_limit_address`                              |
| Per device, only when the address has no `funding` row yet (a new address), bucket `fund:device:<id>`, UTC day | 20 new addresses      | `429 fund_limit_device`                               |
| Global, `funding_daily.wei_sent + amount`                                                                      | 50 MON per UTC day    | `429 fund_daily_cap`, plus alert `fund_cap_reached`   |
| Fee sponsor reserve: `sponsorBalance − amount − 21000 × maxFeePerGas`                                          | must stay ≥ 10 MON    | `502 fund_unavailable`, plus alert `fund_sponsor_low` |

7. Send from `FEE_SPONSOR_PRIVATE_KEY`: `{ to: address, value: amount, gas: 21000n, maxFeePerGas, maxPriorityFeePerGas }`. A plain MON transfer always costs 21,000 gas, so the limit is set to that and not estimated (MONSKILLS `gas`). If the send throws, roll back and return `502 fund_unavailable`.
8. In the same transaction, upsert `funding` (`day` = today, `count_today` = old + 1 or 1 on a new day, `last_funded_at` = now, `total_wei` += amount), add `amount` to `funding_daily.wei_sent` for today, and add 1 to the IP bucket and (for a new address) the device bucket in `rate_limits`. Commit.
9. Outside the lock, wait up to 10 s for the receipt. Return `200 { status: "sent", txHash }` whether or not the wait finished. The client waits for the receipt itself (06 S06-24).

- **S07-27** Limits and amounts are constants in `lib/server/fund/config.ts`: `ADDRESS_PER_DAY = 5`, `NEW_ADDRESSES_PER_DEVICE_PER_DAY = 20`, `PER_IP_PER_DAY = 30`, `DAILY_CAP_WEI = 50 MON`, `RESERVE_FLOOR_WEI = 10 MON`. Tests inject other values. "Day" is the server's UTC date, not an account clock.
- **S07-28** Fee sponsor wallet (PRD 6, reserve balance rule). Below 10 MON, Monad makes MON transfers out of the wallet revert, except one every 3 blocks. So the wallet must start each day with at least 10 MON plus the 50 MON daily budget: 60 MON. The reserve check in S07-26 step 6 keeps every send above the floor. A non-blocking alert `fund_sponsor_budget_low` fires when `sponsorBalance − amount < 10 MON + (DAILY_CAP_WEI − wei_sent_today − amount)`, meaning the wallet cannot cover the rest of today's budget.
- **S07-29** Alerts go through 05's `sendAlert(kind, text)` (S05-40: `{ "text" }` to `ALERT_WEBHOOK_URL`, 3 s timeout, at most once per kind per hour, logged at `warn` when the variable is unset). They are sent after the response is decided and never delay or change it. Texts:
  - `fund_cap_reached`: "Amplop fee sponsor: daily cap of 50 MON reached on {day}. Top-ups are stopped until 00:00 UTC."
  - `fund_sponsor_low`: "Amplop fee sponsor: balance {balance} MON is at the 10 MON reserve floor. Top-ups are stopped. Refill now."
  - `fund_sponsor_budget_low`: "Amplop fee sponsor: balance {balance} MON will not cover the rest of today's budget."
- **S07-30** Logs (JSON, 05's logger) record the decision code, amount, tx hash and address only. Never the IP in full (05's rule), never the signature or the device id.

### J. Profile endpoints

- **S07-31** `POST /api/profile`: auth `signed:owner`, action `profile.save`. Body `{ accountId: string, name: string }` with strict zod; `accountId` is a decimal string (01 §9).
  - `accountId` (05's `zAccountId`) must equal the signed `Account`, else `403 wrong_account` (05's account resolver, S05-12). 05 checks that the signer owns it.
  - `name` goes through `normalizeName`. On failure: `400 name_invalid` with `message` "Use 1 to 60 characters, without hidden formatting characters."
  - Upsert `profiles` (`account_id`, `name`, `updated_at`). Return `{ ok: true }`. Saving the same name twice is harmless (L4).
- **S07-32** `GET /api/profile/[accountId]`: auth `signed:either`, action `profile.read`. The path `accountId` must equal the signed `Account`, else `403 wrong_account` (S05-12). 05 checks the signer is the owner or the trusted person. Returns `{ name }`, or `404 profile_not_found`.
- **S07-33** The name is personal data. It is never written to the chain, logs, analytics or error reports. It renders only as React text (06). The invite page reads it on the server for `GET /api/invite/[inviteId]` (10).

## Interfaces used

- 01 §3: `register(uint8[5])`, `saveSplit(uint8[5])`, `AccountCreated`, reads `accountOf`, `accountInfo`, `inviteOf`, `clock`.
- 01 §4: `POST /api/fund` (`fund`), `POST /api/profile` (`profile.save`), `GET /api/profile/[accountId]` (`profile.read`), error shape, auth kinds. Rate limit table `rate_limits`.
- 01 §5: tables `profiles`, `funding`, `funding_daily`, `rate_limits`.
- 01 §7: `FEE_SPONSOR_PRIVATE_KEY`, `MONAD_RPC_URL`, `MONAD_RPC_URL_FALLBACK`, `ALERT_WEBHOOK_URL`, `DATABASE_URL`.
- 06: `createPasskeyAccount`, `signInWithPasskey`, `signOut`, `checkPasskeySupport`, `sendUserTx`, `ensureFunded`, `api`, `normalizeName`, `shortName`, `formatUsd`, `whatsappUrl`, `copyText`, `isChatAppBrowser`, components.
- 05: signed request verification, server chain clients, client IP, logger, `rate_limits` helper.
- 10: `GET /api/invite/latest` for the trusted person's name on 0.6.

## Screens

| Board                    | Route                     | File                    |
| ------------------------ | ------------------------- | ----------------------- |
| 0.1 Open in browser      | any shell route, in place | `Gate.dc.html`          |
| 0.2 Welcome              | `/app`                    | `Welcome.dc.html`       |
| 0.2b Your name           | `/app/name`               | `Name.dc.html`          |
| 0.3 Set up envelopes     | `/app/setup`              | `Setup.dc.html`         |
| 0.6 Home, waiting        | `/app`                    | `HomeEmpty.dc.html`     |
| 0.7 Home, nobody invited | `/app`                    | `HomeNoTrusted.dc.html` |

Where the boards say "Ibu", use the trusted person's name. Where they say a lost passkey cannot be recovered, follow the PRD: recovery exists (13).

## Errors and edge cases

| Case                                                              | Behaviour                                                                                                                         |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Passkey prompt cancelled on Welcome                               | S07-8, A4.                                                                                                                        |
| Passkey made but tab closed before the name                       | Next visit: Sign in → role none → "No account for this passkey" → "Set up a new account" continues with the same passkey (S07-9). |
| Reload on name or set-up                                          | S07-4, S07-5 (A13).                                                                                                               |
| Funding slow or fails once                                        | S07-23 (A15).                                                                                                                     |
| Funding limit or cap reached                                      | S07-24 (A16).                                                                                                                     |
| `register` lands but the receipt is lost                          | S07-18: re-read `accountOf`, continue.                                                                                            |
| Profile save fails after `register`                               | S07-18: Try again; on reload, account mode on `/app/name`.                                                                        |
| Two tabs both press Continue on set-up                            | 06 lock: one send; the other sees "already has an account", re-reads and continues (S07-18).                                      |
| Name with `<script>` or `"><img src=x onerror=alert(1)>`          | Accepted as plain text; shows as typed; no CSP report (PRD 15).                                                                   |
| Address already funded above 3 actions                            | `not_needed`; no counters change.                                                                                                 |
| Trusted person opens `/app/setup`                                 | 06 guard: `/app/parent`.                                                                                                          |
| Student with an account opens `/app/name` and their name is saved | redirect `/app`.                                                                                                                  |

## Security

- `/api/fund` funds only the address that signed (S07-26 step 2). There are four limits: per address, per device (client-reported, so never the only limit), per IP, and a global daily cap of 50 MON with an alert (PRD 15 threat table).
- The fee sponsor key is only in `FEE_SPONSOR_PRIVATE_KEY`, never `NEXT_PUBLIC_`. It does nothing but send MON. Its sends are serialised with an advisory lock.
- The reserve floor check stops the sponsor from emptying itself below 10 MON.
- The name never goes on the chain and is never logged. It renders as plain text. The `profiles` table is reached only through Drizzle with parameters.
- Profile reads need a signature from the owner or the trusted person (01 auth kinds).
- PRD 15 security tests owned here: "A top-up for an address that did not sign is refused. Once the daily cap is reached, top-ups stop and the alert fires." The name half of "A name or reason containing `<script>` … shows as plain text, and the page logs no policy violation."

## Tests

**Unit**

- `decideFund`: every row of the S07-26 table, with injected counts, balances and gas price. `not_needed` at exactly `3 × unit`. Amount equals `20 × unit − balance`. A new day resets the address count. An existing address from a new device does not use the device count.
- Split editor reducer: steps of 5; minus off at 0; plus off at total 100 and at value 100; 0% and 100% accepted; total 95 and 105 mark the total and turn Continue off.
- Resume table S07-4: every row.
- Share text builder: both languages, the URL ends `/app/parent/send`.

**Server (Vitest, against a test Postgres and Anvil)**

- Fund, unsigned → `401`. Signed by address A with body address B → `403 address_mismatch`, no MON moves (**PRD 15 security test**).
- Fund, balance at or above 3 actions' worth → `not_needed`; `funding` unchanged.
- Fund, six calls for one address in one UTC day, with the address's balance set back to 0 (`anvil_setBalance`) before each call → the sixth is `429 fund_limit_address`.
- Fund, 21 new addresses with one device id → the 21st is `429 fund_limit_device`. A 22nd address with a new device id from the same IP passes, until the IP limit.
- Fund, 31 top-ups from one IP → `429 fund_limit_ip`.
- Fund, `funding_daily.wei_sent` set to 49.9 MON and an amount of 0.2 MON → `429 fund_daily_cap`, no send, and exactly one webhook call. A second refusal within the hour makes no second call (**PRD 15 security test**).
- Fund, sponsor balance set so the send would leave 9.9 MON → `502 fund_unavailable`, alert `fund_sponsor_low`, no send.
- Fund, ten parallel requests for one funded-to-zero address → at most five sends, and the sponsor's nonces are consecutive with no gaps or clashes.
- Fund, broadcast throws → `502`, no counter changed.
- Fund, missing `Amplop-Device` → `400 bad_device`; an extra body field → `400`; a replayed nonce → `409` (05).
- Profile save: trims, keeps 60 graphemes, rejects 61, empty, spaces only and `‮`; a trusted person's signature → `403`; a body `accountId` different from the signed `Account` → `403 wrong_account`; `<script>alert(1)</script>` is stored and returned unchanged.
- Profile read: owner and trusted get `{ name }`; a stranger → `403`; an account with no profile → `404 profile_not_found`.

**End-to-end (Playwright, spec 19 harness).** Expected results and tiers are copied from PRD 14.

| ID  | Kind   | Case                                                                            | Expected                                                                                    | Tier | How                                                                                                                                              |
| --- | ------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| A1  | Normal | New student: create passkey, type name, keep the default split, skip the invite | Account exists on the chain, fee top-up has arrived, home 0.7 shows five envelopes at $0,00 | 1    | Raka's profile. Check `accountOf > 0`, the MON balance > 0, the `funding` row, five tiles reading `$0,00`, and the "Nobody is invited yet" card. |
| A2  | Normal | Sign out, then Sign in with passkey                                             | Same account and the same home                                                              | 1    | Sign out in Settings (13), Sign in on Welcome; the same `accountId` and the home heading "Hi, Raka".                                             |
| A3  | Normal | Change the split to 50 / 10 / 10 / 20 / 10 and continue                         | The saved split matches; total shows 100%                                                   | 1    | During sign-up; `accountInfo.split` equals `[50,10,10,20,10]`; "Total 100%" was shown.                                                           |
| A4  | Edge   | Passkey prompt is cancelled                                                     | Stays on Welcome with a plain message; a second try works                                   | 2    | Virtual authenticator set to refuse user verification once.                                                                                      |
| A5  | Edge   | Browser without passkey support                                                 | Welcome names a browser to use; the button is off                                           | 3    | By hand on a browser without PRF (or an init script that deletes `PublicKeyCredential`).                                                         |
| A6  | Edge   | Link opened inside a chat app's browser                                         | Board 0.1 appears; Copy link copies the address                                             | 2    | WhatsApp user agent; clipboard permission granted; the clipboard text equals the page URL.                                                       |
| A7  | Edge   | Sign in with a passkey that has no account                                      | "No account for this passkey" with a way to create one                                      | 2    | A passkey whose sign-up was abandoned before set-up; new page; Sign in.                                                                          |
| A8  | Edge   | Name left empty, or only spaces                                                 | Continue stays off                                                                          | 1    |                                                                                                                                                  |
| A9  | Edge   | Name of 60 letters; name with non-Latin letters                                 | Saved in full; shortened with an ellipsis on the card; nothing overflows                    | 3    | 60 Latin letters; "ꦫꦏ" (Javanese) and "رَاكَا"; `GET /api/profile` returns them unchanged.                                                       |
| A10 | Edge   | Split totals 95% or 105%                                                        | Continue stays off and the total is marked                                                  | 1    | 95% with the buttons; 105% through a changed draft.                                                                                              |
| A11 | Edge   | Minus at 0% and plus when the total is 100%                                     | Both buttons are off; no envelope goes below 0                                              | 2    |                                                                                                                                                  |
| A12 | Edge   | Emergency set to 0%; one envelope set to 100%                                   | Both are accepted                                                                           | 2    | Two sign-ups: `[45,15,15,25,0]` and `[100,0,0,0,0]`; both `register`.                                                                            |
| A13 | Edge   | Page reloaded after the passkey but before the name                             | Returns to the name step, not to Welcome                                                    | 2    | Reload on `/app/name`, unlock, "What should we call you?" is shown.                                                                              |
| A14 | Edge   | Back through the set-up steps                                                   | Typed values are kept                                                                       | 3    | Name → set-up (change split) → Back → Continue: name and split are as typed.                                                                     |
| A15 | Edge   | Fee top-up is slow or fails once                                                | The first action waits, shows "Getting ready", then goes through                            | 2    | Route `/api/fund`: 4 s delay in one run; `502` once in another.                                                                                  |
| A16 | Edge   | Fee top-up limit reached                                                        | A clear message; no silent failure                                                          | 3    | Route `/api/fund` to `429 fund_daily_cap`; the S07-24 sentence and Try again appear.                                                             |
| A17 | Edge   | Language switched to Bahasa Indonesia                                           | Text changes; money keeps the same format                                                   | 3    | Toggle ID on Welcome; finish sign-up; the home shows Indonesian text and `$0,00`.                                                                |

**Security E2E (inside A1 and A9):** a name of `"><img src=x onerror=alert(1)>` shows as typed on the card preview and home, no dialog opens, and no `securitypolicyviolation` event fires.

## Acceptance checklist

- [ ] Boards 0.1, 0.2, 0.2b, 0.3, 0.6, 0.7 match their files at 390 wide and pass L9 at 360×640.
- [ ] Sign-up follows S07-1; the fund call starts right after the passkey and has landed before `register` on testnet (PRD 17 day-one check 3: time it on Mon 5 Oct and record it in `apps/web/e2e/README.md`; if it is late, the call already starts on Welcome, so only the wait text in S07-23 applies).
- [ ] A13 resume works; the draft holds no key; Back keeps values.
- [ ] The split editor follows S07-15; the lock switch shows on and disabled.
- [ ] `register` then profile save; failures resume cleanly (S07-18).
- [ ] 0.6 and 0.7 pick the right state and refresh when the trusted person accepts.
- [ ] `/api/fund` enforces all five checks, alerts once per day, keeps the sponsor above 10 MON, and serialises sends.
- [ ] Profile endpoints validate, check roles, and never log the name.
- [ ] A1, A2, A3, A8, A10 automated (Tier 1); A4, A6, A7, A11 to A13, A15 automated or run by hand on Mon 12 Oct; A5, A9, A14, A16, A17 run by hand once.
- [ ] Fund server tests and both PRD 15 security tests pass.

## Skills to use

- `monskill` first (PRD 6), pinned to commit `3f8efd2`.
- `gas`: 21,000 gas for the sponsor's MON transfer; the gas limit is what is charged, so the fund amount is priced from `maxFeePerGas × TYPICAL_ACTION_GAS`.
- `concepts`: `reserve-balance` (the sponsor's 10 MON floor plus budget, S07-28; user accounts are low-balance accounts); `async-execution` (a newly funded account can send only once its funding is 3 blocks old; 06's helper waits); `eip-7702` (never delegate user accounts; the floor would trap their small balance).
- `tooling-and-infra`: RPC providers for `MONAD_RPC_URL` and the fallback, from the official Monad docs pages.
- `scaffold`: only its known gotcha, `tsconfig` target ES2020.
- Do **not** use `wallet-integration` (Para). Amplop uses Mera (`@category-labs/mera`). Do not use `wallet`.

## Decisions made here

1. **The name is posted after `register`.** `POST /api/profile` is `signed:owner`, which needs an account, so the name waits in the `sessionStorage` draft until then (S07-1, S07-3).
2. **The lock switch is shown but disabled during sign-up.** `register` has no lock setting; switching off takes 48 hours and lives in Settings (S07-16).
3. **105% is unreachable with the buttons** (A11 disables plus at 100%), so A10's 105% branch is tested through a changed draft (S07-15).
4. **Home before the first allowance shows `$0,00` on each tile** plus the percentage (A1 expects five envelopes at $0,00; the board shows only percentages) (S07-19).
5. **0.6 has two variants.** "{T} is linked" with "Send top-up link to {T}" (B1 needs Raka's home to say Mama is linked), and "{T} has been invited" with "Send a new invite link". The invite key is never stored, so an old link cannot be re-shared, only replaced (S07-19).
6. **Fund amounts top up to 20 actions' worth** (`20 × unit − balance`) instead of always adding 20, so the sponsor spends less.
7. **Per-IP limit is 30 top-ups a day.** The PRD gives no number. 30 leaves room for judges on one venue network while capping abuse beside the device limit and the 50 MON cap.
8. **Device id travels in an `Amplop-Device` header,** because 01 fixes the body to `{address}` with strict parsing.
9. **The fund call waits up to 10 s for the receipt, then returns `sent` either way.** The client always confirms the receipt and the 3-block delay itself.
10. **"Day" for limits and the cap is the server's UTC date,** not an account clock, so Skip time cannot reset them.
11. **The sponsor reserve check counts the transfer's own gas** (21,000 × `maxFeePerGas`), so the wallet never ends below 10 MON.
12. **Welcome has a "Finish setting up" state** for a session that has a passkey and no account, so Back from the name step does not strand the student (S07-9).

## Additions to 01 (status)

1. `Amplop-Device` header on `POST /api/fund`, `400 bad_device`, `localStorage` `amplop.device`: Merged into 01 (section 9).
2. Error codes: Not merged; per 01 section 9 each spec lists its own codes. `account_mismatch` is dropped in favour of 05's `wrong_account`, which has the same meaning. The codes this spec owns: `address_mismatch`, `bad_device`, `fund_limit_address`, `fund_limit_device`, `fund_limit_ip`, `fund_daily_cap`, `fund_unavailable`, `name_invalid`, `profile_not_found`.
3. `accountId` as a decimal string: Merged into 01 (section 9).
4. Rate limits for `fund`: Merged into 01 (section 4).
5. `rate_limits` buckets `fund:ip:<ip>`, `fund:device:<id>`: Not merged; bucket names are internal to 05 and this spec. Alert dedupe uses 05's `alert:<kind>` hourly bucket.
6. `ALERT_WEBHOOK_URL` payload `{ text }`: Merged into 01 (section 7). Alert kinds stay in this spec and 05.
7. Shared name rule (1 to 60 grapheme clusters, `normalizeName`): Not merged; it is 06's function (S06-31), used by 07 and 10.
