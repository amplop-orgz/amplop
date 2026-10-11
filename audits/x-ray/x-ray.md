# X-Ray Report

> AmplopEnvelopes | 831 nSLOC | 99a172c (`main`) | Foundry | 11/10/26

Generated with the pinned pashov `x-ray` skill (commit 92b0ea6). Scope: `contracts/src/AmplopEnvelopes.sol` only. Note: the skill's `enumerate.sh` uses `grep -P`, which macOS BSD grep lacks, so nSLOC and test counts were recomputed with POSIX `grep -E`.

---

## 1. Protocol Overview

**What it does:** One contract holds every student's AUSD and enforces the allowance-envelope rules R1–R24 (split into five envelopes, weekly release, card holds, a locked Emergency envelope, trusted-person approvals).

- **Users**: students (account owners), their trusted person (parent/guardian), and two server keys (treasury, card service).
- **Core flow**: treasury `deposit` → split into envelopes released over four Mondays → card service `authorize` holds from one envelope → `collect` to settlement or `releaseHold`.
- **Key mechanism**: balances computed on read from monotonic counters (`inAmt`, `outAmt`, `held`, `locked`) and ≤3 live schedule records; one per-account clock (`block.timestamp + skipSeconds`) for every wait.
- **Token model**: one ERC-20 (AUSD, 6 decimals expected, read at deploy). No protocol token.
- **Admin model**: none. No owner, pause or upgrade; treasury, card service, settlement and `demoMode` are immutable.

For a visual overview, see the [architecture diagram](architecture.svg).

### Contracts in Scope

| Subsystem | Key Contracts   | nSLOC | Role                                                                                     |
| --------- | --------------- | ----: | ---------------------------------------------------------------------------------------- |
| Envelopes | AmplopEnvelopes |   831 | Custody, split/release schedule, card holds, Emergency lock, trusted person and recovery |

### How It Fits Together

The core trick: no weekly transaction — released money is `k * base` per schedule record computed from the account clock at read time.

### Deposit

```
Treasury → AmplopEnvelopes.deposit()
  ├─ _promoteSplit()            *pending split applied if its 48 h wait is over*
  ├─ _fold(monday)              *records with 4 shares out move into inAmt*
  ├─ parts = amount * split / 100, remainder → Everyday
  ├─ Emergency part → locked (or Everyday if lock off)
  ├─ _scheduleFor(monday).base += part/4, part += part
  └─ AUSD.safeTransferFrom(treasury) + _checkReceived()   *exact-amount check*
```

### Card purchase

```
CardService → authorize()       *decline is an event, never a revert*
  ├─ _resolve(shopType)         *blocked > override > default > Everyday*
  ├─ available(env) < amount ? Everyday steps in : decline
  └─ outAmt[pay] += amount; held[pay] += amount
CardService → collect()         *within 7 account-clock days*
  ├─ held -= h; inAmt += h - amount
  └─ AUSD.safeTransfer(settlement, amount)
Anyone (after 7 d) / CardService → releaseHold()  *held → inAmt*
CardService → refund()          *pull from settlement into the paying envelope*
```

### Emergency and recovery

```
Student → requestEmergency(amount ≤ locked)
  ├─ Trusted → approveEmergency()          *instant*
  └─ Anyone → finalizeEmergency()          *after 48 h*  → locked -= amount; Everyday += amount
Trusted → approveRecovery(newOwner) → Anyone → finishRecovery()  *after 48 h unless student cancels*
```

---

## 2. Threat & Trust Model

Kept in its own file for spec 04 S04-20: **[threat-model.md](threat-model.md)** (profile, actors, adversary ranking, trust boundaries, key attack surfaces, temporal and dependency risks). Entry points: [entry-points.md](entry-points.md).

---

## 3. Invariants

> ### Full invariant map: **[invariants.md](invariants.md)**
>
> - **30 Enforced Guards** (`G-1` … `G-30`) — per-call preconditions with `Check` / `Location` / `Purpose`
> - **21 Single-Contract Invariants** (`I-1` … `I-21`; I-16…I-21 are the six PRD 7 rules) — Conservation, Bound, Ratio, StateMachine, Temporal
> - **0 Cross-Contract Invariants** — single contract; the token is out of scope
> - **1 Economic Invariant** (`E-1`) — per-account solvency
>
> **On-chain=No: [I-11](invariants.md#i-11)** — a pending recovery's target can `register` during the wait, after which the recovery can be neither finished nor cancelled by the student. Its test `invariant_XR_recoveryTargetStaysFree` fails (shrunk to 2 calls).

---

## 4. Documentation Quality

| Aspect          | Status           | Notes                                                     |
| --------------- | ---------------- | --------------------------------------------------------- |
| README          | Present          | `README.md`, `audits/README.md`                           |
| NatSpec         | ~293 annotations | Every public function, event, error and struct            |
| Spec/Whitepaper | Present          | `specs/PRD.md` §4 (R1–R24) and §7, `specs/03-contract.md` |
| Inline Comments | Adequate         | Rule ids (R-n, S03-n) at each enforcement point           |

---

## 5. Test Analysis

| Metric                                  | Value                            | Source                        |
| --------------------------------------- | -------------------------------- | ----------------------------- |
| Test files                              | 17 (.sol under `contracts/test`) | File scan                     |
| Test functions                          | 126 `test*` + 18 `invariant_*`   | File scan                     |
| Line coverage (`AmplopEnvelopes.sol`)   | 99.31% (432/435)                 | `forge coverage --ir-minimum` |
| Branch coverage (`AmplopEnvelopes.sol`) | 97.96% (96/98)                   | `forge coverage --ir-minimum` |

### Test Depth

| Category                | Count         | Contracts Covered                                     |
| ----------------------- | ------------- | ----------------------------------------------------- |
| Unit                    | ~120          | AmplopEnvelopes (rules/, Security, FreshEyes, Deploy) |
| Stateless Fuzz          | 5             | `rules/FuzzMaths.t.sol` and fuzzed rule tests         |
| Stateful Fuzz (Foundry) | 18 invariants | `test/invariant/` (6 PRD + 12 XR)                     |
| Formal Verification     | 0             | none                                                  |

### Gaps

- No formal verification (Halmos / Certora) of the release math (I-14) or the conservation law (I-1).
- No fork test against the real AUSD on Monad (pause / blacklist behaviour unknown).

---

## 6. Developer & Git History

> Repo shape: squashed_import — all 1,251 source lines arrived in one commit (2e0b54a); no evolution to analyse. Analyzed branch: `main` at `99a172c`.

| Author | Commits | Source Lines (+/-) | % of Source Changes |
| ------ | ------: | ------------------ | ------------------: |
| chidx  |       5 | +1251 / -0         |                100% |

| Signal                       | Value                   | Assessment                                                         |
| ---------------------------- | ----------------------- | ------------------------------------------------------------------ |
| Unique contributors          | 1                       | Single-dev                                                         |
| Merge commits                | 0 of 5                  | No merge commits — no visible peer review                          |
| Repo age                     | 2026-10-11 → 2026-10-11 | Same day                                                           |
| Recent source activity (30d) | 1 commit                | Entire source is new                                               |
| Test co-change rate          | 100%                    | The source commit also added tests (co-modification, not coverage) |

### Security Observations

- **Single developer, one commit** — no review signal in history (2e0b54a).
- **No tech-debt markers** — 0 TODO/FIXME/HACK in scope.
- **No forked dependencies** — OpenZeppelin via `lib/` submodule.

### Cross-Reference Synthesis

- **Squashed history + no admin path** → review weight falls on the code and the invariant suite, not on change history.
- **I-11 On-chain=No ↔ recovery attack surface** → the one unguarded write site (`register`:535) is the first place to look.

---

## X-Ray Verdict

**ADEQUATE** — unit, fuzz and invariant tests plus NatSpec and a spec exist, but roles are single immutable keys with no timelock or multisig on the server side.

**Structural facts:**

1. 831 nSLOC in one contract; no proxy, owner, pause or upgrade path.
2. 4 immutable privileged addresses (token, settlement, treasury, card service) plus immutable `demoMode`.
3. 126 test functions and 18 Foundry invariants; 99.31% line / 97.96% branch coverage on the in-scope file.
4. All source authored by one developer in one commit.
