# 03. Contract: AmplopEnvelopes

Status: Ready · PRD sources: 4 (R1–R24), 7, 12, 14 (contract tests, rules 1–8), 15 (Solidity rules, threats, security tests) · Depends on: 01, 02

## Goal

One Solidity contract, `AmplopEnvelopes`, holds every AUSD unit and enforces rules R1 to R24. Balances are computed on read, so no weekly transaction is needed. A Foundry test suite proves each rule by name, runs the six PRD 7 invariants over random call sequences, and meets the coverage floors.

## In scope / Out of scope

**In scope**

- `contracts/src/AmplopEnvelopes.sol`: storage, every write and read in 01 section 3, the custom errors, NatSpec.
- `contracts/test/`: unit tests per rule, fuzz tests, invariant tests with a handler, security tests, mock tokens.
- `contracts/foundry.toml` profiles for fuzz and invariant runs (CI wiring itself is spec 02).

**Out of scope**

- Deploy, verification, approvals, ABI generation, self-audit (spec 04).
- Currency conversion (R14 lives in the server, spec 09; the contract only sees token units).
- Shop names, reasons, invite names (server, specs 09, 10, 12).
- Any admin, pause, upgrade or sweep function. There is none.

## Requirements

### A. Build basics

**S03-1 File, compiler, libraries.** The contract is `contracts/src/AmplopEnvelopes.sol` with `pragma solidity 0.8.30;` (exact, no caret). `foundry.toml` sets `solc = "0.8.30"`, `optimizer = true`, `optimizer_runs = 200`, `evm_version = "prague"`. Confirm in the MONSKILLS `concepts` / `tooling-and-infra` skill that Monad testnet supports Prague opcodes; if not, use `"cancun"`. Use OpenZeppelin Contracts 5.x, one exact tag installed as a git submodule (`lib/openzeppelin-contracts`), recorded in `foundry.toml` remappings. Imports: `IERC20`, `IERC20Metadata`, `SafeERC20`, `ReentrancyGuard` (storage version, not transient), `EIP712`, `ECDSA`, `SafeCast`. Inherit `EIP712` and `ReentrancyGuard` only.

**S03-2 No hidden powers.** No owner, admin, pause, upgrade proxy, `selfdestruct`, `delegatecall`, `receive` or `fallback`. Sending MON to the contract reverts. No function moves tokens except `deposit`, `collect` and `refund`. Nothing can change the token, settlement, treasury, card service, demo switch or shop-type table after the constructor.

**S03-3 Constructor.** `constructor(IERC20 token, address settlement, address treasury, address cardService, bool demoMode)` (01 section 3), plus `EIP712("AmplopEnvelopes", "1")`.

1. Revert `ZeroAddress()` if `token`, `settlement`, `treasury` or `cardService` is `address(0)`. Do not require the role addresses to differ (PRD 6 allows one wallet in the first days; spec 04 checks three wallets by submission).
2. Read `IERC20Metadata(address(token)).decimals()` inside `try`/`catch`. On failure revert `TokenDecimalsUnreadable()`. Store it as immutable `tokenDecimals`. The contract never uses a literal `6` or `1e6`.
3. Store all five arguments as immutables.
4. Write the default shop-type table (S03-13).
5. Emit no event (the constructor is not a write in the PRD 7 sense; the deploy transaction is the record).

**S03-4 Public getters.** `token()`, `settlement()`, `treasury()`, `cardService()`, `demoMode()`, `tokenDecimals()` and `accountCount()` are public view getters (01 section 3).

**S03-5 Interface exactness.** Every function name, parameter type, return type, struct field, enum, constant and event in 01 section 3 is implemented exactly, including `skipDays(uint16 numDays)` and `event DaysSkipped(uint256 indexed accountId, uint16 numDays, uint64 skipSeconds)` (`days` is a reserved word in Solidity, so no parameter or field is named `days`).

### B. The account clock and Monday maths

**S03-6 Clock.** `clock(accountId) = uint64(block.timestamp) + accounts[accountId].skipSeconds`. For `accountId` 0 or an unknown id it returns `uint64(block.timestamp)`. The clock only moves forward (block time is monotonic; `skipSeconds` only grows).

**S03-7 Day and Monday numbers.** With `t = clock(accountId)`:

- `dayNumber = t / 86400`
- `mondayNumber(day) = (day + 3) / 7`
- Day number of the Monday that starts Monday number `m`: `mondayDay(m) = 7 * m - 3`
- For a schedule record started in Monday number `s`: `sharesOut = min(4, 1 + mondayNumber(today) - s)`. It is always at least 1.

Day 0 (1 Jan 1970) is a Thursday, so `+3` makes each new Monday number start at Monday 00:00 UTC.

**S03-8 One clock for every wait (invariant 6).** Every stored time and every time comparison uses the clock of the account concerned, never raw `block.timestamp`: deposit start day, schedule Monday, purchase `createdAt`, hold expiry, move window, Emergency `requestedAt`/`opensAt`, every pending `readyAt`, invite `expiresAt`. A function that acts on a purchase uses the clock of `purchase.accountId`.

**Worked examples (all times UTC, no skip).**

| Date       | Weekday | Unix time at 00:00 | dayNumber | mondayNumber |
| ---------- | ------- | ------------------ | --------- | ------------ |
| 2026-10-04 | Sun     | 1791072000         | 20730     | 2961         |
| 2026-10-05 | Mon     | 1791158400         | 20731     | 2962         |
| 2026-10-11 | Sun     | 1791676800         | 20737     | 2962         |
| 2026-10-12 | Mon     | 1791763200         | 20738     | 2963         |
| 2026-10-14 | Wed     | 1791936000         | 20740     | 2963         |
| 2026-10-19 | Mon     | 1792368000         | 20745     | 2964         |
| 2026-10-26 | Mon     | 1792972800         | 20752     | 2965         |
| 2026-11-02 | Mon     | 1793577600         | 20759     | 2966         |

_Arrival on a Sunday (D3)._ Deposit on Sun 11 Oct 2026 at 10:00 (`t = 1791712800`), record `s = 2962`. Shares out: 1 at once; 2 from Mon 12 Oct 00:00 (the next day); 3 from Mon 19 Oct; 4 from Mon 26 Oct; still 4 on Mon 2 Nov (`min(4, 5)`). `nextReleaseDay` right after arrival = `mondayDay(2963)` = 20738.

_Arrival on a Monday._ Deposit on Mon 12 Oct 2026 at 00:00:00 exactly (`t = 1791763200`), `s = 2963`. Share 1 at once; share 2 on Mon 19 Oct; 3 on Mon 26 Oct; 4 on Mon 2 Nov. A deposit one second earlier (Sun 23:59:59) has `s = 2962` and reaches share 2 one second after arrival.

_Sample $1.000 split 40/15/15/20/10 (C1, D1)._ With 6 decimals, `amount = 1_000_000_000`.

| Envelope  | Part        | Share 1–3   | Share 4     | Available at arrival            |
| --------- | ----------- | ----------- | ----------- | ------------------------------- |
| Food      | 400_000_000 | 100_000_000 | 100_000_000 | $100,00                         |
| Transport | 150_000_000 | 37_500_000  | 37_500_000  | $37,50                          |
| Study     | 150_000_000 | 37_500_000  | 37_500_000  | $37,50                          |
| Everyday  | 200_000_000 | 50_000_000  | 50_000_000  | $50,00                          |
| Emergency | 100_000_000 | n/a         | n/a         | 0 available, 100_000_000 locked |

Weekly envelopes gain $225,00 of available at arrival and at each of the next three Mondays, then nothing more.

_Two overlapping allowances (C14, R8)._ Allowance A ($1.000) arrives Wed 14 Oct (`s = 2963`). Allowance B ($500, Food part 200_000_000, share 50_000_000) arrives Wed 21 Oct (`s = 2964`). Food, nothing spent:

| Clock                  | A shares out | B shares out | Food available | Food unreleased |
| ---------------------- | ------------ | ------------ | -------------- | --------------- |
| Wed 14 Oct             | 1            | –            | $100           | $300            |
| Mon 19 Oct             | 2            | –            | $200           | $200            |
| Wed 21 Oct (B arrives) | 2            | 1            | $250           | $350            |
| Mon 26 Oct             | 3            | 2            | $400           | $200            |
| Mon 2 Nov              | 4            | 3            | $550           | $50             |
| Mon 9 Nov              | 4            | 4            | $600           | $0              |

### C. Storage design

Pack fields where natural; use `SafeCast` for every downcast. Names below are internal and may differ; the shape and meaning may not.

**S03-9 Accounts.** `accountCount` (uint256) starts at 0; `register` assigns `++accountCount`, so ids start at 1 and 0 means "no account". Per account:

| Field                              | Type                              | Meaning                                                          |
| ---------------------------------- | --------------------------------- | ---------------------------------------------------------------- |
| `owner`                            | address                           | Student (R1).                                                    |
| `trusted`                          | address                           | Trusted person or 0 (R2).                                        |
| `split`                            | uint8[5]                          | Split in force.                                                  |
| `lockOn`                           | bool                              | Emergency lock. `true` at `register`.                            |
| `everDeposited`                    | bool                              | Set by the first `deposit`; makes `saveSplit` pending.           |
| `requestSeq`                       | uint64                            | Emergency request counter.                                       |
| `skipSeconds`                      | uint64                            | Demo skip total.                                                 |
| `locked`                           | uint256                           | Emergency locked balance.                                        |
| `inAmt[4]`, `outAmt[4]`, `held[4]` | uint256                           | Envelope counters for Food, Transport, Study, Everyday (S03-11). |
| `schedules[6]`, `scheduleCount`    | Schedule, uint8                   | Allowances still releasing (S03-10).                             |
| `em`                               | Emergency record                  | S03-12.                                                          |
| `invite`                           | key, expiresAt, used              | S03-16.                                                          |
| `pendings[4]`                      | Pending, indexed by `PendingKind` | S03-17.                                                          |
| `overrideOf[uint16]`               | uint8                             | Per-account shop-type override (S03-13).                         |

Plus global `accountOf[address]`, `trustedAccountOf[address]` and `recoveryAccountOf[address]` (uint256, 0 = none; the last maps a pending recovery's new owner to its account, S03-44).

**S03-10 Release schedules, merged by start Monday.** A record is `{ uint64 startMonday; uint128[4] base; uint128[4] part; }` for Food, Transport, Study, Everyday. `part[e]` is the total of the parts of every allowance in that record; `base[e]` is the sum of each allowance's `floor(part_j / 4)`.

- A deposit goes into the record whose `startMonday` equals today's Monday number, or a new record if none exists.
- Released amount of a record for envelope `e`: `released = (sharesOut == 4) ? part[e] : sharesOut * base[e]`.
- Merging is exact. Each allowance alone would release `base_j` per share for shares 1–3 and `part_j - 3*base_j` for share 4 (R5). Summing over allowances gives `k*Σbase_j` for `k < 4` and `Σpart_j` at `k = 4`. So R8 ("its own four shares") holds to the unit.
- **Folding.** At the start of every `deposit`, each record with `sharesOut == 4` is folded: `inAmt[e] += part[e]` for all four envelopes, then the record is removed (swap with last, decrement count). Value is unchanged by folding.
- **Bound.** After folding, live records have `startMonday ∈ {M-2, M-1, M}` where `M` is today's Monday number. Records are added only by `deposit`, which folds first. So `scheduleCount <= 3` always. Storage is a fixed array of `MAX_SCHEDULES` (6). If `scheduleCount == MAX_SCHEDULES` when a new record is needed, revert `TooManySchedules()`; this is defensive and unreachable (an invariant test asserts `scheduleCount <= 3`).

**S03-11 Envelope counters.** For each weekly envelope `e` (0–3):

- `inAmt[e]`: money that has come in other than live schedule releases: folded records, returns from collect, released holds, refunds, move-ins to Everyday, opened Emergency money, lock-off money, unlocked Emergency shares.
- `outAmt[e]`: money taken out: holds placed (`authorize`) and moves out (the target of `movePurchase`).
- `held[e]`: sum of `held` over this account's purchases in state `Held` paid from `e`.

Both `inAmt` and `outAmt` only grow. Available is never stored (S03-18).

**S03-12 Emergency record.** `{ EmergencyStatus status; uint64 requestSeq; uint256 amount; bytes32 reasonHash; uint64 requestedAt; uint64 opensAt; }`. One record per account, overwritten by each new request. The amount is not reserved: `locked` can only grow while a request is Open (deposits), and only that request or lock-off can lower it, and lock-off cannot start while a request is Open (S03-38). So `amount <= locked` holds when it opens.

**S03-13 Shop-type table and overrides (R9, R12, R15).**

- Global `defaultRule[uint16] → uint8`: `0` unset (Everyday), `1..4` = Food..Everyday as `envelope + 1`, `255` = blocked. The constructor writes exactly the table in 01 section 3: Food 5411, 5812, 5814; Transport 4111, 4121, 5541, 5542; Study 5943, 7338, 8299; blocked 7995. 5942 and 7832 stay unset (Everyday). The table never maps to Emergency.
- Per account `overrideOf[shopType] → uint8`: `0` none, `1..3` = Food, Transport, Study as `envelope + 1`. Written only by `movePurchase`.
- Resolution, used by `authorize` and `shopEnvelope`:

```
rule = defaultRule[shopType]
if rule == 255:              return (Everyday, blocked = true)
if overrideOf[shopType] > 0: return (Envelope(overrideOf - 1), false)
if rule > 0:                 return (Envelope(rule - 1), false)
return (Everyday, false)
```

Blocked wins over any override (R12 "always declined").

**S03-14 Purchases.** `mapping(bytes32 => Purchase)` packed in three slots:

- slot 1: `uint64 accountId`, `uint64 createdAt`, `uint16 shopType`, `uint8 envelope`, `uint8 state`, `bool moved`, `bool everydayStepIn`
- slot 2: `uint128 amount` (approved amount, never changes), `uint128 held` (current hold)
- slot 3: `uint128 collected`, `uint128 refunded`

Plus `mapping(bytes32 => bool) purchaseIdUsed`, set for every authorised id, approved or declined. Declined purchases are not stored in `Purchase` (state stays `None`).

**S03-15 Used payment ids.** `mapping(bytes32 => bool) paymentUsed`. Set once by `deposit`, never cleared.

**S03-16 Invites.** Per account `{ address key; uint64 expiresAt; bool used; }`. `createInvite` overwrites it, so a new invite replaces any earlier one, used or not (PRD 14 rule 2).

**S03-17 Pending changes.** Per account `Pending[4]` indexed by `PendingKind`: `{ bool active; uint64 readyAt; bytes32 data; }`.

- `Split`: `data` = packed split: `uint256(s[0]) | uint256(s[1]) << 8 | uint256(s[2]) << 16 | uint256(s[3]) << 24 | uint256(s[4]) << 32`, as `bytes32`.
- `Recovery`: `data = bytes32(uint256(uint160(newOwner)))`.
- `TrustedRemoval`, `LockOff`: `data = 0`.

A second start of the same kind overwrites the record and restarts `readyAt` (PRD 14 rule 7).

**Pending split promotion.** `_promoteSplit(id)`: if `pendings[Split].active` and `clock >= readyAt`, set `split = unpack(data)` and clear the pending record. It runs at the start of `saveSplit` and `deposit` and emits nothing (the earlier `SplitSaved` already announced `startsAt`). Views apply the same rule on read (S03-20).

### D. Reads

**S03-18 Envelope formulas (R6, R8).** Unspent money stays in its envelope and carries over, because nothing ever resets the counters. For a weekly envelope `e` (0–3), summing over live records `r` with `k_r = sharesOut(r)`:

```
live[e]       = Σ_r ( k_r == 4 ? r.part[e] : k_r * r.base[e] )
unreleased[e] = Σ_r r.part[e] - live[e]
available[e]  = inAmt[e] + live[e] - outAmt[e]
held[e]       = held[e]
locked        = 0
```

For Emergency (4): `available = 0`, `unreleased = 0`, `held = 0`, `locked = account.locked`. Emergency money never sits as available: opened money, lock-off money and unlocked shares all go to Everyday.

`available[e]` never underflows (invariant 3). Use checked arithmetic so a bug reverts rather than wraps.

**S03-19 `envelopes(accountId)`** returns the five `EnvelopeView` values above and `nextReleaseDay`: if any live record has `sharesOut < 4`, `nextReleaseDay = mondayDay(mondayNumber(today) + 1)`, else `0`. It is a day number on the account clock (screens turn it into a date). No write ever happens on read.

**S03-20 Other reads.**

| Read                                  | Returns                                                                                                                                                                                                                                                                                      |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `totals(id)`                          | For e = 0..3: `available + unreleased`. For Emergency: `locked + available` (= `locked`). Held is excluded (R25).                                                                                                                                                                            |
| `accountOf(a)`, `trustedAccountOf(a)` | Stored ids, 0 = none.                                                                                                                                                                                                                                                                        |
| `accountInfo(id)`                     | `AccountInfo` per 01. `split` and `pendingSplit` are effective: if the pending split is due, `split` = pending, `pendingSplit` = zeros, `pendingSplitStartsAt` = 0.                                                                                                                          |
| `purchase(pid)`                       | `PurchaseInfo` per 01 (`accountId` widened to uint256, `createdAt` on the account clock). Zero struct for unknown or declined ids.                                                                                                                                                           |
| `emergency(id)`                       | `EmergencyInfo` per 01.                                                                                                                                                                                                                                                                      |
| `pending(id, kind)`                   | `(active, readyAt, data)`. For `Split`, a due pending split reads as `(false, 0, 0)`.                                                                                                                                                                                                        |
| `shopEnvelope(id, shopType)`          | Resolution in S03-13. Works for `id = 0` (default table only).                                                                                                                                                                                                                               |
| `clock(id)`                           | S03-6.                                                                                                                                                                                                                                                                                       |
| `inviteOf(id)`                        | `(key, expiresAt, used)`.                                                                                                                                                                                                                                                                    |
| `paymentUsed(pid)`                    | Stored flag.                                                                                                                                                                                                                                                                                 |
| `purchaseUsed(pid)`                   | `purchaseIdUsed` flag: true for approved and declined ids. The card service reads it after a timeout to learn whether an id reached the chain (spec 09).                                                                                                                                     |
| `recoveryAccountOf(a)`                | Stored id of the account with a pending recovery to `a`, 0 = none (S03-44 to S03-46).                                                                                                                                                                                                        |
| `schedules(id)`                       | Every stored record as `ScheduleView { uint64 startMonday; uint8 sharesOut; uint256[4] base; uint256[4] part; }`, `sharesOut` computed on read (S03-7). Records with `sharesOut == 4` stay in the list until the next `deposit` folds them. Screens 2.2, 2.3 and 1.1 read it (specs 11, 14). |

Every read returns zero values for an unknown `accountId` and never reverts.

### E. Access control (R1, R2, R3, invariant 5)

**S03-21 Who may call what.** "Owner" means `accountOf[msg.sender] != 0`; the function acts on that account. A function that takes `accountId` first reverts `AccountNotFound(accountId)` if `accountId == 0 || accountId > accountCount`.

| Function                                                                                                                                         | Allowed caller                                           | Otherwise              |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- | ---------------------- |
| `register`                                                                                                                                       | Address with no account                                  | `AlreadyHasAccount()`  |
| `saveSplit`, `createInvite`, `removeTrusted`, `movePurchase`, `requestEmergency`, `cancelEmergency`, `startLockOff`, `cancelPending`, `skipDays` | Owner                                                    | `NoAccount()`          |
| `acceptInvite`                                                                                                                                   | Holder of a valid invite signature (S03-41)              | invite errors          |
| `deposit`                                                                                                                                        | `treasury`                                               | `NotTreasury()`        |
| `authorize`, `collect`, `refund`                                                                                                                 | `cardService`                                            | `NotCardService()`     |
| `releaseHold`                                                                                                                                    | `cardService`, or anyone once the hold period has passed | `HoldNotExpired()`     |
| `approveEmergency`, `approveRecovery`                                                                                                            | `accounts[id].trusted` (non-zero)                        | `NotTrusted()`         |
| `finishRemoveTrusted`, `finalizeEmergency`, `finishLockOff`, `finishRecovery`                                                                    | Anyone, after the wait                                   | `WaitNotOver(readyAt)` |

Treasury can only add money (R3). Card service can only spend available money of the chosen envelope into a hold, release it, collect it to `settlement`, or refund from `settlement`. No server role can touch `locked` or unreleased money.

**S03-22 Address rules (PRD 14 rules 1 and 8, B5, B8).** An address owns at most one account (`accountOf`), is the trusted person of at most one account (`trustedAccountOf`), and is never the trusted person of the account it owns. Owning one account and being the trusted person of another is allowed.

### F. Writes

Each block lists checks in the order they run (tests rely on the order), then effects, token transfer, and the one event. Every write emits exactly one event (PRD 7).

**S03-23 Split validation (R4).** A split is valid when every value is a multiple of 5 and the five values sum to exactly 100. 0 and 100 are allowed for any envelope (A12). Otherwise `InvalidSplit()`. Sum with a `uint256` accumulator so `uint8` overflow cannot hide a bad split.

**S03-24 `register(uint8[5] split) returns (uint256 accountId)`** (R1)

- Checks: `accountOf[msg.sender] != 0` → `AlreadyHasAccount()`; invalid split → `InvalidSplit()`.
- Effects: new id; `owner = msg.sender`; `split`; `lockOn = true`; `accountOf[msg.sender] = id`.
- Event: `AccountCreated(id, msg.sender, split)`.

**S03-25 `saveSplit(uint8[5] split)`** (R21, H1, H4)

- Checks: `NoAccount()`; `InvalidSplit()`.
- Effects: `_promoteSplit`. If `!everDeposited`: `split = new`, clear any pending split; event `SplitSaved(id, split, clock, true)`. Else: `pendings[Split] = {true, clock + WAIT, pack(split)}`, replacing any earlier pending split and restarting the wait; event `SplitSaved(id, split, clock + WAIT, false)`.
- Money already in envelopes and schedules is never re-divided (H3).

**S03-26 `deposit(uint256 accountId, uint256 amount, bytes32 paymentId)`** (R4–R8, nonReentrant)

- Checks: `NotTreasury()`; `AccountNotFound`; `amount == 0` → `AmountZero()`; `amount > type(uint128).max` → `AmountTooLarge()`; `paymentId == 0` → `InvalidId()`; `paymentUsed[paymentId]` → `PaymentAlreadyUsed(paymentId)`.
- Effects, in order:
  1. `_promoteSplit(id)` (a split saved 48 hours ago applies; one still waiting does not, C15).
  2. Fold finished records (S03-10).
  3. Parts (S03-27): `parts[e]` for e = 0..4.
  4. `paymentUsed[paymentId] = true`; `everDeposited = true`.
  5. Emergency part: if `lockOn`, `locked += parts[4]` (R7). Else `inAmt[Everyday] += parts[4]`, whole and available at once (R20, C16).
  6. Weekly parts: find or create the record for today's Monday number; for e = 0..3, `base[e] += parts[e] / 4`, `part[e] += parts[e]`.
- Transfer: `token.safeTransferFrom(treasury, address(this), amount)`, with a balance-before/after check; a difference reverts `TransferMismatch()`.
- Event: `Deposited(id, paymentId, amount, parts, dayNumber)`. `parts` is the split result, even when the Emergency part went to Everyday (indexer reads `lockOn` from `LockOffDone`).

**S03-27 Rounding (R4, R5).**

- R4: for e in {Food, Transport, Study, Emergency}: `parts[e] = amount * split[e] / 100` (floor). `parts[Everyday] = amount - (sum of the other four)`. All leftover units land in Everyday. The five parts sum to `amount` exactly.
- R5: per weekly envelope, share 1–3 = `floor(part / 4)`, share 4 = `part - 3 * floor(part / 4)`. Leftover units are in the last share.

_Worked example (C12, D4)._ Rp1.234.567 → `floor(1_234_567 × 10^6 / 16_500)` = **74_822_242** units (the server does this, 01 section 8). Split 40/15/15/20/10:

| Envelope  | Formula                      | Part       | Shares 1–3   | Share 4   |
| --------- | ---------------------------- | ---------- | ------------ | --------- |
| Food      | floor(74_822_242 × 40 / 100) | 29_928_896 | 7_482_224    | 7_482_224 |
| Transport | floor(× 15 / 100)            | 11_223_336 | 2_805_834    | 2_805_834 |
| Study     | floor(× 15 / 100)            | 11_223_336 | 2_805_834    | 2_805_834 |
| Emergency | floor(× 10 / 100)            | 7_482_224  | locked whole |           |
| Everyday  | 74_822_242 − 59_857_792      | 14_964_450 | 3_741_112    | 3_741_114 |

Everyday gets 2 units more than `floor(20%)` = 14_964_448. Sum of parts = 74_822_242.

**S03-28 `authorize(uint256 accountId, bytes32 purchaseId, uint16 shopType, uint256 amount)`** (R9–R12)

- Revert checks (input errors only, never a decline): `NotCardService()`; `AccountNotFound`; `purchaseId == 0` → `InvalidId()`; `purchaseIdUsed[purchaseId]` → `PurchaseIdUsed(purchaseId)`; `amount == 0` → `AmountZero()`; `amount > type(uint128).max` → `AmountTooLarge()`.
- Effects: `purchaseIdUsed[purchaseId] = true`. Resolve `(env, blocked)` (S03-13). Then:
  1. `blocked` → decline `Blocked`. No money moves (R12).
  2. `available(env) >= amount` → pay from `env`, `everydayStepIn = false`.
  3. `env != Everyday` and `available(Everyday) >= amount` → pay from Everyday, `everydayStepIn = true`.
  4. Otherwise decline `NotEnough`.
- Pay from `p`: `outAmt[p] += amount`; `held[p] += amount`; store `Purchase {accountId, createdAt = clock, shopType, envelope = p, state = Held, amount, held = amount, moved = false, everydayStepIn}`. Event `PurchaseApproved(id, purchaseId, p, amount, shopType, everydayStepIn)`.
- Decline: event `PurchaseDeclined(id, purchaseId, amount, shopType, reason)`. No balance changes.
- Never split across envelopes (R10). Only Everyday steps in; Food, Transport and Study never step in for anything. Emergency is never chosen (R11): the table and overrides cannot name it.

| Case | Food avail                      | Everyday avail | Shop | Amount     | Result                               |
| ---- | ------------------------------- | -------------- | ---- | ---------- | ------------------------------------ |
| E1   | $100                            | $50            | 5411 | 14_388_750 | Approved, Food, no step-in           |
| E3   | $10                             | $50            | 5411 | 14_388_750 | Approved, Everyday, step-in          |
| R10  | $10                             | $10            | 5411 | 14_388_750 | Declined NotEnough (never split)     |
| E6   | $100                            | $5             | 7832 | $10        | Declined NotEnough; Food untouched   |
| E7   | any                             | any            | 7995 | any        | Declined Blocked                     |
| E19  | any                             | $50            | 1234 | $10        | Approved, Everyday                   |
| E10  | $0 (all weekly $0), locked $100 | $0             | 5411 | $10        | Declined NotEnough; locked untouched |

**S03-29 `collect(bytes32 purchaseId, uint256 amount)`** (R13, nonReentrant)

- Checks: `NotCardService()`; `state != Held` → `NotHeld()` (also unknown ids); `amount == 0` → `AmountZero()`; `amount > held` → `AmountAboveHeld()`; `clock >= createdAt + HOLD_PERIOD` → `HoldExpired()`.
- Effects: `returned = held - amount`; `held[env] -= held`; `inAmt[env] += returned`; `p.held = 0`; `p.collected = amount`; `state = Collected`.
- Transfer: `token.safeTransfer(settlement, amount)`. The recipient is always the immutable `settlement` (invariant 4).
- Event: `PurchaseCollected(id, purchaseId, amount, returned)`.

**S03-30 `releaseHold(bytes32 purchaseId)`** (R13)

- Checks: `state != Held` → `NotHeld()`; `msg.sender != cardService && clock < createdAt + HOLD_PERIOD` → `HoldNotExpired()`.
- Effects: `a = p.held`; `held[env] -= a`; `inAmt[env] += a`; `p.held = 0`; `state = Released`. No token moves.
- Event: `HoldReleased(id, purchaseId, a)`.
- At exactly `createdAt + HOLD_PERIOD` collect fails and anyone may release.

**S03-31 `refund(bytes32 purchaseId, uint256 amount)`** (R13, nonReentrant)

- Checks: `NotCardService()`; `state` not `Collected` or `Refunded` → `NotCollected()`; `amount == 0` → `AmountZero()`; `refunded + amount > collected` → `RefundTooLarge()`.
- Effects: `refunded += amount`; `state = Refunded`; `inAmt[p.envelope] += amount` (the envelope that paid; after a move, the target).
- Transfer: `token.safeTransferFrom(settlement, address(this), amount)` with the balance-delta check (`TransferMismatch()`).
- Event: `PurchaseRefunded(id, purchaseId, amount)`. Partial refunds may repeat until `refunded == collected`.

**S03-32 `movePurchase(bytes32 purchaseId, Envelope to)`** (R15, PRD 14 rule 5)

- Checks: `NoAccount()`; `state == None` → `PurchaseNotFound(purchaseId)`; `p.accountId != caller's id` → `NotOwner()`; `to` not Food, Transport or Study → `InvalidTarget()`; `p.moved` → `AlreadyMoved()`; `p.envelope != Everyday` → `NotFromEveryday()`; `clock >= createdAt + MOVE_PERIOD` → `MovePeriodOver()`; moved amount `m == 0` → `NothingToMove()`; `available(to) < m` → `TargetShort()`.
- Moved amount: `Held` → `m = p.held`; `Collected` or `Refunded` → `m = collected - refunded`; `Released` → `m = 0`.
- Effects: if `Held`, `held[Everyday] -= m` and `held[to] += m`. Always `outAmt[to] += m`; `inAmt[Everyday] += m`; `p.envelope = to`; `p.moved = true`; `overrideOf[p.shopType] = uint8(to) + 1`.
- Event: `PurchaseMoved(id, purchaseId, Envelope.Everyday, to, p.shopType)`.
- A step-in purchase (E3) is paid from Everyday, so it can move (F9). A declined purchase has no record, so it reverts `PurchaseNotFound` (F8).

**S03-33 `requestEmergency(uint256 amount, bytes32 reasonHash)`** (R16)

- Checks: `NoAccount()`; `em.status == Open` → `RequestAlreadyOpen()`; lock-off pending → `LockOffPending()`; `amount == 0` → `AmountZero()`; `amount > locked` → `AmountAboveLocked()`; `reasonHash == 0` → `ReasonRequired()` (PRD 14 rule 6).
- Effects: `requestSeq += 1`; `em = {Open, requestSeq, amount, reasonHash, clock, clock + WAIT}`.
- Event: `EmergencyRequested(id, requestSeq, amount, reasonHash, clock + WAIT)`.

**S03-34 `approveEmergency(uint256 accountId, uint64 requestSeq)`** (R17)

- Checks: `AccountNotFound`; caller is not `trusted` (or `trusted == 0`) → `NotTrusted()`; `status != Open` → `NoOpenRequest()`; `requestSeq != em.requestSeq` → `RequestChanged()` (audit change SA-01: the approval is bound to the request the trusted person saw).
- Effects: `_open(Approval)`. Works before or after `opensAt`.

**S03-35 `finalizeEmergency(uint256 accountId)`** (R17, R19)

- Checks: `AccountNotFound`; `status != Open` → `NoOpenRequest()`; `clock < opensAt` → `WaitNotOver(opensAt)`.
- Effects: `_open(Time)`. Opens at exactly `requestedAt + 48h`, not one second before. Works whether or not a trusted person exists; there is no refuse function (R17).

`_open(by)`: `locked -= amount`; `inAmt[Everyday] += amount`; `status = Opened`. Event `EmergencyOpened(id, requestSeq, amount, by)`. The rest stays locked (R18).

**S03-36 `cancelEmergency()`** (R16)

- Checks: `NoAccount()`; `status != Open` → `NoOpenRequest()`; `requestSeq != em.requestSeq` → `RequestChanged()` (audit change SA-01: the approval is bound to the request the trusted person saw).
- Effects: `status = Cancelled`. Locked unchanged. Event `EmergencyCancelled(id, requestSeq)`.

**S03-37 Emergency worked example (G1).** After C1, locked = 100_000_000. Raka requests 70_000_000 at clock T. Mama approves: Everyday available +70_000_000, locked = 30_000_000, `EmergencyOpened(…, Approval)`. Without approval: `finalizeEmergency` at `T + 172_799` reverts `WaitNotOver(T + 172_800)`; at `T + 172_800` it opens with `Time`.

**S03-38 `startLockOff()`** (R20)

- Checks: `NoAccount()`; `!lockOn` → `LockAlreadyOff()`; `em.status == Open` → `RequestAlreadyOpen()`.
- Effects: `pendings[LockOff] = {true, clock + WAIT, 0}` (restarts if already pending).
- Event: `LockOffStarted(id, clock + WAIT)`.

**S03-39 `finishLockOff(uint256 accountId)`** (R20)

- Checks: `AccountNotFound`; not pending → `NothingPending()`; `clock < readyAt` → `WaitNotOver(readyAt)`.
- Effects: `moved = locked`; `locked = 0`; `inAmt[Everyday] += moved`; `lockOn = false`; clear pending.
- Event: `LockOffDone(id, moved)`. Later Emergency parts go to Everyday at once (S03-26 step 5). The lock cannot be turned back on in this version.

**S03-40 `createInvite(address inviteKey)`** (R22)

- Checks: `NoAccount()`; `inviteKey == 0` → `ZeroAddress()`.
- Effects: `invite = {inviteKey, clock + INVITE_LIFE, false}`, replacing any earlier invite. Allowed while a trusted person is linked (the replacement flow, B10).
- Event: `InviteCreated(id, inviteKey, clock + INVITE_LIFE)`.

**S03-41 `acceptInvite(uint256 accountId, bytes signature)`** (R22, B3–B8)

- Checks, in order:
  1. `AccountNotFound`.
  2. `invite.key == 0` → `NoInvite()`.
  3. `invite.used` → `InviteUsed()`.
  4. `clock >= expiresAt` → `InviteExpired()`.
  5. `digest = _hashTypedDataV4(keccak256(abi.encode(ACCEPT_INVITE_TYPEHASH, accountId, msg.sender)))` with `ACCEPT_INVITE_TYPEHASH = keccak256("AcceptInvite(uint256 accountId,address trusted)")`. `(signer, err, ) = ECDSA.tryRecover(digest, signature)`. `err != NoError` or `signer != invite.key` → `BadSignature()`. `tryRecover` rejects high-`s` (malleable) signatures. The domain binds chain id and contract address.
  6. `msg.sender == owner` → `CannotTrustSelf()` (B5).
  7. `trustedAccountOf[msg.sender] != 0` → `AlreadyTrusted()` (B8).
  8. `trusted != 0` → `TrustedAlreadyLinked()`.
- Effects: `invite.used = true`; `trusted = msg.sender`; `trustedAccountOf[msg.sender] = accountId`.
- Event: `TrustedLinked(accountId, msg.sender)`.
- Replacement (B10): the new person can link only after the old one is removed. If a removal is ready but not finished, the app calls `finishRemoveTrusted(accountId)` first (anyone may), then `acceptInvite`.

**S03-42 `removeTrusted()`** (R22)

- Checks: `NoAccount()`; `trusted == 0` → `NoTrustedPerson()`.
- Effects: a pending recovery is cancelled first (`recoveryAccountOf[newOwner] = 0`, pending cleared). Audit change SA-02: otherwise a trusted person could re-approve after every cancel and never be removed.
- Effects: `pendings[TrustedRemoval] = {true, clock + WAIT, 0}` (restarts if already pending).
- Event: `TrustedRemovalStarted(id, trusted, clock + WAIT)`. The trusted person keeps every power during the wait.

**S03-43 `finishRemoveTrusted(uint256 accountId)`**

- Checks: `AccountNotFound`; not pending → `NothingPending()`; `clock < readyAt` → `WaitNotOver(readyAt)`.
- Effects: `t = trusted`; `trustedAccountOf[t] = 0`; `trusted = 0`; clear pending. An open Emergency request stays open; a new trusted person can approve it (G14).
- Event: `TrustedRemoved(accountId, t)`.

**S03-44 `approveRecovery(uint256 accountId, address newOwner)`** (R23, I9)

- Checks: `AccountNotFound`; `NotTrusted()`; `newOwner == 0` → `ZeroAddress()`; `accountOf[newOwner] != 0` → `NewOwnerHasAccount()` (also covers the current owner); `newOwner == trusted` → `NewOwnerIsTrusted()`; removal pending → `TrustedRemovalPending()`; `recoveryAccountOf[newOwner] != 0 && != accountId` → `RecoveryTargetBusy()`.
- Effects: if a recovery is already pending to another address `old`, `recoveryAccountOf[old] = 0`. Then `pendings[Recovery] = {true, clock + WAIT, bytes32(uint256(uint160(newOwner)))}` and `recoveryAccountOf[newOwner] = accountId`. A second approval replaces the first and restarts the wait.
- Event: `RecoveryApproved(accountId, newOwner, clock + WAIT)`.
- With no trusted person there is no recovery (R23), because nobody passes `NotTrusted`.

**S03-45 `finishRecovery(uint256 accountId)`** (R23)

- Checks: `AccountNotFound`; not pending → `NothingPending()`; `clock < readyAt` → `WaitNotOver(readyAt)`; re-check `NewOwnerHasAccount()` and `NewOwnerIsTrusted()` (state may have changed during the wait).
- Effects: `old = owner`; `accountOf[old] = 0`; `accountOf[newOwner] = id`; `owner = newOwner`; `recoveryAccountOf[newOwner] = 0`; clear pending. Balances, schedules, holds, the open request, the invite, other pending changes and `skipSeconds` are untouched (I1).
- Event: `RecoveryDone(accountId, old, newOwner)`. The old address now fails every owner check (I4).

**S03-46 `cancelPending(PendingKind kind)`** (R24, H5, B11, G17, I3)

- Checks: `NoAccount()`; `!active`, or `kind == Split` and `clock >= readyAt` (already in force) → `NothingPending()`; `clock >= readyAt` → `WaitOver()`, except a `Recovery` whose new owner now owns an account (it can never finish, so it stays cancellable; audit change SA-03).
- Effects: clear `pendings[kind]`; for `Recovery`, also `recoveryAccountOf[newOwner] = 0`.
- Event: `PendingCancelled(id, kind)`.

**S03-47 `skipDays(uint16 numDays)`** (PRD 12, demo)

- Checks: `!demoMode` → `DemoOff()` (first, so it always reverts on a demo-off deployment); `NoAccount()`; `numDays == 0 || numDays > MAX_SKIP_DAYS_PER_CALL` → `InvalidDays()`.
- Effects: `skipSeconds += numDays * 86400` for the caller's account only.
- Event: `DaysSkipped(id, numDays, skipSeconds)`.
- "Skip to next Monday" is the app's job: it computes `numDays = mondayDay(mondayNumber(today) + 1) - today` (1 to 7). "Skip 48 hours" is `numDays = 2`.

### G. Cross-cutting

**S03-48 One event per write.** Each external write emits exactly one event from 01 section 3, and no write emits two. A test per function counts logs (`vm.recordLogs`).

**S03-49 Reentrancy, SafeERC20, checks-effects-interactions.** `deposit`, `collect` and `refund` are `nonReentrant`. All token calls use `SafeERC20`. All checks run first, then all storage effects, then the single token call. `deposit` and `refund` compare the contract's token balance before and after `safeTransferFrom` and revert `TransferMismatch()` if it did not grow by exactly `amount`. Accounting never reads `balanceOf` for balances. A direct token transfer to the contract (donation) is not credited to anyone and cannot be swept.

**S03-50 Decimals.** The constructor reads `decimals()` (S03-3). Contract maths is in token units only, so no formula depends on decimals. Tests build amounts from `token.decimals()` and run key suites at 6 and 18 decimals.

**S03-51 Gas on Monad.** Monad charges the fee on the gas limit a transaction sets, not on gas used (PRD 7; confirm in the MONSKILLS `gas` skill). So:

- Every loop is bounded: at most 3 live records (S03-10) × 4 envelopes. No unbounded arrays.
- `authorize` reads only the chosen envelope, plus Everyday on a step-in. A decline writes one slot plus the event.
- `Purchase` is three slots. Do not add fields to it.
- Cold storage access costs more on Monad than on Ethereum; take the figures from the `gas` skill and minimise distinct slots touched in `authorize`, `deposit` and `collect`.
- Commit `contracts/.gas-snapshot` (`forge snapshot`) with one test per write that measures its worst case. From `forge test --gas-report`, record for every write function its highest gas plus 10% as `GAS_FLOOR[functionName]` in `packages/shared/src/constants.ts`, and `TYPICAL_ACTION_GAS` as the largest floor among the functions a user signs (01 section 9). Update both in the same commit as any contract change. The browser (06) and the server (05) set every gas limit to `max(estimate + 20%, GAS_FLOOR[functionName])` (01 section 9).
- Runtime bytecode should fit 24,576 bytes with the optimizer on. If it does not, first move view maths into an internal library; if still too large, confirm Monad's code-size limit in the `concepts` skill and start Anvil with `--code-size-limit`.

**S03-52 Style and NatSpec.** NatSpec (`@notice`, `@param`, `@return`, and `@dev` naming the PRD rule) on every external and public function, event and custom error. `forge fmt --check` and solhint (recommended rules) pass with zero warnings. Rule numbers appear in comments where a rule is enforced (`// R10`).

**S03-53 Custom errors.** Every revert uses one of these. No `require` strings, no `assert` outside tests. Spec 06 maps each name to a sentence.

| Error                                   | Raised by                                                       |
| --------------------------------------- | --------------------------------------------------------------- |
| `ZeroAddress()`                         | constructor, `createInvite`, `approveRecovery`                  |
| `TokenDecimalsUnreadable()`             | constructor                                                     |
| `AlreadyHasAccount()`                   | `register`                                                      |
| `NoAccount()`                           | every owner function                                            |
| `AccountNotFound(uint256 accountId)`    | every function taking `accountId`                               |
| `NotOwner()`                            | `movePurchase`                                                  |
| `NotTrusted()`                          | `approveEmergency`, `approveRecovery`                           |
| `NotTreasury()`                         | `deposit`                                                       |
| `NotCardService()`                      | `authorize`, `collect`, `refund`                                |
| `InvalidSplit()`                        | `register`, `saveSplit`                                         |
| `AmountZero()`                          | `deposit`, `authorize`, `collect`, `refund`, `requestEmergency` |
| `AmountTooLarge()`                      | `deposit`, `authorize`                                          |
| `InvalidId()`                           | `deposit`, `authorize`                                          |
| `PaymentAlreadyUsed(bytes32 paymentId)` | `deposit`                                                       |
| `TooManySchedules()`                    | `deposit` (unreachable, defensive)                              |
| `TransferMismatch()`                    | `deposit`, `refund`                                             |
| `PurchaseIdUsed(bytes32 purchaseId)`    | `authorize`                                                     |
| `PurchaseNotFound(bytes32 purchaseId)`  | `movePurchase`                                                  |
| `NotHeld()`                             | `collect`, `releaseHold`                                        |
| `AmountAboveHeld()`                     | `collect`                                                       |
| `HoldExpired()`                         | `collect`                                                       |
| `HoldNotExpired()`                      | `releaseHold`                                                   |
| `NotCollected()`                        | `refund`                                                        |
| `RefundTooLarge()`                      | `refund`                                                        |
| `InvalidTarget()`                       | `movePurchase`                                                  |
| `AlreadyMoved()`                        | `movePurchase`                                                  |
| `NotFromEveryday()`                     | `movePurchase`                                                  |
| `MovePeriodOver()`                      | `movePurchase`                                                  |
| `NothingToMove()`                       | `movePurchase`                                                  |
| `TargetShort()`                         | `movePurchase`                                                  |
| `RequestAlreadyOpen()`                  | `requestEmergency`, `startLockOff`                              |
| `NoOpenRequest()`                       | `approveEmergency`, `finalizeEmergency`, `cancelEmergency`      |
| `RequestChanged()` | `approveEmergency` (SA-01) |
| `AmountAboveLocked()`                   | `requestEmergency`                                              |
| `ReasonRequired()`                      | `requestEmergency`                                              |
| `LockOffPending()`                      | `requestEmergency`                                              |
| `LockAlreadyOff()`                      | `startLockOff`                                                  |
| `WaitNotOver(uint64 readyAt)`           | every finish function, `finalizeEmergency`                      |
| `WaitOver()`                            | `cancelPending`                                                 |
| `NothingPending()`                      | `cancelPending`, every finish function                          |
| `NoInvite()`                            | `acceptInvite`                                                  |
| `InviteUsed()`                          | `acceptInvite`                                                  |
| `InviteExpired()`                       | `acceptInvite`                                                  |
| `BadSignature()`                        | `acceptInvite`                                                  |
| `CannotTrustSelf()`                     | `acceptInvite`                                                  |
| `AlreadyTrusted()`                      | `acceptInvite`                                                  |
| `TrustedAlreadyLinked()`                | `acceptInvite`                                                  |
| `NoTrustedPerson()`                     | `removeTrusted`                                                 |
| `TrustedRemovalPending()`               | `approveRecovery`                                               |
| `NewOwnerHasAccount()`                  | `approveRecovery`, `finishRecovery`                             |
| `NewOwnerIsTrusted()`                   | `approveRecovery`, `finishRecovery`                             |
| `RecoveryTargetBusy()`                  | `approveRecovery`                                               |
| `DemoOff()`                             | `skipDays`                                                      |
| `InvalidDays()`                         | `skipDays`                                                      |

OpenZeppelin's `ReentrancyGuardReentrantCall()` and `SafeERC20FailedOperation(address)` may also surface; spec 06 maps them to the generic "try again" sentence.

## Interfaces used

- 01 section 3 in full: enums, constants, constructor, writes, reads, structs, events, EIP-712 domain, shop-type table.
- OpenZeppelin Contracts 5.x: `IERC20`, `IERC20Metadata`, `SafeERC20`, `ReentrancyGuard`, `EIP712`, `ECDSA`, `SafeCast`.
- forge-std (`Test`, `StdInvariant`, `vm.sign`, `vm.warp`, `vm.recordLogs`).

## Screens

None. The contract serves boards 0.3 to 4.3 through the reads above.

## Errors and edge cases

| Case                                                       | Behaviour                                                                                                                  |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Deposit 1 unit                                             | Food/Transport/Study/Emergency parts 0, Everyday 1; Everyday shares 0, 0, 0, 1.                                            |
| Emergency 0% (G15)                                         | `locked` stays 0; `requestEmergency` reverts `AmountZero` or `AmountAboveLocked`.                                          |
| One envelope 100%                                          | Accepted; other parts 0.                                                                                                   |
| Purchase before any allowance (E11)                        | Declined `NotEnough`.                                                                                                      |
| Amount exactly equal to available (E9)                     | Approved; available becomes 0.                                                                                             |
| Two authorisations for the last dollars in one block (E14) | First approved, second declined `NotEnough`.                                                                               |
| Collect after release (E17)                                | `NotHeld()`.                                                                                                               |
| Approve after Emergency opened by time (G10)               | `NoOpenRequest()`.                                                                                                         |
| Lock-off while request open                                | `RequestAlreadyOpen()`; cancel the request first.                                                                          |
| Request while lock-off pending                             | `LockOffPending()`; cancel the lock-off first.                                                                             |
| Recovery and removal at once | `removeTrusted` cancels a pending recovery (SA-02); `approveRecovery` reverts `TrustedRemovalPending` during a removal. |
| Two accounts approve a recovery to the same new owner      | The second reverts `RecoveryTargetBusy()`; the new phone creates a fresh passkey.                                          |
| New owner registers during recovery wait                   | `finishRecovery` reverts `NewOwnerHasAccount()`; the student cancels or the trusted person approves again.                 |
| Due split never promoted                                   | Views show it as in force; `cancelPending(Split)` reverts `NothingPending()`; the next `saveSplit` or `deposit` stores it. |
| Old owner after recovery (I4)                              | `accountOf[old] = 0`, so every owner function reverts `NoAccount()`; the old address may register a fresh account.         |
| Skip on demo-off deployment (K4)                           | `DemoOff()`.                                                                                                               |
| Token donated directly                                     | Not credited; balance exceeds the sum (invariant 1 is tested with no donations).                                           |

## Security

- Access control exactly as S03-21; no admin key exists, so "one deployer address sets the contract up" (PRD 15 accepted risk) grants no lasting power.
- EIP-712 domain `("AmplopEnvelopes", "1", block.chainid, address(this))`; single-use invite; `ECDSA.tryRecover` (no malleable signatures, no `ecrecover` zero-address match because `invite.key != 0` is checked first).
- Reentrancy guard and CEI on all three token-moving functions; balance-delta check closes fee-on-transfer and odd-token gaps.
- Collected money only ever goes to the immutable `settlement` (invariant 4).
- `skipDays` reverts unless `demoMode`, which is immutable; it is bounded per call and per account.
- Purchase amounts, envelopes and shop types are public (R27). No names or reasons on chain; only `reasonHash`.

## Tests

### Layout

**S03-54 Files and helpers.**

- `contracts/test/AmplopBase.t.sol`: deploys `MockERC20` with `TOKEN_DECIMALS` (env, default 6), the contract with demo on, named actors (`raka`, `mama`, `dewi` second student, `budi` second trusted person, `stranger`, `treasury`, `cardService`, `settlement`), mints to treasury, sets treasury and settlement approvals. Helpers: `usd(dollars, cents)` from `token.decimals()`; `warpTo(dayNumber, secondsIntoDay)`; `signInvite(pk, accountId, trusted)` building the EIP-712 digest; `skipToNextMonday(account)`.
- `contracts/test/mocks/MockERC20.sol`: OpenZeppelin ERC20 with `constructor(string name, string symbol, uint8 decimals_)`, public `mint(address,uint256)`. Used on Anvil too (spec 04).
- `contracts/test/mocks/FeeOnTransferERC20.sol`: takes 1% on transfer (for `TransferMismatch`).
- `contracts/test/mocks/ReentrantERC20.sol`: on `transfer`/`transferFrom` calls back into the contract (`collect`, `refund`, `deposit`); the outer call must revert `ReentrancyGuardReentrantCall()`.
- `contracts/test/mocks/NoDecimalsERC20.sol`: `decimals()` reverts (constructor test).
- `contracts/test/rules/*.t.sol` one file per area; `contracts/test/invariant/Handler.sol` and `Invariants.t.sol`; `contracts/test/Security.t.sol`; `contracts/test/Decimals18.t.sol` (re-runs deposit, rounding and card suites with 18 decimals by inheriting them with `TOKEN_DECIMALS = 18`).

### Rule tests

**S03-55 One test per rule, named after it** (PRD 14 "Contract tests"). Each row in the PRD table maps to at least one test below. Names are exact; `test_` prefix, rule id, then a short description.

| PRD 14 area / case           | Test name                                        | Proves (expected result)                                                                                                                        | Req              | E2E twin    |
| ---------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ----------- |
| Split: totals 100            | `test_R4_splitMustTotal100AndStepsOf5`           | 95, 105 and a 3% step revert `InvalidSplit`; 0/100 accepted                                                                                     | S03-23           | A10, A12    |
| Split: rounding to Everyday  | `test_R4_leftoverUnitsGoToEveryday`              | 74_822_242 → table in S03-27; sum exact                                                                                                         | S03-27           | C12         |
| Split: payment id once       | `test_R4_samePaymentIdCannotDepositTwice`        | second deposit reverts `PaymentAlreadyUsed`; balances unchanged                                                                                 | S03-26           | C5, C6      |
| Split: only Treasury         | `test_R3_onlyTreasuryCanDeposit`                 | any other caller reverts `NotTreasury`                                                                                                          | S03-21           |             |
| Split: sample                | `test_R4_sampleThousandDollars`                  | parts 400/150/150/200/100; first shares 100/37,50/37,50/50; locked 100                                                                          | S03-27           | C1          |
| Release: share 1             | `test_R5_firstShareOnArrival`                    | available = share 1 at arrival                                                                                                                  | S03-18           | C1          |
| Release: Mondays             | `test_R5_sharesTwoToFourOnNextThreeMondays`      | +225 at each Monday 00:00, not at 23:59:59 the day before                                                                                       | S03-7            | D1          |
| Release: Sunday              | `test_R5_arrivalOnSunday`                        | share 2 next day; `nextReleaseDay` = 20738                                                                                                      | S03-7            | D3          |
| Release: Monday              | `test_R5_arrivalOnMonday`                        | share 2 seven days later                                                                                                                        | S03-7            |             |
| Release: non-Monday skip     | `test_R5_skipThreeDaysReleasesNothing`           | from Tue, +3 days → no change; `nextReleaseDay` same                                                                                            | S03-19           | D5          |
| Release: after share 4       | `test_R5_nothingAfterFourthShare`                | weeks 5–8 add nothing; `nextReleaseDay` = 0                                                                                                     | S03-19           | D1, D6      |
| Release: leftover            | `test_R5_leftoverInLastShare`                    | Everyday 14_964_450 → 3_741_112 ×3, 3_741_114                                                                                                   | S03-27           | D4          |
| Release: carry over          | `test_R6_unspentMoneyCarriesOver`                | week 2 available = share 1 + share 2                                                                                                            | S03-18           | D2          |
| Release: Emergency           | `test_R7_emergencyShareArrivesWholeAndLocked`    | `locked` += part; Emergency available 0                                                                                                         | S03-26           | C1          |
| Release: overlap             | `test_R8_twoOverlappingAllowancesAddUp`          | table in S03-7                                                                                                                                  | S03-10           | C14         |
| Release: same-week merge     | `test_R8_sameWeekAllowancesMergeExactly`         | two deposits same week = sum of separate schedules, unit-exact; `scheduleCount` 1                                                               | S03-10           |             |
| Release: folding             | `test_R8_finishedSchedulesFoldOnDeposit`         | views equal before and after fold; `scheduleCount <= 3`                                                                                         | S03-10           |             |
| Card: match                  | `test_R9_matchingEnvelopePays`                   | each table code pays from its envelope                                                                                                          | S03-28           | E1, E2      |
| Card: table                  | `test_R9_defaultShopTable`                       | `shopEnvelope` for every code in 01 §3, 5942 and 7832 → Everyday, unknown → Everyday                                                            | S03-13           | E19         |
| Card: step-in                | `test_R10_everydayStepsInWhenMatchShort`         | Everyday pays, `everydayStepIn = true`                                                                                                          | S03-28           | E3          |
| Card: both short             | `test_R10_declineWhenBothShort`                  | `PurchaseDeclined(NotEnough)`; all balances unchanged                                                                                           | S03-28           | E5          |
| Card: never split            | `test_R10_neverSplitAcrossEnvelopes`             | Food 10 + Everyday 10, amount 14,39 → declined                                                                                                  | S03-28           |             |
| Card: Everyday short         | `test_R10_everydayShopNoStepInFromOthers`        | cinema with Everyday short declines; Food untouched                                                                                             | S03-28           | E6          |
| Card: exact                  | `test_R10_exactAmountApproved`                   | available → 0                                                                                                                                   | S03-28           | E9          |
| Card: last dollars           | `test_R10_secondPurchaseForLastDollarsDeclined`  | one approved, one declined, never below 0                                                                                                       | S03-28           | E14         |
| Card: before allowance       | `test_R10_purchaseBeforeAllowanceDeclined`       | `NotEnough`                                                                                                                                     | S03-28           | E11         |
| Card: Emergency              | `test_R11_emergencyNeverPays`                    | weekly 0, locked 100 → declined; locked unchanged                                                                                               | S03-28           | E10         |
| Card: gambling               | `test_R12_gamblingAlwaysDeclinedNoBalanceChange` | 7995 declined `Blocked` with money in every envelope; every view unchanged; id burned                                                           | S03-28           | E7, E8      |
| Card: only service           | `test_R3_onlyCardServiceCanAuthorize`            | others revert `NotCardService`                                                                                                                  | S03-21           |             |
| Card: id reuse               | `test_R3_purchaseIdCannotBeReused`               | reuse of approved and of declined id reverts `PurchaseIdUsed`; `purchaseUsed` is true for both and false for an unused id                       | S03-28           | E13, E21    |
| Holds: collect less          | `test_R13_collectLessReturnsDifference`          | settlement +x; envelope +(held − x)                                                                                                             | S03-29           | E15         |
| Holds: collect more          | `test_R13_collectMoreThanHeldFails`              | `AmountAboveHeld`                                                                                                                               | S03-29           |             |
| Holds: collect late          | `test_R13_collectAfterHoldPeriodFails`           | at `createdAt + 7d` → `HoldExpired`                                                                                                             | S03-29           |             |
| Holds: release by anyone     | `test_R13_releaseAfterSevenDaysByAnyone`         | stranger reverts `HoldNotExpired` at 7d − 1s, succeeds at 7d; same envelope credited                                                            | S03-30           | E16         |
| Holds: collect after release | `test_R13_collectAfterReleaseFails`              | `NotHeld`                                                                                                                                       | S03-29           | E17         |
| Holds: refund                | `test_R13_refundReturnsToPayingEnvelope`         | step-in purchase refunds to Everyday; partial refunds cap at collected                                                                          | S03-31           | E18         |
| Holds: only service          | `test_R3_onlyCardServiceCollectsAndRefunds`      | `NotCardService`                                                                                                                                | S03-21           |             |
| Move: from Everyday          | `test_R15_onlyFromEveryday`                      | Food-paid purchase → `NotFromEveryday`                                                                                                          | S03-32           | F6          |
| Move: once                   | `test_R15_onlyOnce`                              | second move → `AlreadyMoved`                                                                                                                    | S03-32           | F5          |
| Move: 7 days                 | `test_R15_onlyWithinSevenDays`                   | at `createdAt + 7d` → `MovePeriodOver`                                                                                                          | S03-32           | F7          |
| Move: target short           | `test_R15_failsIfTargetShort`                    | `TargetShort`                                                                                                                                   | S03-32           | F4          |
| Move: override               | `test_R15_overrideAppliesToNextPurchase`         | next 5942 purchase pays from Study                                                                                                              | S03-32           | F2, F3      |
| Move: held                   | `test_R15_heldPurchaseCanBeMoved`                | hold moves; release later credits target                                                                                                        | S03-32           | rule 5      |
| Move: declined               | `test_R15_declinedPurchaseCannotBeMoved`         | `PurchaseNotFound`                                                                                                                              | S03-32           | F8          |
| Move: step-in                | `test_R15_stepInPurchaseCanMoveToFood`           | E3 purchase moves to Food                                                                                                                       | S03-32           | F9          |
| Move: owner only             | `test_R1_onlyOwnerCanMove`                       | other account → `NotOwner`                                                                                                                      | S03-32           |             |
| Emergency: above locked      | `test_R16_requestAboveLockedFails`               | `AmountAboveLocked`; 0 → `AmountZero`; empty reason → `ReasonRequired`                                                                          | S03-33           | G6, G7      |
| Emergency: second            | `test_R16_secondRequestWhileOpenFails`           | `RequestAlreadyOpen`                                                                                                                            | S03-33           | G8          |
| Emergency: cancel            | `test_R16_cancelKeepsLockedBalance`              | locked unchanged; status Cancelled                                                                                                              | S03-36           | G9          |
| Emergency: approve           | `test_R17_approveOpensAtOnce`                    | G1 numbers                                                                                                                                      | S03-34           | G1          |
| Emergency: 48h               | `test_R17_opensByTimeAtExactly48Hours`           | 172_799 s reverts, 172_800 s opens                                                                                                              | S03-35           | G2, G13     |
| Emergency: cannot block      | `test_R17_opensByTimeEvenWithTrustedPerson`      | finalize works with trusted linked                                                                                                              | S03-35           |             |
| Emergency: already opened    | `test_R17_approveAfterOpenedFails`               | `NoOpenRequest`                                                                                                                                 | S03-34           | G10         |
| Emergency: only trusted      | `test_R17_onlyTrustedCanApprove`                 | `NotTrusted`                                                                                                                                    | S03-34           | G12         |
| Emergency: to Everyday       | `test_R18_openedMoneyToEverydayRestLocked`       | Everyday +70, locked 30; then spendable at once                                                                                                 | S03-35           | G3          |
| Emergency: second request    | `test_R16_secondRequestAfterDone`                | remaining 30 opens; locked 0                                                                                                                    | S03-33           | G4          |
| Emergency: no trusted        | `test_R19_noTrustedPersonWaits48Hours`           | opens by time only                                                                                                                              | S03-35           | G5          |
| Emergency: replaced trusted  | `test_R17_newTrustedCanApproveOldCannot`         | after replacement                                                                                                                               | S03-43           | G14         |
| Changes: later only          | `test_R21_newSplitOnlyForLaterAllowances`        | deposit at +47h uses old split; at +48h new; old money not re-divided                                                                           | S03-25           | H2, H3, C15 |
| Changes: immediate           | `test_R21_immediateBeforeFirstAllowance`         | `immediate = true`; split in force                                                                                                              | S03-25           | H1          |
| Changes: replace             | `test_R21_secondSaveReplacesAndRestarts`         | readyAt from the second save                                                                                                                    | S03-25           | H4          |
| Changes: lock-off            | `test_R20_lockOffAfter48HoursMovesBalance`       | 47h59m59s reverts; at 48h Everyday += locked; locked 0                                                                                          | S03-39           | G16         |
| Changes: unlocked shares     | `test_R20_laterEmergencySharesArriveUnlocked`    | next deposit's Emergency part → Everyday available                                                                                              | S03-26           | C16         |
| Changes: lock-off guards     | `test_R20_lockOffAndRequestBlockEachOther`       | `RequestAlreadyOpen`, `LockOffPending`; after lock-off, `startLockOff` reverts `LockAlreadyOff` and nothing turns the lock back on              | S03-38, S03-39   |             |
| Cancel split                 | `test_R24_cancelPendingSplit`                    | old split stays                                                                                                                                 | S03-46           | H5          |
| Cancel removal               | `test_R24_cancelTrustedRemoval`                  | trusted stays linked                                                                                                                            | S03-46           | B11         |
| Cancel lock-off              | `test_R24_cancelLockOff`                         | stays locked                                                                                                                                    | S03-46           | G17         |
| Cancel recovery              | `test_R24_cancelRecovery`                        | old owner keeps account                                                                                                                         | S03-46           | I3          |
| Cancel too late              | `test_R24_cancelAfterWaitFails`                  | `WaitOver`; due split → `NothingPending`                                                                                                        | S03-46           |             |
| Invite: once                 | `test_R22_inviteWorksOnce`                       | second accept → `InviteUsed`                                                                                                                    | S03-41           | B3          |
| Invite: expiry               | `test_R22_inviteExpiresAfterSevenDays`           | at 7d − 1s works (fresh invite), at 7d `InviteExpired`                                                                                          | S03-41           | B4          |
| Invite: other address        | `test_R22_signatureForAnotherAddressFails`       | `BadSignature`                                                                                                                                  | S03-41           |             |
| Invite: replaced             | `test_R22_newInviteReplacesOld`                  | old key → `BadSignature`; new works                                                                                                             | S03-40           | B7          |
| Invite: own                  | `test_R22_ownerCannotAcceptOwnInvite`            | `CannotTrustSelf`                                                                                                                               | S03-41           | B5          |
| Invite: already trusted      | `test_R22_trustedOfAnotherCannotAccept`          | `AlreadyTrusted`                                                                                                                                | S03-41           | B8          |
| Invite: linked               | `test_R22_cannotLinkWhileTrustedLinked`          | `TrustedAlreadyLinked`                                                                                                                          | S03-41           |             |
| Invite: replace flow         | `test_R22_replaceTrustedAfter48Hours`            | remove, wait, finish, new accept; old has no role                                                                                               | S03-42, 43       | B10, J6     |
| One trusted                  | `test_R2_atMostOneTrustedPerson`                 | S03-22 rules                                                                                                                                    | S03-22           |             |
| Recovery: only trusted       | `test_R23_onlyTrustedCanApprove`                 | `NotTrusted`                                                                                                                                    | S03-44           | I6          |
| Recovery: cancel             | `test_R23_oldOwnerCanCancel`                     | pending cleared                                                                                                                                 | S03-46           | I3          |
| Recovery: swap               | `test_R23_newOwnerControlsAfter48Hours`          | new owner acts; old reverts `NoAccount`; balances, holds, open request unchanged                                                                | S03-45           | I1, I4      |
| Recovery: never approved     | `test_R23_nothingHappensWithoutApproval`         | skip 30 days; owner unchanged                                                                                                                   | S03-45           | I5          |
| Recovery: has account        | `test_R23_newOwnerWithAccountRejected`           | approve and finish revert `NewOwnerHasAccount`                                                                                                  | S03-44, 45       | I9          |
| Recovery: no trusted         | `test_R23_noTrustedPersonNoRecovery`             | nobody can approve                                                                                                                              | S03-44           | I8          |
| Recovery: second approval    | `test_R23_secondApprovalRestartsWait`            | readyAt moves; `recoveryAccountOf` of the first address is 0, of the second is the account                                                      | S03-44           |             |
| Recovery: lookup             | `test_R23_recoveryAccountOfTracksPending`        | set on approve; 0 after cancel and after finish; a second account approving the same new owner reverts `RecoveryTargetBusy`                     | S03-44 to S03-46 | I1, I3      |
| Recovery vs removal          | `test_R23_removalAndRecoveryBlockEachOther`      | `removeTrusted` during a pending recovery cancels it (SA-02); `approveRecovery` during a pending removal reverts `TrustedRemovalPending` | S03-42, S03-44   |             |
| Owner functions              | `test_R1_onlyOwnerActsAsStudent`                 | each owner function from a stranger reverts `NoAccount`                                                                                         | S03-21           |             |
| Demo: off                    | `test_DEMO_skipDaysRevertsWhenDemoOff`           | `DemoOff`                                                                                                                                       | S03-47           | K4          |
| Demo: per account            | `test_DEMO_skipAffectsOnlyCallersAccount`        | other account's clock, releases, waits unchanged                                                                                                | S03-6            | K3          |
| Demo: bounds                 | `test_DEMO_skipDaysBounds`                       | 0 and 15 revert `InvalidDays`; 14 works                                                                                                         | S03-47           |             |
| Events                       | `test_EVENTS_everyWriteEmitsExactlyOne`          | log count 1 per write                                                                                                                           | S03-48           |             |
| Constructor                  | `test_CTOR_zeroAddressesAndDecimals`             | `ZeroAddress`, `TokenDecimalsUnreadable`, immutables set                                                                                        | S03-3            |             |

### Invariants and fuzz

**S03-56 Invariant tests (PRD 7 "always true", PRD 15).** `foundry.toml` profile `ci`: `[invariant] runs = 1000, depth = 50, fail_on_revert = false`. A `Handler` drives bounded random calls from fixed actors: register, saveSplit, deposit, authorize (shop types drawn from every table code, 7995 and one unknown), collect, releaseHold, refund, movePurchase, the four Emergency calls, lock-off start and finish, createInvite and acceptInvite (handler holds invite keys), removeTrusted and finish, approveRecovery and finish, cancelPending, skipDays, and `vm.warp` forward by 0 to 9 days. Ghost variables track what each call did. Invariant functions, named after the PRD 7 numbers:

| Test                                            | Asserts                                                                                                                                                                |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `invariant_1_tokenBalanceEqualsAllMoney`        | `token.balanceOf(contract) == Σ_accounts Σ_e (available + unreleased + held + locked)`                                                                                 |
| `invariant_2_lockedLeavesOnlyByR17ToR20`        | every decrease of any `locked` happened in `approveEmergency`, `finalizeEmergency` (by the request amount) or `finishLockOff` (to 0)                                   |
| `invariant_3_purchaseLowersOneEnvelope`         | each approved `authorize` lowered available of exactly one envelope by `amount` and left the other four unchanged; `envelopes()` never reverts (no negative available) |
| `invariant_4_collectedOnlyToSettlement`         | the mock token logs every transfer out of the contract; every recipient is `settlement`; settlement's net gain = Σ collected − Σ refunded                              |
| `invariant_5_onlyAllowedCallersSucceed`         | ghost counter of successful calls by a caller not allowed by S03-21 stays 0                                                                                            |
| `invariant_6_everyWaitReadsAccountClock`        | every stored `readyAt`, `opensAt`, `expiresAt` equals the account clock at the start call plus its constant; finishing succeeded only when `clock(id) >= readyAt`      |
| `invariant_XR_scheduleCountAtMostThree`         | `scheduleCount <= 3` for every account (S03-10)                                                                                                                        |
| `invariant_XR_paymentAndPurchaseIdsNeverReused` | ghost set of ids used matches the contract flags                                                                                                                       |

Any extra invariant found by the `x-ray` skill in spec 04 is added as `invariant_XR_<name>`.

**S03-57 Fuzz tests.** Profile `ci`: `[fuzz] runs = 10000`. At least:

- `testFuzz_R4_partsSumToAmount(uint128 amount, uint8[5] seed)`: valid split from seed; parts sum exactly; Everyday ≥ floor share.
- `testFuzz_R5_sharesSumToPart(uint128 part)`: 3 × base + last == part; last − base < 4.
- `testFuzz_mondayMaths(uint64 t)`: `mondayNumber` changes exactly at Monday 00:00 UTC (compare with a reference using weekday = `(day + 4) % 7`, Monday = 1).
- `testFuzz_R10_choiceMatchesRule(...)`: random balances and amount; result matches a reference model of R10.
- `testFuzz_R8_mergeEqualsSeparate(uint128 a, uint128 b)`: merged record releases the same per share as two separate reference schedules.

### Security tests

**S03-58** (PRD 15 "Security tests", contract part):

| Test                                                 | Expected                                                                               |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `test_SEC_inviteSignatureForAnotherChainRejected`    | digest built with `chainId = 1` → `BadSignature`                                       |
| `test_SEC_inviteSignatureForAnotherContractRejected` | digest with another `verifyingContract` → `BadSignature`                               |
| `test_SEC_malleableSignatureRejected`                | high-`s` twin of a valid signature → `BadSignature`                                    |
| `test_SEC_skipDaysRevertsWithDemoOff`                | contract deployed with `demoMode = false`; every owner gets `DemoOff`                  |
| `test_SEC_reentrancyBlocked`                         | `ReentrantERC20` callbacks into `deposit`, `collect`, `refund` revert                  |
| `test_SEC_feeOnTransferTokenRejected`                | `deposit` reverts `TransferMismatch`                                                   |
| `test_SEC_collectOnlyToSettlement`                   | no call path sends tokens elsewhere (with invariant 4)                                 |
| `test_SEC_serverKeysCannotTouchLockedOrUnreleased`   | treasury and card service calling every function cannot lower `locked` or `unreleased` |
| `test_SEC_noEtherAccepted`                           | sending MON reverts                                                                    |

### Coverage

**S03-59** `forge coverage --report summary --report lcov --no-match-coverage "(test|script|mocks)"` shows at least **95% lines** and **90% branches** for `src/AmplopEnvelopes.sol`. CI fails below either floor (spec 02 runs it).

## Acceptance checklist

- [ ] `forge build` with 0.8.30, zero warnings; `forge fmt --check` and solhint clean.
- [ ] Every function, struct, event and enum matches 01 section 3.
- [ ] Every rule R1–R24 (contract side) and every PRD 14 contract-test row has a passing named test from S03-55.
- [ ] Eight invariant tests pass at 1,000 runs × depth 50; fuzz passes at 10,000 runs.
- [ ] Security tests in S03-58 pass.
- [ ] Coverage ≥ 95% lines and ≥ 90% branches.
- [ ] Decimals18 suite passes.
- [ ] `.gas-snapshot` committed; `GAS_FLOOR` and `TYPICAL_ACTION_GAS` recorded in `packages/shared` from the gas report; bytecode size printed by `forge build --sizes` is recorded in the PR.
- [ ] NatSpec on every external function, event and error.

## Skills to use

- MONSKILLS (pinned `3f8efd2`): start with `monskill`; then `concepts` (EVM compatibility, block time, finality, code-size limit), `gas` (fee charged on gas limit, cold-access costs), `tooling-and-infra` (Foundry against Monad, Anvil setup), `addresses` (AUSD for later; must be confirmed against Agora docs for testnet before use, see spec 04).
- Not used here: `wallet-integration`, `wallet`, `indexer`.

## Decisions made here

1. **Schedules merge by start Monday.** Records hold `base` sums and `part` sums, so merging is unit-exact and R8 holds. At most 3 records are live; the PRD's limit of 6 is never reached.
2. **Folding happens only in `deposit`.** Other writes and reads compute live releases from at most 3 records.
3. **Two monotonic counters per envelope** (`inAmt`, `outAmt`) plus `held`; available is computed on read.
4. **Unlocked Emergency parts go to Everyday whole and at once** (R20, C16), not in four shares.
5. **Emergency amount is not reserved.** Lock-off cannot start while a request is open, and a request cannot start while lock-off is pending.
6. **Recovery and trusted removal cannot run together.** `approveRecovery` reverts while a removal is pending, and `removeTrusted` cancels a pending recovery (audit change SA-02), so a removed person's approval never completes and a trusted person cannot block their removal.
7. **`acceptInvite` requires no linked trusted person.** In the replacement flow the app calls `finishRemoveTrusted` first (spec 10).
8. **Collect only within the hold period**; at `createdAt + 7d` only release is possible. Spec 09's collect timer must run before then.
9. **Refunds may be partial and repeated** up to the collected amount; state becomes `Refunded` on the first one. `refund` has no time limit.
10. **Move amount** is the held amount for a held purchase and `collected − refunded` for a collected one; a released purchase cannot move.
11. **Declined purchase ids are burned** (`purchaseIdUsed`) but not stored as purchases.
12. **Cancelling after the wait** reverts `WaitOver`; a due split counts as in force (`NothingPending`).
13. **Views never revert** on unknown ids; they return zeros.
14. **`decimals()` is read in the constructor and exposed** as `tokenDecimals()`; no contract formula needs it.
15. **Reason fingerprint is required** (`reasonHash != 0`), matching PRD 14 rule 6.
16. **`skipDays` checks `demoMode` before anything else**, so it reverts for every caller on a demo-off deployment.
17. **Balance-delta check** on `deposit` and `refund` to keep invariant 1 exact with any token.
18. **One pending recovery per new owner.** `recoveryAccountOf` lets the new phone find its account (spec 13). `approveRecovery` reverts `RecoveryTargetBusy` when another account already waits to move to the same address, so the lookup is never ambiguous.

## Additions to 01 (status)

1. `skipDays(uint16 numDays)` and `DaysSkipped(..., uint16 numDays, ...)`: Merged into 01 (section 3).
2. Public getters: Merged into 01 (section 3).
3. Schedule read `schedules` and `ScheduleView`: Merged into 01 (section 3).
4. `PurchaseInfo.collected` and `refunded`: Merged into 01 (section 3).
5. `purchaseUsed(bytes32)`: Merged into 01 (sections 3 and 9).
6. Packed split format for `pending(…, Split).data`: Merged into 01 (section 3).
7. `nextReleaseDay` is an account-clock day number, 0 when none is due: Merged into 01 (section 3).
8. `authorize` reverts on any reused `purchaseId`: Merged into 01 (section 9).
9. Reads return zero values for an unknown `accountId`: Merged into 01 (section 3).
10. `recoveryAccountOf(address)` and the `RecoveryTargetBusy` rule: Merged into 01 (sections 3 and 9).
11. `GAS_FLOOR` and `TYPICAL_ACTION_GAS` recorded from the gas report: Merged into 01 (section 9).
