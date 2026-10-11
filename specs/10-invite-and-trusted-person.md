# 10. Invite and trusted person

Status: Ready · Source: PRD 4 (R2, R22, R24), 5 (boards 0.4, 0.5), 7 (invite binding), 8, 9, 14 (B1 to B11, rules 1 and 2), 15 · Depends on: 03, 05, 06, 07

## Goal

The student invites one trusted person with a WhatsApp link. That person opens it on their own phone, creates their own passkey and is linked at once (R22). The link carries a one-time key after the `#`, so no server ever sees it, and someone who copies the network traffic cannot reuse it. The student can later replace or remove the trusted person. That takes 48 hours and can be cancelled (R22, R24).

## In scope / Out of scope

**In scope**

- Board 0.4 Invite (`/app/invite`) and board 0.5 Invite accepted (`/invite/[inviteId]`).
- The invite key flow: create in the browser, `createInvite`, the link, accept with an EIP-712 signature and `acceptInvite`.
- `POST /api/invite`, `GET /api/invite/[inviteId]` and `GET /api/invite/latest` (01 §4).
- Invite states: open, used, expired, replaced.
- The WhatsApp share text.
- Address rules: own invite refused (B5), already a trusted person refused (B8).
- Not now (B2).
- Replacing or removing the trusted person: `removeTrusted`, the 48-hour wait, `finishRemoveTrusted`, cancel with `cancelPending(TrustedRemoval)`, and a new invite after.
- The `TrustedPersonRow` component that 13 places in Settings.
- Which events produce alerts (14 shows them).
- End-to-end cases B1 to B11 and the PRD 15 invite-key security test.

**Out of scope**

- Raka's home text "{T} is linked" (07 builds 0.6; this spec owns the B1 check).
- Parent home, board 1.1 (14). B1 lands there.
- The Settings screen itself (13). It places `TrustedPersonRow`.
- Emergency approval by an old or new trusted person (12, G14).
- Recovery (13).
- The contract's invite logic (03). This spec lists what it relies on.

## Requirements

### A. Board 0.4 Invite

- **S10-1** Route `/app/invite`, guard `student` (06). Layout and copy as `Invite.dc.html`:
  - `TopBar` with Back (→ `/app/setup` when reached from sign-up, else `/app`) and no title text.
  - Heading "Invite your trusted person".
  - Line "Who should Amplop ask when you need the Emergency envelope?"
  - `TextField` with label "Their name" and placeholder "For example, Mama".
  - A list card headed "What {name} can do": "Send your allowance in rupiah", "Approve Emergency requests with a passkey", "Help you recover your account if you lose your phone".
  - A list card headed "What {name} sees": "Each envelope's total", "Not your individual purchases".
  - Primary button with a WhatsApp icon, "Share invite on WhatsApp". Secondary button with a copy icon, "Copy invite link". Text button "Skip for now" (→ `/app`, which shows 0.7).
  - Footer, muted: "The invite link works once and expires in 7 days. Without a trusted person, Emergency opens after a 48-hour wait."

  `{name}` is the typed name. While the field is empty, the headings read "What they can do" and "What they see". The field starts with the `trustedName` of the latest invite (`GET /api/invite/latest`) if there is one, otherwise empty.

- **S10-2** The name uses `normalizeName` (06 S06-31): 1 to 60 grapheme clusters, any script, plain text. While it fails, both share buttons are off. The errors are the same as 07 S07-13.
- **S10-3** Screen states, chosen from `accountInfo(accountId)`, `inviteOf(accountId)`, `pending(accountId, TrustedRemoval)` and `clock(accountId)`:

| State                                     | What shows                                                                                                                          |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| No trusted person, no open invite         | The form (S10-1).                                                                                                                   |
| No trusted person, an open invite exists  | The form, plus an `InfoBox`: "Your earlier invite link will stop working when you send a new one." (B7)                             |
| Trusted person linked, no removal pending | An `InfoBox`: "{T} is your trusted person. To change this, go to Settings." and a link "Go to Settings" → `/app/settings`. No form. |
| Removal pending                           | An `InfoBox`: "{T} stays linked until {formatDayTime(readyAt)}. You can invite someone new after that." No form.                    |
| Ready (after S10-4)                       | S10-5.                                                                                                                              |

T is the trusted person's name from `GET /api/invite/latest`, or "your trusted person".

- **S10-4** Tapping "Share invite on WhatsApp" or "Copy invite link" in the form runs these steps in order. Both buttons show "Getting ready…" during funding and "Creating your invite…" after.
  1. Make a fresh invite key in the browser: `k = generatePrivateKey()` from `viem/accounts` (uses `crypto.getRandomValues`). `inviteKey = privateKeyToAddress(k)`. `k` is held only in a component ref. It is never stored, logged, put in a query key, or sent anywhere.
  2. `sendUserTx({ functionName: "createInvite", args: [inviteKey] })` (06). The contract sets the expiry to the account clock plus 7 days and replaces any unused invite (01 §3; PRD 14 rule 2).
  3. `POST /api/invite` with `{ accountId, inviteKey, trustedName }` returns `{ inviteId }`. On a network or `5xx` failure, retry up to 3 times with the same values. The endpoint is idempotent (S10-9).
  4. Build the link: `{location.origin}/invite/{inviteId}#k={64 lowercase hex of k, without 0x}` (01 §6). The key appears only after `#`.
  5. If the tap was Share: set `location.href = whatsappUrl(text, { secret: true })` straight away. This is a `whatsapp://send?text=…` app link, so no web request carries the key (06 S06-50). If the tap was Copy: copy the link with `copyText(promise)`, where the `ClipboardItem` was created at tap time from a promise of the link, so Safari keeps the tap's permission (06).
  6. Show the ready state (S10-5). If step 5 was blocked because the tap's permission had run out, the ready state's buttons work with one more tap.
- **S10-5** Ready state, on the same route:
  - `InfoBox`: "Invite ready for {name}. It works once and expires in 7 days."
  - "Share invite on WhatsApp" as an `<a href="whatsapp://send?text=…">`.
  - "Copy invite link", which copies the link and reads "Link copied" for 3 s.
  - Text button "Done" → `/app`.

  Leaving the route drops `k`. A later "Send a new invite link" (07's 0.6) or "Send again" (S10-17) makes a new invite, which replaces this one.

- **S10-6** WhatsApp text, in the student's app language. `{link}` is the full link with the fragment:
  - English: "Hi {trustedName}, I'm using Amplop for my allowance. Please be my trusted person: open this link on your phone, in Chrome or Safari. It works once and expires in 7 days.\n{link}"
  - Bahasa Indonesia: "Halo {trustedName}, aku pakai Amplop untuk uang sakuku. Tolong jadi orang kepercayaanku: buka tautan ini di HP, lewat Chrome atau Safari. Tautan ini hanya bisa dipakai sekali dan berlaku 7 hari.\n{link}"
- **S10-7** Order and half-done states (06 S06-44). The chain write comes first. If `POST /api/invite` keeps failing, the screen shows "Your invite wasn't saved. Try again." with Try again, which repeats only step 3 with the same `k` while the screen is open. If the screen is left, the on-chain invite has no row and its link was never shared. The next invite replaces it. Nothing else needs cleaning up.

### B. Server endpoints

- **S10-8** Logic lives in `lib/server/invite/`. Handlers stay thin.
- **S10-9** `POST /api/invite`: auth `signed:owner`, action `invite.create`. Body `{ accountId: string, inviteKey: string, trustedName: string }` with strict zod (`accountId`: 05's `zAccountId`; `inviteKey`: 05's `zAddress`, lowercase).
  1. `accountId` must equal the signed `Account`, else `403 wrong_account` (05's account resolver, S05-12). 05 checks that the signer owns it.
  2. `trustedName` through `normalizeName`, else `400 name_invalid`.
  3. Read `inviteOf(accountId)`. If its `inviteKey` is not `inviteKey` (compared lowercase), return `409 invite_not_on_chain` with the message "This invite isn't on record yet. Try again." If `used` is true, return `409 invite_used`.
  4. If a row with this `invite_key` already exists for this account, return its `inviteId` (retry-safe).
  5. Insert into `invites`: `invite_id` = `crypto.randomBytes(16)` as 32 lowercase hex, `account_id`, `invite_key` (lowercase), `trusted_name`, `created_at`. Return `{ inviteId }`.
- **S10-10** `GET /api/invite/[inviteId]`: auth `public` (01 §4: allowed because the id is a random 128-bit value). Response header `Cache-Control: no-store`.
  1. `inviteId` must match `^[0-9a-f]{32}$`, else `404 invite_not_found` with the message "This invite is not valid."
  2. Load the row, or return the same 404.
  3. Load `studentName` from `profiles` (empty string if none).
  4. Read `inviteOf(accountId)` and `clock(accountId)` with the server chain client.
  5. `state`, checked in this order: chain `inviteKey` ≠ row `invite_key` → `"replaced"`; `used` → `"used"`; `clock ≥ expiresAt` → `"expired"`; else `"open"`. Expiry uses the account clock, so Skip time moves it like every other wait (PRD 12).
  6. Return `{ accountId, studentName, trustedName, inviteKey, state }` (01 §4). `accountId` is a decimal string.
- **S10-11** `GET /api/invite/latest` (01 §4): auth `signed:either`, action `invite.latest`, no body. The account comes from the signed `Account`, and 05 checks the signer is its owner or trusted person. Returns the account's newest `invites` row as `{ inviteId, trustedName, state }`, with `state` worked out as in S10-10, or `404 invite_not_found`. It is used for the trusted person's name on 0.6 (07), 0.4, `TrustedPersonRow`, the trusted person's local profile label (06 S06-18), and the "Mama" copy in 12 and 13. Screens read it through `useTrustedName(accountId)` in `lib/client/trusted.ts`: it returns the latest row's `trustedName` while `accountInfo(accountId).trusted` is not zero, and `null` otherwise or on any error, so each screen shows its own fallback ("your trusted person"). 08, 09, 11, 12, 13 and 14 use it.

### C. Board 0.5 Invite accepted (the trusted person's phone)

- **S10-12** Route `/invite/[inviteId]`. No guard; the page runs its own checks. It uses the parent text size (17px base, 56px primary buttons; 06 S06-38). In a chat app's browser, 06's gate shows board 0.1 first, and its Copy link keeps the `#k=` fragment.
- **S10-13** On load:
  1. Read `k` from `location.hash`. It must be `#k=` followed by 64 hex characters (an optional `0x` is accepted). If it is missing or malformed, show the "not valid" state.
  2. `GET /api/invite/[inviteId]`. A 404 shows the "not valid" state.
  3. Check `privateKeyToAddress(k)` equals `inviteKey` (case-insensitive). If not, show the "not valid" state (B6).
  4. Show the screen for `state`:

| State      | Title                               | Line                                                                     |
| ---------- | ----------------------------------- | ------------------------------------------------------------------------ |
| not valid  | "This invite is not valid"          | "Check that you opened the whole link, or ask for a new one."            |
| `used`     | "This invite has already been used" | "Each invite link works once. Ask {short} for a new one if you need it." |
| `expired`  | "This invite has expired"           | "Invite links work for 7 days. Ask {short} to send a new one."           |
| `replaced` | "This invite has been replaced"     | "{short} sent a newer invite. Open the newest link instead."             |
| `open`     | S10-14                              |                                                                          |

`{short}` is `shortName(studentName)`, or "the student" when the name is empty. While loading, the screen shows "Loading the invite…". A network failure shows 06's no-connection line with Try again.

- **S10-14** Open state. Layout and copy as `InviteAccept.dc.html`:
  - Small label "Invitation".
  - Heading "{studentName} invites you to Amplop".
  - Line "Amplop splits {short}'s allowance into envelopes and releases it week by week."
  - A list card "What you can do": "Send {short}'s allowance in rupiah, by bank transfer", "Approve Emergency requests from your own phone".
  - A list card "What you will see": "Each envelope's total, and alerts", "Not {short}'s individual purchases".
  - Primary button with a fingerprint icon: "Accept and create a passkey". Under it: "Your phone will ask for your fingerprint, face or screen lock. No password."
  - Text button "Not now".
  - When this device already has at least one local profile (06 `listProfiles()`), a second text button: "Use a passkey already on this phone" (S10-16).
- **S10-15** "Accept and create a passkey" runs these steps in order (R22: the first trusted person is linked at once):
  1. `createPasskeyAccount("trusted", { studentShortName: short })` (06). The button reads "Creating your passkey…". 06 saves the local profile with the label `trustedName`.
  2. Start `ensureFunded(session.address)` straight away (06, single-flight).
  3. Sign the EIP-712 message with the invite key, locally: `privateKeyToAccount(k).signTypedData({ domain: { name: "AmplopEnvelopes", version: "1", chainId: NEXT_PUBLIC_CHAIN_ID, verifyingContract: NEXT_PUBLIC_CONTRACT_ADDRESS }, types: { AcceptInvite: [{ name: "accountId", type: "uint256" }, { name: "trusted", type: "address" }] }, primaryType: "AcceptInvite", message: { accountId, trusted: session.address } })` (01 §3).
  4. Read `accountInfo(accountId)` and `pending(accountId, TrustedRemoval)`. If a trusted person is still linked, a removal is pending and `clock(accountId) ≥ readyAt`, first send `finishRemoveTrusted(accountId)` with `sendUserTx` from the new account (anyone may, 01 §9: `acceptInvite` reverts while a trusted person is linked). If a trusted person is linked and no removal is due, show "{short} already has a trusted person." and stop. Then `sendUserTx({ functionName: "acceptInvite", args: [accountId, signature] })` from the new account. The button reads "Getting ready…" during funding and "Linking you to {short}…" after. The trusted person's own passkey account sends the transaction. The invite key only signed which address may accept, so a copy of the signature from the network is useless to anyone else (PRD 7).
  5. On the receipt: remove the fragment with `history.replaceState(null, "", location.pathname)`, drop the reference to `k`, and navigate with `replace` to `/app/parent` (B1; 14 builds that screen).
- **S10-16** "Use a passkey already on this phone" calls `signInWithPasskey()` with the browser's chooser, then `resolveRole(address)` (06), and decides:

| Result                                                      | Behaviour                                                                                                                                                                        |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `studentAccountId` equals the invite's `accountId`          | Refused, no transaction: "This is your own invite. Send it to the person you want as your trusted person." (B5)                                                                  |
| `trustedAccountId` equals the invite's `accountId`          | "You are already {short}'s trusted person." with a primary "Open Amplop" → `/app/parent`.                                                                                        |
| `trustedAccountId` is another account                       | Refused, no transaction: "You are already a trusted person for another student. In this version, one person can be the trusted person for one student only." (B8, PRD 14 rule 1) |
| Anything else (no account, or a student of another account) | S10-15 steps 2 to 5 with this session.                                                                                                                                           |

The contract enforces the same rules (01 §3 address rules), so a refusal here only saves a failed transaction.

- **S10-17** "Not now" (B2) makes no request. It replaces the "Not now" button with the line "No problem. This link keeps working until someone accepts it, for up to 7 days from when {short} sent it." The Accept button stays. Nothing changes on the chain or the server, and the link still works later.
- **S10-18** A cancelled passkey prompt (B9) leaves the person on the invite with "The passkey prompt was closed. Try again when you're ready." The button works again, and a second try works (06 S06-15).
- **S10-19** Contract errors during accept map as follows (06 S06-35). An expired, used or invalid invite switches the page to the matching S10-13 state instead of an inline message.

| Error situation                               | Result                                  |
| --------------------------------------------- | --------------------------------------- |
| Invite used (someone else accepted first, B3) | `used` state                            |
| Invite expired                                | `expired` state                         |
| Invite missing, replaced, or bad signature    | not valid state                         |
| Caller is the owner                           | B5 sentence                             |
| Caller is already a trusted person            | B8 sentence                             |
| Account already has a trusted person          | "{short} already has a trusted person." |

### D. Raka's side after linking

- **S10-20** When `accountInfo.trusted` becomes non-zero, Raka's home before the first allowance shows "{T} is linked. When money arrives it splits into your envelopes." (07 S07-19). It polls every 10 s and on focus (07 S07-20). After the first allowance, 11's home and 12's Emergency copy use T as well.

### E. Replacing or removing the trusted person

- **S10-21** `TrustedPersonRow` (`components/trusted/TrustedPersonRow.tsx`) is the "Trusted person" row on Settings. 13 places it; this spec owns its behaviour. Its states come from `accountInfo`, `inviteOf`, `pending(accountId, TrustedRemoval)` and `clock`:

| State                                                                 | Title / sub line                                                             | Action                                                                                 |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Nobody, no open invite                                                | "Nobody yet" / "Emergency opens after a 48-hour wait"                        | text button "Invite" → `/app/invite`                                                   |
| Nobody, invite open                                                   | "{T} · invited" / "Waiting for them to accept"                               | text button "Send again" → `/app/invite`                                               |
| Linked                                                                | "{T} · can approve Emergency" (Settings board)                               | text button "Change" → S10-22                                                          |
| Linked, a recovery is pending (`pending(accountId, Recovery).active`) | "{T} · can approve Emergency" / "Changing your trusted person cancels the recovery that is waiting" | "Change" enabled while `clock < readyAt`, and `removeTrusted` cancels the recovery; disabled once the recovery is ready to finish (01 §9, audit change SA-02) |
| Removal pending, wait running                                         | "{T} · leaving on {formatDayTime(readyAt)}" / "You can cancel until then"    | `danger` text button "Cancel change" → S10-23                                          |
| Removal pending, wait over                                            | "Finishing the change…"                                                      | none (S10-24 runs)                                                                     |

- **S10-22** "Change" opens a `Sheet`:
  - Title "Change your trusted person?"
  - Line "{T} stays linked for 48 hours and sees an alert about the change. After that, you can invite someone new. You can cancel during the wait."
  - Primary "Start the 48-hour wait", which calls `sendUserTx({ functionName: "removeTrusted", args: [] })`. Busy label "Starting…". On the receipt, the sheet closes and the row shows the pending state.
  - Secondary "Keep {T}", which closes the sheet.

  Removing and replacing are the same action. Replacing is removal, then a new invite once the wait is over (R22).

- **S10-23** "Cancel change" calls `sendUserTx({ functionName: "cancelPending", args: [PendingKind.TrustedRemoval] })` (R24). Busy label "Cancelling…". On the receipt, the row is back to "Linked" with the line "Change cancelled. {T} stays your trusted person." T stays linked (B11).
- **S10-24** `useTrustedHousekeeping()` is mounted in the `(shell)/app` layout whenever the session is a student. When the account is loaded and when the window regains focus: if `pending(accountId, TrustedRemoval).active` is true and `clock(accountId) ≥ readyAt`, it sends `finishRemoveTrusted(accountId)` with `sendUserTx`, once per page load (an in-memory flag; the simulation also stops a repeat). On the receipt (`TrustedRemoved`) it refreshes the account. The row and `/app/invite` then offer a new invite (B10). Anyone may call `finishRemoveTrusted` (01 §3), but only the student's app does it automatically.
- **S10-25** During the wait, the old trusted person is still the contract's `trusted`. They still see the account on parent home and can still approve Emergency (12, G14). After `finishRemoveTrusted`, their next role read returns none (06 S06-20). Every guarded route then sends them to `/app`, which shows Welcome with "No account for this passkey" (07 S07-9). They see nothing of the student's account (J6, owned by 14).
- **S10-26** A new invite cannot be made while a trusted person is linked or a removal is pending (S10-3). New links work only after the removal is finished, so the 48-hour wait cannot be skipped by accepting a new invite early.

### F. Alerts this spec produces (14 shows them)

- **S10-27** Events and alerts. Spec 14 owns the alert rows and their wording (S14-10); 16 stores them.

| Trigger                                       | Who sees it                                       | Source                                                                                                                                                                                              |
| --------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TrustedRemovalStarted`                       | The trusted person being removed, on parent home  | 14's "Trusted removal started" row. 14 builds it from the contract read `pending(T, TrustedRemoval)` while it is active, so it shows with the indexer down, and from the indexer `Alert` otherwise. |
| `PendingCancelled` with kind `TrustedRemoval` | The same trusted person                           | The same row, with "cancelled" (16 sets the alert's `status` to `Cancelled`).                                                                                                                       |
| `TrustedRemoved`                              | Nobody: the old person no longer sees the account |                                                                                                                                                                                                     |
| `TrustedLinked`                               | The student, as home text (07), not an alert      | Contract `accountInfo.trusted`                                                                                                                                                                      |

## Interfaces used

- 01 §3 writes: `createInvite(address)`, `acceptInvite(uint256, bytes)`, `removeTrusted()`, `finishRemoveTrusted(uint256)`, `cancelPending(PendingKind)`.
- 01 §3 reads: `inviteOf`, `accountInfo`, `pending`, `clock`, `accountOf`, `trustedAccountOf`.
- 01 §3 events: `InviteCreated`, `TrustedLinked`, `TrustedRemovalStarted`, `TrustedRemoved`, `PendingCancelled`.
- 01 §3 EIP-712 domain and the `AcceptInvite(uint256 accountId,address trusted)` type.
- 01 §4 `POST /api/invite` (`invite.create`), `GET /api/invite/[inviteId]` (public).
- 01 §5 `invites`, `profiles`. 01 §6 link `/invite/<inviteId>#k=<inviteKeyPrivateKeyHex>`.
- 06: `createPasskeyAccount`, `signInWithPasskey`, `resolveRole`, `listProfiles`, `sendUserTx`, `ensureFunded`, `api`, `whatsappUrl`, `copyText`, `normalizeName`, `shortName`, `formatDayTime`, components.
- 07: home 0.6 text, `GET /api/profile`.
- What this spec relies on from 03 (the contract must do these): `createInvite` is owner-only, sets expiry to account clock + `INVITE_LIFE`, and replaces any unused invite; `inviteOf` keeps the latest invite with `used = true` after acceptance; `acceptInvite` reverts when the invite is missing, used or expired on the account clock, when the signature is not by `inviteKey` over `(accountId, msg.sender)`, when the caller owns that account, when the caller is already a trusted person of any account, and when the account already has a trusted person; `finishRemoveTrusted` works for anyone after `WAIT` and emits `TrustedRemoved`.

## Screens

| Board                                           | Route                       | File                                     |
| ----------------------------------------------- | --------------------------- | ---------------------------------------- |
| 0.4 Invite                                      | `/app/invite`               | `Invite.dc.html`                         |
| 0.5 Invite accepted                             | `/invite/[inviteId]`        | `InviteAccept.dc.html`                   |
| (component) Trusted person row and Change sheet | inside `/app/settings` (13) | `Settings.dc.html`, row "Trusted person" |

## Errors and edge cases

| Case                                                                          | Behaviour                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Link opened in a chat app                                                     | 06 gate (board 0.1); Copy link keeps the fragment.                                                                                                                                                                                                                                                      |
| Fragment missing or changed                                                   | "This invite is not valid" (B6).                                                                                                                                                                                                                                                                        |
| `inviteId` changed                                                            | 404 → "This invite is not valid" (B6).                                                                                                                                                                                                                                                                  |
| Opened after 7 days on the account clock                                      | "This invite has expired" (B4).                                                                                                                                                                                                                                                                         |
| Opened again after acceptance                                                 | "This invite has already been used" (B3).                                                                                                                                                                                                                                                               |
| An older link after a newer invite                                            | "This invite has been replaced" (B7). An old link that was used and later followed by a new invite also shows "replaced", because the `invites` table keeps no accepted flag.                                                                                                                           |
| Two people accept at once                                                     | One `acceptInvite` succeeds; the other's simulation or receipt fails with "used" and shows that state.                                                                                                                                                                                                  |
| Student opens their own link and uses their own passkey                       | B5 refusal (S10-16).                                                                                                                                                                                                                                                                                    |
| A trusted person accepts another student's invite with their existing passkey | B8 refusal (S10-16).                                                                                                                                                                                                                                                                                    |
| Passkey prompt cancelled                                                      | B9, S10-18.                                                                                                                                                                                                                                                                                             |
| Connection lost after `createInvite` but before `POST /api/invite`            | S10-7.                                                                                                                                                                                                                                                                                                  |
| Connection lost during accept                                                 | 06 S06-44: the sent transaction's hash is checked on return; the person is not asked to send twice. If the page reloads before the receipt, the fragment is still there; reopening checks `state` and shows `used` if the accept landed (then "Use a passkey already on this phone" opens parent home). |
| Student taps Change twice                                                     | 06 disables the button while running; the contract refuses a second removal or replaces it (PRD 14 rule 7).                                                                                                                                                                                             |
| Removal finishes while the old person has parent home open                    | Their next focus or refetch reads role none → redirect `/app` (S10-25).                                                                                                                                                                                                                                 |

## Security

- **One-time key.** Made in the student's browser with a secure random source. It goes only into the link after `#`, which browsers never send to a server. It is never stored, never logged, never in a query key or error report. The server stores and sees only its address (PRD 15 threat table).
- **No web request carries the key.** The invite page fetches `GET /api/invite/[inviteId]` (no key) and RPC calls (signature only). WhatsApp sharing uses the `whatsapp://` app link, not `wa.me` (06 S06-50). The service worker's fetch events never include the fragment.
- **Referrer-Policy: no-referrer** on every response (05 sets it). This spec checks it on `/invite/*`.
- **Front-running.** The EIP-712 signature names the accepting address, chain id and contract (01 §3). A copied signature cannot link anyone else, or work on another chain or contract. Each invite works once and expires after 7 days (R22).
- **The fragment is removed** from the address bar after a successful accept, so it does not stay in history as a usable link.
- **Names render as plain text.** `trustedName` and `studentName` are React text only. They are never logged. A name with `<script>` shows as typed.
- **Roles.** `POST /api/invite` needs the owner's signature. `GET /api/invite/latest` needs the owner's or the trusted person's signature. `GET /api/invite/[inviteId]` is public only because the id is a random 128-bit value; it returns no shop data and no balances.
- **The 48-hour wait cannot be skipped.** No invite can be made while a trusted person is linked or leaving (S10-26), and the contract refuses an accept while one is linked.

## Tests

**Unit**

- Link builder: `/invite/<32 hex>#k=<64 hex>`; nothing about the key before `#`.
- Fragment parser: accepts 64 hex with or without `0x`; rejects 63 or 65 characters, non-hex characters, a missing `k=`.
- State function (shared by both GET endpoints): every branch of S10-10 step 5, including expiry exactly at `expiresAt`.
- EIP-712 builder: for a fixed key, account id, trusted address, chain 31337 and contract address, the signature equals a stored vector, and it recovers to the invite key's address. Shared with 03's Foundry test so both sides agree on the domain.
- S10-16 decision table: all four rows.
- WhatsApp text: both languages; the link is the last line; `whatsappUrl` gets `secret: true`.
- `TrustedPersonRow` state picker: all six rows.

**Server (Vitest)**

- `POST /api/invite`: valid → `{ inviteId }` of 32 hex; repeated with the same `inviteKey` → the same `inviteId`; `inviteKey` not on chain → `409 invite_not_on_chain`; on chain but used → `409 invite_used`; signed by the trusted person → `403`; body `accountId` different from the signed `Account` → `403 wrong_account`; name of 61 graphemes → `400 name_invalid`; extra field → `400`.
- `GET /api/invite/[inviteId]`: `open`; `used` after an accept on Anvil; `expired` after `skipDays` past the expiry; `replaced` after a second `createInvite`; malformed id → 404; unknown id → 404; response has `Cache-Control: no-store`; response never contains a field beyond the 01 shape.
- `GET /api/invite/latest`: owner and trusted get the newest row; a stranger → `403`; no invites → `404 invite_not_found`.
- A name with `<script>alert(1)</script>` is stored and returned unchanged.

**End-to-end (Playwright, spec 19 harness).** Expected results and tiers are copied from PRD 14. "Raka", "Mama", "Budi" and "Sari" are separate browser profiles.

| ID  | Kind   | Case                                                                                 | Expected                                                                                                          | Tier | How                                                                                                                                                                                                                                                                                                                                                                                                          |
| --- | ------ | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| B1  | Normal | Raka shares the invite; Mama opens it in her own profile, accepts, creates a passkey | Mama lands on Parent home showing Raka's envelopes; Raka's home says Mama is linked                               | 1    | After A1, Raka types "Mama", taps Copy invite link, and the test reads the clipboard. Mama's profile opens the link and taps Accept and create a passkey. Expect `/app/parent` with "Raka's allowance" and five totals, `accountInfo.trusted` = Mama's address, and on Raka's home "Mama is linked." within 15 s.                                                                                            |
| B2  | Normal | Mama taps Not now                                                                    | Nothing changes; the link still works later                                                                       | 3    | Not now: no new request after the tap; the S10-17 line shows. Reload; accept works.                                                                                                                                                                                                                                                                                                                          |
| B3  | Edge   | The same link opened a second time by someone else                                   | "This invite has already been used"                                                                               | 1    | After B1, Budi's profile opens the same link.                                                                                                                                                                                                                                                                                                                                                                |
| B4  | Edge   | Link opened after 8 days                                                             | "This invite has expired"                                                                                         | 2    | Raka makes an invite, then skips 8 days on his account clock (Skip 48 hours four times, 15). Mama opens the link.                                                                                                                                                                                                                                                                                            |
| B5  | Edge   | Raka opens his own invite link                                                       | Refused: a student cannot be their own trusted person                                                             | 2    | Raka's profile opens his own link, taps "Use a passkey already on this phone", picks his passkey. The B5 sentence shows; no transaction is sent.                                                                                                                                                                                                                                                             |
| B6  | Edge   | Link with a changed code                                                             | "This invite is not valid"                                                                                        | 2    | Change one character of the `inviteId`; separately, change one hex digit of the `k` fragment. Both show the not valid state.                                                                                                                                                                                                                                                                                 |
| B7  | Edge   | Raka makes a second invite while the first is unused                                 | The first stops working; only the newest works                                                                    | 2    | Invite 1, then "Send a new invite link" → invite 2. Link 1 shows "This invite has been replaced". Link 2 accepts.                                                                                                                                                                                                                                                                                            |
| B8  | Edge   | Someone who is already a trusted person opens another student's invite               | Refused in this version, with a message                                                                           | 3    | After B1, Sari registers and invites; Mama opens Sari's link and uses her existing passkey. The B8 sentence shows; no transaction is sent.                                                                                                                                                                                                                                                                   |
| B9  | Edge   | Mama cancels her passkey prompt                                                      | Stays on the invite; a second try works                                                                           | 3    | Virtual authenticator refuses user verification once.                                                                                                                                                                                                                                                                                                                                                        |
| B10 | Normal | Raka replaces the trusted person                                                     | 48-hour wait starts; Mama sees an alert; after Skip 48 hours the new invite links and the old person sees nothing | 2    | After B1: Raka, Settings → Change → Start the 48-hour wait. Mama's parent home shows the S10-27 removal alert. Raka skips 48 hours and opens the app; `finishRemoveTrusted` runs (`TrustedRemoved` emitted). Raka invites "Budi"; Budi accepts and lands on parent home. Mama reloads: after unlock she lands on Welcome with "No account for this passkey", and no request for Raka's account data is made. |
| B11 | Edge   | Raka cancels the replacement during the wait                                         | Mama stays linked                                                                                                 | 2    | Start the wait, then Cancel change. Skip 48 hours. `accountInfo.trusted` is still Mama's address; Mama's parent home still shows Raka's totals.                                                                                                                                                                                                                                                              |

**Security E2E (PRD 15: "During the invite end-to-end case, the one-time key appears in no request the browser sends")**

- Run inside B1. Record every request from both Raka's and Mama's browser contexts with `context.on("request")` (this includes service worker requests), plus WebSocket frames. For each, check the URL, every header and the body. The 64-hex key, in any case and with or without `0x`, appears in none of them. No request goes to `wa.me`. The share hands off through `whatsapp://`, which is not an HTTP request.
- Every response for `/invite/*` has `Referrer-Policy: no-referrer`.
- After the accept, `location.hash` is empty.
- A trusted name of `"><img src=x onerror=alert(1)>` shows as typed on 0.4 and 0.5; no dialog opens; no `securitypolicyviolation` event fires.

## Acceptance checklist

- [ ] Board 0.4 matches `Invite.dc.html`, with the states in S10-3 and the ready state in S10-5.
- [ ] The invite key is made in the browser, sits only after `#`, and is never stored, logged or sent; the security E2E check passes.
- [ ] `POST /api/invite` checks the chain and is idempotent; `GET /api/invite/[inviteId]` returns the right state for open, used, expired and replaced.
- [ ] `GET /api/invite/latest` built and used for T on 0.4, 0.6 and Settings.
- [ ] Board 0.5 matches `InviteAccept.dc.html`; accept signs EIP-712 with the invite key and sends `acceptInvite` from the new passkey account; lands on parent home.
- [ ] B5 and B8 refusals on the existing-passkey path; Not now changes nothing.
- [ ] `TrustedPersonRow` and the Change sheet work; cancel works; the student's app finishes the removal by itself after the wait.
- [ ] The removal alert shows on parent home from the contract read, with the indexer off.
- [ ] B1 and B3 automated (Tier 1); B4 to B7, B10, B11 automated or run by hand on Mon 12 Oct; B2, B8, B9 run by hand once.

## Skills to use

- `monskill` first (PRD 6), pinned to commit `3f8efd2`.
- `concepts`: `reserve-balance` (the new trusted account holds under 10 MON, so it sends one transaction at a time; 06's helper spaces them by 3 blocks); `async-execution` (the new account's first top-up must be 3 blocks old before `acceptInvite`; 06 waits); `eip-7702` (never sign an authorisation for user accounts). This spec's signature is EIP-712, not EIP-7702.
- `gas`: `acceptInvite` and `createInvite` go through 06's helper (01 §9 rule: the larger of the estimate plus 20% and the function's floor, because Monad charges the limit).
- `tooling-and-infra`: the explorer behind `NEXT_PUBLIC_EXPLORER_TX_URL` if a proof link is added to the ready state.
- `scaffold`: only its known gotcha, `tsconfig` target ES2020.
- Do **not** use `wallet-integration` (Para). Amplop uses Mera (`@category-labs/mera`). Do not use `wallet`.

## Decisions made here

1. **"Use a passkey already on this phone" on the invite page** (shown only when the device has a local profile). "Accept and create a passkey" always makes a fresh address that cannot break B5 or B8. The refusals apply where an existing identity is used, which is the only place the app can know who the person is. A student who creates a second passkey on their own invite is a separate person to the app, as with a second phone; the docs say so.
2. **The invite is created on the first Share or Copy tap,** then the WhatsApp app link opens at once. The screen also shows a ready state with live buttons, in case the browser blocked the automatic open (S10-4, S10-5).
3. **WhatsApp invite shares use `whatsapp://send`,** not `wa.me`, so the key is never in a web request (PRD 15 security test).
4. **The key in the link is 64 lowercase hex characters without `0x`.** The parser accepts either.
5. **Chain write first, then `POST /api/invite`.** The server checks the key is on chain before it saves the name, and returns the same id on retry.
6. **State order: replaced, used, expired, open.** A used link later followed by a new invite shows "replaced", because 01's `invites` table has no accepted flag.
7. **No new invite while a trusted person is linked or leaving.** Replacing means removing (48 hours), then inviting (S10-26). This matches B10, "after Skip 48 hours the new invite links".
8. **The student's app finishes the removal by itself** with `finishRemoveTrusted` when the wait is over, like `finalizeEmergency` (PRD 7).
9. **The removal alert also comes from a contract read** (`pending(accountId, TrustedRemoval)`, 14 S14-9), so Mama sees it with the indexer down. The cancelled state comes from the indexer.
10. **The fragment stays in the address bar until the accept succeeds,** so a reload before accepting still works (L7). It is removed after.
11. **A removed trusted person sees Welcome with "No account for this passkey".** The app cannot tell "removed" from "never linked" without the indexer, and needs to show them nothing of the account (J6).
12. **The trusted person's name for the student's screens comes from a new `GET /api/invite/latest`,** because no 01 endpoint returns it.

## Additions to 01 (status)

1. Endpoint `GET /api/invite/latest`: Merged into 01 (section 4).
2. Error codes: Not merged; per 01 section 9 each spec lists its own codes (`invite_not_found`, `invite_not_on_chain`, `invite_used`). `account_mismatch` is dropped in favour of 05's `wrong_account`; `name_invalid` is 07's code with the same meaning.
3. Invite key in the link as 64 lowercase hex without `0x`: Not merged; a detail of this spec's link builder and parser (S10-4, S10-13), which are the only readers.
4. `acceptInvite` reverts while a trusted person is linked; `inviteOf` keeps the used invite: Merged into 01 (section 9) and stated in 03 (S03-16, S03-41).
5. Indexer alert kind `trusted_removal_cancelled`: Not merged. 16 marks the `TrustedRemovalStarted` alert `Cancelled` instead, and 14 shows it as cancelled.
