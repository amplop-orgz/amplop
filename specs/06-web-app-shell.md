# 06. Web app shell

Status: Ready · Source: PRD 2, 5, 6, 9, 12, 13 (wording), 14 (L4 to L11), 15, 17 · Depends on: 01, 02

## Goal

Build the frame every phone screen lives in. That means the installable app, the route map and who may open each route, passkey accounts with Mera, the contract client, the signed API client, plain error sentences, money and date formats, two languages, the design system, and the states every screen must handle. Feature specs (07 to 17) add screens on top of this and call the helpers named here. They do not build their own versions.

## In scope / Out of scope

**In scope**

- PWA: manifest, icons, theme colour, minimal service worker, install metadata.
- Route map for every board in PRD 5, and the route guards.
- Passkey accounts with Mera: support check, create, sign in, sign out, cancelled prompt, key held in memory only.
- Local profiles (credential ids and labels) and the switching mechanism behind View as.
- Finding the account for a signed-in address.
- Contract client: reads with RPC fallback, and one write helper used for every user transaction.
- Signed API client (01 §4).
- Mapping contract custom errors and other failures to plain sentences.
- Money, number and date formatting in `packages/shared`.
- English and Bahasa Indonesia.
- Design tokens, fonts, shared components, logo use.
- Where the demo banner sits.
- Shared screen states: loading, no connection, transaction failed with Try again, reload and deep links, two tabs, small screens and large text, accessible names and tap sizes.
- WhatsApp share links and chat-app browser detection (board 0.1 is drawn by 07, detected here).
- End-to-end cases L4 to L11.

**Out of scope**

- The screens themselves (07 to 17 own them).
- Server signature checks, nonces, rate limits, CSP and security headers (05). This spec lists what the client needs from them.
- The View as button and its rules (15). This spec owns only the mechanism.
- Demo banner wording and when demo controls exist (15).
- The landing page content (17). This spec supplies the logo, fonts and tokens it uses.

## Requirements

### A. Installable app (PWA)

- **S06-1** The app has a web manifest served from `src/app/manifest.ts` with: `name: "Amplop"`, `short_name: "Amplop"`, `id: "/app"`, `start_url: "/app"`, `scope: "/"`, `display: "standalone"`, `theme_color: "#F2F3EE"`, `background_color: "#F2F3EE"`, `lang: "en"`, and the three icons from `design/logo/web/site.webmanifest` (`/icon-192.png`, `/icon-512.png`, `/icon-maskable-512.png` with `purpose: "maskable"`). No description mentions crypto (PRD 2, landing rule).
- **S06-2** Icon files are copied unchanged from `specs/design/logo/web/`: `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` into `apps/web/public/`; `favicon.ico` into `src/app/favicon.ico`; `favicon.svg` into `src/app/icon.svg`; `apple-touch-icon.png` into `src/app/apple-icon.png` (logo README, Next.js option). The root layout exports `viewport.themeColor = "#F2F3EE"` and `metadata.appleWebApp = { capable: true, title: "Amplop", statusBarStyle: "default" }`.
- **S06-3** A minimal service worker `public/sw.js` is registered from the shell layout in production builds only. It precaches only `/offline.html` and the icons. For navigation requests it goes to the network first and serves `/offline.html` only when the network fails. It never caches or answers `/api/*`, RPC, indexer or any cross-origin request. The cache name contains the build id; on activate it deletes older caches, then calls `skipWaiting()` and `clients.claim()`.
- **S06-4** `/offline.html` is a static page with no script. It shows the Amplop logo, the line "No connection. Check your internet and try again." and a link styled as the primary button, "Try again", pointing to `/app`.
- **S06-5** The app passes Chrome's installability check on Android (manifest with 192 and 512 icons, `start_url`, standalone, served over HTTPS). Passkeys work in the installed app the same as in the browser (Chrome Android and Safari iOS 18+).

### B. Routes and guards

- **S06-6** Folder layout under `apps/web/src/app`:
  - `(marketing)/page.tsx` → `/` (17).
  - `(shell)/layout.tsx` → the app shell for every route below: providers, chat-app gate, demo banner, route guard, unlock sheet.
  - `(shell)/app/...` → every `/app/*` route.
  - `(shell)/invite/[inviteId]/page.tsx`, `(shell)/approve/[linkId]/page.tsx`, `(shell)/recover/page.tsx`, `(shell)/recover/[linkId]/page.tsx`.
  - App pages are client components. They render no per-user data on the server, because the account only exists in the browser after a passkey prompt.
- **S06-7** Every board in PRD 5 maps to exactly one route, as in this table. "Guard" names the rule from S06-8.

| Board                                         | Route                                                                            | Guard                           | Built in                                   |
| --------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------ |
| 0.0 Landing                                   | `/`                                                                              | none                            | 17                                         |
| 0.1 Open in browser                           | shown in place on any shell route when in a chat app's browser (S06-49)          | none                            | 07 (screen), 06 (detection)                |
| 0.2 Welcome                                   | `/app` with no session, or a session with no account                             | none                            | 07                                         |
| 0.2b Your name                                | `/app/name`                                                                      | `onboarding`                    | 07                                         |
| 0.3 Set up envelopes                          | `/app/setup`                                                                     | `onboarding`                    | 07 (13 reuses it for a later split change) |
| 0.4 Invite                                    | `/app/invite`                                                                    | `student`                       | 10                                         |
| 0.5 Invite accepted                           | `/invite/[inviteId]`                                                             | none (page runs its own checks) | 10                                         |
| 0.6 Home, waiting                             | `/app`, student, no allowance ever arrived, trusted person linked or invited     | `student`                       | 07                                         |
| 0.7 Home, nobody invited                      | `/app`, student, no allowance ever arrived, no trusted person and no open invite | `student`                       | 07                                         |
| 1.1 Parent home                               | `/app/parent`                                                                    | `trusted`                       | 14                                         |
| 1.2 Send allowance                            | `/app/parent/send`                                                               | `trusted`                       | 08                                         |
| 1.3 / 1.4 Waiting for payment, Allowance sent | `/app/parent/send/[orderId]`                                                     | `trusted`                       | 08                                         |
| 2.1 Allowance arrived                         | `/app/arrived/[deposit]`                                                         | `student`                       | 08                                         |
| 2.2 Student home                              | `/app`, student, an allowance has arrived                                        | `student`                       | 11                                         |
| 2.3 Envelope detail                           | `/app/envelope/[id]` (`id` = 0 to 3; 4 redirects to `/app/emergency`)            | `student`                       | 11                                         |
| 2.4 Card                                      | `/app/card`                                                                      | `student`                       | 09                                         |
| 2.5 Simulated checkout                        | `/app/card/pay`                                                                  | `student`                       | 09                                         |
| 2.6 / 2.7 / 2.8 Result                        | `/app/card/result/[id]` (`id` = purchaseId)                                      | `student`                       | 09                                         |
| 2.9 Activity                                  | `/app/activity`                                                                  | `student`                       | 11                                         |
| 2.10 Move a purchase                          | `/app/activity/[id]` (`id` = purchaseId)                                         | `student`                       | 11                                         |
| 3.1 / 3.2 / 3.5 Emergency                     | `/app/emergency`                                                                 | `student`                       | 12                                         |
| 3.3 / 3.4 Approval                            | `/approve/[linkId]`                                                              | `signedIn` (12 checks the role) | 12                                         |
| 4.1 Settings                                  | `/app/settings`                                                                  | `student`                       | 13                                         |
| 4.2 Recover                                   | `/recover`                                                                       | none                            | 13                                         |
| 4.3 Approve recovery                          | `/recover/[linkId]`                                                              | `signedIn` (13 checks the role) | 13                                         |

- **S06-8** Guards are one pure function, `decideRoute(path, state) → { allow } | { unlock } | { redirect: to }`, in `lib/client/guard.ts`. `state` is `{ session: null | { role } }` where `role` is the result of S06-20. Rules:

| Guard        | No session | Session, role none                 | Session, student      | Session, trusted only  |
| ------------ | ---------- | ---------------------------------- | --------------------- | ---------------------- |
| `student`    | unlock     | redirect `/app`                    | allow                 | redirect `/app/parent` |
| `trusted`    | unlock     | redirect `/app`                    | redirect `/app` (C17) | allow                  |
| `onboarding` | unlock     | allow                              | allow                 | redirect `/app/parent` |
| `signedIn`   | unlock     | allow (page shows its own refusal) | allow                 | allow                  |
| none         | allow      | allow                              | allow                 | allow                  |

A person who is both a student and a trusted person (allowed by 01 address rules) passes both `student` and `trusted` guards. `/app` itself: student → home; trusted only → redirect `/app/parent`; role none or no session → Welcome (07).

- **S06-9** Redirects use `router.replace`, so Back does not return to the refused page. A guarded page renders nothing, starts no data request and offers no action until the guard says `allow`. This is what makes C17 "Both are sent away; nothing is created" true on the client. Guards are for the user's comfort only. The real control is the contract role checks and the signed API roles (05). No spec may rely on a guard for security.
- **S06-10** "Unlock" means: the route stays in the address bar and an unlock sheet covers the page. The sheet shows the logo, the title "Welcome back", the line "Sign in with your passkey to continue.", a primary button "Sign in with passkey" and a text button "New to Amplop? Start here" (goes to `/app`). If a last-used profile exists (S06-17), the button signs in with that credential, and a second text button "Use another passkey" signs in with the browser's passkey chooser. After sign-in the guard runs again on the same route. The sheet needs a tap because Safari only starts a passkey prompt from a user gesture.

### C. Passkey accounts (Mera)

- **S06-11** All passkey and key code lives in `lib/client/account/` and uses `@category-labs/mera` (exact version pinned) and `@category-labs/mera/viem`. Exported API:

```ts
checkPasskeySupport(): Promise<{ ok: true } | { ok: false; reason: "no_webauthn" | "no_platform_authenticator" | "no_prf" }>
createPasskeyAccount(kind: "student" | "trusted", opts: { studentShortName?: string }): Promise<Session>
signInWithPasskey(opts?: { credentialId?: string }): Promise<Session>
signOut(): void
switchProfile(credentialId: string): Promise<Session>
useSession(): { session: Session | null; role: Role | "loading" }
type Session = { address: `0x${string}`; credentialId: string; account: LocalAccount }  // viem LocalAccount from toViemAccount
```

- **S06-12** Support check, run once when the shell loads: `window.PublicKeyCredential` must exist (`no_webauthn` if not); `PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()` must resolve true (`no_platform_authenticator`); if `PublicKeyCredential.getClientCapabilities` exists and returns `"extension:prf": false`, the result is `no_prf`. When the capability is unknown the check passes, and a `PRF_UNAVAILABLE` error at creation is handled by S06-15.
- **S06-13** Create: call `createPasskeyWithPrfOutput` with `rp: { id: location.hostname, name: "Amplop" }` and `user.name = user.displayName =` "Amplop student account" (kind `student`) or "Amplop: trusted person for {studentShortName}" (kind `trusted`). These labels let the phone's passkey chooser tell two Amplop passkeys apart (PRD 17). Use Mera's default PRF salt. Never pass a custom salt.
- **S06-14** Derive the key exactly as the Mera docs do, and never change it, because a change gives every user a new address: `prfOutput` (32 bytes) → `entropyToMnemonic(prfOutput, english)` → `mnemonicToSeedSync` → `HDKey.fromMasterSeed(seed).derive("m/44'/60'/0'/0/0")` → `createSecp256k1SigningSession({ privateKey })` → `toViemAccount(session)`. Use `@scure/bip39` and `@scure/bip32` (already viem dependencies; pin them). After the session is created, overwrite `prfOutput`, `seed` and the derived `privateKey` byte arrays with zeros and drop every reference to the mnemonic. A unit test pins one fixed PRF output to one expected address.
- **S06-15** Errors from Mera map to three app errors. A `MeraError` with code `PASSKEY_OPERATION_FAILED` whose cause is a `NotAllowedError` (or has no cause) is `PasskeyCancelled`. `PRF_UNAVAILABLE` is `PasskeyUnsupported`. Anything else is `PasskeyFailed`. On any of these the screen stays where it is, shows the sentence from S06-36, and enables the button again. A second try must work without a reload (A4, B9).
- **S06-16** The private key exists only inside the Mera signing session in memory. It is never written to `localStorage`, `sessionStorage`, IndexedDB, cookies, the URL, React state that is serialised, error reports or logs, and never sent over the network (PRD 15 threat table). `signOut()` calls `session.end()`, clears every cached query, clears in-memory state, and navigates to `/app`. Closing or reloading the tab loses the session by design. The next visit shows Welcome or the unlock sheet (S06-10).

### D. Local profiles and the View as mechanism

- **S06-17** `lib/client/profiles.ts` keeps a list of passkeys used on this device in `localStorage` key `amplop.profiles.v1`: an array of at most 5 records `{ credentialId: string, label: string, transports?: string[] }`, most recent first, unique by `credentialId`. `transports` is Mera's optional hint and holds no key material. `amplop.lastProfile` holds the last used `credentialId`. Nothing else about an account is stored: no address, no account id, no role, no key. Exports: `listProfiles()`, `saveProfile(record)`, `setProfileLabel(credentialId, label)`, `lastProfileId()`.
- **S06-18** A record is saved right after a passkey is created (label "Amplop student" or the trusted person's name from the invite), and after any successful sign-in with a credential not yet listed. Its label is updated when the real name is known: a student's label becomes their short name (S06-31); a trusted person's label becomes the name the student typed on the invite (from `GET /api/invite/latest`, spec 10, falling back to "Trusted person").
- **S06-19** `switchProfile(credentialId)` is the View as mechanism (15 owns the button). It throws without doing anything when `NEXT_PUBLIC_DEMO_MODE` is not `"true"` (15, K4). It: (1) calls `getPasskeyPrfOutput({ rpId, credential: { credentialId, transports } })`; (2) only when that succeeds, ends the current session, clears all cached queries and in-memory state; (3) starts the new session and resolves its role (S06-20); (4) navigates with `replace` to `/app/parent` if the new role is trusted only, else `/app`. If the prompt is cancelled, the current session stays signed in and nothing changes. Each switch signs in as the other real account (K1). `signInWithPasskey({ credentialId })` (unlock sheet, last profile) and `switchProfile` both pass `allowCredentials` with that one credential id, so a browser holding two Amplop passkeys never picks the wrong one (01 §9, K1). Only "Use another passkey" leaves the choice to the browser.

### E. Finding the account for an address

- **S06-20** `resolveRole(address)` (exported from `lib/client/account/`) reads `accountOf(address)` and `trustedAccountOf(address)` from the contract in parallel. It returns `{ studentAccountId?: bigint; trustedAccountId?: bigint }`, with "none" when both are 0. The contract is the only source. The indexer `Account` entity may be used to prefetch, but never to decide. The role is read again after any transaction the user sends, after `switchProfile`, and when the window regains focus, so a removed trusted person loses access on their next focus (J6, 10).

### F. Contract client

- **S06-21** `lib/client/chain/client.ts` creates one viem public client. The chain is `defineChain` with `id = NEXT_PUBLIC_CHAIN_ID` (10143, or 31337 in tests). Transport: `fallback([http(NEXT_PUBLIC_MONAD_RPC_URL, { batch: true, retryCount: 0, timeout: 10_000 }), http(NEXT_PUBLIC_MONAD_RPC_URL_FALLBACK, { batch: true, retryCount: 0, timeout: 10_000 })], { rank: false, retryCount: 1 })`. A rate-limited (HTTP 429) or failing first provider moves the call to the second without any message to the user (L5). Reads use the `latest` block tag. Multicall is not used, because Anvil has no Multicall3; JSON-RPC batching groups parallel reads instead.
- **S06-22** ABI and types come from the generated ABI in `packages/shared` (wagmi CLI from the Foundry build, PRD 15). They are never copied by hand. The contract address is `NEXT_PUBLIC_CONTRACT_ADDRESS`.
- **S06-23** Every user transaction goes through one helper, `sendUserTx(call, { onStatus })` in `lib/client/chain/write.ts`, where `call = { functionName, args }` for `AmplopEnvelopes`. It runs these steps in order:
  1. Take a cross-tab lock with `navigator.locks.request("amplop-tx-" + address, ...)`. A second tab waits; it does not send in parallel (L8).
  2. `simulateContract` with the session account. A revert stops here, nothing is sent, and the decoded custom error goes to S06-35.
  3. `estimateContractGas`, then `gasLimit = max(estimate + estimate / 5, GAS_FLOOR[functionName])` (01 §9: estimate plus 20%, never below the floor from 03's gas report; Monad charges the gas limit, so no wider margin).
  4. `estimateFeesPerGas()` gives `maxFeePerGas` and `maxPriorityFeePerGas`.
  5. Funding check (S06-24). Status `funding` while it runs.
  6. Reserve-balance spacing: if this account sent a transaction before in this session, wait until the latest block is at least 3 blocks after that transaction's block (S06-25).
  7. `writeContract` with explicit `gas: gasLimit` and both fee fields. Status `sending`.
  8. `waitForTransactionReceipt({ hash, timeout: 30_000 })`. Status `confirming`. A receipt with `status: "reverted"` re-runs the simulation to find the reason (S06-35). A timeout shows the S06-36 "taking longer" sentence and keeps polling for up to 2 minutes, then shows the failure sentence with Try again.
  9. On success: write `{ hash, functionName, at }` to `sessionStorage` key `amplop.lastTx` (a public hash only), post `{ type: "tx", hash }` on `BroadcastChannel("amplop")`, invalidate cached reads for this account, and return `{ hash, receipt, proofUrl }`.

  `onStatus` receives `preparing | funding | signing | sending | confirming | done | failed`. Screens show `funding` as "Getting ready…" (07 owns the A15 wording), `sending` as "Sending…" and `confirming` as "Confirming…".

- **S06-24** Funding check, `ensureFunded(address, neededWei)`: read the MON balance. Let `unit = TYPICAL_ACTION_GAS × maxFeePerGas` (constant in `packages/shared`, 01 §9). If `balance < 3 × unit` or `balance < gasLimit × maxFeePerGas`, call `POST /api/fund` (07) with the signed client. On `sent`, wait for the funding receipt, then wait until the latest block is at least 3 blocks after it (Monad asynchronous execution: a newly funded account cannot send until its funding is 3 blocks old; MONSKILLS `concepts`). Retry `502` and network errors up to 3 times after 1 s, 3 s and 9 s. Do not retry `429`; show its message (A16). `ensureFunded` is single-flight per address: a call made while another is running for the same address waits for that one instead of calling `/api/fund` again (07 starts one early during sign-up). The user never sees MON, a fee or a wallet prompt (PRD 9).
- **S06-25** Amplop accounts hold far less than 10 MON, so Monad treats them as low-balance accounts: one transaction every 3 blocks, and an in-flight gas budget of `min(10 MON, balance)` (reserve balance rule; MONSKILLS `concepts`). The write helper therefore sends one transaction at a time per account and keeps the 3-block spacing in step 6. The app never signs an EIP-7702 authorisation (`signAuthorization` is never called): a delegated account is always held to the 10 MON floor and could not spend its small sponsored balance.
- **S06-26** `proofUrl(hash) = NEXT_PUBLIC_EXPLORER_TX_URL + hash`. Every "View transaction proof" link uses the `ProofLink` component: an `<a>` with `target="_blank"` and `rel="noopener noreferrer"`, the visible text "View transaction proof", and an accessible name that includes what it proves, for example "View transaction proof for Allowance sent".
- **S06-27** A screen may use viem's `sendTransactionSync` (`eth_sendRawTransactionSync`) in step 7 when the active RPC supports it. Otherwise it uses `writeContract` plus step 8. The returned shape is the same either way.

### G. Signed API client

- **S06-28** `lib/client/api.ts` exports `api.get(path, opts?)`, `api.post(path, body, opts)` and `class ApiError { status; code; message }`. `opts.auth` is `{ action, accountId }` for signed calls (01 §4 action names); omit it for `public` endpoints. For each signed call it:
  1. calls `GET /api/auth/nonce` and computes `serverOffset = Date.parse(expiresAt) − 5 min − Date.now()`;
  2. serialises the body once with `JSON.stringify` and keeps those exact bytes (empty string for `GET`);
  3. builds the 01 §4 message line by line: `Amplop request`, `Site: <location.host>`, `Chain: <NEXT_PUBLIC_CHAIN_ID>`, `Action: <action>`, `Account: <accountId or 0>`, `Address: <session address, lowercase>`, `Nonce: <nonce>`, `Issued: <new Date(Date.now() + serverOffset).toISOString()>`, `Body: <sha256 hex of the body bytes>` (WebCrypto), joined with `\n`, no trailing newline;
  4. signs it with `session.account.signMessage({ message })` (EIP-191);
  5. sends `Amplop-Auth-Message: base64url(message)`, `Amplop-Auth-Signature: <0x hex>`, `Content-Type: application/json`, with `credentials: "same-origin"`, `referrerPolicy: "no-referrer"`, and the exact body bytes.
- **S06-29** A `409` from a signed call (nonce unknown, expired or used) is retried once with a fresh nonce. `401` and `403` are never retried. Any error response is parsed as `{ error: { code, message } }` into `ApiError`. A network failure becomes `ApiError { status: 0, code: "offline" }`. The message, signature, nonce and body are never logged.

### H. Plain sentences for errors

- **S06-30** `lib/client/errors.ts` exports `toPlainMessage(error) → { key, text }`. Order: `ApiError` with a known `code` → that code's i18n key (each feature spec lists its codes); a decoded contract custom error → `chainError.<ErrorName>`; the S06-36 non-contract cases; else the generic sentence. The server's `message` is used only when the code has no key. Raw error text, hex data or stack traces never reach the screen.

### I. Money, numbers, names and dates (`packages/shared`)

- **S06-31** `packages/shared/src/names.ts`: `normalizeName(raw) → { ok: true; value } | { ok: false; reason: "empty" | "too_long" | "bad_chars" }`. It applies NFC, trims Unicode white space, turns runs of white space into one space, rejects control characters (`\p{Cc}`), line and paragraph separators and bidi override characters (U+202A to U+202E, U+2066 to U+2069), and allows 1 to 60 grapheme clusters (counted with `Intl.Segmenter`). Any script is allowed. `shortName(name)` returns the first space-separated word ("Raka Pratama" → "Raka"), or the whole name if it has no space. The client and server use the same function.
- **S06-32** `packages/shared/src/money.ts`, all `bigint`, never `number`. Display uses a dot for thousands and a comma for decimals in both languages (01 §8, L11). It does not use `Intl.NumberFormat`, whose output changes by locale.

| Function                                    | Example in → out                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `formatUsd(units, decimals)`                | `1_000_000_000n, 6` → `$1.000,00`; `14_388_750n, 6` → `$14,39` (cents rounded half up); `0n` → `$0,00`; negative → `−$14,39` (U+2212)                                                                                                                                                                                                                                                       |
| `formatRupiah(rupiah)`                      | `16_500_000n` → `Rp16.500.000`                                                                                                                                                                                                                                                                                                                                                              |
| `formatRupiahRounded(rupiah, step = 1000n)` | `2_050_125n` → `Rp2.050.000` (nearest step, half up)                                                                                                                                                                                                                                                                                                                                        |
| `formatRupiahCompact(rupiah, lang)`         | `10_887_690n, "en"` → `Rp10,9 million`; `"id"` → `Rp10,9 juta`; ≥ 10⁹ uses `billion` / `miliar`; under 10⁶ falls back to `formatRupiahRounded`                                                                                                                                                                                                                                              |
| `formatEur(minor)`                          | `1250n` → `€12,50`                                                                                                                                                                                                                                                                                                                                                                          |
| `formatPercent(n)`                          | `40` → `40%`                                                                                                                                                                                                                                                                                                                                                                                |
| `rupiahToUnits(rupiah, decimals)`           | `floor(rupiah × 10^decimals / 16500)`; `16_500_000n, 6` → `1_000_000_000n`                                                                                                                                                                                                                                                                                                                  |
| `eurMinorToUnits(minor, decimals)`          | `floor(minor × 11511 × 10^decimals / (10000 × 100))`; `1250n, 6` → `14_388_750n`                                                                                                                                                                                                                                                                                                            |
| `parseDecimalInput(text, decimals)`         | Returns `{ ok, minor }` or an error. With a comma present, the comma is the decimal mark and dots are thousands separators. Without one, a dot followed by 1 or 2 final digits is the decimal mark, and other dots are thousands separators. Rejects letters, signs, empty input and more than `decimals` decimal places. For `decimals = 0` (rupiah) dots are always thousands separators. |

The rates come from configuration (`SAMPLE_RATE_IDR_PER_USD`, `SAMPLE_RATE_USD_PER_EUR`) on the server. The functions take the rate as a parameter with these defaults. `decimals` always comes from the token's `decimals()` read, never a literal.

- **S06-33** `packages/shared/src/dates.ts`. Dates on screen follow the account clock (PRD 12):
  - `accountClockNow(clockRead, readAtMs)` = the value of the contract's `clock(accountId)` when it was read, plus the seconds passed since (`performance.now()` difference). It does not use the device clock, so a wrong phone clock or a skipped account still shows the right day. Screens refetch `clock` with the account's other reads.
  - `dayNumber(s) = floor(s / 86400)` and `mondayNumber(d) = floor((d + 3) / 7)`, as in 01 §1.
  - Day-only values (release days such as `nextReleaseDay`) are shown as UTC dates, because releases happen at Monday 00:00 UTC. Moments (request sent, opens at, ready at, purchase time) are shown in the device's time zone.
  - Formats (built from `Intl.DateTimeFormat#formatToParts` so the pattern is fixed):

| Function                                         | English                          | Bahasa Indonesia                  |
| ------------------------------------------------ | -------------------------------- | --------------------------------- |
| `formatDay`                                      | `Mon, 12 Oct`                    | `Sen, 12 Okt`                     |
| `formatDayTime`                                  | `Wed, 7 Oct at 14:05`            | `Rab, 7 Okt pukul 14.05`          |
| `formatRelative` (same account day / day before) | `Today 14:05`, `Yesterday 09:12` | `Hari ini 14.05`, `Kemarin 09.12` |
| `formatDuration(seconds)`                        | `47 h 12 min`, `12 min`          | `47 j 12 mnt`, `12 mnt`           |
| `formatMonthYear`                                | `October 2026`                   | `Oktober 2026`                    |

24-hour time in both languages. "Today" means the same day number on the account clock in the device's time zone.

### J. Languages

- **S06-34** English is the default (PRD 2). Bahasa Indonesia is the second language. Strings live in `apps/web/messages/en.json` and `apps/web/messages/id.json`. They are read with `useT()` from `lib/client/i18n` (a small in-house helper with `{name}` placeholders; no locale in the URL, because PRD 5 fixes the routes). The choice is stored in `localStorage` key `amplop.lang` (`"en"` or `"id"`) and sets `<html lang>`. Money formats do not change with the language (A17, L11). User-typed text (names, reasons, shop names) is never translated. Each feature spec gives its English copy. The implementer adds the Indonesian line in the same commit. A unit test fails if any key is missing from either file. API error codes map to i18n keys; the server's English `message` is only a fallback.

### K. Error sentence table

- **S06-35** Contract custom errors (03 S03-53 owns the names) map to these sentences. A unit test reads every `type: "error"` entry in the generated ABI and fails if one has no `chainError.<Name>` key, so when 03 adds an error the build fails until a sentence exists. A screen may replace a sentence with its own state (for example 10 S10-19 switches the invite page to its "used" state).

| 03 error                                                                                                                                                                                                                                                                                                                                | Sentence (English)                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `NoAccount`, `NotOwner`                                                                                                                                                                                                                                                                                                                 | "Only the account owner can do this. Sign in with the right passkey."                                                               |
| `NotTrusted`                                                                                                                                                                                                                                                                                                                            | "Only the trusted person can do this."                                                                                              |
| `AlreadyHasAccount`                                                                                                                                                                                                                                                                                                                     | "This passkey already has an account. Sign in instead."                                                                             |
| `AccountNotFound`                                                                                                                                                                                                                                                                                                                       | "This account could not be found."                                                                                                  |
| `InvalidSplit`                                                                                                                                                                                                                                                                                                                          | "The split must add up to 100%, in steps of 5."                                                                                     |
| `InviteExpired`                                                                                                                                                                                                                                                                                                                         | "This invite has expired."                                                                                                          |
| `InviteUsed`                                                                                                                                                                                                                                                                                                                            | "This invite has already been used."                                                                                                |
| `NoInvite`, `BadSignature`                                                                                                                                                                                                                                                                                                              | "This invite is not valid."                                                                                                         |
| `CannotTrustSelf`                                                                                                                                                                                                                                                                                                                       | "A student cannot be their own trusted person."                                                                                     |
| `AlreadyTrusted`                                                                                                                                                                                                                                                                                                                        | "You are already a trusted person for another student. In this version, one person can be the trusted person for one student only." |
| `TrustedAlreadyLinked`                                                                                                                                                                                                                                                                                                                  | "This student already has a trusted person."                                                                                        |
| `NoTrustedPerson`                                                                                                                                                                                                                                                                                                                       | "There is no trusted person to remove."                                                                                             |
| `TrustedRemovalPending`                                                                                                                                                                                                                                                                                                                 | "The trusted person is being changed, so a recovery can't be approved right now."                                                   |
| `NothingPending`                                                                                                                                                                                                                                                                                                                        | "There is nothing waiting to cancel."                                                                                               |
| `WaitOver`                                                                                                                                                                                                                                                                                                                              | "The 48-hour wait is already over."                                                                                                 |
| `WaitNotOver`                                                                                                                                                                                                                                                                                                                           | "The 48-hour wait is not over yet."                                                                                                 |
| `AmountAboveLocked`                                                                                                                                                                                                                                                                                                                     | "That is more than the locked Emergency balance."                                                                                   |
| `AmountZero`                                                                                                                                                                                                                                                                                                                            | "Enter an amount above $0,00."                                                                                                      |
| `ReasonRequired`                                                                                                                                                                                                                                                                                                                        | "Write a reason for the request."                                                                                                   |
| `RequestAlreadyOpen`                                                                                                                                                                                                                                                                                                                    | "You already have an open Emergency request."                                                                                       |
| `NoOpenRequest`                                                                                                                                                                                                                                                                                                                         | "There is no open Emergency request."                                                                                               |
| `RequestChanged` | "This request changed. Open the latest request and approve it again." |
| `LockOffPending`                                                                                                                                                                                                                                                                                                                        | "The Emergency lock is switching off, so you can't ask right now."                                                                  |
| `LockAlreadyOff`                                                                                                                                                                                                                                                                                                                        | "The Emergency lock is already off."                                                                                                |
| `PurchaseNotFound`, `NotFromEveryday`, `AlreadyMoved`, `InvalidTarget`, `NothingToMove`                                                                                                                                                                                                                                                 | "This purchase can't be moved."                                                                                                     |
| `MovePeriodOver`                                                                                                                                                                                                                                                                                                                        | "Purchases can only be moved within 7 days."                                                                                        |
| `TargetShort`                                                                                                                                                                                                                                                                                                                           | "That envelope doesn't have enough available for this move."                                                                        |
| `NewOwnerHasAccount`                                                                                                                                                                                                                                                                                                                    | "That passkey already has an account."                                                                                              |
| `NotNewOwner` | "Only the new passkey can finish this recovery." |
| `NewOwnerIsTrusted`                                                                                                                                                                                                                                                                                                                     | "A trusted person's passkey can't take over an account."                                                                            |
| `RecoveryTargetBusy`                                                                                                                                                                                                                                                                                                                    | "This new passkey is already waiting for another recovery. Create a fresh one."                                                     |
| `DemoOff`                                                                                                                                                                                                                                                                                                                               | "Skipping time is only available in the demo."                                                                                      |
| `InvalidDays`                                                                                                                                                                                                                                                                                                                           | "You can skip up to 14 days at a time."                                                                                             |
| Server-key-only errors (`NotTreasury`, `NotCardService`, `PaymentAlreadyUsed`, `PurchaseIdUsed`, `NotHeld`, `AmountAboveHeld`, `HoldExpired`, `HoldNotExpired`, `NotCollected`, `RefundTooLarge`, `AmountTooLarge`, `InvalidId`, `TooManySchedules`, `TransferMismatch`, `ZeroAddress`, `TokenDecimalsUnreadable`, OpenZeppelin errors) | Generic sentence                                                                                                                    |

- **S06-36** Non-contract cases:

| Case                                                               | Sentence (English)                                                                                                     | Button                  |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| Generic or unknown                                                 | "Something went wrong and nothing was changed. Try again."                                                             | Try again               |
| Transaction reverted on the chain                                  | "The transaction did not go through. Nothing was changed."                                                             | Try again               |
| Receipt slow (over 30 s)                                           | "This is taking longer than usual. We'll keep checking."                                                               | none, keeps polling     |
| No connection (`offline`, fetch failure, `navigator.onLine` false) | "No connection. Check your internet and try again."                                                                    | Try again               |
| Account still not funded after retries                             | "Your account is still getting ready. Try again in a moment."                                                          | Try again               |
| `nonce too low` from the RPC                                       | none: retried once without telling the user                                                                            |                         |
| `PasskeyCancelled`                                                 | "The passkey prompt was closed. Try again when you're ready."                                                          | the screen's own button |
| `PasskeyUnsupported`                                               | "This browser can't use passkeys with Amplop. Open Amplop in Chrome on Android or Safari on iPhone (iOS 18 or later)." | none                    |
| `PasskeyFailed`                                                    | "Your passkey didn't respond. Try again."                                                                              | the screen's own button |

### L. Design system

- **S06-37** Tokens from `design/SPEC.md` are defined once as CSS variables in `src/app/globals.css` with Tailwind v4 `@theme`, and shadcn/ui's variables point to them:

| Token                                                                                                    | Value                                                                          |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `--color-ground` (page background)                                                                       | `#F2F3EE`                                                                      |
| `--color-card`                                                                                           | `#FFFFFF`                                                                      |
| `--color-border`                                                                                         | `#D9DCD3`                                                                      |
| `--color-ink` (text, primary button)                                                                     | `#111B33`                                                                      |
| `--color-muted`                                                                                          | `#55606E`                                                                      |
| `--color-quiet` (quiet surface, Detail box)                                                              | `#E7E9E2`                                                                      |
| `--color-input-border`                                                                                   | `#7C8591`                                                                      |
| `--color-link`                                                                                           | `#2A5CA6`                                                                      |
| `--color-danger` (cancel text)                                                                           | `#A51F1E`                                                                      |
| Envelopes: `--color-food`, `--color-transport`, `--color-study`, `--color-everyday`, `--color-emergency` | `#2B7A4B`, `#6E4A9C`, `#2A5CA6`, `#8C5A2B`, `#B5302A` (solid fill, white text) |
| Status OK (Approved, Collected, Released)                                                                | text `#0D6332` on `#D9F8E0`                                                    |
| Status wait (On hold, Waiting)                                                                           | text `#7E4F04` on `#FEEDC5`                                                    |
| Status bad (Declined, Blocked)                                                                           | text `#A51F1E` on `#FFE7E4`                                                    |
| Status locked (Locked, Not yet) and Info box                                                             | text `#444D61` on `#E6EAF2`                                                    |
| Radius                                                                                                   | 16px tiles, cards, buttons; 999px pills; 12px inputs                           |
| Page side padding                                                                                        | 20px; gaps 10 to 20px                                                          |

Light theme only (`color-scheme: light`). No gradients, no emoji, no images for icons: inline stroke SVG, 24 viewBox, `stroke-width: 2`, round caps (lucide-react matches this).

- **S06-38** Fonts with `next/font/google` (self-hosted at build, so no font request leaves the app at run time): Plus Jakarta Sans 400, 500, 600, 700 for everything; Archivo with the `wdth` axis (62 to 125) at weight 800, loaded only by the landing page layout, for landing headlines (`font-stretch: 125%`). Type sizes use `rem` so the phone's text size setting applies (L9). Student screens use a 1rem (16px) base; parent and trusted-person screens (`/app/parent*`, `/invite/*`, `/approve/*`, `/recover/[linkId]`) use 1.0625rem (17px). No text is smaller than 0.8125rem (13px). Amounts use `font-variant-numeric: tabular-nums`.
- **S06-39** Shared components in `src/components/`, built on shadcn/ui where it has a base. Each one matches `design/boards/ThemeA.dc.html` and the boards that use it:

| Component             | Rules                                                                                                                                                                                                                                                                                                    |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`              | `primary`: 52px tall (56px on parent screens), radius 16, ink background, white bold text, full width. `secondary`: white, 1px `#7C8591` border, ink text. `text`: no background, link colour, 48px tall; `danger` variant uses `#A51F1E`. Busy state keeps the width and shows the status label.        |
| `TopBar`              | Sub-page bar, 56px tall, back chevron as a 44×44 `<a>` with `aria-label="Back"`, title 18px bold.                                                                                                                                                                                                        |
| `EnvelopeTile`        | Solid envelope colour, white text, the four wavy "guilloche" lines copied from ThemeA.dc.html.                                                                                                                                                                                                           |
| `EnvelopeChip`        | Pill, solid envelope colour, white 13px bold text.                                                                                                                                                                                                                                                       |
| `StatusBadge`         | Pill, 13px bold, icon plus word, tinted pair from S06-37.                                                                                                                                                                                                                                                |
| `ListCard`, `ListRow` | White, radius 16, `padding: 0 16px`, rows 52 to 60px tall, 1px `#D9DCD3` dividers.                                                                                                                                                                                                                       |
| `InfoBox`             | `#E6EAF2` background, `#444D61` text, radius 16, `padding: 14px 16px`, clock or info icon.                                                                                                                                                                                                               |
| `DetailBox`           | Receipts only. `#E7E9E2`, radius 16, heading "Detail" 14px bold muted, rows 14px. The only place the words "AUSD" and "digital dollar" may appear (design/SPEC.md, PRD 13).                                                                                                                              |
| `ResultHeader`        | 72px circle with icon on the tinted status colour, title 24px bold in the status text colour, amount 32px.                                                                                                                                                                                               |
| `DemoCard`            | 350×221 at 390 wide (scales with width, keeps the ratio), `#111B33`, radius 16, white guilloche at 0.12 opacity, on-dark logo top left, pill "Demo card" (white outline), "•••• •••• •••• {last4}" and the name in capitals at the bottom, cut with an ellipsis on one line (A9). No card network marks. |
| `TabBar`              | Student only (Home, Card, Activity screens): 68px plus the bottom safe area, white, top border, three `<a>` items "Envelopes" `/app`, "Card" `/app/card`, "Activity" `/app/activity`; the selected item is ink and bold with `aria-current="page"`, others `#55606E`.                                    |
| `Stepper`             | Minus and plus for the split editor. A 36px visible circle inside a 44×44 tap area. Accessible names "Less {envelope}" and "More {envelope}".                                                                                                                                                            |
| `TextField`           | `<label for>` plus `<input id>`, radius 12, 1px `#7C8591` border, 48px tall, help text below.                                                                                                                                                                                                            |
| `Switch`              | `role="switch"`, `aria-checked`, 48×28 visible inside a 44px tall tap area.                                                                                                                                                                                                                              |
| `Sheet`               | shadcn Dialog or Drawer, focus trapped, Esc and back gesture close it.                                                                                                                                                                                                                                   |
| `InlineMessage`       | One line of text (with an optional Try again button) shown in place on the existing screen, `aria-live="polite"`. Kinds: `info`, `error`, `offline`.                                                                                                                                                     |
| `ProofLink`           | S06-26.                                                                                                                                                                                                                                                                                                  |
| `LanguageToggle`      | Two-segment pill "EN" / "ID", each a 44px tall button with `aria-pressed` and `aria-label` "English" / "Bahasa Indonesia" (Welcome board).                                                                                                                                                               |
| `Logo`                | S06-40.                                                                                                                                                                                                                                                                                                  |
| `DemoBanner`          | S06-41.                                                                                                                                                                                                                                                                                                  |
| `UnlockSheet`         | S06-10.                                                                                                                                                                                                                                                                                                  |

The shell renders pages in a column at most 480px wide, centred on wider screens, on the ground colour, with `min-height: 100dvh` and padding for `env(safe-area-inset-*)` in standalone mode. Unlike the mock-ups, pages never use a fixed 844px height. They scroll.

### M. Logo, demo banner

- **S06-40** The logo is the "Kiriman" design in `design/logo/`. Inline the SVGs from `design/logo/svg/` as React components (`<Logo variant="color" | "on-dark" | "mono" | "white" height={…} />`), so they cost no request. Use:
  - colour lockup (`amplop-logo.svg`) in the landing header, 34px tall, inside an `<a aria-label="Amplop home">` with the SVG `aria-hidden` (Landing board), and on Welcome, 28px tall, `role="img" aria-label="Amplop"` (Welcome board);
  - on-dark lockup (`amplop-logo-on-dark.svg`) on the `DemoCard`, 22px tall (Card and Name boards).

  Rules from the logo README: the full logo is never narrower than 96px; the mark alone is never smaller than 24px (use the favicon below that); keep clear space at least as wide as the card in the mark; never stretch, outline, shadow or recolour it outside the listed colours.

- **S06-41** `DemoBanner` is the first element inside the shell layout, above every screen's top bar, on every shell route (`/app/*`, `/invite/*`, `/approve/*`, `/recover*`), never on `/`. It sits in the page flow (not fixed), so it never covers content. Min height 32px, 13px text, `#E7E9E2` background, ink text, an info icon, `role="note"`. It renders only when `NEXT_PUBLIC_DEMO_MODE === "true"`. Its text and the rule for when demo controls exist belong to 15 (PRD 12 wording: "Demo mode: payments are simulated and time can be skipped").

### N. Shared states every screen handles

- **S06-42** **Loading.** While first reads are in flight, a screen shows its layout with muted placeholder blocks, or the line "Loading…". It never shows a blank page or a spinner for more than 10 s without text. Buttons that start a write show the write status (S06-23) and are disabled while it runs, so a double tap sends one action.
- **S06-43** **No connection** (L4). When `navigator.onLine` is false, or a read or API call fails with a network error, the screen shows `InlineMessage kind="offline"` with "No connection. Check your internet and try again." and a Try again button that repeats the failed step. When the browser fires `online`, reads refetch by themselves.
- **S06-44** **Nothing half-saved** (L4). Every multi-step action is ordered so a failure at any point leaves a state the screen can resume from: the chain write comes first, and any server write that follows is idempotent (upsert, or returns the existing row) and is retried when the screen next loads. The hash of a sent transaction is kept in memory and `amplop.lastTx`, so after a lost connection or reload the screen checks that receipt before offering to send again. Each feature spec states the order for its actions.
- **S06-45** **Transaction failed** (L6). A revert or failure shows the mapped sentence (S06-35, S06-36) with a Try again button, within 5 s of the receipt or error. No screen waits on a promise without a timeout: reads time out at 10 s, receipts follow S06-23 step 8.
- **S06-46** **Reload and deep links** (L7). Each screen's state comes only from its route, its params, the chain and the server. The only exceptions are the passkey session (memory) and onboarding drafts (07, `sessionStorage`). Reloading any route, or opening it directly in a new tab, shows the unlock sheet if needed, then the same screen in its current state.
- **S06-47** **Two tabs** (L8). Writes from one account are serialised across tabs (S06-23 step 1). After a confirmed write, the other tabs receive the `BroadcastChannel("amplop")` message and refetch. Both tabs show the same balances after a refresh. If a second tab tries an action the first already did, the simulation fails with the contract's error, mapped to a sentence, and nothing is sent.
- **S06-48** **Small screens and large text** (L9, L10). Every screen works at 360×640 with the root font size at 200%. Text wraps or truncates with an ellipsis; it is never clipped or overlapping; amounts never overflow their container (`min-width: 0` on flex children, `overflow-wrap: anywhere` on user text). Every button and link has an accessible name and is at least 44px tall. Focus is visible. Icon-only buttons have `aria-label`. Status changes are announced by `aria-live` regions.

### O. Chat-app browsers and WhatsApp

- **S06-49** `isChatAppBrowser(userAgent)` in `lib/client/browser.ts` returns true when the user agent matches `/FBAN|FBAV|FB_IAB|Instagram|Line\/|WhatsApp|MicroMessenger|Snapchat|TikTok|musical_ly|BytedanceWebview|Twitter|KAKAOTALK/i`, or contains `; wv)` (Android WebView). On every shell route, when it returns true, the shell shows board 0.1 (built by 07) in place of the page. The URL is left as it is, so Copy link copies the full address, including any `#k=` fragment. A text button "Try here anyway" lets the person continue (it stores `amplop.gateSkip = "1"` in `sessionStorage`), in case detection is wrong. The gate does not offer an Android `intent://` link, because that would drop the URL fragment that carries the invite key.
- **S06-50** `whatsappUrl(text, { secret })` in `lib/client/share.ts`. For text that holds no secret it returns `https://wa.me/?text=<encodeURIComponent(text)>`. For text that holds a secret (only the invite link, 10) it returns `whatsapp://send?text=<…>`. The app scheme hands the text straight to WhatsApp on the phone and makes no web request, so the invite key never reaches `wa.me`'s servers (PRD 15). Share buttons are `<a>` elements, so they work from a user tap. `copyText(text | Promise<string>)` uses `navigator.clipboard.write` with a `ClipboardItem` built from a promise where supported (Safari keeps the tap's permission), and `writeText` otherwise. After copying, the button's label changes to "Link copied" for 3 s.

### P. Test hooks, indexer client and day-one checks

- **S06-51** **Test hooks** (19). Shared components render the `data-testid`s listed in 01 §9 (`envelope-available-<i>`, `envelope-later-<i>`, `envelope-locked`, `parent-total-<i>`, `tx-proof` on every `ProofLink`, `demo-banner`, `history-catching-up`, `alert-item`). When `NEXT_PUBLIC_CHAIN_ID` is `31337`, and only then, the shell defines a read-only `window.__amplopTest = { address, accountId }` for the signed-in session; the code is dead in a 10143 build.
- **S06-52** **Indexer client and lag helper** (16 S16-13, S16-14). `lib/client/indexer.ts` posts `{ query, variables }` to `NEXT_PUBLIC_INDEXER_URL` with an `INDEXER_TIMEOUT_MS` (4 s) timeout and throws on `errors`. `useIndexerHealth()` runs `IndexerMetaQuery` and `getBlockNumber()` together at most every 10 s while a screen that reads the indexer is open, and reports `behind` when the call fails or times out, `isReady` is false, or `head − progressBlock > INDEXER_MAX_LAG_BLOCKS` (30). 11 and 14 use it. Nothing in the core flows calls it.
- **S06-53** **Day-one checks** (PRD 17, Mon 5 Oct, before feature work). (1) Mera works on the phones: create, sign in again and sign a transaction with a ten-line test page on Chrome for Android and Safari for iPhone; if it fails, swap Mera for another embedded-wallet kit Monad lists (Privy, Para or Turnkey) behind the S06-11 API, and no screen changes. (2) Two passkeys for one site on one phone can be told apart: create two on the test page and sign in with each; if they cannot, View as needs two browsers or two phones and the try-it guide says so (18 S18-14). Record both results in `apps/web/e2e/README.md` (19 S19-5 records the authenticator check there too).

## Interfaces used

- 01 §3 reads `accountOf`, `trustedAccountOf`, `clock`, `accountInfo`; every write goes through `sendUserTx`; EIP-712 domain for 10.
- 01 §4 signed request format, error shape, `GET /api/auth/nonce`, `POST /api/fund` (from `ensureFunded`).
- 01 §6 routes and link formats. 01 §7 `NEXT_PUBLIC_*` variables. 01 §8 money formats.
- `packages/shared`: generated ABI, `TYPICAL_ACTION_GAS` and `GAS_FLOOR` (01 §9), `INDEXER_MAX_LAG_BLOCKS` and `INDEXER_TIMEOUT_MS` (01 §9).
- From 05: CSP that allows this shell (see Security), `Referrer-Policy: no-referrer`, same-origin CORS.

## Screens

This spec builds no board. It builds the unlock sheet (S06-10), the offline page (S06-4), the demo banner slot (S06-41) and the gate mechanism (S06-49). Every board's route is in S06-7.

## Errors and edge cases

| Case                                                  | Behaviour                                                                                                                                                    |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Passkey prompt cancelled                              | S06-15: stay, plain sentence, button enabled, second try works.                                                                                              |
| Browser lacks passkey or PRF support                  | S06-12, 07 shows it on Welcome (A5).                                                                                                                         |
| Signed in with a passkey that has no account          | role none; `/app` shows Welcome with 07's "No account for this passkey" (A7).                                                                                |
| Old passkey after recovery, or removed trusted person | role none on next read (S06-20); guarded routes redirect to `/app` (I4, J6).                                                                                 |
| First RPC rate-limited                                | fallback transport, no message (L5).                                                                                                                         |
| Both RPCs down                                        | No-connection message with Try again.                                                                                                                        |
| Device clock wrong                                    | Dates use the contract clock (S06-33); signed requests use the server offset (S06-28).                                                                       |
| `localStorage` blocked (private mode)                 | Profiles and language are kept in memory for the tab; nothing fails; View as needs the passkey chooser.                                                      |
| Two tabs act at once                                  | S06-47.                                                                                                                                                      |
| `navigator.locks` missing (old browsers)              | Fall back to an in-tab mutex; the contract still refuses a double action.                                                                                    |
| Chat-app browser misdetected                          | "Try here anyway" (S06-49).                                                                                                                                  |
| Preview deployments                                   | Passkeys belong to the host name (rpId). A passkey made on a preview URL does not work on the production URL. The try-it guide uses only the production URL. |

## Security

- The private key and PRF output live in memory only (S06-14, S06-16). ESLint `no-restricted-globals` bans `localStorage`, `sessionStorage`, `indexedDB` and `document.cookie`, and `no-console` bans console calls, inside `lib/client/account/**`. The session object exposes only `address`, `credentialId` and viem signing methods, never the key.
- `localStorage` holds only the keys in 01 §9: `amplop.profiles.v1`, `amplop.lastProfile`, `amplop.lang`, `amplop.device` (07), `amplop.openOrders`, `amplop.seenDeposit` (08), `amplop.emergency.v1` (12), `amplop.recovery` (13). `sessionStorage` holds only `amplop.lastTx`, `amplop.gateSkip`, and 07's `amplop.onboarding.<credentialId>` draft. An E2E check fails on any other key or field.
- No `dangerouslySetInnerHTML` anywhere (ESLint `react/no-danger`). Names, reasons and shop names render as React text.
- The client logger redacts 64-hex strings and never logs signed messages, signatures, names, reasons or shop names (PRD 15 Logs).
- Signed requests follow 01 §4 exactly (S06-28). The client never sends a key, only signatures.
- What 05's CSP must allow for this shell (listed so 05 can include it): `script-src 'self' 'nonce-…'` (no `unsafe-inline`, no `unsafe-eval`); `connect-src 'self'` plus both `NEXT_PUBLIC_MONAD_RPC_URL*` origins and the `NEXT_PUBLIC_INDEXER_URL` origin; `worker-src 'self'`; `manifest-src 'self'`; `img-src 'self' data:`; `font-src 'self'`; `frame-ancestors 'none'`. Permissions-Policy must leave `publickey-credentials-create` and `publickey-credentials-get` allowed for `self`.
- Links to the explorer and WhatsApp use `rel="noopener noreferrer"`.

## Tests

**Unit (Vitest, `packages/shared` and `apps/web/src/lib/client`)**

- Money: every row of S06-32, plus `formatUsd(14_385_000n, 6)` → `$14,39` (half up), `formatUsd(5_000n, 6)` → `$0,01`, large values `$50.000.000,00`, and `parseDecimalInput` for "12,50", "12.50", "1.234,56", "1.234", "12,505" (error), "-1" (error), "" (error), "abc" (error).
- Dates: `formatDay` for 12 Oct 2026 in both languages; `formatDayTime`, `formatRelative` at the day boundary; `formatDuration(169_920)` → `47 h 12 min`; `accountClockNow` ignores a device clock set a day wrong; `mondayNumber` for a Sunday and a Monday.
- Names: empty, spaces only, 60 and 61 graphemes, Javanese and Arabic names, emoji counted as one grapheme, `‮` rejected, `<script>` accepted as plain text.
- Key derivation: a fixed 32-byte PRF output gives a fixed expected address (pins the path and salt).
- `decideRoute`: every cell of the S06-8 table, plus the student-and-trusted case.
- Signed message builder: the exact text for a fixed input matches a stored string; the body hash of `""` is `e3b0c442…b855`; the base64url header decodes back to the same text.
- Error mapping: every ABI error has a key (S06-35); every S06-36 case maps; an unknown error gives the generic sentence.
- i18n: `en.json` and `id.json` have the same keys; no value is empty.
- `isChatAppBrowser`: a table of 12 real user-agent strings (WhatsApp Android and iOS, Instagram, Facebook, Messenger, LINE, Telegram (false), Chrome Android (false), Safari iOS (false), Samsung Internet (false), Android WebView, TikTok).
- `whatsappUrl`: the secret flag gives `whatsapp://send?text=`; otherwise `https://wa.me/?text=`; the text is URI-encoded.
- Profiles: a stored record holds only `credentialId`, `label`, `transports`; the list keeps 5, most recent first, no duplicates.
- `sendUserTx` (mocked clients): sets `gas` to `max(estimate + 20%, GAS_FLOOR[functionName])`; calls `ensureFunded` when the balance is under 3 actions' worth; waits 3 blocks after funding; does not send when the simulation reverts; maps a reverted receipt; times out to the "taking longer" status.

**End-to-end (Playwright, spec 19 harness).** Expected results and tiers are copied from PRD 14.

| ID  | Case                                                       | Expected                                                           | Tier | How                                                                                                                                                                                                                                                                                                                                            |
| --- | ---------------------------------------------------------- | ------------------------------------------------------------------ | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L4  | Connection lost at the moment of an action                 | A message with Try again; nothing is half-saved                    | 2    | On set-up, tap Continue and call `context.setOffline(true)` before the send. See "No connection. Check your internet and try again." Go online, tap Try again: exactly one account exists and the name is saved. Repeat with offline set just after the send: after reconnect the screen finds the receipt and moves on without a second send. |
| L5  | The chain connection is rate-limited                       | The app switches to the second provider without the user noticing  | 3    | Switch 19's browser RPC proxy (the first RPC URL) to answer every call with HTTP 429. Run A1. No error text appears.                                                                                                                                                                                                                           |
| L6  | A transaction fails on the chain                           | A plain message with Try again; the screen does not hang           | 2    | Route the simulation's `eth_call` and `eth_estimateGas` to fake success so the real transaction reverts. See "The transaction did not go through. Nothing was changed." with Try again within 5 s of the receipt.                                                                                                                              |
| L7  | Reload on every screen, and open each address directly     | The right screen and state come back                               | 2    | For every route in S06-7: reload, unlock, check the screen's heading and one state value; then open the same address in a new page and check again.                                                                                                                                                                                            |
| L8  | The same account open in two tabs                          | Both show the same balances after a refresh; no double action      | 3    | Two pages, one account. Tap the same action in both at once. One transaction on the chain; the other tab shows the contract's sentence or the new state; both show the same envelopes after refresh.                                                                                                                                           |
| L9  | A 360 by 640 screen and the phone's largest text size      | No text is cut off on the home, card, checkout or approval screens | 3    | Viewport 360×640, root font size 200%. On the four screens, no text element has `scrollWidth > clientWidth` unless it ends in an ellipsis by design; visual check by hand.                                                                                                                                                                     |
| L10 | Screen reader labels and tap sizes on the six main screens | Every button has a name and is at least 44 pixels tall             | 3    | On Welcome, Student home, Card, Checkout, Parent home and Approval: `@axe-core/playwright` reports no `button-name` or `link-name` violation; every `button` and `a` has a bounding box at least 44px tall. Check with VoiceOver and TalkBack by hand.                                                                                         |
| L11 | Money formats in English and Bahasa Indonesia              | $1.000,00 and Rp16.500.000 everywhere                              | 3    | After C1, in each language, scan the text of home, parent home and Allowance sent: every amount matches `\$\d{1,3}(\.\d{3})*,\d{2}` or `Rp\d{1,3}(\.\d{3})*`; none matches `\$\d+\.\d{2}\b`.                                                                                                                                                   |

**Security E2E checks (owned here, run inside A1 and B1)**

- After sign-up and sign-in, `localStorage` and `sessionStorage` hold only the keys listed in Security, and profile records hold only the allowed fields. IndexedDB has no Amplop database. No cookie is set by the app.
- Console output during A1 and B1 contains no 64-hex string.

## Acceptance checklist

- [ ] Manifest, icons and theme colour as in S06-1 to S06-2; Chrome Android offers "Install app"; the installed app opens `/app`.
- [ ] Service worker serves `/offline.html` when offline and never touches `/api/*` or RPC.
- [ ] Every route in S06-7 exists and is guarded by `decideRoute`; all unit cases pass.
- [ ] Create, sign in, cancel, sign out, and switch profile work on Chrome Android and Safari iOS 18 with Mera.
- [ ] The key is in memory only; the storage allowlist check passes; ESLint bans storage and console in `lib/client/account/**`.
- [ ] `sendUserTx` sets the gas limit by the 01 §9 rule, funds when low, keeps the 3-block spacing, waits for the receipt, and returns a proof link.
- [ ] The signed client matches 01 §4 byte for byte (shared test vector with 05).
- [ ] Every ABI error has a plain sentence; both language files have the same keys.
- [ ] `packages/shared` money, date and name helpers pass their tests.
- [ ] Tokens, fonts and components match the boards; the logo appears on the landing header, Welcome and the demo card.
- [ ] Demo banner slot on every shell route when `NEXT_PUBLIC_DEMO_MODE=true`, never on `/`.
- [ ] L4, L6 and L7 automated or run by hand on Mon 12 Oct; L5, L8 to L11 run by hand once.

## Skills to use

- `monskill` first, to route to the others (PRD 6), pinned to MONSKILLS commit `3f8efd2`.
- `gas`: Monad charges the gas limit, not gas used, so the limit is the estimate plus 20% or the function's floor, whichever is larger (S06-23, 01 §9). Use 21,000 for plain MON transfers.
- `concepts`: `reserve-balance` (low-balance accounts: one transaction per 3 blocks, the 10 MON floor; S06-25), `async-execution` (wait 3 blocks after funding before the first transaction; S06-24), `eip-7702` (delegated accounts are always held to the 10 MON floor, so never sign an authorisation; S06-25), `block-states` (reads use `latest`).
- `tooling-and-infra`: pick the two RPC providers for `NEXT_PUBLIC_MONAD_RPC_URL` and `..._FALLBACK` and the block explorer for `NEXT_PUBLIC_EXPLORER_TX_URL` from the official Monad docs pages it routes to.
- `scaffold`: only its "Known gotchas": set `tsconfig.json` `"target": "ES2020"` (viem uses BigInt literals). Skip its project creation (the repository exists) and its wagmi and Para advice. Amplop uses viem directly.
- Do **not** use `wallet-integration` (Para). Amplop uses Mera passkeys (`@category-labs/mera`). Do not use `wallet` either.

## Decisions made here

1. **Unlock sheet on reload.** The key is memory-only, so any reload needs one passkey prompt. The route stays put and an unlock sheet covers it (S06-10). L7's "the right screen and state come back" holds after that prompt.
2. **Profiles store no address.** Only credential id, label and Mera's transports hint. A role is always read fresh from the contract.
3. **View as prompts before it signs out.** A cancelled switch leaves the current account signed in (S06-19).
4. **Guards are per route, not per person.** Someone who is both a student and a trusted person can open both kinds of route (S06-8).
5. **Dates.** Release days are shown as UTC dates (they start at Monday 00:00 UTC). Moments are shown in the device's time zone. Both use the contract's `clock`, not the device clock (S06-33).
6. **Money formatting is custom, not `Intl`,** so English and Indonesian give the same `$1.000,00` (L11).
7. **Gas limit** follows 01 §9: the larger of the estimate plus 20% and the function's floor from 03's gas report.
8. **No Multicall** (Anvil has none). JSON-RPC batching instead.
9. **Secret WhatsApp shares use `whatsapp://send`,** not `wa.me`, so the invite key is never in a web request (S06-50).
10. **Chat-app gate has a "Try here anyway" escape** and no Android intent link (S06-49).
11. **Minimal service worker** for installability and the offline page only. It caches nothing dynamic, so a new deploy is never hidden behind a stale cache.
12. **Small tap targets on the boards are enlarged.** The split editor's 36px steppers and the 28px switch get 44px tap areas (L10).
13. **Mock-ups are fixed at 844px tall; the app scrolls** (L9).

## Additions to 01 (status)

1. Client storage keys: Merged into 01 (section 9), with the keys 08, 12 and 13 need.
2. `packages/shared` constants `TYPICAL_ACTION_GAS`, `FUND_THRESHOLD_ACTIONS`, `FUND_TARGET_ACTIONS`: Merged into 01 (section 9). `TYPICAL_ACTION_GAS` comes from 03's gas report, not the 300 000 placeholder.
3. Custom error names: Not merged. 03 owns the names (S03-53) and S06-35 now maps 03's actual names.
4. `Amplop-Device` header: Merged into 01 (section 9).
5. Route `/offline.html`: Merged into 01 (section 9).
6. No new environment variables: nothing to merge.
