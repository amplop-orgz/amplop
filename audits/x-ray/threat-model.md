# Threat & Trust Model

> AmplopEnvelopes | 831 nSLOC | 99a172c (`main`) | Foundry | 11/10/26
> Section 2 of [x-ray.md](x-ray.md), kept as its own file for spec 04 S04-20. Invariant IDs link to [invariants.md](invariants.md).

## Protocol Threat Profile

> Protocol classified as: **Custodial payment escrow** (no standard profile matches) with **Yield Aggregator/Vault**-style internal accounting characteristics

One contract custodies every student's AUSD and tracks it with internal counters (no shares, no oracle, no AMM); the closest x-ray profile is a vault with internal accounting, plus Governance-style 48-hour pending changes.

## Actors & Adversary Model

| Actor                                   | Trust Level            | Capabilities                                                                                                      |
| --------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Treasury (`treasury`, immutable)        | Bounded (deposit only) | Pulls AUSD from itself into any account (`deposit`:792). Instant, no pause.                                       |
| Card service (`cardService`, immutable) | Trusted (server key)   | `authorize`, `collect` (to fixed `settlement`), `releaseHold` any time, `refund`. Instant, no pause, any account. |
| Settlement (`settlement`, immutable)    | Trusted                | Receives collections; must keep allowance for `refund` pulls. No call into the contract.                          |
| Student (account owner)                 | Bounded (own account)  | Split, invite, move purchase, Emergency request/cancel, lock-off, cancel pending, `skipDays` in demo mode.        |
| Trusted person                          | Bounded (one account)  | Instant `approveEmergency`; `approveRecovery` that moves ownership after 48 h unless the student cancels.         |
| Anyone                                  | Bounded                | `finish*` / `finalizeEmergency` after the wait; `releaseHold` after 7 account-clock days.                         |

No owner, admin, pause or upgrade path (NatSpec `AmplopEnvelopes.sol:117`). All role addresses and `demoMode` are immutable.

**Adversary Ranking**

1. **Compromised card-service key** — the only role that can move tokens out, across every account, with no delay.
2. **Malicious or careless trusted person** — holds recovery and Emergency-approval powers over one student's funds.
3. **Student gaming their own clock (demo deployments)** — `skipDays` advances the per-account clock that every wait and hold period reads.
4. **Token issuer (AUSD)** — pause, blacklist or upgrade of the token blocks every flow.
5. **Compromised treasury key** — limited to crediting accounts from its own balance.

See [entry-points.md](entry-points.md) for the full permissionless entry point map.

## Trust Boundaries

- **R3 server roles** — immutable, single EOAs, no timelock or pause; card service can collect any live hold to `settlement` instantly (`collect`:887).
- **Trusted person** — 48 h wait on recovery is the only protection, and only the student can cancel, only during the wait (`cancelPending`:666).
- **Account clock** — every wait reads `_clock`:1119; in demo mode the student moves it forward up to 14 days per call (`skipDays`:674).
- **Invite link** — EIP-712 signature by a one-time key over `(accountId, caller)` (`acceptInvite`:694); the key holder chooses who may link.

## Key Attack Surfaces

- **Card-service key compromise** &nbsp;&#91;[I-1](invariants.md#i-1), [I-2](invariants.md#i-2), [I-3](invariants.md#i-3)&#93; — `authorize`:841 + `collect`:887 move any account's spendable balance to `settlement` with no rate limit or pause; worth confirming operational controls around the key and settlement.

- **Recovery lifecycle and its interaction with `register`** &nbsp;&#91;[I-10](invariants.md#i-10), [I-11](invariants.md#i-11), [G-29](invariants.md#g-29)&#93; — `approveRecovery`:719 checks the target owns no account but `register`:535 does not consult `recoveryAccountOf`; worth tracing what states a pending Recovery can reach after its wait (`finishRecovery`:776, `cancelPending`:666, `removeTrusted`:583).

- **Trusted-person powers vs. student's cancel window** &nbsp;&#91;[I-9](invariants.md#i-9), [G-26](invariants.md#g-26)&#93; — recovery to any fresh address finishes permissionlessly after 48 h (`finishRecovery`:772) and `removeTrusted`:583 is blocked while one is pending; worth checking how repeated `approveRecovery` calls interact with the student's ability to remove the trusted person.

- **Per-account demo clock** &nbsp;&#91;[I-15](invariants.md#i-15), [G-12](invariants.md#g-12), [G-14](invariants.md#g-14)&#93; — `skipDays`:674 moves the clock read by `collect`:895, `releaseHold`:914, `finalizeEmergency`:754 and `_finishPending`:1209; worth confirming which deployments set `demoMode` and what a student can do to their own holds and locks.

- **Purchase move after collection** &nbsp;&#91;[I-1](invariants.md#i-1), [I-4](invariants.md#i-4)&#93; — `movePurchase`:600-616 moves `collected - refunded` for Collected/Refunded purchases and later `refund`:936 credits the new envelope; worth tracing the move + partial refund + second refund ordering.

- **Schedule fold and release math** &nbsp;&#91;[I-13](invariants.md#i-13), [I-14](invariants.md#i-14)&#93; — `_fold`:1155 swaps-and-pops records while iterating and `_live`:1138 computes released value on read; worth checking Monday-boundary behaviour with skips.

## Protocol-Type Concerns

**As a custodial escrow:**

- `deposit`:810-813 floors four parts and gives the remainder to Everyday; `base = part/4` per deposit (825) so up to 3 units per deposit per envelope release on the fourth Monday (I-14).
- `collect`:904 pushes tokens with no post-balance check, unlike pulls (G-30); relies on AUSD having standard transfer semantics.

## Temporal Risk Profile

**Deployment & Initialization:**

- Constructor:495 fixes token, settlement, treasury, card service and `demoMode` forever; a wrong address or `demoMode = true` on a non-demo deploy needs a redeploy (no setter).
- `_defaultRule` table (516-526) is hard-coded; changes need a redeploy.

## Composability & Dependency Risks

**Dependency Risk Map:**

> **AUSD (ERC-20)** — via `deposit`:830, `refund`:939, `collect`:904
>
> - Assumes: exact-amount transfers, no callbacks, `decimals()` readable
> - Validates: balance delta on pulls (G-30), `decimals()` at deploy (503); SafeERC20 everywhere
> - Mutability: per token issuer (could not determine for AUSD on Monad)
> - On failure: revert (no fallback)

**Token Assumptions** _(unvalidated only)_:

- Pausable / blacklistable token: assumes the contract and `settlement` are never blocked — impact if violated: all deposits, collections and refunds revert.
