# Entry Point Map

> AmplopEnvelopes | 22 entry points | 5 permissionless | 17 role-gated | 0 admin-only

---

## Protocol Flow Paths

### Setup (Student)

`register()` → `saveSplit()` (immediate before first deposit) → `createInvite()` → `acceptInvite()` (trusted person)

### Money In (Treasury)

`[register above]` → `deposit()` ◄── treasury approval; split promoted if its wait is over
├─→ released over four Mondays (computed on read) ◄── time
└─→ Emergency part to `locked` (or Everyday once lock is off)

### Card (Card service)

`[deposit above]` → `authorize()` ◄── envelope available ≥ amount (or Everyday steps in)
├─→ `collect()` ◄── within 7 account-clock days → `refund()`
├─→ `releaseHold()` ◄── card service any time, anyone after 7 days
└─→ `movePurchase()` (student) ◄── Everyday, not moved, within 7 days

### Emergency (Student / Trusted / Anyone)

`[deposit above]` → `requestEmergency()` ◄── locked > 0, no lock-off pending
├─→ `approveEmergency()` (trusted)
├─→ `finalizeEmergency()` ◄── 48 h on account clock
└─→ `cancelEmergency()`
`startLockOff()` ◄── no open request → `finishLockOff()` ◄── 48 h

### Trusted person and recovery

`[acceptInvite above]` → `removeTrusted()` → `finishRemoveTrusted()` ◄── 48 h, no recovery pending
`[acceptInvite above]` → `approveRecovery()` → `finishRecovery()` ◄── 48 h, target still has no account
Any pending change → `cancelPending()` (student) ◄── before readyAt

---

## Permissionless

### `AmplopEnvelopes.register()`

| Aspect           | Detail                                                          |
| ---------------- | --------------------------------------------------------------- |
| Visibility       | external                                                        |
| Caller           | Any address without an account                                  |
| Parameters       | split (user-controlled)                                         |
| Call chain       | `→ _checkSplit()`                                               |
| State modified   | `accountCount`, `accountOf`, `_accounts[id].owner/split/lockOn` |
| Value flow       | None                                                            |
| Reentrancy guard | no                                                              |

### `AmplopEnvelopes.releaseHold()`

| Aspect           | Detail                                                                |
| ---------------- | --------------------------------------------------------------------- |
| Visibility       | external                                                              |
| Caller           | Card service any time; anyone once `clock >= createdAt + HOLD_PERIOD` |
| Parameters       | purchaseId (user-controlled)                                          |
| Call chain       | `→ _clock()`                                                          |
| State modified   | `held[env]`, `inAmt[env]`, purchase `held/state`                      |
| Value flow       | None (internal: hold → envelope)                                      |
| Reentrancy guard | no                                                                    |

### `AmplopEnvelopes.finalizeEmergency()`

| Aspect           | Detail                                   |
| ---------------- | ---------------------------------------- |
| Visibility       | external                                 |
| Caller           | Anyone, after `em.opensAt`               |
| Parameters       | accountId (user-controlled)              |
| Call chain       | `→ _openEmergency()`                     |
| State modified   | `locked`, `inAmt[Everyday]`, `em.status` |
| Value flow       | None (internal: locked → Everyday)       |
| Reentrancy guard | no                                       |

### `AmplopEnvelopes.finishLockOff()` / `finishRemoveTrusted()` / `finishRecovery()`

| Aspect           | Detail                                                                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Visibility       | external                                                                                                                                    |
| Caller           | Anyone, after the pending change's `readyAt`                                                                                                |
| Parameters       | accountId (user-controlled)                                                                                                                 |
| Call chain       | `→ _finishPending()`                                                                                                                        |
| State modified   | LockOff: `locked`, `inAmt[Everyday]`, `lockOn`. Removal: `trusted`, `trustedAccountOf`. Recovery: `owner`, `accountOf`, `recoveryAccountOf` |
| Value flow       | None                                                                                                                                        |
| Reentrancy guard | no                                                                                                                                          |

`acceptInvite()` has no modifier but is gated by the invite key's signature over the caller — listed under role-gated.

---

## Role-Gated

### Treasury (`msg.sender == treasury`)

| Function    | Parameters                                     | State Modified                                                                          | Value flow          | nonReentrant |
| ----------- | ---------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------- | ------------ |
| `deposit()` | accountId, amount, paymentId (keeper-provided) | `paymentUsed`, `everDeposited`, `locked` / `inAmt[3]`, schedules, split promotion, fold | treasury → contract | yes          |

### Card service (`_onlyCardService`)

| Function      | Parameters                                                | State Modified                                   | Value flow            | nonReentrant          |
| ------------- | --------------------------------------------------------- | ------------------------------------------------ | --------------------- | --------------------- |
| `authorize()` | accountId, purchaseId, shopType, amount (keeper-provided) | `purchaseUsed`, `outAmt`, `held`, `_purchases`   | None                  | no (no external call) |
| `collect()`   | purchaseId, amount                                        | `held`, `inAmt`, purchase `held/collected/state` | contract → settlement | yes                   |
| `refund()`    | purchaseId, amount                                        | purchase `refunded/state`, `inAmt[env]`          | settlement → contract | yes                   |

### Student (`_caller()` → `accountOf[msg.sender]`)

| Function             | Parameters         | State Modified                                                           |
| -------------------- | ------------------ | ------------------------------------------------------------------------ |
| `saveSplit()`        | split              | `split` or `pendings[Split]`                                             |
| `createInvite()`     | inviteKey          | `invite`                                                                 |
| `removeTrusted()`    | —                  | `pendings[TrustedRemoval]`                                               |
| `movePurchase()`     | purchaseId, to     | `held`, `outAmt[t]`, `inAmt[3]`, purchase `envelope/moved`, `overrideOf` |
| `requestEmergency()` | amount, reasonHash | `requestSeq`, `em`                                                       |
| `cancelEmergency()`  | —                  | `em.status`                                                              |
| `startLockOff()`     | —                  | `pendings[LockOff]`                                                      |
| `cancelPending()`    | kind               | `pendings[kind]`, `recoveryAccountOf`                                    |
| `skipDays()`         | numDays (1–14)     | `skipSeconds` (demo mode only)                                           |

### Trusted person (`_onlyTrusted`)

| Function             | Parameters          | State Modified                            |
| -------------------- | ------------------- | ----------------------------------------- |
| `approveEmergency()` | accountId           | `locked`, `inAmt[3]`, `em.status`         |
| `approveRecovery()`  | accountId, newOwner | `pendings[Recovery]`, `recoveryAccountOf` |

### Invite-key holder (signature-gated)

| Function         | Parameters                         | State Modified                               |
| ---------------- | ---------------------------------- | -------------------------------------------- |
| `acceptInvite()` | accountId, signature (user-signed) | `invite.used`, `trusted`, `trustedAccountOf` |

---

## Admin-Only

None. Constructor sets immutable roles and the default shop-type table.
