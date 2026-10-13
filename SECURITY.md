# Security

## Status

Testnet only, with sandbox payments: no real money moves. The contract is `AmplopEnvelopes` at `0x5596Bf1014EC25F760e8976f1DD8a40Ee250c56C` on Monad testnet (chain 10143), from [`deployments/monad-testnet.json`](deployments/monad-testnet.json). It is self-reviewed, findings published; there has been no external audit.

## Reporting a problem

Use GitHub's private vulnerability reporting: open the repository's Security tab and choose Report a vulnerability. Please do not open a public issue.

Tell us what you found, the steps to reproduce it, and the transaction or request if there is one. We reply within 72 hours, best effort. There is no bounty. Everything runs on testnet, so please do not try to take test money from other people's accounts; a description is enough.

## Threats and the required fix

The PRD 15 table, unchanged, with a fourth column naming the test or check that shows each fix holds.

<!-- fragment:threats:start -->

| What an attacker tries                                               | Where                                                  | Required fix                                                                                                                                                                                                                                                                                                                                                                                           | Proof                                                                                                                                                            |
| -------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spend a student's money by calling the card endpoint with their card | `POST /api/card/authorize`                             | The request carries the account owner's signature (demo), or the issuer's HMAC (later). The card token is a random 128-bit value, never the address. Rate limit per card.                                                                                                                                                                                                                              | Server tests `card.test.ts` T09-1, T09-2 (no or wrong signature refused before any chain call) and T09-9 (per-card limit)                                        |
| Drain the fee sponsor by asking for top-ups for many addresses       | `POST /api/fund`                                       | The address being funded must sign the request. Skip addresses already above 3 actions' worth. Limit per address and per IP; the device id comes from the client, so it is never the only limit. A daily cap of 50 MON in total; past it, top-ups stop and an alert fires.                                                                                                                             | Server tests `fund.test.ts` "POST /api/fund checks before any send" and `decideFund`                                                                             |
| Replay a signed request seen once                                    | Private text, profile, card                            | The signed message names the site, chain id 10143, the action, the account, a single-use server nonce and the time. A nonce expires after 5 minutes; used nonces are stored.                                                                                                                                                                                                                           | Server tests `platform.test.ts` T05-1 to T05-5 (message, checks, replayed and expired nonces)                                                                    |
| Fake or replay a payment notification                                | `POST /api/midtrans/webhook`                           | Check `signature_key` = SHA-512(order id + status code + gross amount + server key) with a constant-time compare. Then fetch the status from the Midtrans API. Deposit only on `settlement`, only when the amount equals the order's, once per order id (unique key in the database).                                                                                                                  | Server tests `topup.test.ts` T08-1, T08-2, T08-4, T08-5, T08-6 and the chain test T08-21                                                                         |
| Use test-only tools on a real deployment                             | Simulate payment, Collect now, Skip time, View as Mama | A server flag `DEMO_MODE`. When it is off, those routes return 404, and the contract is deployed with its demo switch off, which cannot be changed later. Hiding a button is never the control.                                                                                                                                                                                                        | Server tests T05-16, T08-9, T09-10; contract test `test_SEC_skipDaysRevertsWithDemoOff`; demo-off bundle check (S15-15)                                          |
| Read another parent's order by guessing its id                       | `GET /api/topup/[order]`, invites, reasons             | Every id is a random 128-bit value; nothing is numbered in order. The order endpoint returns status only.                                                                                                                                                                                                                                                                                              | Server tests T08-12 (another account's order is 404) and the reason and recovery tests                                                                           |
| Steal the passkey-derived key with injected script                   | Web app                                                | A strict Content-Security-Policy with nonces: no inline script, no `unsafe-eval`. No `dangerouslySetInnerHTML`. Names, reasons and shop names render as plain text. The derived key lives in memory. Its only stored copy is encrypted under a key that page script cannot read, kept for one tab, and dropped on sign-out, when the tab closes, or after 30 minutes away (06 S06-16a). Never in logs. | Server test T05-13 (headers and CSP); lint rule `react/no-danger`; key never stored (06)                                                                         |
| Read the invite's one-time key from logs                             | Invite link                                            | The key goes after `#` in the link, which browsers never send to a server. `Referrer-Policy: no-referrer`. The server only ever sees the invite's address.                                                                                                                                                                                                                                             | Invite link format (10); server test T05-13 (`Referrer-Policy: no-referrer`)                                                                                     |
| Reuse an invite or recovery signature elsewhere                      | Contract                                               | EIP-712 signatures that name chain id 10143 and the contract address, each usable once.                                                                                                                                                                                                                                                                                                                | Contract tests `test_SEC_inviteSignatureForAnotherChainRejected`, `test_SEC_inviteSignatureForAnotherContractRejected`, `test_SA06_inviteKeyWorksOncePerAccount` |
| Re-enter the contract during a transfer, or break the money total    | Contract                                               | Checks before effects before transfers, `ReentrancyGuard` on every function that moves AUSD, `SafeERC20`. Invariant tests for the six rules in section 7.                                                                                                                                                                                                                                              | Contract test `test_SEC_reentrancyBlocked`; invariant tests `invariant_1` to `invariant_6`                                                                       |
| Use a stolen server key                                              | Server keys                                            | Three wallets, each allowed only what R3 gives it, each holding only a few days' budget. Keys sit in Vercel's encrypted settings, never in a `NEXT_PUBLIC_` variable. A build step searches the browser bundle for key patterns.                                                                                                                                                                       | Contract invariant `invariant_5_onlyAllowedCallersSucceed`; server tests T05-18, T05-21; bundle scan T05-23                                                      |
| Inject SQL                                                           | Database                                               | Queries only through the ORM with parameters, never built from strings. The production database user cannot change tables.                                                                                                                                                                                                                                                                             | Server test T05-22 (database role); lint rule against `sql.raw`                                                                                                  |
| Flood the server to run up cost                                      | Every `POST`                                           | Rate limits per IP and per account. A 10 KB body limit. The 280-character reason limit is checked on the server too.                                                                                                                                                                                                                                                                                   | Server tests T05-9 (rate limits) and T05-10 (body); reason length tests (12)                                                                                     |
| Frame the app, or downgrade the connection                           | Web app                                                | Headers: HSTS, `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, a Permissions-Policy that allows only what passkeys need. CORS: same origin only.                                                                                                                                                                                                                                          | Server test T05-13 (headers and CSP), T05-14 (origin)                                                                                                            |
| Ship a malicious or vulnerable package                               | Dependencies                                           | Lockfile committed and installed with `npm ci`, exact versions. Next.js and React on their newest patch release. Check downloads, maintainers and install scripts before adding any package.                                                                                                                                                                                                           | `npm run check:deps` (exact versions, lockfile, install scripts, framework patch); OSV-Scanner and Dependabot in CI                                              |

<!-- fragment:threats:end -->

## Contract self-review

The full report is [`audits/2026-10-self-review.md`](audits/2026-10-self-review.md). It reviewed the contract at the tag `audit-2026-10-10-end`; the first testnet deployment (commit `43b7c5c`) carries every fix.

| Severity                     | Fixed                   | Accepted                       | False positive |
| ---------------------------- | ----------------------- | ------------------------------ | -------------- |
| Medium                       | 3 (SA-01, SA-02, SA-04) | 1 on a demo deployment (SA-09) |                |
| Low                          | 3 (SA-03, SA-05, SA-06) | 2 (SA-08, SA-10)               |                |
| Info                         |                         | 1 (SA-11)                      |                |
| Tool-reported high or medium |                         |                                | 1 (SA-07)      |

No high or medium finding is open.

## Server and app review

The server and app security review pass before submission (PRD 15 "Before submission" step 1) is run on Mon 12 Oct; its reviewer, date and every finding, fixed with its commit or accepted with its reason, are recorded here when it is done. Until then, the threat table above lists the tests that cover each server and app threat.

## Accepted risks

<!-- fragment:accepted-risks:start -->

- Testnet only; no real money moves.
- Purchase amounts are public on the chain (R27).
- Someone with many addresses can still get some test MON, within the caps.
- One deployer address sets the contract up.
- No external audit; the contract has a self-audit only. A launch with real money needs an external audit first.
- Script injected into the page while a session is open could use the account, and could also read the encrypted session copy kept for reloads. The weekly release limits what can be spent, and the strict Content-Security-Policy is the barrier. A device key limited by the contract replaces this later (Roadmap).

<!-- fragment:accepted-risks:end -->

Accepted later, from the self-review:

- **Demo mode moves every clock.** On a deployment built with `demoMode = true`, a student's `skipDays` moves the clock that every wait, weekly release and card hold reads (PRD 12). A student can skip past a card hold before the card service collects it, finish a 48-hour wait at once, or release a whole allowance early. The hackathon deployment is demo mode with test AUSD and a simulated card; any deployment holding real money must use `demoMode = false`, which cannot be changed after deploy.
- **Recovery address squatting.** A trusted person of any account can approve a recovery to an address first, so another account's recovery to the same address reverts `RecoveryTargetBusy`. Nobody gains anything (the new owner must call `finishRecovery` itself), and the new phone can create a fresh passkey.
- **The trusted person can propose a recovery to an address they control.** By design (R23, R24): it takes 48 hours and the student can cancel it, or remove the trusted person, which also cancels it.
- **A recovery past its wait is the new owner's to finish.** Nobody can cancel it any more, and while it is pending the trusted person cannot be removed. If the new passkey is lost before it finishes, only the trusted person can clear it, by approving again; if that key leaks, its holder can still finish it.
- **A student can make a second address their own trusted person.** The contract cannot tell who owns an address; that student skips the 48-hour Emergency wait for their own money.
- **A thief holding the student's key can cancel recoveries** (R24 lets the old passkey cancel). Recovery protects against a lost key, not a stolen one.
- **Holds expire after 7 days** (R13). A card network that captures later than that finds the hold released.
- **AUSD's issuer can freeze or pause the token.** Collects and deposits then revert; the contract has no way around it.
- **Unlimited approvals.** Treasury and Settlement approve the contract for the maximum amount. The contract pulls from Treasury only inside `deposit`, which only Treasury can call, and from Settlement only inside `refund`, capped per purchase at collected minus refunded. Approvals are revoked from an old contract on redeploy.

## Accepted analysis findings

These Slither and Aderyn findings were checked by hand and accepted. `audits/accepted-findings.json` lists them, and CI fails on any low finding not listed here.

| Tool    | Detector                      | Location                            | Reason                                                                                                                                                                                                                |
| ------- | ----------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Slither | `timestamp`                   | `contracts/src/AmplopEnvelopes.sol` | Every wait, release and hold reads the account clock (block.timestamp plus demo skips) by design (PRD 7 rule 6, S03-8). Comparisons are against 48-hour, 7-day and weekly boundaries, far above any block-time drift. |
| Aderyn  | `costly-loop`                 | `contracts/src/AmplopEnvelopes.sol` | The loops run over at most 3 live schedule records and 4 envelopes (S03-10, S03-51); storage writes inside them are bounded and needed.                                                                               |
| Aderyn  | `literal-instead-of-constant` | `contracts/src/AmplopEnvelopes.sol` | The literals are the PRD's own fixed values: the merchant category codes of the default shop table (R9), 100 for percent, 5 envelopes, 4 weekly shares and 7 days a week. Naming each adds nothing.                   |
| Aderyn  | `require-revert-in-loop`      | `contracts/src/AmplopEnvelopes.sol` | The loops are bounded at 5 split values and 3 schedule records; reverting on the first bad value is the intended check (R4).                                                                                          |

False positives silenced inline, each with its reason on the line above (SA-07 in the report): Slither `arbitrary-send-erc20` (pulls come only from the immutable treasury and settlement), `incorrect-equality` (the exact week match is the schedule merge rule), `unused-return` (the third `tryRecover` value adds nothing once the error is checked), and Aderyn `reentrancy-state-change` (a view call in the constructor).

## Gates

Every push runs these in [`ci.yml`](.github/workflows/ci.yml), and production deploys only from a commit where all of them are green:

- Types, lint and format: `tsc --noEmit`, ESLint, Prettier, solhint, `forge fmt --check`, with zero errors and zero warnings.
- Tests: Vitest and `forge test` (fuzz at 10,000 runs, invariant tests), with the coverage floors.
- Contract analysis: Slither and Aderyn, no high or medium finding; each low one fixed or listed above.
- Code scanning: CodeQL and Semgrep, no open high or medium finding.
- Secrets: gitleaks in the pre-commit hook and over the whole history in CI.
- Dependencies: `npm audit --omit=dev`, OSV-Scanner and Dependabot alerts, zero high or critical.
- Build: `next build`, then a search of the browser bundle for key patterns and server variable names.
- End to end: the Tier 1 cases on the preview deploy.

## Supported versions

Only the latest commit on `main` and its testnet deployment.
