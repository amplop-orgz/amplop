# 04. Contract deploy, verification and self-audit

Status: Ready · PRD sources: 6 (server keys, reserve balance, MONSKILLS), 7, 12, 13 (deployed contract), 15 (contract self-audit, gates, accepted risks), 16 (Sat 10 Oct), 17 (day-one checks) · Depends on: 01, 02, 03

## Goal

Put `AmplopEnvelopes` on Anvil and on Monad testnet (chain 10143) with one repeatable script, verify its source, set the two token approvals, and publish its address and deploy block in one committed file that the web app and the indexer read. Then run the PRD 15 self-audit, publish the report, fix and redeploy if needed.

## In scope / Out of scope

**In scope**

- `contracts/script/Deploy.s.sol`, `contracts/script/LocalSetup.s.sol`, `contracts/script/Approve.s.sol`, `contracts/script/write-deployment.mjs`, `contracts/script/check-wallets.sh`.
- `deployments/monad-testnet.json` (committed) and `deployments/anvil.json` (git-ignored).
- Source verification on the Monad testnet explorer.
- ABI generation into `packages/shared` with the wagmi CLI.
- Server wallet balances and the Monad reserve balance rule, as a deploy and operations requirement.
- The self-audit: tools, checklist, report at `audits/2026-10-self-review.md`, fix commits, redeploy.

**Out of scope**

- Contract behaviour (spec 03). CI wiring of Slither and Aderyn on every push (spec 02).
- How the server reads keys and sends transactions (spec 05). Faucet refills of the treasury at runtime (spec 08).
- The indexer config itself (spec 16); this spec only supplies the address and start block.

## Requirements

### A. Inputs and wallets

**S04-1 Deploy inputs.** Read from the environment of the machine that deploys. None of these goes to Vercel except where 01 section 7 already lists it.

| Name                                             | Used by                        | Notes                                                                                                                     |
| ------------------------------------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `MONAD_RPC_URL`                                  | Deploy, Approve, check-wallets | Same name as 01. Confirm the public testnet RPC in the MONSKILLS `tooling-and-infra` skill.                               |
| `AUSD_ADDRESS`                                   | Deploy (10143)                 | Must equal `NEXT_PUBLIC_AUSD_ADDRESS`. See S04-3.                                                                         |
| `SETTLEMENT_ADDRESS`                             | Deploy                         | Same as 01.                                                                                                               |
| `TREASURY_ADDRESS`, `CARD_SERVICE_ADDRESS`       | Deploy                         | Public addresses of the two role wallets.                                                                                 |
| `DEMO_MODE`                                      | Deploy                         | Must be set explicitly to `true` or `false`; no default on 10143. `true` for the demo deployment.                         |
| `DEPLOYER_ACCOUNT`                               | Deploy                         | Name of a Foundry keystore account (`cast wallet import <name> --interactive`). No raw key in a file or in shell history. |
| `TREASURY_PRIVATE_KEY`, `SETTLEMENT_PRIVATE_KEY` | Approve                        | Used once, locally. `SETTLEMENT_PRIVATE_KEY` never goes to Vercel.                                                        |
| `ETHERSCAN_API_KEY` or verifier key              | Verify                         | Only if the chosen verifier needs one.                                                                                    |

**S04-2 Wallet roles.** Five wallets: deployer, Treasury, Card service, Fee sponsor, Settlement. Deployer has no power after the deploy (spec 03 S03-2). Treasury, Card service and Fee sponsor may share a wallet in the first days but must be three different wallets by submission (PRD 6). `Deploy.s.sol` prints a warning when `TREASURY_ADDRESS == CARD_SERVICE_ADDRESS`; the final deploy (S04-17) fails if they are equal.

**S04-3 AUSD address.** The MONSKILLS `addresses` skill lists AUSD as `0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a`. Before any testnet deploy, confirm that address **for Monad testnet** in Agora's own docs (PRD 6). Record the Agora docs page in `deployments/monad-testnet.json` as `tokenSource`. If Agora's docs give a different testnet address, use Agora's. `Deploy.s.sol` on 10143 refuses to run if `AUSD_ADDRESS` has no code or if `decimals()` reverts.

### B. Deploy script

**S04-4 Pre-flight checks in `Deploy.s.sol`.** Before broadcasting, the script reverts with a clear message if any of these fail:

1. `block.chainid` is 10143 or 31337.
2. Token, settlement, treasury and card service addresses are non-zero.
3. The token has code and `IERC20Metadata(token).decimals()` returns. Log the value. If it is not 6, log a warning (AUSD is expected to use 6; nothing in the contract depends on it, but the app's display and the server's conversion read it at runtime).
4. On 10143, `DEMO_MODE` is set explicitly.
5. On 10143, the deployer balance is above 10 MON plus the estimated deploy cost (S04-15).

**S04-5 Deploy.** `new AmplopEnvelopes(IERC20(AUSD_ADDRESS), SETTLEMENT_ADDRESS, TREASURY_ADDRESS, CARD_SERVICE_ADDRESS, DEMO_MODE)`, in exactly that argument order (01 section 3). The demo deployment on Monad testnet uses `demoMode = true`. After the deploy, in the same script, read back `token()`, `settlement()`, `treasury()`, `cardService()`, `demoMode()` and `tokenDecimals()` and revert if any differs from the inputs. Log the address.

**S04-6 Monad testnet command.**

```
cd contracts
forge script script/Deploy.s.sol:Deploy \
  --rpc-url monad_testnet --account $DEPLOYER_ACCOUNT \
  --broadcast --slow --gas-estimate-multiplier 120
node script/write-deployment.mjs 10143
```

`foundry.toml` has `[rpc_endpoints] monad_testnet = "${MONAD_RPC_URL}"` and `fs_permissions = [{ access = "read-write", path = "../deployments" }]`. Monad charges the fee on the gas limit, not on gas used (PRD 7). The multiplier is 120 (Foundry's default is 130); confirm against the MONSKILLS `gas` skill and lower it if the deploy succeeds with margin.

**S04-7 Anvil local setup (`LocalSetup.s.sol`).** One command builds a full local chain for development and the end-to-end harness (spec 19):

1. Start Anvil with `npm run chain:up`: `anvil --chain-id 31337 --port 8545 --accounts 10 --balance 10000 --timestamp 1790586000` (Mon 28 Sep 2026 09:00 UTC, 01 section 9; add `--code-size-limit` only if spec 03 S03-51 needed it).
2. Use Anvil's default accounts: index 0 deployer, 1 Treasury, 2 Card service, 3 Settlement, 4 Fee sponsor.
3. Deploy `MockERC20("AUSD test stand-in", "AUSD", 6)` from `contracts/test/mocks/MockERC20.sol` (spec 03). Mint 1.000.000 AUSD to Treasury and 10.000 AUSD to Settlement.
4. Deploy `AmplopEnvelopes` with `demoMode` from `DEMO_MODE` (default `true` on Anvil; `false` builds the K4 demo-off chain).
5. Set both approvals (S04-9) with the Anvil keys.
6. Write `deployments/anvil.json` in the same format (S04-11), with `token` = the mock address. This file is git-ignored.

`npm run deploy:local` runs steps 3 to 6 (`LocalSetup.s.sol`, then `write-deployment.mjs 31337`) against the running Anvil. Spec 19's harness and the README set-up (18) use these two root scripts.

**S04-8 Script tests.** `contracts/test/Deploy.t.sol` runs `Deploy.run()` and `LocalSetup.run()` in-process with env set by `vm.setEnv`. It asserts the read-backs from S04-5, that both allowances are set, and that each pre-flight check in S04-4 reverts when its input is broken (zero address, token without code, wrong chain id).

### C. Approvals

**S04-9 Two approvals.** Run `Approve.s.sol` right after every deploy:

| Wallet     | Call                                        | Why                                                |
| ---------- | ------------------------------------------- | -------------------------------------------------- |
| Treasury   | `AUSD.approve(contract, type(uint256).max)` | `deposit` pulls from Treasury with `transferFrom`. |
| Settlement | `AUSD.approve(contract, type(uint256).max)` | `refund` pulls from Settlement (01 section 3).     |

The script reads `allowance` back and reverts if it is not the maximum. The unlimited amount is safe because the contract pulls from Treasury only inside `deposit` (callable only by Treasury) and from Settlement only inside `refund`, capped per purchase at `collected − refunded` (spec 03 S03-31). Write this reasoning into `SECURITY.md` (spec 18).

**S04-10 Revoke on redeploy.** When a new contract replaces an old one, `Approve.s.sol` with `OLD_CONTRACT_ADDRESS` set also calls `approve(old, 0)` from both wallets.

### D. Deployment record

**S04-11 `deployments/monad-testnet.json`.** Written by `write-deployment.mjs` (Node 22, no dependencies) from Foundry's `broadcast/Deploy.s.sol/<chainId>/run-latest.json`: it finds the `CREATE` transaction for `AmplopEnvelopes`, reads `contractAddress`, the transaction hash and the receipt's `blockNumber`, and `git rev-parse HEAD` for the commit. Format:

```json
{
  "chainId": 10143,
  "contract": "AmplopEnvelopes",
  "address": "0x…",
  "deployBlock": 0,
  "deployTx": "0x…",
  "commit": "<40-hex git sha>",
  "compiler": "0.8.30",
  "token": "0x…",
  "tokenDecimals": 6,
  "tokenSource": "<Agora docs page that lists the testnet AUSD address>",
  "settlement": "0x…",
  "treasury": "0x…",
  "cardService": "0x…",
  "demoMode": true,
  "verified": false,
  "deployedAt": "<ISO 8601 UTC>"
}
```

Addresses are EIP-55 checksummed. `deployBlock` is a JSON number. `verified` is set to `true` by hand in the same commit as a successful S04-13. The file holds no secret. Commit it as `chore(contract): deploy AmplopEnvelopes to monad testnet`.

**S04-12 Consumers.**

- `packages/shared` re-exports only the committed `deployments/monad-testnet.json` as a typed constant (`deployments.monadTestnet`). It never imports `anvil.json`, so a clean checkout builds. Local and end-to-end runs take the Anvil addresses from environment variables that `deploy:local` writes into `apps/web/.env.local` and the indexer's e2e config (spec 19, S19-8; spec 16, S16-5).
- The indexer (spec 16) takes `address` and `deployBlock` (as `start_block`) from this file. Its config is regenerated from it, never edited by hand.
- The web app reads `NEXT_PUBLIC_CONTRACT_ADDRESS` (01 section 7). After each deploy, set that variable in Vercel to `address`. Spec 05 logs a warning at start-up if it differs from `deployments.monadTestnet.address`.
- The README's contract address line (spec 18) is copied from this file.

### E. Verification

**S04-13 Verify the source.** Verify with `forge verify-contract` against the Monad testnet explorer's verifier. Confirm which verifier type (Sourcify or Etherscan-style) and its URL in the Monad docs or the MONSKILLS `tooling-and-infra` skill; do not guess the URL. Shape of the command:

```
forge verify-contract <address> src/AmplopEnvelopes.sol:AmplopEnvelopes \
  --chain 10143 --verifier <type> --verifier-url <url from the docs> \
  --compiler-version 0.8.30 --num-of-optimizations 200 \
  --constructor-args $(cast abi-encode "constructor(address,address,address,address,bool)" \
      $AUSD_ADDRESS $SETTLEMENT_ADDRESS $TREASURY_ADDRESS $CARD_SERVICE_ADDRESS $DEMO_MODE) \
  --watch
```

Done when the explorer shows the source and the constructor arguments decode to the inputs. If it fails, retry with `--show-standard-json-input` and upload that JSON by hand on the explorer. Record the explorer page in the README (spec 18) and set `NEXT_PUBLIC_EXPLORER_TX_URL` from the same explorer.

### F. ABI generation

**S04-14 wagmi CLI into `packages/shared`.** `packages/shared/wagmi.config.ts` uses the `@wagmi/cli` Foundry plugin with `project: "../../contracts"`, `include: ["AmplopEnvelopes.sol/**"]`, output `packages/shared/src/generated/amplop.ts` (typed `amplopEnvelopesAbi`). `npm run generate -w packages/shared` runs `forge build` then `wagmi generate`. A second step writes the plain JSON ABI to `packages/shared/abi/AmplopEnvelopes.json` (from `contracts/out/AmplopEnvelopes.sol/AmplopEnvelopes.json`, field `abi`) for the Envio config. Both outputs are committed. CI runs the generator and fails if `git diff --exit-code` shows a change (spec 02). ABI types are never copied by hand (PRD 15).

### G. Wallet balances and the reserve rule

**S04-15 Reserve balance rule.** Below 10 MON, Monad's reserve balance rule makes transfers of MON out of a wallet revert, except one every 3 blocks (PRD 6; see the Monad docs page on reserve balance and the MONSKILLS `concepts` skill). So every server wallet stays above **10 MON plus its daily budget**:

| Wallet       | Floor                               | Budget basis                                                                                                   |
| ------------ | ----------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Fee sponsor  | **≥ 60 MON**                        | 10 MON reserve + the 50 MON daily cap (PRD 15).                                                                |
| Treasury     | 10 MON + daily budget               | `deposits per day × deposit gas limit × max fee per gas`. Plan for 100 deposits a day.                         |
| Card service | 10 MON + daily budget               | `calls per day × worst-case gas limit (authorize/collect/refund) × max fee per gas`. Plan for 500 calls a day. |
| Deployer     | 10 MON + deploy cost                | Only during deploys.                                                                                           |
| Settlement   | Enough for one `approve` per deploy | Sends no MON otherwise.                                                                                        |

Gas limits follow 01 section 9 (`max(estimate + 20%, GAS_FLOOR)`, floors from spec 03 S03-51); the max fee per gas is read from the RPC on the day. Record the computed floors in the docs site's operations page (spec 18).

**S04-16 `check-wallets.sh`.** Uses `cast balance` and `cast call` to print, for each wallet: MON balance against its floor, and for Treasury the AUSD balance against **20.000 AUSD** (PRD 10). It also prints both allowances from S04-9. Exit code 1 if any check fails. Run it after every deploy, before every recording, and on 13 Oct before the freeze.

**S04-17 Final deploy checks.** The deployment used for submission must have: three distinct addresses for Treasury, Card service and Fee sponsor; `demoMode = true`; verified source; both allowances at maximum; `check-wallets.sh` green.

### H. Self-audit (PRD 15, Sat 10 Oct)

**S04-18 Freeze the scope.** Tag the commit under review `audit-2026-10-10-start`. No change to `contracts/src/` during steps S04-19 to S04-23. The report names this commit.

**S04-19 Install pinned tools.** Record every version in `audits/tools/versions.txt`.

- pashov/skills at commit `92b0ea6`: `git clone https://github.com/pashov/skills` outside the repository, `git checkout 92b0ea6`, then install the `x-ray` and `solidity-auditor` skills into Claude Code's user skills folder. Do not run their update command during the freeze.
- Slither: one exact `slither-analyzer` release installed with `pipx`. Aderyn: one exact release. Use the latest release on the day and pin it.
- Foundry: the version in CI (spec 02).
- Add `.solidity-auditor/` and `.audit-*` to `.gitignore`.

**S04-20 Run the tools, in this order.** Outputs go to `audits/tools/`.

1. `x-ray` skill on `contracts/src/AmplopEnvelopes.sol` → `audits/x-ray/threat-model.md` and `audits/x-ray/invariants.md`. Every invariant not among the six in PRD 7 becomes an `invariant_XR_<name>` test in spec 03's suite (commit `test(contract): add x-ray invariant <name>`).
2. Slither from `contracts/` with `slither.config.json` (`filter_paths: "lib|test|script"`) → `audits/tools/slither.txt`.
3. Aderyn on `contracts/` → `audits/tools/aderyn-report.md`.
4. `FOUNDRY_PROFILE=ci forge test` (fuzz 10,000, invariants 1,000 × 50) → `audits/tools/forge-test.txt`.
5. `forge coverage --report summary` → `audits/tools/coverage.txt` (floors 95% lines, 90% branches).

**S04-21 Checklist walk.** For every external function of the contract, fill one row of this table in the report. Each cell is "OK" with a one-line reason, or a finding id.

| Function | Access control (R3) | Signatures | Rounding | Time | Token | Reentrancy / CEI | Loops | Event |
| -------- | ------------------- | ---------- | -------- | ---- | ----- | ---------------- | ----- | ----- |

What each column checks:

- Access control: the allowed callers match spec 03 S03-21 and R3, and nothing else can call it.
- Signatures: EIP-712 domain with chain id and contract address, single use, OpenZeppelin `ECDSA` (no malleable signatures).
- Rounding: the split and the four weekly shares add up exactly; leftover units go to Everyday.
- Time: every wait reads the account clock; `skipDays` is bounded; the demo switch is fixed at deploy.
- Token: `decimals()` read, not assumed; the balance matches invariant 1.
- Reentrancy, loops that can grow without limit, an event on every change.

**S04-22 Fresh eyes.** Run the `solidity-auditor` skill on `AmplopEnvelopes.sol` in loop mode (3 passes). Then a second person or Claude Code's `/security-review`. Copy the skill's `full-report.md` to `audits/solidity-auditor-full-report.md`.

**S04-23 Hand check rule.** A tool or reviewer finding counts only after it is checked by hand. Either a failing test proves it (named `test_SA<NN>_<what>`, e.g. `test_SA03_skipDaysUnbounded`), or it is marked a false positive with the reason. Slither and Aderyn exclusions are allowed only with a written reason in the report.

**S04-24 Report at `audits/2026-10-self-review.md`.** Sections, in this order:

1. Summary: "Self-reviewed, findings published." Never "audited".
2. Scope: file, commit (`audit-2026-10-10-start`), lines of code, out of scope.
3. Tools and versions (from `versions.txt`).
4. Threat model summary (from x-ray) and the invariant list with test names.
5. Checklist table (S04-21).
6. Findings table: `ID | Title | Severity | Status | Proof | Fix commit or reason`.
   - IDs `SA-01`, `SA-02`, … in the order found, never reused.
   - Severity: high, medium, low, info.
   - Status: `fixed` (with commit sha), `accepted` (with reason; also listed in `SECURITY.md`), or `false positive` (with reason).
7. Tool output index (links to `audits/tools/`).
8. Redeploy record: old and new address, new deploy block, date.

**S04-25 Fix workflow.** One finding per commit, with its regression test in the same commit. Message: `fix(contract): <what changed> (SA-NN)`, for example `fix(contract): cap skipDays (SA-03)`. After all fixes: re-run S04-20 steps 2 to 5 and confirm no new high or medium finding. Tag `audit-2026-10-10-end`.

**S04-26 Redeploy if anything in `contracts/src/` changed.** Steps, in order:

1. Deploy (S04-6) and write the record (S04-11).
2. Verify (S04-13).
3. Approvals for the new address and revoke for the old (S04-9, S04-10).
4. Update `NEXT_PUBLIC_CONTRACT_ADDRESS` in Vercel, the README address, the indexer config address and `start_block` (from `deployBlock`), and regenerate the ABI (S04-14).
5. Run `check-wallets.sh` and the Tier 1 end-to-end cases on the preview deploy.
6. Fill the redeploy record in the report.

**S04-27 Done.** The report is committed, no high or medium finding is open, and every gate in PRD 15 is green on the commit that produced the live address.

## Interfaces used

- Constructor and getters of `AmplopEnvelopes` (01 section 3).
- `MockERC20` (spec 03 S03-54).
- Environment names from 01 section 7: `MONAD_RPC_URL`, `NEXT_PUBLIC_CONTRACT_ADDRESS`, `NEXT_PUBLIC_AUSD_ADDRESS`, `NEXT_PUBLIC_EXPLORER_TX_URL`, `SETTLEMENT_ADDRESS`, `TREASURY_PRIVATE_KEY`, `DEMO_MODE`.

## Screens

None.

## Errors and edge cases

| Case                                               | What happens                                                                                                                            |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Wrong chain id                                     | `Deploy.s.sol` reverts before broadcast.                                                                                                |
| AUSD address has no code on testnet                | Reverts; confirm the address in Agora's docs (S04-3).                                                                                   |
| `decimals()` is not 6                              | Warning logged; deploy continues; the app and server read decimals at runtime.                                                          |
| Deploy transaction stuck or dropped                | `--slow` sends one at a time; re-run with `--resume`.                                                                                   |
| Gas limit too low                                  | Raise `--gas-estimate-multiplier` by 10 and retry.                                                                                      |
| `write-deployment.mjs` finds no CREATE transaction | Exits 1 with the broadcast path; nothing is written.                                                                                    |
| Verification fails                                 | Retry; then standard JSON input by hand (S04-13).                                                                                       |
| A wallet under 10 MON                              | MON transfers revert except one every 3 blocks; `check-wallets.sh` fails; top up from the Monad testnet faucet before any further step. |
| Approve sent from the wrong wallet                 | Read-back check fails; re-run with the right key.                                                                                       |
| Redeploy without revoking                          | Old contract keeps an allowance; S04-10 removes it.                                                                                     |

## Security

- Deployer key in a Foundry keystore; role keys only in the deploying shell and in Vercel's encrypted settings (PRD 15). `SETTLEMENT_PRIVATE_KEY` is never stored on the server. gitleaks runs on every commit (spec 02).
- `deployments/*.json` hold public data only.
- The demo switch is immutable; a demo-off deployment cannot be turned on (PRD 15 threat "test-only tools on a real deployment"). The hackathon deployment is demo-on and says so on screen (spec 15).
- Unlimited approvals are bounded by contract logic (S04-9); revoked on redeploy.
- The self-audit is published, and the wording is "self-reviewed, findings published" everywhere (README, docs, pitch).
- Accepted risks from PRD 15 ("one deployer address sets the contract up", "no external audit") go into `SECURITY.md` with the report link.

## Tests

| Test                                                             | Expected                                                                                                                     |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `contracts/test/Deploy.t.sol` `test_DEPLOY_readBacksMatchInputs` | Getters equal inputs; both allowances maximum.                                                                               |
| `test_DEPLOY_preflightRejectsBadInputs`                          | Zero address, no-code token and wrong chain each revert.                                                                     |
| `test_DEPLOY_localSetupDemoOff`                                  | With `DEMO_MODE=false`, `skipDays` reverts `DemoOff` (K4 contract side).                                                     |
| CI job `contracts-local-deploy`                                  | Runs Anvil, `LocalSetup.s.sol`, `write-deployment.mjs 31337`, and `check-wallets.sh` against Anvil; all exit 0.              |
| ABI drift check                                                  | `npm run generate -w packages/shared` leaves no diff.                                                                        |
| End-to-end L2 (spec 19)                                          | Every "View transaction proof" link opens a transaction on the explorer for the address in `deployments/monad-testnet.json`. |
| End-to-end K4 (spec 15/19)                                       | Uses the Anvil demo-off chain from S04-7.                                                                                    |

## Acceptance checklist

- [ ] AUSD testnet address confirmed in Agora's docs; `tokenSource` recorded.
- [ ] `Deploy.s.sol`, `LocalSetup.s.sol`, `Approve.s.sol`, `write-deployment.mjs`, `check-wallets.sh` committed with their tests.
- [ ] Contract deployed on Monad testnet with `demoMode = true`; source verified; constructor arguments decode correctly.
- [ ] Treasury and Settlement allowances at maximum; read-back passes.
- [ ] `deployments/monad-testnet.json` committed with address, deploy block, commit and `verified: true`.
- [ ] ABI generated into `packages/shared` (TS and JSON); CI drift check green.
- [ ] Vercel `NEXT_PUBLIC_CONTRACT_ADDRESS`, README address and indexer `start_block` updated.
- [ ] Fee sponsor ≥ 60 MON; Treasury and Card service above their floors; Treasury ≥ 20.000 AUSD; `check-wallets.sh` green.
- [ ] Self-audit report at `audits/2026-10-self-review.md` with tools, versions, checklist, findings `SA-NN`; no open high or medium.
- [ ] Every fix commit named `fix(contract): … (SA-NN)` with its regression test.
- [ ] Redeployed and re-verified if the contract changed; old allowances revoked.

## Skills to use

- MONSKILLS (pinned `3f8efd2`): `monskill` to start; `tooling-and-infra` (RPC, explorer, verifier type and URL, Foundry against Monad); `gas` (fee on gas limit, multiplier); `addresses` (AUSD candidate address only, confirmed against Agora); `concepts` (reserve balance rule, finality). Use `scaffold` only for its Foundry setup gotchas, not to create a project.
- Skip `wallet` (deploy with Foundry and the deployer keystore instead) and `wallet-integration`.
- pashov/skills at `92b0ea6`: `x-ray`, `solidity-auditor`.
- Claude Code `/security-review` for the fresh-eyes pass.

## Decisions made here

1. **Deployment file at the repository root** (`deployments/`), so web, indexer and docs read one source. Foundry writes there through `fs_permissions`.
2. **Deploy block comes from Foundry's broadcast receipt**, written by a small Node script, because a script cannot know its own block during simulation.
3. **Unlimited approvals** for Treasury and Settlement, justified by contract logic, revoked on redeploy.
4. **Anvil account mapping**: 0 deployer, 1 Treasury, 2 Card service, 3 Settlement, 4 Fee sponsor.
5. **Only one testnet deployment (demo on).** The demo-off case (K4) is proven on Anvil and in Foundry tests.
6. **Gas multiplier 120** for deploy transactions, to be lowered after the first deploy if safe.
7. **Daily budget planning figures**: 100 deposits and 500 card-service calls a day.
8. **Deployer uses a Foundry keystore**, never a raw key in an env file.

## Additions to 01 (status)

1. Repository layout: `deployments/` and the generated ABI paths: Merged into 01 (section 2).
2. Deploy-only environment variables: Merged into 01 (section 7), except the verifier key: Not merged, because it is set in the deploying shell only when the chosen verifier needs one and never appears in `.env.example` or Vercel.
3. Anvil account mapping: Merged into 01 (section 9).
4. Root scripts `chain:up` and `deploy:local`: Merged into 01 (section 9); defined in S04-7.
