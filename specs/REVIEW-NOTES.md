# Review notes: Amplop specs 00 to 20

Reviewer pass on `specs/00-index.md` to `specs/20-submission.md` against `PRD.md` and `01-conventions.md` (with its new section 9). Order of authority used for every fix: PRD, then 01, then the spec that owns the item in 00-index.

## 1. What was checked and how

- Read the PRD, 00, 01 and all 19 feature specs in full, and the text of every board in `specs/design/boards/` (extracted with a script) for copy checks.
- **Case script** (`cases.py`, kept in the reviewer's scratchpad): parses the 12 PRD 14 tables (A to L), then every markdown table in the specs that has ID, Case/Expected and Tier columns. It checks that each of the 140 cases is in its owner spec once with Kind, Case, Expected and Tier exactly as in the PRD, that any non-owner restatement matches too, that spec 19's case map lists all 140 with the right kind, case text, tier and owner, and that 19's Tier 1 list equals the PRD's. Before: 5 mismatches (spec 16's restated table). After: 0.
- **Rule script** (`rules.py`): for R1 to R27, checks that a numbered requirement (`S<nn>-<n>`) in the owning spec or owner pair cites the rule (ranges such as R16–R19 expanded), and that every contract rule has a Foundry test named `test_R<n>_…` in 03. Before: 3 gaps (R7 in 08/11, R18 in 12, R23 in 13). After: 0.
- **Other scripts**: error codes collected from every spec and grouped by code and status (no code now has two meanings); template section order against 01 §10 (all 19 specs in order); requirement numbering (continuous in all 19 specs); greps for stale names (`days` parameter, `recoveryOf`, `account_mismatch`, `demo_mode_mismatch`, "+10%" gas, 25-block lag, `(proposed)`, `localStorage` keys not in 01 §9).
- Hand checks: every PRD 8 endpoint, the 15 PRD 15 threat rows, the 8 security tests, the 8 gate rows, the 6 self-audit steps, the PRD 13 deliverables, PRD 16 schedule, cut order and never-cut list, PRD 17 day-one checks, the 8 "behaviour these tests pin down" rules, and the worked maths (dates and Monday numbers in 03, Rp1.234.567 split, €12,50 conversion, mock-up figures for pace, bars, totals and rupiah).

## 2. Changes by spec

**00-index.** Dependencies brought in line with the spec headers (11, 12, 13, 14, 16). Coverage table: R14 is server-only (09), contract rules listed as R1–R13 and R15–R24; threat rows, security tests, endpoints, PRD 14 rules 1–8, PRD 16 and PRD 17 day-one checks each mapped to an owner.

**01-conventions.** §9 error-code paragraph now lists 05's actual platform codes and says a code keeps one meaning when reused. Added: `recoveryAccountOf` set/clear rule and one pending recovery per new owner; `GAS_FLOOR` in shared constants; an "Indexer" line (16 owns entity and field names, `accountClock`, `sortKey`, alert `status`, 14 owns wording); `?tx=` on `/app/arrived/[deposit]`; storage keys `amplop.openOrders` (shape), `amplop.seenDeposit`, `amplop.emergency.v1`, `amplop.recovery`; `scan:bundle` and 05's pattern file path; `DEPENDABOT_READ_TOKEN` in §7; owners of `mcc.ts` and `schedule.ts` in §2; §10 template now ends with "Additions to 01 (status)".

**02.** Shared package entries for constants, indexer and other modules; root scripts `db:up`, `db:migrate`, `chain:up`, `deploy:local`, `test:e2e`, `check:wording`, `check:fragments`; CI job `contracts-local-deploy` (04's test); bundle scan now runs 05's script and patterns (02 supplies canaries); `deployments/anvil.json` in `.gitignore`; `.env.example` check excludes CI-only secrets; "01 §10" → §11; additions section with statuses.

**03.** `numDays` stated as the interface (no exception); `purchaseUsed`, `recoveryAccountOf`, getters and `schedules` written as real requirements (no "proposed"); new storage `recoveryAccountOf`, set in `approveRecovery`, cleared on finish, cancel and replacement, new error `RecoveryTargetBusy()`; gas report now produces `GAS_FLOOR` and `TYPICAL_ACTION_GAS` in `packages/shared`, and the 01 gas rule replaces "estimate plus a small margin"; tests added or extended: `test_R23_recoveryAccountOfTracksPending`, `test_R23_removalAndRecoveryBlockEachOther`, `purchaseUsed` in `test_R3_purchaseIdCannotBeReused`, no re-locking in `test_R20_lockOffAndRequestBlockEachOther`; decision 18; additions with statuses.

**04.** `chain:up` (Anvil with `--timestamp 1790586000`) and `deploy:local` defined; gas floors per 01; additions with statuses (verifier key not merged, reason given).

**05.** All "proposed" markers removed; `orders` and `purchases` schema rows now match 01 §5 (missing columns, `pending` result, `hold_state` index); `GAS_FLOOR` comes from `packages/shared` (shared with the browser); PRD 17 fee-on-limit day-one check placed in S05-41; `db:up` and `db:migrate` defined; additions with statuses.

**06.** Envelope route `0` to `3` with `4` redirecting; gas limit `max(estimate + 20%, GAS_FLOOR)` everywhere (step, test, acceptance, skill line, decision); `switchProfile` refuses when demo mode is off; `allowCredentials` stated for known-profile sign-in; S06-35 error table rewritten with 03's real error names (including the new recovery and lock-off errors); storage allowlist matches 01 §9; new S06-51 (test ids, `window.__amplopTest`), S06-52 (indexer client and `useIndexerHealth`, which 16 said 06 provides), S06-53 (PRD 17 day-one checks 1 and 2); L5 uses 19's RPC proxy; additions with statuses.

**07.** `account_mismatch` → 05's `wrong_account`; `zAccountId` and lowercase `zAddress`; alerts go through 05's `sendAlert` (hourly dedupe, test adjusted); PRD 17 day-one check 3 in the acceptance list; stale "proposed" references removed; additions with statuses.

**08.** Route `/app/arrived/[deposit]` is the `paymentId` with `?tx=` (lookup order: receipt, indexer, 100-block log scan); storage keys `amplop.openOrders` and `amplop.seenDeposit` per 01; R7 cited; C14 note fixed for same-week merging; `isDemoUi` → 15's `DEMO` and `SimulatePaymentButton`; "proposed" references removed; additions with statuses.

**09.** Retry after a timeout reads `purchaseUsed` (01 §9); Collect now shown only before `HOLD_PERIOD` ends, and a collect on an expired hold releases it and answers `not_held`; refund default uses `collected − refunded`; next-share figure from 11's `nextRelease`; stale conditional about 03 removed; E15 fallback removed; additions with statuses.

**10.** `account_mismatch` → `wrong_account`; accept flow calls `finishRemoveTrusted` first when a removal is due (01 §9); `TrustedPersonRow` disables Change while a recovery is pending; alerts defer to 14's rows (the separate `trusted_removal_cancelled` kind dropped); `useTrustedName` defined (08, 09 and others used it but no spec defined it); gas line; additions with statuses.

**11.** Release maths rewritten to 03's `ScheduleView { startMonday, sharesOut, base[4], part[4] }`: `shareAmount`, `releaseDay`, `sharesOutAt`, `weekCounter`, `thisWeekShare`, `nextRelease`, `pace` and the release-schedule rows (mock-up figures re-checked: week 2 of 4, $225,00 next release, 57% tick, Food on plan, Everyday spending fast). Move amount is 03's `m` (held, or collected − refunded), not `amount`. Indexer lag 30 blocks / 4 s via 06's helper; Activity ordered by 16's `sortKey` and dated by `accountClock`; deposit link uses `paymentId?tx=`; no Multicall (06 owns the client); `GET /api/purchases` sample includes `result`; D3 and D5 use the UI skips the harness allows; MCC table moved into requirement S11-30; obsolete "schedules() missing" fallback removed; additions with statuses.

**12.** Lock-off-pending notice replaces the form (01 §9); linkId kept in memory and recovered with `GET /api/reason/current`; storage reduced to `amplop.emergency.v1`; `wrong_account`; reason row of another account answers 404 (05 S05-12, and no reuse of `not_allowed` with a new meaning); R17/R18 cited; indexer field `closedTx`; G13 uses the harness's single `evm_increaseTime` exception and expects "59 min"; additions with statuses.

**13.** `recoveryOf` → `recoveryAccountOf` (no indexer fallback); Settings uses 10's `TrustedPersonRow` instead of a second, different copy table; lock switch disabled while an Emergency request is open; approval page refuses during a pending removal and when the new passkey waits for another recovery; Passkey row shows "This phone" (no stored date); `bad_request` → `bad_input`; `amplop.recovery` per 01; R20, R21, R23, R24 cited in requirements; additions with statuses.

**14.** Alerts read with 16's names (`accountClock`, `status`, `readyAt`, `sortKey`), `Replaced` alerts hidden, cancelled from `status`; the pending trusted-person removal is also built from the contract (so 10's indexer-down need is met) with 14's wording; immediate-split row dropped to match 16; lag via 06's helper; additions with statuses.

**15.** `skipDays(numDays)` throughout; `demo_mode_mismatch` → 05's `demo_mismatch`; banner style deferred to 06 (they disagreed on colours); Collect now only before the hold period ends; demo-off bundle search given an owner script run in 19's K4 build; additions with statuses.

**16.** Restated E2E table now matches the PRD exactly; config check reads 04's `address` and `deployBlock`; monorepo fallback text; additions with statuses.

**17.** Route group `(marketing)` to match 06; additions with statuses.

**18.** The eight reviewed cards and their source links put into the footnote spec (S18-15) and `reviewed-cards.txt`; the "if the report is not at hand" fallback and its edge-case row removed; names checked case-sensitive as whole words; set-up and test sections use the root scripts; additions with statuses.

**19.** Anvil wallets per 01 §9 (settlement = account 3, fee sponsor = account 4; seeding as 04); Anvil and deploy through `chain:up` / `deploy:local`; server and browser RPC proxies added (E21 and L5 depended on a proxy nobody defined); Midtrans stand-in answers 08's Core API calls (not Snap); single G13 time exception; `test:e2e` alias; demo-off bundle check on the K4 stack; "Case map" made a subsection of Requirements; additions with statuses.

**20.** Wrong cross-reference (S20-9 → S20-11); additions with status.

## 3. Open points, settled

1. **`RecoveryTargetBusy`.** Kept. Someone could block a pending new passkey, but the student just makes a fresh one. Binding recovery links to an account is a later improvement.
2. **Share 1 date and pace period.** Kept as written: share 1 shows its arrival week's Monday when the indexer is down; with the indexer up, the arrival date comes from the `Deposited` event. No contract change.
3. **Immediate split alert.** No alert. An immediate save is only possible before any allowance has arrived, so nothing the parent sent is affected.
4. **Recovery to a passkey that is a trusted person elsewhere.** The stricter app and server rule stays: a recovery should always go to a fresh passkey. The contract stays as is.
5. **`deployments/anvil.json`.** Fixed in 04: the shared package exports only the committed testnet file; local runs read addresses from `.env.local` written by `deploy:local`.

## 4. Coverage results

- **Rules:** R1 to R27 each cited by a numbered requirement in the owning spec or owner pair (R1–R13 and R15–R24 in 03; R4–R8 in 08/11; R9–R15 in 09/11; R16–R19 in 12; R20, R21, R23, R24 in 13; R22 in 10; R25, R26 in 14; R27 in 09 and 18; R14 in 09). Every contract rule except R14 (server-only) has at least one named Foundry test; 23 rules, 82 distinct `test_R…` tests in the S03-55 table, plus invariants, fuzz and security tests.
- **End-to-end cases:** 140 in the PRD (35 Normal, 105 Edge; Tier 1 = 40, Tier 2 = 65, Tier 3 = 35). All 140 appear in their owner spec with Case, Expected and Tier identical to the PRD, and in 19's case map with the right kind, tier and owner. By owner (T1/T2/T3/total): 06 0/3/5/8, 07 5/7/5/17, 08 7/8/2/17, 09 9/11/2/22, 10 2/6/3/11, 11 5/8/5/18, 12 5/7/4/16, 13 3/7/7/17, 14 2/4/1/7, 15 1/2/1/4, 17 0/2/0/2, 19 1/0/0/1. Script result: 0 mismatches.
- **Endpoints:** all 14 PRD 8 endpoints (11 table rows, with the profile, invite and reason pairs counted separately) are in 01 §4 with an owner (07, 08, 09, 10, 11, 12), plus the gap-filled nonce, card issue, invite latest, reason current, recovery and cron endpoints (05, 09, 10, 12, 13, 08).
- **Threats:** all 15 PRD 15 rows owned: 10 platform rows in 05's table, fee sponsor in 07, payment notification in 08, card endpoint in 09, signature reuse and reentrancy in 03. All 8 security tests, 8 gate rows (02 S02-13) and 6 self-audit steps (04 S04-18 to S04-26) are traceable. PRD 13 deliverables: 20 S20-1 (18 rows). PRD 16: 00 build order, 13 cut order, 19 Tier 1 days, 20 S20-11 to S20-14. PRD 17 day-one checks: 06 S06-53, 07, 04, 08, 05, 19 (mapped in 00-index). PRD 14 rules 1 to 8: 19 S19-19, each with owner and case.
