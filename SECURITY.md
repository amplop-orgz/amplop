# Security

Amplop is a hackathon project on Monad testnet. The contract is **self-reviewed, findings published**; it has not had an external audit. The full self-review is in [`audits/2026-10-self-review.md`](audits/2026-10-self-review.md). Spec 18 extends this page.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting on this repository ("Security" tab, "Report a vulnerability"). Please do not open a public issue.

## Accepted analysis findings

These Slither and Aderyn findings were checked by hand and accepted. `audits/accepted-findings.json` lists them, and CI fails on any low finding not listed here.

| Tool    | Detector                      | Why it is accepted                                                                                                                                                          |
| ------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Slither | `timestamp`                   | Every wait, release and hold reads the account clock (block time plus demo skips) by design. The boundaries are 48 hours, 7 days and weeks, far above any block-time drift. |
| Aderyn  | `costly-loop`                 | Loops run over at most 3 schedule records and 4 envelopes.                                                                                                                  |
| Aderyn  | `literal-instead-of-constant` | The literals are the PRD's fixed values: shop codes, 100 percent, 5 envelopes, 4 shares, 7 days.                                                                            |
| Aderyn  | `require-revert-in-loop`      | The loops are bounded (5 split values, 3 records); stopping at the first bad value is the check.                                                                            |

False positives silenced inline, each with its reason on the line above (SA-07 in the report): Slither `arbitrary-send-erc20` (pulls come only from the immutable treasury and settlement), `incorrect-equality` (the exact week match is the schedule merge rule), `unused-return` (the third `tryRecover` value adds nothing once the error is checked), and Aderyn `reentrancy-state-change` (a view call in the constructor).

## Accepted risks

- **Demo mode moves every clock.** On a deployment built with `demoMode = true`, a student's `skipDays` moves the clock that every wait, weekly release and card hold reads (PRD 12). A student can skip past a card hold before the card service collects it, finish a 48-hour wait at once, or release a whole allowance early. The hackathon deployment is demo mode with test AUSD and a simulated card; any deployment holding real money must use `demoMode = false`, which cannot be changed after deploy.
- **Recovery address squatting.** A trusted person of any account can approve a recovery to an address first, so another account's recovery to the same address reverts `RecoveryTargetBusy`. Nobody gains anything (the new owner must call `finishRecovery` itself), and the new phone can create a fresh passkey.
- **The trusted person can propose a recovery to an address they control.** By design (R23, R24): it takes 48 hours and the student can cancel it, or remove the trusted person, which also cancels it.
- **A student can make a second address their own trusted person.** The contract cannot tell who owns an address; that student skips the 48-hour Emergency wait for their own money.
- **A thief holding the student's key can cancel recoveries** (R24 lets the old passkey cancel). Recovery protects against a lost key, not a stolen one.
- **Holds expire after 7 days** (R13). A card network that captures later than that finds the hold released.
- **AUSD's issuer can freeze or pause the token.** Collects and deposits then revert; the contract has no way around it.
- **Unlimited approvals.** Treasury and Settlement approve the contract for the maximum amount. The contract pulls from Treasury only inside `deposit`, which only Treasury can call, and from Settlement only inside `refund`, capped per purchase at collected minus refunded. Approvals are revoked from an old contract on redeploy.
- **One deployer address sets the contract up.** It keeps no power afterwards: there is no owner, admin, pause or upgrade.
- **No external audit.** See the self-review above.
