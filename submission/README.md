# Submission

Everything the judges receive beyond the code (spec 20). The texts live here so `npm run check:wording` covers them: [portal.md](portal.md), [agora.md](agora.md), [envio.md](envio.md), [videos.md](videos.md), [interviews.md](interviews.md). See the [root README](../README.md) for the project itself.

Code stops at 18:00 WIB on Tue 13 Oct. The submission goes in by 23:00 WIB the same night. Wed 14 Oct until 10:59 WIB is buffer only (S20-13).

## Deliverables (S20-1)

| Done | #   | Deliverable               | Built by       | Done when                                                                                        |
| ---- | --- | ------------------------- | -------------- | ------------------------------------------------------------------------------------------------ |
| [ ]  | 1   | Public repository         | 02             | Public; `LICENSE` is MIT; first commit inside the event window; full-history gitleaks scan green |
| [ ]  | 2   | README                    | 18             | 18's checklist ticked; `check:wording` and `check:fragments` green                               |
| [x]  | 3   | Deployed contract         | 03, 04         | Explorer shows verified source at the address in `deployments/monad-testnet.json`                |
| [ ]  | 4   | Live app                  | 06–17          | Production deployed by CI from the final commit; two-phone script ticked                         |
| [ ]  | 5   | Demo video                | 20             | Uploaded, opens logged out, 3:00 or less                                                         |
| [ ]  | 6   | Portal submission         | 20             | Portal shows "submitted"                                                                         |
| [ ]  | 7   | Docs site                 | 18             | Live at `NEXT_PUBLIC_DOCS_URL`; 18's checklist ticked                                            |
| [ ]  | 8   | Landing page              | 17             | 17's checklist ticked; L1 and L3 pass                                                            |
| [ ]  | 9   | Agora bounty entry        | 20             | [agora.md](agora.md) submitted                                                                   |
| [ ]  | 10  | Envio bounty entry        | 16, 20         | [envio.md](envio.md) submitted                                                                   |
| [ ]  | 11  | Interview summary         | 20             | [interviews.md](interviews.md) written and linked from the portal                                |
| [ ]  | 12  | Tests                     | 03, 05, 16, 19 | Final gate run below green                                                                       |
| [ ]  | 13  | Pitch video               | 20             | Uploaded, opens logged out, 2:00 or less                                                         |
| [ ]  | 14  | Agora bounty video        | 20             | Uploaded, opens logged out, 2:00 or less                                                         |
| [ ]  | 15  | Go-to-market answer       | 20             | In the portal field                                                                              |
| [ ]  | 16  | Judge access instructions | 18, 20         | In the portal field, same text as the docs Try it page (`npm run check:submission`)              |
| [ ]  | 17  | `SECURITY.md`             | 18             | 18's checklist ticked                                                                            |
| [x]  | 18  | Self-review report        | 04             | `audits/2026-10-self-review.md`, no open high or medium                                          |

## Final gate run (S20-11, before 18:00 WIB Tue 13 Oct)

Write the time (WIB) next to each box as it is ticked.

- [ ] The final commit is pushed and `ci.yml` is green on it, including `e2e-tier1` with no retries used and `preview-smoke`.
- [ ] `deploy-production` deployed that commit; the production URL serves it.
- [ ] Tier 1 on Monad testnet (`e2e-testnet.yml`) passed on that deployment with no retries.
- [ ] `apps/web/e2e/manual/2026-10-12-results.md` has a passing row for every Tier 3 case and every Tier 2 case not automated; the two-phone script is ticked both ways.
- [ ] No open high or medium finding: code scanning, Dependabot, Slither and Aderyn, the self-review report, the Mon 12 Oct review pass.
- [ ] Three different server wallets. Treasury at least 20.000 AUSD (aim for 40.000) and above 10 MON plus its daily budget; card service above 10 MON plus its daily budget; fee sponsor at least 60 MON.
- [ ] Contract verified; README, docs and SECURITY.md addresses match `deployments/monad-testnet.json`.
- [ ] Envio Cloud deployment promoted, `_meta.isReady` true, auto-deploy turned off.
- [ ] Landing page, app and docs open on a phone from a logged-out browser; L3 passes on production.
- [ ] An annotated tag `submission-2026-10-13` is pushed on the final commit (a new tag, never a moved one).

At 18:00 WIB code stops. After that, no commit touches `apps/web/src`, `contracts`, `indexer`, `packages/shared` or CI files.

## Submit (S20-12, by 23:00 WIB Tue 13 Oct)

- [ ] Repository public (after the full-history gitleaks scan is green).
- [ ] Every portal field filled from [portal.md](portal.md).
- [ ] Every portal link opened from a logged-out browser on a phone.
- [ ] Portal form, Agora bounty form and Envio bounty entry submitted.
- [ ] Submission times and confirmations recorded here (no screenshots with personal data).
- [ ] If anything was cut (S20-14), the description and the docs say so.

| What         | Submitted at (WIB) | Confirmation |
| ------------ | ------------------ | ------------ |
| Portal       |                    |              |
| Agora bounty |                    |              |
| Envio bounty |                    |              |

## If a day slips (S20-14)

Never cut: passkey sign-up, split and weekly release, the card decision, the trusted-person approval, Simulate payment, Skip time, the README's real and simulated table, and the gates.

Cut order, from the top, stopping as soon as the schedule fits: account recovery screens; lock-off and replacing a trusted person; move a purchase; Midtrans Snap; alerts on the parent home; Activity from the indexer (this one gives up the Envio bounty, so it goes last).
