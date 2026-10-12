# 19. End-to-end test harness

Status: Ready · Source: PRD sections 14 (all of it), 15 (security tests, gates), 16 (schedule, cut order) · Depends on: 01, 02, 03, 04, 06; feature specs 07–17 write the cases

## Goal

One Playwright harness that drives the real app in a real browser, from a tap to a transaction and back, with nothing faked except the bank and the clock (PRD 14). It gives every feature spec the same tools: two phone-sized profiles (Raka and Mama), real passkeys through a virtual authenticator, a local chain with the real contract, Skip time through the UI, Simulate payment and signed sandbox webhooks, the indexer on or off, and one shared end-of-case money check. It owns the case map for all 140 cases, case L2, the browser-level security checks, the Tier 1 run on Monad testnet before recording, and the hand-run scripts.

## In scope

- Playwright set-up, projects, fixtures and helpers in `apps/web/e2e/`.
- WebAuthn: virtual authenticator with the PRF extension Mera needs, and the day-one check that Mera accepts it.
- Local stack: Anvil, contract in demo mode, mock AUSD, seeded wallets, Postgres, Midtrans stand-in, explorer stand-in, the app's production build, the indexer.
- The end-of-case money check and the transaction-proof check (L2).
- Browser-level security checks from PRD 15.
- Tags, tiers, the case map file and its check.
- CI entry points (`e2e:tier1:ci`, `e2e:smoke`, `e2e-testnet.yml`).
- The hand-run plan: Tier 2 leftovers and Tier 3 on Mon 12 Oct, the two-phone script.

## Out of scope

- Writing the cases themselves. Each case is written by its owner spec (case map below), on the same day as the feature (PRD 14).
- Contract tests (03), server tests (05 and features), indexer handler tests (16).
- The CI workflow file (02); this spec provides the commands it calls.

## Requirements

### Set-up

**S19-1. Location.** `apps/web/e2e/` holds `cases/` (one spec file per group: `a-signup.spec.ts` … `l-landing-devices.spec.ts`, plus `security.spec.ts`, `smoke.spec.ts`, `passkey-check.spec.ts`), `support/` (fixtures and helpers), `manual/` (hand-run records), `case-map.json`, `global-setup.ts`, `global-teardown.ts`, `README.md`. Config in `apps/web/playwright.config.ts`. `@playwright/test` pinned exactly; browsers installed with `npx playwright install --with-deps chromium webkit`.

**S19-2. Projects.**

| Project          | Engine   | Viewport  | Other                                                                                                                                        |
| ---------------- | -------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `chromium-phone` | Chromium | 390 × 844 | `isMobile: true`, `hasTouch: true`, `deviceScaleFactor: 3`, Android Chrome user agent                                                        |
| `webkit-phone`   | WebKit   | 390 × 844 | `isMobile: true`, `hasTouch: true`, `deviceScaleFactor: 3`, iPhone Safari user agent (Playwright `iPhone 13` descriptor, which is 390 × 844) |

Both projects run every automated case (PRD 14: same two engines as Android and iPhone browsers). Defaults: `locale: "en-US"`; test timeout 120 s locally and in CI, 300 s on testnet; `expect` timeout 15 s; `retries: 1` in CI and 0 locally; `trace: "on-first-retry"`, screenshot and video on failure; `workers: 2`. The final gate run before recording must pass with no retries used.

**S19-3. Profiles.** Fixtures give each test separate browser contexts, so two people can act in one test as they would on two phones (PRD 14):

| Fixture    | Who                               | `timezoneId`       | Notes                                  |
| ---------- | --------------------------------- | ------------------ | -------------------------------------- |
| `raka`     | The student                       | `Europe/Amsterdam` | Own context, own authenticator         |
| `mama`     | The parent and trusted person     | `Asia/Jakarta`     | Own context, own authenticator         |
| `stranger` | Anyone else (B3, B8, G12, I6, J6) | `Asia/Jakarta`     | Created only when the test asks for it |

Each fixture exposes `page`, `authenticator` (S19-4) and `address` (the account address once the passkey exists, read from the app's own state through a test hook that 06 exposes only when `NEXT_PUBLIC_CHAIN_ID=31337`). Different timezones on purpose: dates must follow the account clock (PRD 12), not the phone.

Helpers available to every case (in `support/`): `signUpStudent(profile, name)`, `acceptInvite(profile, link)`, `sendAllowance(mama, rupiah, { via: "simulate" | "webhook" })`, `pay(raka, shop, amountMinor, currency)`, `skip(profile, "monday" | "48h")`, `viewAs(profile, "Mama" | "Raka")`, `collectNow(raka, purchase)`, `indexer.stop()`, `indexer.start()`, `contract` (viem public client and typed reads from `@amplop/shared/abi`), `expectMoneyAgrees(...)` (S19-12), `expectTxProof(...)` (S19-13). Helpers drive the UI only; they never call the contract to change state.

### Passkeys

**S19-4. Virtual authenticator.**

- `chromium-phone`: Chrome DevTools Protocol `WebAuthn.enable`, then `WebAuthn.addVirtualAuthenticator` with `protocol: "ctap2"`, `transport: "internal"`, `hasResidentKey: true`, `hasUserVerification: true`, `isUserVerified: true`, `automaticPresenceSimulation: true`, and `hasPrf: true` (the passkey extension Mera needs). One authenticator per profile.
- `webkit-phone`: Playwright has no virtual authenticator for WebKit. The harness installs a software authenticator with `context.addInitScript` that implements `navigator.credentials.create` and `get` for `publicKey`: P-256 keys made with WebCrypto, attestation `none`, correct authenticator data flags (user present, user verified, attested credential data on create), discoverable credentials, and the `prf` extension (deterministic HMAC-SHA-256 output per credential and salt, so the same passkey always gives the same account). Credentials are kept on the Node side per profile through `context.exposeBinding`, so they survive reloads and are never in page storage.
- Both expose the same helper API: `credentials()`, `failNext("NotAllowedError")` (A4, B9), `copyCredentialTo(otherProfile)` (I2 synced passkey), `addOrphanCredential()` (A7).

**S19-5. Day-one check that Mera accepts it.** The first harness commit is `cases/passkey-check.spec.ts`, run in both projects: create a passkey through the app's Welcome flow, derive the Mera account, reload, sign in again and get the same address, sign one message. Result written to `apps/web/e2e/README.md` with the date.

| Result                                              | Then                                                                                                                                                                                               |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chromium virtual authenticator works                | Use it in `chromium-phone`.                                                                                                                                                                        |
| Chromium authenticator lacks PRF or Mera rejects it | Use the software authenticator in `chromium-phone` too.                                                                                                                                            |
| Mera rejects the software authenticator in WebKit   | `webkit-phone` runs only cases with no passkey (L1, L3, smoke). Passkey flows on Safari are covered by the two-phone script on a real iPhone. Record this in the README and in 20's honesty notes. |

**S19-6. One passkey per profile, chosen by id.** View as (15) and sign-in (06) must ask for a specific credential (`allowCredentials` with the stored credential id) when the app knows which profile it wants. Otherwise a browser holding two passkeys for the site may pick the wrong one. K1 depends on this.

### Local stack

**S19-7. Chain.** `global-setup.ts` starts Anvil with 04's `npm run chain:up`, which uses these fixed values:

```
anvil --chain-id 31337 --port 8545 --accounts 10 --balance 10000 --timestamp 1790586000
```

`1790586000` is Mon 28 Sep 2026 09:00 UTC, the sample allowance day (design spec), so share dates match the mock-ups. Time then moves at wall-clock speed. Anvil auto-mines every transaction.

Then it runs 04's `npm run deploy:local`, which must (01 §9 wallet mapping: account 0 deployer, 1 Treasury, 2 Card service, 3 Settlement, 4 Fee sponsor):

| Step                     | Value                                                                                                                  |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Deploy the stand-in AUSD | ERC-20 with 6 decimals, mintable by the deployer only                                                                  |
| Deploy `AmplopEnvelopes` | `demoMode = true`; token = stand-in AUSD; treasury = Anvil account 1; card service = account 2; settlement = account 3 |
| Fee sponsor              | Anvil account 4 (only sends MON; no contract role, 01 §3)                                                              |
| Seed treasury            | Mint 1.000.000 AUSD to account 1 and 10.000 AUSD to account 3; account 1 approves the contract                         |
| Settlement approval      | Account 3 approves the contract for refunds (01 §3)                                                                    |
| Record                   | `deployments/anvil.json` with addresses, deploy block, chain id                                                        |

Anvil keys are the public defaults; they are allowlisted in gitleaks (02) and never used outside tests.

**S19-8. App and server.** The harness tests a production build (`next build`, then `next start -p 3000`), the same build shape that ships. Environment, from `deployments/anvil.json` and fixed test values:

| Name                                                                          | Test value                                                                                                                                     |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_CHAIN_ID`                                                        | `31337`                                                                                                                                        |
| `MONAD_RPC_URL`, `MONAD_RPC_URL_FALLBACK`                                     | `http://127.0.0.1:8546`: the server RPC proxy (`support/rpc-proxy.ts`), which forwards to Anvil and can be switched to refuse every call (E21) |
| `NEXT_PUBLIC_MONAD_RPC_URL`                                                   | `http://127.0.0.1:8547`: a second proxy instance for the browser, which can be switched to answer HTTP 429 (L5)                                |
| `NEXT_PUBLIC_MONAD_RPC_URL_FALLBACK`                                          | `http://127.0.0.1:8545` (Anvil)                                                                                                                |
| `NEXT_PUBLIC_CONTRACT_ADDRESS`, `NEXT_PUBLIC_AUSD_ADDRESS`                    | from `deployments/anvil.json`                                                                                                                  |
| `NEXT_PUBLIC_EXPLORER_TX_URL`                                                 | `http://127.0.0.1:3999/tx/` (explorer stand-in, S19-13)                                                                                        |
| `NEXT_PUBLIC_INDEXER_URL`                                                     | `http://127.0.0.1:8080/v1/graphql`                                                                                                             |
| `DEMO_MODE`, `NEXT_PUBLIC_DEMO_MODE`                                          | `true`                                                                                                                                         |
| `TREASURY_PRIVATE_KEY`, `CARD_SERVICE_PRIVATE_KEY`, `FEE_SPONSOR_PRIVATE_KEY` | Anvil accounts 1, 2, 4                                                                                                                         |
| `SETTLEMENT_ADDRESS`                                                          | Anvil account 3                                                                                                                                |
| `MIDTRANS_SERVER_KEY`                                                         | `SB-Mid-server-e2e-test-key`                                                                                                                   |
| `MIDTRANS_IS_PRODUCTION`                                                      | `false`                                                                                                                                        |
| `MIDTRANS_API_BASE_URL`                                                       | `http://127.0.0.1:4010` (Midtrans stand-in; 01 §7)                                                                                             |
| `SAMPLE_RATE_IDR_PER_USD`, `SAMPLE_RATE_USD_PER_EUR`                          | `16500`, `1.1511`                                                                                                                              |
| `CRON_SECRET`                                                                 | `e2e-cron-secret`                                                                                                                              |
| `DATABASE_URL`                                                                | the test Postgres (CI service container from 02, or 05's `npm run db:up` locally)                                                              |

Database migrations (05) run before the server starts. The server's stdout and stderr go to `test-results/server.log`.

For K4 the harness can start a second stack: a second contract deployed with `demoMode = false`, a second build with `DEMO_MODE=false` and `NEXT_PUBLIC_DEMO_MODE=false`, served on port 3001, and 15's `check-demo-off-bundle.mjs` runs on that build (S15-15). It is started only when a `@demo-off` test is selected.

**S19-9. Bank.** The only faked parts are the bank and the clock (PRD 14).

- **Simulate payment:** through the UI button on 1.3 (08, 15). This is the main path.
- **Signed sandbox webhooks:** `midtrans.sendWebhook({ orderId, statusCode, transactionStatus, grossAmount, signatureKey? })` posts to `/api/midtrans/webhook` with `signature_key = SHA-512(order_id + status_code + gross_amount + MIDTRANS_SERVER_KEY)`. `signatureKey` can be overridden to test a wrong signature (C4).
- **Midtrans stand-in** (`support/midtrans-stand-in.ts`, HTTP on `127.0.0.1:4010`): answers the Core API charge 08 makes (`POST /v2/charge`, returning a virtual account number, bank and expiry; 08 S08-18) and the status call (`GET /v2/{order_id}/status`) the webhook handler and polls make after checking the signature (PRD 15). The test sets each order's status there (`settlement`, `pending`, `expire`, `cancel`) before sending the webhook, so "fetch the status from the Midtrans API" sees the same thing.

**S19-10. Time.** Time moves only through the demo Skip time control in Settings (PRD 12, 14): "Skip to next Monday" and "Skip 48 hours", tapped in the UI by `skip()`. To reach a weekday, tap "Skip 48 hours" as needed (for D3: from Monday 09:00, three taps reach Sunday 09:00). The harness never calls `skipDays`, `evm_increaseTime` or `evm_setNextBlockTimestamp` during a case, with one exception: G13 ("Skip 47 hours only") cannot be reached with whole-day skips, so it calls `evm_increaseTime(169200)` and mines one block, in its own serial project. Otherwise the Anvil start time (S19-7) is the only clock set by the harness.

**S19-11. Indexer.** Started by `global-setup.ts` with 16's `config.e2e.yaml` (`npx envio --config config.e2e.yaml dev`, Docker), reset at the start of each run. Two groups:

| Group       | Tag            | Rule                                                                                                                                                                                                                                                           |
| ----------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Indexer on  | `@indexer`     | Activity and alert cases (F1–F9, F11, J2). J3's low-envelope alert is computed by the app from the contract, so it does not need the indexer. The harness waits until `_meta.progressBlock` reaches the block of the last transaction before reading Activity. |
| Indexer off | `@indexer-off` | F10 and the "core flows still work" run. `indexer.stop()` stops the process and keeps its database; `indexer.start()` restarts it so it back-fills (F11). Runs in its own serial project (`workers: 1`) so it never affects other tests.                       |

All other cases must pass whether the indexer is on or off; they never read from it.

### Shared checks

**S19-12. End-of-case money check.** Every money case ends with `expectMoneyAgrees({ raka, mama, accountId })` (PRD 14: "so it is not repeated in each row"). It reloads both pages and checks:

1. Student home (2.2): for Food, Transport, Study and Everyday, the shown "available" amount equals `envelopes(accountId).list[i].available` from the contract, formatted with `@amplop/shared/money`; the shown "later" amount equals `unreleased`; Emergency's shown locked amount equals `list[4].locked` (and its available amount, once opened or unlocked, equals `list[4].available`).
2. Parent home (1.1): each of the five totals equals `totals(accountId)[i]`, formatted the same way.
3. The contract agrees with itself: `totals[i] = available[i] + unreleased[i]` for envelopes 0 to 3, and `totals[4] = locked[4] + available[4]` (01 §3, R25).
4. Every transaction link on those two screens passes S19-13.

When the account has no trusted person, step 2 is skipped. Amounts are compared as strings produced by the shared formatter from `bigint` values, never as floats. The check reads elements by the test ids in 01 §9 (rendered by 06 S06-51).

**S19-13. Transaction proofs (L2, owned here).** `expectTxProof(page, expected)` runs on every screen that shows a "View transaction proof" link (or "View approval proof", board 3.4). For each element with `data-testid="tx-proof"`:

1. The `href` starts with `NEXT_PUBLIC_EXPLORER_TX_URL` and ends with a 32-byte hash (`0x` and 64 hex).
2. The chain has a receipt for that hash with `status = success` and `to` = the contract address.
3. Its logs, decoded with the ABI, contain the expected event (`Deposited`, `PurchaseApproved`, `PurchaseDeclined`, `PurchaseCollected`, `PurchaseMoved`, `EmergencyOpened`, and so on) for this `accountId`, and the event's amount equals the amount shown on the screen (for `Deposited`, `amount`; for purchases, `amount`; for `EmergencyOpened`, `amount`).
4. Opening the link works: locally, `GET` on the explorer stand-in (`support/explorer-stand-in.ts`, `127.0.0.1:3999`, which answers 200 with the hash only if Anvil knows the transaction, else 404) returns 200; on testnet, `GET` on the real explorer URL returns 200 and the page contains the hash.

The L2 case walks one account through every screen that can show a proof link (1.4, 2.1, 2.6, 2.7, 2.8, purchase detail before and after Collect now, 2.10 after a move, 3.4) and fails if any of 1.4, 2.6 or 3.4 (the boards that draw the link) shows none.

**S19-14. Browser-level security checks** (PRD 15 "Security tests"), in `cases/security.spec.ts`, tagged `@tier1` because they are gates:

| Id   | Check                                                                                                                                                                                                             | Expected                                                                                                                                                                                                                                                                                        |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SEC1 | Student name, invite name and Emergency reason set to `<script>alert(1)</script>` and to `"><img src=x onerror=alert(1)>` (one test per string), then every screen that shows them is opened, by Raka and by Mama | Each string shows as plain text (found with an exact text match); no dialog opens (`page.on("dialog")` fails the test); zero Content-Security-Policy violations (an init script records `securitypolicyviolation` events; console messages mentioning Content Security Policy are also counted) |
| SEC2 | During the invite case (B1 steps), record every request from both profiles: URL, headers and body                                                                                                                 | The invite's one-time key (64 hex, with and without `0x`) appears in none; no `Referer` header carries the link fragment                                                                                                                                                                        |
| SEC3 | After the run, scan `test-results/server.log`                                                                                                                                                                     | It contains no invite key, no student or trusted-person name used in tests, no reason text, no shop name typed in tests, and no private key (PRD 15 "Logs")                                                                                                                                     |

The CSP-violation recorder and the dialog guard are on in every test, not only SEC1: any case that triggers a violation fails.

### Tags, tiers and the case map

**S19-15. Naming and tags.** Each automated case is one Playwright `test` whose title starts with its case ID and ends with its tags, for example `test("C1 Mama sends Rp16.500.000 with Simulate payment @tier1 @money", …)`. Tags: `@tier1`, `@tier2`, `@indexer`, `@indexer-off`, `@demo-off`, `@money` (ends with the money check), `@testnet-skip` (cannot run on testnet, with the reason in a comment). Scripts:

| Script                                                    | Runs                                                                                             |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `npm run e2e -w apps/web` (root alias `npm run test:e2e`) | Every automated case against the local stack                                                     |
| `npm run e2e:tier1 -w apps/web`                           | `--grep @tier1` (40 cases plus SEC1–SEC3), both projects                                         |
| `npm run e2e:tier1:ci` (root)                             | Starts the whole local stack, builds, runs `e2e:tier1`, tears down; used by 02's `e2e-tier1` job |
| `npm run e2e:smoke` (root)                                | S19-18 against `BASE_URL`                                                                        |
| `npm run e2e:testnet` (root)                              | S19-17 against `BASE_URL` on Monad testnet                                                       |
| `npm run e2e:check-map -w apps/web`                       | S19-16                                                                                           |

**S19-16. Case map file and check.** `apps/web/e2e/case-map.json` has one entry per case: `{ "id", "kind", "tier", "owner", "automated": true | false, "testnetSkip"?: "reason" }`, built from the case map below. `e2e:check-map` (run in 02's `test-ts` job) fails if:

- there are not exactly 140 entries, or any ID from A1–A17, B1–B11, C1–C17, D1–D7, E1–E22, F1–F11, G1–G18, H1–H6, I1–I9, J1–J7, K1–K4, L1–L11 is missing or repeated;
- tier counts are not 40, 65 and 35;
- a Tier 1 ID has no test, or more than one test, with that ID and `@tier1`;
- a test title starts with an ID that is not in the map, or its tier tag differs from the map;
- an entry has `automated: true` but no test, or `automated: false` but a test exists.

`automated` for Tier 2 starts `false` and flips to `true` when its owner automates it.

**S19-17. Tiers and when they run.**

| Tier | Meaning (PRD 14)                                                          | Count | Runs                                                                                                                                                                      |
| ---- | ------------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Automated. Must pass before the video is recorded.                        | 40    | Written by the owner spec on the day of its feature (PRD 16). Run on every push in CI (02 `e2e-tier1`), both engines. Run once on Monad testnet before recording (below). |
| 2    | Automated if the day allows; otherwise run by hand once on Monday 12 Oct. | 65    | Automated ones run locally with `npm run e2e` and in the final gate run. The rest are run by hand on Mon 12 Oct and recorded (S19-20).                                    |
| 3    | Run by hand once. Mostly device and wording checks.                       | 35    | By hand on Mon 12 Oct together with the two-phone script; any left over by Tue 13 Oct 12:00 WIB. Recorded (S19-20).                                                       |

Tier 1 on Monad testnet (PRD 14), `npm run e2e:testnet` or `.github/workflows/e2e-testnet.yml` (`workflow_dispatch`, input `base_url`; secrets: the sandbox `MIDTRANS_SERVER_KEY` and `VERCEL_AUTOMATION_BYPASS_SECRET` if the target is a protected preview):

- Target: the production demo deployment (or its preview), chain 10143, the real contract, the Envio Cloud indexer.
- Run on Tue 13 Oct morning before recording, and again in the final gate run before 18:00 (20). It must pass with no retries.
- Serial (`workers: 1`) to stay within rate limits (01 §4) and the fee sponsor's daily cap.
- Before the run: treasury holds at least 40.000 AUSD (about 25 deposits of $1.000 plus margin; refill from the faucet, 10.000 per minute), fee sponsor at least 60 MON.
- Skipped on testnet, each tagged `@testnet-skip` with the reason: C2 and C5 (Midtrans sandbox's own status API would not confirm a self-signed payment), F10 (the hosted indexer cannot be switched off from a test; covered locally and by the two-phone script). C4 still runs (a wrong signature must be refused).
- Transaction proofs check against the real explorer (S19-13 step 4).

**S19-18. Preview smoke set** (`cases/smoke.spec.ts`, `@smoke`, no transactions, used by 02's `preview-smoke` job on every Vercel preview):

| Check                                                      | Expected                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L1                                                         | As in 17                                                                                                                                                                                                                                                   |
| L3                                                         | As in 17                                                                                                                                                                                                                                                   |
| `/app`                                                     | Board 0.2 Welcome renders (or 0.1 when the user agent is a chat app's browser)                                                                                                                                                                             |
| Headers on `/` and `/app`                                  | Content-Security-Policy with a nonce and without `unsafe-eval` or `unsafe-inline` for scripts; `Strict-Transport-Security`; `frame-ancestors 'none'`; `X-Content-Type-Options: nosniff`; `Referrer-Policy: no-referrer`; `Permissions-Policy` present (05) |
| `GET /api/auth/nonce`                                      | 200 with a 32-hex nonce                                                                                                                                                                                                                                    |
| `POST /api/topup/<random id>/simulate` without a signature | 401 when demo mode is on (not 404, not 500)                                                                                                                                                                                                                |
| Console and CSP                                            | No console error and no policy violation on `/` and `/app`                                                                                                                                                                                                 |

**S19-19. Behaviour these tests pin down.** PRD 14 settled these eight points; they count as rules. Each owner spec implements its rule and the listed case proves it.

| #   | Rule (PRD 14)                                                                      | Case    | Owner                |
| --- | ---------------------------------------------------------------------------------- | ------- | -------------------- |
| 1   | A person can be the trusted person for one student only.                           | B8      | 10 (03 on chain)     |
| 2   | A new invite cancels any unused earlier invite.                                    | B7      | 10 (03 on chain)     |
| 3   | A payment on an order the parent has replaced is still deposited.                  | C13     | 08                   |
| 4   | A checkout request must be signed by the passkey that currently owns the account.  | E22, I4 | 09, 13               |
| 5   | A purchase still on hold can be moved; a declined one cannot.                      | F8      | 11 (03 on chain)     |
| 6   | The Emergency reason is required, up to 280 characters.                            | G7      | 12 (05 server check) |
| 7   | A second pending change of the same kind replaces the first and restarts its wait. | H4      | 13 (03 on chain)     |
| 8   | A recovery cannot move an account to a passkey that already owns one.              | I9      | 13 (03 on chain)     |

PRD 14 also says no list can be proved complete: any bug found by hand becomes a new case. A new case gets the next free ID in its group (for example E23), a tier, an owner, and an entry in `case-map.json`. The count checks in S19-16 then compare against the new totals, recorded in this spec's case map and in the README.

### Hand runs

**S19-20. Records.** Every hand run is recorded in `apps/web/e2e/manual/2026-10-12-results.md`, one table row per case: case ID, tier, date and time (WIB), device and browser, pass or fail, note (and the fix commit for a fail). Every Tier 3 case and every Tier 2 case with `automated: false` must have a passing row before the Tue 13 Oct 18:00 freeze.

**S19-21. Two-phone script (PRD 14).** Run on Mon 12 Oct on one Android phone with Chrome and one iPhone with Safari, against the production demo deployment on Monad testnet, then swap roles and run it again. Recorded in `apps/web/e2e/manual/2026-10-12-two-phone.md` with the same tick boxes:

- [ ] Open the invite link from WhatsApp on each phone; board 0.1 appears when it should.
- [ ] Create both passkeys; close and reopen the browser; sign in again.
- [ ] Send an allowance with Midtrans sandbox, and once more with Simulate payment.
- [ ] One approved purchase per envelope, one Everyday step-in, one blocked, one not enough.
- [ ] Skip to next Monday; the amounts match section 4.
- [ ] Emergency: approve path, and the 48-hour path with Skip time.
- [ ] Turn the indexer off; the three core flows still work.
- [ ] Every transaction link opens the right transaction.

"Turn the indexer off" on the deployed app: point a Preview deployment's `NEXT_PUBLIC_INDEXER_URL` at an address that does not answer (for example the promoted URL with a wrong path), open that preview on both phones, and run the three core flows (send allowance, pay by card, Emergency). Production is not changed.

### Case map

All 140 cases from PRD 14, with tier and owning spec. Counts verified against the PRD tables: 140 cases (35 Normal, 105 Edge); Tier 1 = 40, Tier 2 = 65, Tier 3 = 35. The expected result of each case is in PRD 14 and repeated in its owner spec.

Owners: A → 07, B → 10, C → 08, D → 11, E → 09, F → 11, G → 12 (G16, G17 → 13), H → 13, I → 13, J → 14, K → 15, L1 and L3 → 17, L2 → 19, L4–L11 → 06.

| ID  | Kind   | Case                                                                                 | Tier | Owner |
| --- | ------ | ------------------------------------------------------------------------------------ | ---- | ----- |
| A1  | Normal | New student: create passkey, type name, keep the default split, skip the invite      | 1    | 07    |
| A2  | Normal | Sign out, then Sign in with passkey                                                  | 1    | 07    |
| A3  | Normal | Change the split to 50 / 10 / 10 / 20 / 10 and continue                              | 1    | 07    |
| A4  | Edge   | Passkey prompt is cancelled                                                          | 2    | 07    |
| A5  | Edge   | Browser without passkey support                                                      | 3    | 07    |
| A6  | Edge   | Link opened inside a chat app's browser                                              | 2    | 07    |
| A7  | Edge   | Sign in with a passkey that has no account                                           | 2    | 07    |
| A8  | Edge   | Name left empty, or only spaces                                                      | 1    | 07    |
| A9  | Edge   | Name of 60 letters; name with non-Latin letters                                      | 3    | 07    |
| A10 | Edge   | Split totals 95% or 105%                                                             | 1    | 07    |
| A11 | Edge   | Minus at 0% and plus when the total is 100%                                          | 2    | 07    |
| A12 | Edge   | Emergency set to 0%; one envelope set to 100%                                        | 2    | 07    |
| A13 | Edge   | Page reloaded after the passkey but before the name                                  | 2    | 07    |
| A14 | Edge   | Back through the set-up steps                                                        | 3    | 07    |
| A15 | Edge   | Fee top-up is slow or fails once                                                     | 2    | 07    |
| A16 | Edge   | Fee top-up limit reached                                                             | 3    | 07    |
| A17 | Edge   | Language switched to Bahasa Indonesia                                                | 3    | 07    |
| B1  | Normal | Raka shares the invite; Mama opens it in her own profile, accepts, creates a passkey | 1    | 10    |
| B2  | Normal | Mama taps Not now                                                                    | 3    | 10    |
| B3  | Edge   | The same link opened a second time by someone else                                   | 1    | 10    |
| B4  | Edge   | Link opened after 8 days                                                             | 2    | 10    |
| B5  | Edge   | Raka opens his own invite link                                                       | 2    | 10    |
| B6  | Edge   | Link with a changed code                                                             | 2    | 10    |
| B7  | Edge   | Raka makes a second invite while the first is unused                                 | 2    | 10    |
| B8  | Edge   | Someone who is already a trusted person opens another student's invite               | 3    | 10    |
| B9  | Edge   | Mama cancels her passkey prompt                                                      | 3    | 10    |
| B10 | Normal | Raka replaces the trusted person                                                     | 2    | 10    |
| B11 | Edge   | Raka cancels the replacement during the wait                                         | 2    | 10    |
| C1  | Normal | Mama sends Rp16.500.000 with Simulate payment                                        | 1    | 08    |
| C2  | Normal | Same amount through a signed sandbox webhook                                         | 1    | 08    |
| C3  | Normal | Mama closes the app while waiting, then reopens                                      | 2    | 08    |
| C4  | Edge   | Webhook with a wrong signature                                                       | 1    | 08    |
| C5  | Edge   | The same webhook delivered three times                                               | 1    | 08    |
| C6  | Edge   | Simulate payment tapped twice quickly                                                | 1    | 08    |
| C7  | Edge   | Webhook says pending, expired or cancelled                                           | 2    | 08    |
| C8  | Edge   | Order left past its expiry                                                           | 2    | 08    |
| C9  | Edge   | Treasury has too little AUSD when the payment lands                                  | 2    | 08    |
| C10 | Edge   | Amount below Rp100.000 or above Rp50.000.000                                         | 2    | 08    |
| C11 | Edge   | Letters or an empty amount                                                           | 3    | 08    |
| C12 | Edge   | Rp1.234.567, which does not divide evenly                                            | 1    | 08    |
| C13 | Edge   | Change amount after an order exists, then the old order is paid                      | 3    | 08    |
| C14 | Normal | A second allowance in week 2 of the first                                            | 1    | 08    |
| C15 | Edge   | A deposit lands while a new split is still waiting                                   | 2    | 08    |
| C16 | Edge   | A deposit lands after the Emergency lock is off                                      | 2    | 08    |
| C17 | Edge   | Raka opens a parent address; an unlinked person opens Send allowance                 | 2    | 08    |
| D1  | Normal | After C1, Skip to next Monday three times                                            | 1    | 11    |
| D2  | Normal | Nothing is spent in week 1                                                           | 1    | 11    |
| D3  | Edge   | Allowance arrives on a Sunday                                                        | 2    | 11    |
| D4  | Edge   | An envelope amount that does not divide by 4                                         | 2    | 11    |
| D5  | Edge   | Skip 3 days, which is not a Monday                                                   | 2    | 11    |
| D6  | Edge   | After the fourth share                                                               | 3    | 11    |
| D7  | Edge   | Skip tapped twice quickly                                                            | 3    | 11    |
| E1  | Normal | Supermarket, 12,50 euro                                                              | 1    | 09    |
| E2  | Normal | Tram and train; cinema with enough in Everyday                                       | 1    | 09    |
| E3  | Normal | Food is short, Everyday has enough                                                   | 1    | 09    |
| E4  | Normal | Collect now on a held purchase                                                       | 1    | 09    |
| E5  | Edge   | Matching envelope and Everyday are both short                                        | 1    | 09    |
| E6  | Edge   | Cinema when Everyday itself is short                                                 | 1    | 09    |
| E7  | Edge   | Gambling site                                                                        | 1    | 09    |
| E8  | Edge   | Gambling site with no trusted person                                                 | 2    | 09    |
| E9  | Edge   | Amount exactly equal to what is available                                            | 2    | 09    |
| E10 | Edge   | Every weekly envelope is empty, Emergency holds money                                | 1    | 09    |
| E11 | Edge   | Purchase before any allowance has arrived                                            | 2    | 09    |
| E12 | Edge   | Amount of 0, empty, negative, or with three decimals                                 | 2    | 09    |
| E13 | Edge   | Pay tapped twice quickly                                                             | 1    | 09    |
| E14 | Edge   | Two purchases at the same moment for the last dollars                                | 2    | 09    |
| E15 | Edge   | Shop collects less than was held                                                     | 2    | 09    |
| E16 | Edge   | Hold not collected; Skip 7 days                                                      | 2    | 09    |
| E17 | Edge   | Collect after the hold was released                                                  | 3    | 09    |
| E18 | Edge   | Refund of a collected purchase                                                       | 2    | 09    |
| E19 | Edge   | A kind of shop the table does not know                                               | 2    | 09    |
| E20 | Edge   | Shop priced in dollars                                                               | 3    | 09    |
| E21 | Edge   | Card service cannot reach the chain                                                  | 2    | 09    |
| E22 | Edge   | Checkout from a session whose passkey no longer owns the account                     | 2    | 09    |
| F1  | Normal | Open Activity after E1, E7 and D1                                                    | 1    | 11    |
| F2  | Normal | Move a bookshop purchase from Everyday to Study                                      | 1    | 11    |
| F3  | Normal | Buy at a bookshop again after F2                                                     | 2    | 11    |
| F4  | Edge   | Move when the target envelope is short                                               | 2    | 11    |
| F5  | Edge   | Move the same purchase a second time                                                 | 2    | 11    |
| F6  | Edge   | Purchase paid from Food, Transport or Study                                          | 2    | 11    |
| F7  | Edge   | Purchase older than 7 days                                                           | 3    | 11    |
| F8  | Edge   | Declined purchase                                                                    | 3    | 11    |
| F9  | Edge   | Purchase that Everyday paid because Food was short (E3)                              | 3    | 11    |
| F10 | Edge   | Indexer switched off                                                                 | 1    | 11    |
| F11 | Edge   | Indexer switched back on                                                             | 2    | 11    |
| G1  | Normal | Raka asks for $70 with a reason; Mama approves                                       | 1    | 12    |
| G2  | Normal | Raka asks; nobody answers; Skip 48 hours; Raka opens the app                         | 1    | 12    |
| G3  | Normal | Opened money is spent at the cinema straight away                                    | 2    | 12    |
| G4  | Normal | A second request for the remaining $30 after the first is done                       | 2    | 12    |
| G5  | Normal | No trusted person: start the 48-hour wait, then skip                                 | 1    | 12    |
| G6  | Edge   | Amount above the locked balance, or 0                                                | 1    | 12    |
| G7  | Edge   | Reason left empty, or longer than 280 characters                                     | 3    | 12    |
| G8  | Edge   | A second request while one is open                                                   | 2    | 12    |
| G9  | Edge   | Raka cancels the request                                                             | 2    | 12    |
| G10 | Edge   | Mama opens the link after it opened by itself                                        | 2    | 12    |
| G11 | Edge   | Approve tapped twice quickly                                                         | 2    | 12    |
| G12 | Edge   | Someone who is not the trusted person opens the approval link                        | 1    | 12    |
| G13 | Edge   | Skip 47 hours only                                                                   | 2    | 12    |
| G14 | Edge   | The trusted person is replaced while a request is open                               | 3    | 12    |
| G15 | Edge   | Emergency share is 0%                                                                | 3    | 12    |
| G16 | Normal | Switch the Emergency lock off, Skip 48 hours                                         | 2    | 13    |
| G17 | Edge   | Lock-off cancelled during the wait                                                   | 3    | 13    |
| G18 | Edge   | Mama taps Message Raka first                                                         | 3    | 12    |
| H1  | Normal | Change the split before any allowance has arrived                                    | 2    | 13    |
| H2  | Normal | Change the split after an allowance; Skip 48 hours; send another                     | 1    | 13    |
| H3  | Edge   | Money already in envelopes after a split change                                      | 2    | 13    |
| H4  | Edge   | A second change while one is waiting                                                 | 3    | 13    |
| H5  | Edge   | Change cancelled during the wait                                                     | 3    | 13    |
| H6  | Edge   | Mama's app during the wait                                                           | 2    | 13    |
| I1  | Normal | New profile, new passkey, recovery link to Mama, she approves, Skip 48 hours         | 1    | 13    |
| I2  | Normal | The same passkey used from a new profile, as a synced passkey would be               | 3    | 13    |
| I3  | Edge   | The old passkey cancels during the wait                                              | 1    | 13    |
| I4  | Edge   | The old passkey after the move                                                       | 2    | 13    |
| I5  | Edge   | Mama never approves                                                                  | 2    | 13    |
| I6  | Edge   | Someone other than the trusted person opens the recovery link                        | 2    | 13    |
| I7  | Edge   | Mama taps This was not Raka                                                          | 3    | 13    |
| I8  | Edge   | No trusted person                                                                    | 3    | 13    |
| I9  | Edge   | The new passkey already owns another account                                         | 3    | 13    |
| J1  | Normal | Parent home after C1, E1 and G1                                                      | 1    | 14    |
| J2  | Normal | Alerts after E7, F2, G1, H2 and I1                                                   | 2    | 14    |
| J3  | Edge   | An envelope falls under 20% of this week's share                                     | 2    | 14    |
| J4  | Edge   | Mama's profile asks the server for Raka's shop names                                 | 1    | 14    |
| J5  | Edge   | Mama's app                                                                           | 2    | 14    |
| J6  | Edge   | A replaced trusted person signs in                                                   | 2    | 14    |
| J7  | Edge   | Mama opens before any allowance                                                      | 3    | 14    |
| K1  | Normal | View as Mama, then View as Raka, on one profile                                      | 1    | 15    |
| K2  | Normal | The demo banner                                                                      | 3    | 15    |
| K3  | Edge   | Skip time by one account                                                             | 2    | 15    |
| K4  | Edge   | A build with demo mode off                                                           | 2    | 15    |
| L1  | Normal | Landing page: Open the app                                                           | 2    | 17    |
| L2  | Normal | Every "View transaction proof" link in the app                                       | 1    | 19    |
| L3  | Edge   | The words "crypto", "blockchain", "hackathon" and "Monad" on the landing page        | 2    | 17    |
| L4  | Edge   | Connection lost at the moment of an action                                           | 2    | 06    |
| L5  | Edge   | The chain connection is rate-limited                                                 | 3    | 06    |
| L6  | Edge   | A transaction fails on the chain                                                     | 2    | 06    |
| L7  | Edge   | Reload on every screen, and open each address directly                               | 2    | 06    |
| L8  | Edge   | The same account open in two tabs                                                    | 3    | 06    |
| L9  | Edge   | A 360 by 640 screen and the phone's largest text size                                | 3    | 06    |
| L10 | Edge   | Screen reader labels and tap sizes on the six main screens                           | 3    | 06    |
| L11 | Edge   | Money formats in English and Bahasa Indonesia                                        | 3    | 06    |

**Counts by owner** (Tier 1 / Tier 2 / Tier 3 / total):

| Owner   | T1     | T2     | T3     | Total   |
| ------- | ------ | ------ | ------ | ------- |
| 06      | 0      | 3      | 5      | 8       |
| 07      | 5      | 7      | 5      | 17      |
| 08      | 7      | 8      | 2      | 17      |
| 09      | 9      | 11     | 2      | 22      |
| 10      | 2      | 6      | 3      | 11      |
| 11      | 5      | 8      | 5      | 18      |
| 12      | 5      | 7      | 4      | 16      |
| 13      | 3      | 7      | 7      | 17      |
| 14      | 2      | 4      | 1      | 7       |
| 15      | 1      | 2      | 1      | 4       |
| 17      | 0      | 2      | 0      | 2       |
| 19      | 1      | 0      | 0      | 1       |
| **All** | **40** | **65** | **35** | **140** |

**The 40 Tier 1 cases:** A1, A2, A3, A8, A10, B1, B3, C1, C2, C4, C5, C6, C12, C14, D1, D2, E1, E2, E3, E4, E5, E6, E7, E10, E13, F1, F2, F10, G1, G2, G5, G6, G12, H2, I1, I3, J1, J4, K1, L2.

**When each group's Tier 1 cases are written** (PRD 16, same day as the feature): A and B on Thu 8 Oct; D1, D2, E and K1 on Fri 9 Oct; C and G on Sat 10 Oct; F, H, I and J on Sun 11 Oct; L2 grows with each money screen and is complete on Sat 10 Oct. If a feature is cut (PRD 16 cut order), its cases are marked `automated: false` with the note "cut" in `case-map.json`, and the cut is recorded in 20's submission notes. Tier 1 cases of never-cut features cannot be cut.

## Interfaces used

- 01 §3 contract reads (`envelopes`, `totals`, `accountOf`, `trustedAccountOf`, `purchase`, `emergency`) and events; 01 §4 endpoints and error codes; 01 §6 routes; 01 §7 variables; 01 §8 formats.
- 02: CI jobs `e2e-tier1`, `preview-smoke`, `test-ts` (case-map check); Postgres service; `e2e-testnet.yml`.
- 04: local deploy command and `deployments/anvil.json`.
- 05: migrations, headers, logs.
- 06: test ids, the test-only address hook on chain 31337, `allowCredentials` sign-in, Skip time and View as wiring with 15.
- 08: the Midtrans base URL setting; 16: `config.e2e.yaml`, `_meta`.

## Screens

None of its own. The harness reaches every route in 01 §6.

## Errors and edge cases

| Case                                                | Behaviour                                                                                                                  |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Mera rejects the virtual authenticator              | S19-5 fallback; recorded.                                                                                                  |
| Two passkeys in one authenticator, wrong one picked | Prevented by S19-6; K1 fails loudly if not.                                                                                |
| Indexer slow to catch up locally                    | Helpers wait on `_meta.progressBlock` (max 30 s), then fail with the gap in the message.                                   |
| Treasury nonce clash with two workers               | A server bug (05 must queue treasury and card-service transactions); the harness does not hide it by going serial locally. |
| A flaky pass on retry in CI                         | Allowed on ordinary pushes, reported in the Playwright report; the final gate run requires zero retries.                   |
| Testnet run hits the fee-sponsor daily cap          | Run fails with the server's message; raise the treasury and sponsor balances before the run, never the cap.                |
| Feature cut                                         | Its cases become `automated: false` with "cut" (above).                                                                    |

## Security

- Tests use only Anvil's public keys and a fake Midtrans key locally. The testnet run reads the sandbox server key from a GitHub secret and never prints it.
- SEC1–SEC3 prove: injected text renders as text with no policy violation; the invite key never leaves the browser; logs hold no keys or personal text.
- The test-only address hook (S19-3) exists only when the chain id is 31337, so it is absent from every deployed build; 02's bundle scan can check for its name in the production bundle.

## Tests

The harness tests itself:

| Test                                                                                            | Expected                                                         |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `passkey-check.spec.ts` (S19-5)                                                                 | Passes in both projects (or the fallback is recorded)            |
| `e2e:check-map`                                                                                 | 140 entries, 40/65/35, every Tier 1 ID has exactly one test      |
| A planted wrong amount in a test copy of the money check                                        | `expectMoneyAgrees` fails with the envelope name and both values |
| A proof link pointing at a made-up hash                                                         | `expectTxProof` fails at step 2                                  |
| A planted `<img src=x onerror=…>` rendered with `dangerouslySetInnerHTML` on a throwaway branch | SEC1 fails                                                       |

End-to-end case owned here:

| ID  | Kind   | Case                                           | Expected                                               | Tier |
| --- | ------ | ---------------------------------------------- | ------------------------------------------------------ | ---- |
| L2  | Normal | Every "View transaction proof" link in the app | Opens a transaction that exists and matches the amount | 1    |

## Acceptance checklist

- [ ] Playwright runs at 390 × 844 in Chromium and WebKit.
- [ ] Raka and Mama run as separate contexts in one test; `stranger` available.
- [ ] Passkeys use the virtual authenticator with PRF (or the recorded fallback), and the day-one check result is in `e2e/README.md`.
- [ ] Anvil starts at Mon 28 Sep 2026 09:00 UTC with the real contract in demo mode, stand-in AUSD, seeded treasury, card service, fee sponsor and settlement approval.
- [ ] Time moves only through Skip time in the UI.
- [ ] Simulate payment and self-signed sandbox webhooks both work; the Midtrans stand-in answers status calls.
- [ ] Indexer-on and indexer-off groups both run; F10 and F11 pass.
- [ ] Every `@money` case ends with the money check; every proof link passes `expectTxProof`; L2 passes.
- [ ] SEC1–SEC3 pass and run with Tier 1.
- [ ] `case-map.json` has 140 entries and `e2e:check-map` passes.
- [ ] All 40 Tier 1 cases pass in CI on every push and once on Monad testnet before recording.
- [ ] Mon 12 Oct: Tier 2 cases not automated and all Tier 3 cases have passing rows in `manual/2026-10-12-results.md`; the two-phone script is ticked both ways.

## Skills to use

- MONSKILLS `concepts` (block states, finality) for how long to wait on Monad testnet before reading a receipt, and `gas` for fee limits when the testnet run budgets MON.
- MONSKILLS `indexer` for the `_meta` fields used to wait for the indexer.
- MONSKILLS `addresses` to confirm the AUSD address and explorer used by the testnet run.

## Decisions made here

1. **WebKit uses a software authenticator** injected by the harness, because Playwright offers a virtual authenticator only in Chromium. Real Safari passkeys are covered by the two-phone script.
2. **Profiles get different time zones** (Amsterdam, Jakarta) so date bugs show up.
3. **Anvil starts at Mon 28 Sep 2026 09:00 UTC**, the sample allowance day.
4. **A Midtrans stand-in and an explorer stand-in** run locally. The Midtrans stand-in is "the bank" (allowed to be faked by PRD 14); the explorer stand-in only lets "opens a transaction that exists" be checked offline. On testnet, the real explorer is used.
5. **Three cases are skipped on testnet** (C2, C5, F10), each with its reason; all three still pass locally on every push.
6. **Security checks SEC1–SEC3 run with Tier 1** and the CSP and dialog guards are on in every test.
7. **The preview smoke set** (no transactions) is defined here and run by 02 on every Vercel preview.
8. **"Turn the indexer off" in the two-phone script** uses a Preview deployment with a dead indexer address, so production is never changed.
9. **A bug found by hand becomes a new case** with the next free ID in its group; the count check follows the recorded totals.
10. **The RPC stand-in answers `finalized` as `latest`.** Anvil puts the finalized block 64 blocks back and mines only on demand, so the server's wait for finality (05) never ended. Monad is final in about a second, so this matches the real chain. (Mon 12 Oct)
11. **Each profile's API calls carry their own `x-real-ip`** (random per context, in 10.0.0.0/8), set with the context's `extraHTTPHeaders` (WebKit drops headers that `route()` adds); the RPC stand-in allows the header for CORS. Without it every profile shared one IP and hit 07's 30-a-day fee top-up limit. (Mon 12 Oct)
12. **The indexer runs locally under `envio dev --restart`** with Docker images already cached (postgres 18.3, hasura v2.43.0). The harness creates the `envio-network` Docker network first, because envio creates it from two tasks at once and can end up with duplicates it then rejects. `E2E_NO_INDEXER=1` skips it. (Mon 12 Oct)
13. **Two extra projects run after the phone projects:** `indexer-off` (F10 pauses the shared indexer's GraphQL container, so nothing else may read it then) and `after-run` (SEC3 reads the log every other test wrote). The phone projects leave out `@indexer-off` and `@after-run`. (Mon 12 Oct)
14. **The 31337 test hook gains `signedGet(path, action, accountId)`**, which calls the API through the app's own signed client as the signed-in profile. 14 asks J4 to call `GET /api/purchases` "through the signed client" from Mama's profile, and a test has no other way to make that signature. Like the rest of the hook it exists only on chain 31337. (Mon 12 Oct)
15. **The testnet run learns accounts from the chain.** The hook is absent on deployed builds (S19-3), so after sign-up the testnet run takes the newest `AccountCreated` event as the profile's account; the run is serial, so it is. J4 and K1 need the hook and join C2, C5 and F10 as `@testnet-skip`. The run itself has not been tried yet: it needs the production deployment. (Mon 12 Oct)
16. **File names.** The teardown is the function `global-setup.ts` returns, so there is no `global-teardown.ts`; L2 lives in `cases/l-proofs.spec.ts`. (Mon 12 Oct)
17. **Anvil mines a block every 0,5 s** (`--block-time 0.5`) instead of only on demand. The app waits a few blocks after a fee top-up (06 S06-24); with on-demand mining no block came, so every sign-up sat out that wait's 30 s limit. Monad makes a block about every 0,4 s. (Mon 12 Oct)
18. **The money check taps through "Allowance arrived".** `/app` sends the student there once per new deposit, so `expectMoneyAgrees` and the home checks use a `home()` helper that taps See my envelopes when it appears. (Mon 12 Oct)
19. **Every app table is emptied at the start of a run** (after migrations, with the migration role). Anvil starts empty, so account ids repeat across runs; old rows then belonged to new accounts, and an invite name from an earlier run showed on a new student. (Mon 12 Oct)
20. **WebKit takes no failure screenshots.** Playwright's screenshot injects an inline style, and WebKit reports it as a policy violation of the page, which the CSP guard (S19-14) would blame on the app. Video and traces still record WebKit failures; Chromium keeps its screenshots. The guard now records each violation's document, line and element. (Mon 12 Oct)
21. **Four workers, and one CI job per engine.** With two workers the full local run took about 20 minutes. Four workers (the CI runner has four cores) bring both engines to about 12 minutes locally, and `e2e-tier1` runs Chromium and WebKit as two matrix jobs side by side (`E2E_ENGINE`), each with its own stack; F10 and SEC3 run in each job on that engine. This replaces S19-2's `workers: 2`. (Mon 12 Oct)

## Additions to 01 (status)

1. §2: `apps/web/e2e/` with `case-map.json` and `manual/`: Merged into 01 (section 2).
2. §7: `MIDTRANS_API_BASE_URL`: Merged into 01 (section 7).
3. Test ids: Merged into 01 (section 9); 06 renders them (S06-51).
4. Test-only hook `window.__amplopTest`: Merged into 01 (section 9); 06 defines it (S06-51).
5. `allowCredentials` when signing in as a known profile: Merged into 01 (section 9); 06 does it (S06-19).
