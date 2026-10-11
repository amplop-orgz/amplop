# 🔐 Security Review — amplop

---

## Scope

|                                  |                                                |
| -------------------------------- | ---------------------------------------------- |
| **Mode**                         | filename                                       |
| **Files reviewed**               | `contracts/src/AmplopEnvelopes.sol`            |
| **Confidence threshold (1-100)** | 75                                             |
| **Passes**                       | 3 (pass 3 ran 10/12 agents)                    |
| **Memory**                       | 0 records before this scan · 24 after · `none` |

---

## Findings

[75] **1. The trusted approval opens whatever request is open when it lands**

`AmplopEnvelopes.approveEmergency` · Confidence: 75 · seen in 2/3 runs · NEW

**Description**
The student cancels a small request and opens a larger one before the trusted approval lands, so the approval opens the larger amount at once.

**Fix**

```diff
- function approveEmergency(uint256 accountId) external {
+ function approveEmergency(uint256 accountId, uint64 requestSeq) external {
      Account storage acc = _account(accountId);
      _onlyTrusted(acc);
      if (acc.em.status != EmergencyStatus.Open) revert NoOpenRequest();
+     if (acc.em.requestSeq != requestSeq) revert NoOpenRequest();
```

---

[75] **2. approveRecovery has no limit, so the trusted person repeats it after each cancel**

`AmplopEnvelopes.approveRecovery` · Confidence: 75 · seen in 2/3 runs · NEW

**Description**
The trusted person calls `approveRecovery` between the student's `cancelPending` and `removeTrusted` transactions, so the removal always reverts `RecoveryPending`.

**Fix**

```diff
- if (acc.pendings[uint8(PendingKind.Recovery)].active) revert RecoveryPending();
+ // removeTrusted cancels any pending recovery instead of a revert
```

---

[75] **3. Any trusted person claims the recovery address of another account**

`AmplopEnvelopes.approveRecovery` · Confidence: 75 · seen in 3/3 runs · NEW

**Description**
An attacker who is trusted on a second account calls `approveRecovery` for the victim's new address first, so the victim's recovery reverts `RecoveryTargetBusy` or, after the wait, `NewOwnerHasAccount`.

**Fix (Option A — restrict)**:

```diff
- if (busy != 0 && busy != accountId) revert RecoveryTargetBusy();
+ // newOwner must sign an EIP-712 AcceptRecovery(accountId, newOwner) before the recovery starts
```

**Fix (Option B — validate)**:

```diff
  function finishRecovery(uint256 accountId) external {
+     if (msg.sender != address(uint160(uint256(acc.pendings[uint8(PendingKind.Recovery)].data)))) revert NotOwner();
```

---

[75] **4. The student cannot cancel a recovery that can never finish**

`AmplopEnvelopes.cancelPending` · Confidence: 75 · seen in 3/3 runs · NEW

**Description**
`cancelPending` reverts `WaitOver` for a recovery whose new owner registered, so the recovery stays active and blocks `removeTrusted` until the trusted person acts.

**Fix**

```diff
- if (now_ >= p.readyAt) revert WaitOver();
+ if (now_ >= p.readyAt && kind != PendingKind.Recovery) revert WaitOver();
```

---

[75] **5. finishRecovery gives an account to an address that did not ask for it**

`AmplopEnvelopes.finishRecovery` · Confidence: 75 · seen in 3/3 runs · NEW

**Description**
An attacker who controls an account and its trusted person moves that account to any fresh address, so that address cannot register and the attacker stays its trusted person.

**Fix**

```diff
  function finishRecovery(uint256 accountId) external {
      Account storage acc = _account(accountId);
      address newOwner = address(uint160(uint256(acc.pendings[uint8(PendingKind.Recovery)].data)));
+     if (msg.sender != newOwner) revert NotOwner();
```

---

[75] **6. A recovery to an address that registers stays pending for ever**

`AmplopEnvelopes.finishRecovery` · Confidence: 75 · seen in 3/3 runs · NEW

**Description**
When the new owner registers during the wait, `finishRecovery` reverts and `cancelPending` reverts `WaitOver`, so the student can never call `removeTrusted`.

**Fix (Option A — allow-and-handle)**:

```diff
- if (accountOf[newOwner] != 0) revert NewOwnerHasAccount();
+ if (accountOf[newOwner] != 0) { recoveryAccountOf[newOwner] = 0; return; } // pending already deleted
```

**Fix (Option B — ban-path)**:

```diff
- if (acc.pendings[uint8(PendingKind.Recovery)].active) revert RecoveryPending();
+ Pending storage r = acc.pendings[uint8(PendingKind.Recovery)];
+ if (r.active) { recoveryAccountOf[address(uint160(uint256(r.data)))] = 0; delete acc.pendings[uint8(PendingKind.Recovery)]; }
```

---

[75] **7. Any caller releases a hold on a clock that the student moves**

`AmplopEnvelopes.releaseHold` · Confidence: 75 · seen in 3/3 runs · NEW

**Description**
`releaseHold` checks `HOLD_PERIOD` on the account clock, so after the student calls `skipDays`, any caller releases the hold and settlement never collects it.

**Fix**

```diff
- if (msg.sender != cardService && _clock(acc) < p.createdAt + HOLD_PERIOD) revert HoldNotExpired();
+ if (msg.sender != cardService && block.timestamp < p.createdAtReal + HOLD_PERIOD) revert HoldNotExpired();
```

---

[75] **8. A trusted person re-approves a recovery to block their own removal**

`AmplopEnvelopes.removeTrusted` · Confidence: 75 · seen in 3/3 runs · NEW

**Description**
`removeTrusted` reverts while a recovery is pending, so a trusted person who calls `approveRecovery` after each cancel stays linked and the student must cancel every 48 hours.

**Fix**

```diff
- if (acc.pendings[uint8(PendingKind.Recovery)].active) revert RecoveryPending();
+ Pending storage r = acc.pendings[uint8(PendingKind.Recovery)];
+ if (r.active) { recoveryAccountOf[address(uint160(uint256(r.data)))] = 0; delete acc.pendings[uint8(PendingKind.Recovery)]; }
```

---

[75] **9. A student moves the clock that ends a card hold**

`AmplopEnvelopes.skipDays` · Confidence: 75 · seen in 3/3 runs · NEW

**Description**
On a demoMode deployment, the student calls `skipDays(7)` after a purchase, so `collect` reverts `HoldExpired` and `releaseHold` gives the held tokens back.

**Fix (Option A — validate)**:

```diff
- if (_clock(acc) >= p.createdAt + HOLD_PERIOD) revert HoldExpired();
+ if (block.timestamp >= p.createdAtReal + HOLD_PERIOD) revert HoldExpired(); // createdAt stored from block.timestamp
```

**Fix (Option B — restrict)**:

```diff
  function skipDays(uint16 numDays) external {
      if (!demoMode) revert DemoOff();
      (uint256 id, Account storage acc) = _caller();
+     if (acc.held[0] + acc.held[1] + acc.held[2] + acc.held[3] != 0) revert HoldPending();
```

---

[55] **10. finishRecovery keeps the invite that the old key created**

`AmplopEnvelopes.finishRecovery` · Confidence: 55 · seen in 2/3 runs · NEW

**Description**
A thief with the old key creates an invite before the recovery, so the thief links as trusted person after the new owner removes the old one.

---

Findings List

| #   | Confidence | Title                                                                            |
| --- | ---------- | -------------------------------------------------------------------------------- |
| 1   | [75]       | The trusted approval opens whatever request is open when it lands                |
| 2   | [75]       | approveRecovery has no limit, so the trusted person repeats it after each cancel |
| 3   | [75]       | Any trusted person claims the recovery address of another account                |
| 4   | [75]       | The student cannot cancel a recovery that can never finish                       |
| 5   | [75]       | finishRecovery gives an account to an address that did not ask for it            |
| 6   | [75]       | A recovery to an address that registers stays pending for ever                   |
| 7   | [75]       | Any caller releases a hold on a clock that the student moves                     |
| 8   | [75]       | A trusted person re-approves a recovery to block their own removal               |
| 9   | [75]       | A student moves the clock that ends a card hold                                  |
|     |            | **Below Confidence Threshold**                                                   |
| 10  | [55]       | finishRecovery keeps the invite that the old key created                         |

---

## Leads

_Vulnerability trails with concrete code smells where the full exploit path could not be completed in one analysis pass. These are not false positives — they are high-signal leads for manual review. Not scored._

- **acceptInvite accepts an old signature for a key used again** — `AmplopEnvelopes.acceptInvite` · seen in 2/3 runs · NEW — Code smells: the digest holds only `accountId` and `trusted` — If the student uses an invite key a second time, the removed trusted person can link again. We did not check whether the frontend ever does this.
- **A student links a second own address as trusted person** — `AmplopEnvelopes.acceptInvite` · seen in 1/3 runs · NEW — Code smells: `acceptInvite` rejects only `msg.sender == acc.owner` — The student approves their own Emergency requests with no wait. We did not confirm that the PRD requires a different person.
- **A pending removal stops the trusted person from approving a recovery** — `AmplopEnvelopes.approveRecovery` · seen in 1/3 runs · NEW — Code smells: `approveRecovery` reverts `TrustedRemovalPending`, but the NatSpec says the trusted person keeps every power — A thief with the owner key calls `removeTrusted` first, so the trusted person cannot recover the account. We did not check if R23 must cover theft.
- **The trusted person can name a second own address as new owner** — `AmplopEnvelopes.approveRecovery` · seen in 2/3 runs · NEW — Code smells: `newOwner == acc.trusted` compares one address only — The trusted person gets the account unless the student cancels within 48 hours. We did not confirm that R23 forbids this.
- **A thief with the owner key cancels every recovery** — `AmplopEnvelopes.cancelPending` · seen in 2/3 runs · NEW — Code smells: the owner can cancel a recovery at any time before `readyAt` — Recovery protects against a lost key and not a stolen one. We did not check whether R23 must cover theft.
- **A late collect fails after any caller releases the hold** — `AmplopEnvelopes.collect` · seen in 3/3 runs · NEW — Code smells: fixed 7-day `HOLD_PERIOD`, open `releaseHold`, no path after release — Any caller can release a hold at day 7, so a late `collect` fails. We did not prove that real card clearing comes later than 7 days.
- **A token freeze stops every collect and keeps the student tokens** — `AmplopEnvelopes.collect` · seen in 3/3 runs · NEW — Code smells: no withdraw path, tokens leave only through `collect` to `settlement` — The token issuer can freeze `settlement` or the contract, and then no function moves the student tokens. We did not check the AUSD freeze rules.
- **An invite key used again makes an old signature valid again** — `AmplopEnvelopes.createInvite` · seen in 2/3 runs · NEW — Code smells: `AcceptInvite` holds no nonce and no invite key — A removed trusted person links again with an old signature if the student uses the same invite key again. We did not check the frontend key rule.
- **The weekly remainder arrives only in week 4** — `AmplopEnvelopes.deposit` · seen in 3/3 runs · NEW — Code smells: `base = parts / 4` rounds down — The contract releases up to 3 remainder units only in week 4. No caller gains tokens, and we did not check R5 for a different rule.
- **Pending changes from the old key stay after recovery** — `AmplopEnvelopes.finishRecovery` · seen in 1/3 runs · NEW — Code smells: `finishRecovery` clears only the Recovery pending — A lock-off that the old key started stays after recovery, and the new owner cannot cancel it after its wait. We did not find a way for the thief to spend the tokens.
- **movePurchase points any shop type at any weekly envelope** — `AmplopEnvelopes.movePurchase` · seen in 1/3 runs · NEW — Code smells: the code does not compare the target with the shop type, and it writes `overrideOf[shopType]` — The student moves an Everyday purchase to Food, so Food tokens become Everyday tokens and later purchases at that shop pay from Food. Spec S03-13 and R15 may allow this.
- **removeTrusted lets a key holder block recovery for 48 hours** — `AmplopEnvelopes.removeTrusted` · seen in 2/3 runs · NEW — Code smells: removal and recovery block each other, and any caller finishes the removal — A holder of the owner key starts a removal, so the trusted person cannot approve a recovery. The PRD may accept this.
- **Two skips release a whole allowance in demo mode** — `AmplopEnvelopes.skipDays` · seen in 1/3 runs · NEW — Code smells: `_live` takes the Monday number from `_clock(acc)` — In demo mode, the student calls `skipDays(14)` twice and gets all four weekly shares at once. We did not confirm that a demo deployment holds real AUSD.
- **The owner key skips every 48-hour wait in demo mode** — `AmplopEnvelopes.skipDays` · seen in 2/3 runs · NEW — Code smells: every WAIT reads `_clock(acc)`, and `skipDays` has no limit for each account — On a demoMode deployment, the owner key holder removes the trusted person or ends the lock in one block. The spec lists "skip 48 hours" as a demo feature.

---

> ⚠️ This review was performed by an AI assistant. AI analysis can never verify the complete absence of vulnerabilities and no guarantee of security is given. Team security reviews, bug bounty programs, and on-chain monitoring are strongly recommended. For a consultation regarding your projects' security, visit [https://www.pashov.com](https://www.pashov.com)
