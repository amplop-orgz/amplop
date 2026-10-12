# 20. Submission deliverables

Status: Ready · Source: PRD sections 1, 3, 13, 14, 15 ("Before submission"), 16, 17 · Depends on: all specs

## Goal

Everything the judges receive beyond the code, ready and checked before the deadline: three videos, the portal text and fields, the Agora and Envio bounty entries, the interview summary, and a final run of every gate. Code stops at 18:00 WIB on Tue 13 Oct; the submission goes in by 23:00 WIB the same night; Wed 14 Oct until 10:59 WIB is buffer only.

## In scope

- A checklist of every PRD 13 deliverable with its owner spec and owner day.
- The 3-minute demo video (script verbatim), the 2-minute pitch video, the 2-minute Agora video.
- Portal fields: description, track, links, team, go-to-market answer, judge access instructions.
- Agora and Envio bounty entries.
- The one-page interview summary.
- The final gate run, the submit step, the buffer rules, the never-cut list and the cut order.

## Out of scope

- Building the app, contract, docs or tests (other specs). This spec only checks they are done and links them.

## Requirements

### Deliverables

**S20-1. Checklist.** Kept as `submission/README.md` with a tick box per row. Owner day comes from the PRD 16 schedule (WIB).

| #   | Deliverable (PRD 13)       | Must contain                                                                                                                                                     | Built by       | Owner day                                                                                | Done when                                                                                                                                         |
| --- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Public repository          | MIT licence, commits inside the event window, the four folders (`apps/web`, `apps/docs`, `contracts`, `indexer`)                                                 | 02             | Mon 5 Oct (created), public by Tue 13 Oct                                                | Repository is public; `LICENSE` is MIT; first commit is on or after the event start; gitleaks full-history scan is green before it is made public |
| 2   | README                     | Three sentences, live links, contract addresses, set-up steps, architecture and tech stack, real/simulated table, attribution, AI-tool disclosure, test commands | 18             | Address Wed 7 Oct; full README Mon 12 Oct                                                | 18's checklist ticked; `check:wording` and `check:fragments` green                                                                                |
| 3   | Deployed contract          | Address on Monad testnet, verified source                                                                                                                        | 03, 04         | Wed 7 Oct; redeploy Sat 10 Oct after the self-audit if anything changed                  | Explorer shows verified source at the address in `deployments/monad-testnet.json`                                                                 |
| 4   | Live app                   | Landing page and app on one public address, working on a phone                                                                                                   | 06–17          | Grows daily; final Tue 13 Oct                                                            | Production deployed by CI from the final commit; two-phone script ticked                                                                          |
| 5   | Demo video                 | 3 minutes or less; script in S20-4                                                                                                                               | this spec      | Tue 13 Oct                                                                               | Uploaded, link opens logged out, length 3:00 or less                                                                                              |
| 6   | Portal submission          | Project description, track, links, team                                                                                                                          | this spec      | Project created Mon 5 / Tue 6 Oct (portal deadline Tue 6 Oct); final Tue 13 Oct by 23:00 | Portal shows "submitted"                                                                                                                          |
| 7   | Docs site                  | Architecture, contracts, API, issuer integration, trust and security, how Amplop differs, try-it guide, user guide, roadmap                                      | 18             | Mon 12 Oct                                                                               | Live at `NEXT_PUBLIC_DOCS_URL`; 18's checklist ticked                                                                                             |
| 8   | Landing page               | As in the mock-up (board 0.0)                                                                                                                                    | 17             | Mon 12 Oct                                                                               | 17's checklist ticked; L1 and L3 pass                                                                                                             |
| 9   | Agora bounty entry         | How AUSD is used: cross-border allowance, held and released by rule, paid out at purchase                                                                        | this spec      | Tue 13 Oct                                                                               | S20-8 submitted                                                                                                                                   |
| 10  | Envio bounty entry         | Config, schema, handlers, one screenshot of the parent's alerts next to the query                                                                                | 16, this spec  | Indexer Sun 11 Oct; entry Tue 13 Oct                                                     | S20-9 submitted                                                                                                                                   |
| 11  | Interview summary          | What 10 students and parents said, in one page                                                                                                                   | this spec      | Tue 13 Oct                                                                               | S20-10 in `submission/interviews.md` and linked from the portal                                                                                   |
| 12  | Tests                      | PRD 14, with the command to run them in the README                                                                                                               | 03, 05, 16, 19 | Tier 1 on each feature's day; Tier 2 and 3 by hand Mon 12 Oct                            | Final gate run (S20-11) green                                                                                                                     |
| 13  | Pitch video                | 2 minutes or less: who you are, the problem, why you are building it                                                                                             | this spec      | Tue 13 Oct                                                                               | Uploaded, link opens logged out                                                                                                                   |
| 14  | Agora bounty video         | 2 minutes or less: passkey sign-up, an AUSD balance, one completed send and receive that settles at once                                                         | this spec      | Tue 13 Oct                                                                               | Uploaded, link opens logged out                                                                                                                   |
| 15  | Go-to-market answer        | First users and how to reach them                                                                                                                                | this spec      | Tue 13 Oct                                                                               | In the portal field                                                                                                                               |
| 16  | Judge access instructions  | The try-it guide's eight steps                                                                                                                                   | 18, this spec  | Guide Mon 12 Oct; pasted Tue 13 Oct                                                      | In the portal field, same text as the docs Try it page                                                                                            |
| 17  | `SECURITY.md` (PRD 15)     | Threat table, self-audit link, accepted risks, how to report                                                                                                     | 18             | Mon 12 Oct                                                                               | 18's checklist ticked                                                                                                                             |
| 18  | Self-audit report (PRD 15) | `audits/2026-10-self-review.md`, no open high or medium                                                                                                          | 04             | Sat 10 Oct                                                                               | Report in the repository                                                                                                                          |

**S20-2. Texts in the repository.** All submission texts live in `submission/` so 18's `check:wording` covers them: `portal.md` (every portal field), `agora.md`, `envio.md`, `interviews.md`, `videos.md` (the three scripts as recorded, with final timings). No personal contact details, keys or real names of interviewees.

### Wording rules

**S20-3.** The PRD 13 wording rules apply to the video narration and on-screen text, the portal text and the bounty entries (18 S18-3):

- State the crypto-free experience once per piece, as a design principle (18 S18-4), not as a feature list repeated everywhere.
- Never call it an innovation. Never compare it with another company. Name no other product anywhere in the videos, portal text or README. The "what is new" claim with the eight reviewed cards stays on the docs site only.
- Lead with the five new things (18 S18-5) when describing what is new.
- Say "the parent sees totals, not shops". Never say "private" or "privacy".
- Say "self-reviewed, findings published". Never "audited".

The video scripts are written into `submission/videos.md` before recording, so `check:wording` checks the narration.

### Videos

**S20-4. Demo video (3 minutes or less).** The script, verbatim from PRD 13:

1. 0:00 to 0:20. The problem: allowance sent once a month is gone by week two, and parents abroad cannot see or help.
2. 0:20 to 0:50. Raka creates a passkey, sets five envelopes, invites Mama.
3. 0:50 to 1:20. Mama accepts on her phone, sends Rp16.500.000, and it arrives as $1.000 already split.
4. 1:20 to 2:00. Raka pays at a supermarket: approved from Food in about a second. A gambling site: declined. Mama's app shows the category, not the shop.
5. 2:00 to 2:25. Skip to next Monday: the next share is released.
6. 2:25 to 2:50. Raka asks for $70 from Emergency. Mama approves with her passkey. It moves to Everyday.
7. 2:50 to 3:00. What is real, what is simulated, and what comes next.

Recording rules:

- Recorded on Tue 13 Oct morning, after Tier 1 has passed on Monad testnet (19 S19-17) on the commit that will be submitted.
- Two real phones (Raka on one, Mama on the other), screen-recorded, against the production demo deployment on Monad testnet. Fresh accounts made during recording.
- Segment 2 shows the passkey prompt (fingerprint or face). Segment 3 shows Simulate payment, then Allowance sent, then Raka's Allowance arrived with $1.000,00 split. Segment 4 shows "Confirmed in" on the Approved screen and taps View transaction proof once, so the explorer is seen. Segment 5 uses Settings, Skip to next Monday. Segment 6 shows Mama's Approve with passkey and Raka's Everyday going up by $70,00.
- Segment 7 shows the README's real/simulated table on screen and names two or three items from the roadmap.
- Captions burned in (English). Voice-over in English.
- Upload as unlisted on a public video host. Length checked: 3:00 or less. Link tested in a logged-out browser on a phone.
- Backup: if Midtrans sandbox is slow, Simulate payment is what the script uses anyway (PRD 17). If a live take fails, re-record that segment; never edit a result that did not happen.

**S20-5. Pitch video (2 minutes or less)** (portal required field, separate from the demo video). Contents and order:

| Time         | Content                                                                                                                                                                                                                          |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00 to 0:20 | Who you are: the builder, one person, and why this problem is close to you.                                                                                                                                                      |
| 0:20 to 1:10 | The problem: Indonesian students far from home get one monthly transfer that runs out by week two; parents abroad cannot see or help without asking for every receipt. Use what the interviews said (S20-10), quoted accurately. |
| 1:10 to 1:50 | Why you are building it: envelopes, weekly release, a trusted person for emergencies, and a parent who sees totals, not shops. First users: Indonesian student associations abroad (S20-7 go-to-market answer).                  |
| 1:50 to 2:00 | Close: the app address and "try it in five minutes".                                                                                                                                                                             |

Face to camera or voice over slides; no app walkthrough (that is the demo video). The personal story is the builder's own; nothing invented.

**S20-6. Agora bounty video (2 minutes or less)** (Agora form required field). Must show, in this order (PRD 13):

| Time         | Shows                                                                                                                                                                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0:00 to 0:15 | One sentence: Amplop holds a student's allowance in AUSD on Monad, splits it into envelopes and releases it by rule.                                                                                                                       |
| 0:15 to 0:40 | Passkey sign-up as Raka (no recovery phrase, no wallet prompt).                                                                                                                                                                            |
| 0:40 to 1:05 | An AUSD balance: Raka's envelopes after the allowance, then the receipt's Detail panel showing the AUSD amount, then the contract's AUSD holding on the explorer.                                                                          |
| 1:05 to 1:40 | One completed send and receive that settles at once: Mama sends Rp16.500.000 with Simulate payment; Raka's envelopes show $1.000,00 split within seconds; View transaction proof opens the `Deposited` transaction with its AUSD transfer. |
| 1:40 to 2:00 | Paid out at purchase: the supermarket purchase approved from Food, then Collect now moves the AUSD to the settlement address.                                                                                                              |

### Portal and bounty entries

**S20-7. Portal fields.** Drafted in `submission/portal.md`, pasted on Tue 13 Oct.

| Field                     | Content                                                                                                                                                         |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project name              | Amplop                                                                                                                                                          |
| Tagline                   | Allowance that lasts the whole month.                                                                                                                           |
| Track                     | Track 02: Consumer Products & Payments                                                                                                                          |
| Description               | The text below, adjusted only if a feature was cut (S20-12).                                                                                                    |
| Links                     | Live app (`NEXT_PUBLIC_SITE_URL`), repository, docs site, try-it guide, demo video, pitch video, contract on the explorer (verified source), self-review report |
| Team                      | One person, the builder (as registered in the portal); role: everything                                                                                         |
| Go-to-market answer       | The text below                                                                                                                                                  |
| Judge access instructions | The eight steps from the docs Try it page (18 S18-14), pasted unchanged, preceded by the app address                                                            |
| Demo video, pitch video   | Their links (S20-4, S20-5)                                                                                                                                      |

Description:

> Amplop is an allowance wallet for Indonesian students studying far from home. A parent pays rupiah once by bank transfer; it arrives as AUSD on Monad testnet, splits into five envelopes, and each envelope is released one weekly share at a time. A demo card pays from the envelope that matches the kind of shop, and the contract itself decides each payment in one transaction that is final in about a second. The Emergency envelope opens when a trusted person approves with their passkey, or by itself after 48 hours: they can open it sooner but cannot block it. The parent sees totals, not shops. Our design principle is no new vocabulary: sign-in is a passkey with no recovery phrase, and nobody sees a wallet prompt or pays a network fee. Every step writes to Monad testnet and links to its transaction. Rupiah payments and the card network are simulated; the docs list exactly what is real. The contract is self-reviewed, findings published.

Go-to-market answer (PRD 13: first users and how to reach them):

> Our first users are Indonesian students studying abroad, reached through Indonesian student associations in their cities. Each student who joins invites one parent by WhatsApp, because the parent is the one who sends the allowance, so every new student brings their sender with them. We start with the students and parents we interviewed and the associations they belong to, then grow city by city through those associations' own channels.

The second sentence of the go-to-market answer and the interview mention must match what the interviews actually covered; adjust to the facts in `submission/interviews.md`.

**S20-8. Agora bounty entry** (`submission/agora.md`):

- How AUSD is used, in three points (PRD 13): cross-border allowance (a parent's rupiah becomes AUSD for a student abroad); held and released by rule (the contract holds the AUSD, splits it into envelopes and releases one weekly share at a time, with Emergency locked until a trusted person approves or 48 hours pass); paid out at purchase (each card payment holds AUSD in one envelope and the shop's collection sends it to settlement).
- AUSD testnet address and the `AmplopEnvelopes` address with explorer links; note that the contract works with any token address (PRD 2).
- Links to the code that moves AUSD: `deposit`, `authorize`, `collect`, `refund` in `contracts/src/AmplopEnvelopes.sol`.
- The Agora video link (S20-6).
- The answer to the open question from PRD 17 ("does the bounty require a native mobile app?"): whatever the event Discord said. If a native app is required, say plainly that Amplop is an installable web app (PWA) used on phones.

**S20-9. Envio bounty entry** (`submission/envio.md`), the materials from 16 S16-19:

- Links to `indexer/config.yaml`, `indexer/schema.graphql` and `indexer/src/handlers/` at the submission commit.
- The screenshot `apps/docs/src/assets/envio-alerts-query.png`: the parent's alerts next to `AlertsForTrustedQuery` and its result.
- The query text.
- The Envio Cloud GraphQL endpoint and start block.
- Two sentences on design: the indexer builds Activity and the parent's alerts from contract events; balances, totals and card results come from the contract, so the app keeps working when the indexer is behind.

**S20-10. Interview summary** (`submission/interviews.md`, one page, about 600 words or fewer):

| Part                       | Content                                                                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Who and how                | How many students and how many parents, where they study or live (city or country only), when, and how (call, chat, in person) |
| What students said         | The three or four points that came up most, each with how many said it                                                         |
| What parents said          | Same                                                                                                                           |
| What changed because of it | Design decisions the interviews caused (for example: weekly release, Emergency approval that cannot block)                     |
| Quotes                     | Two to four short quotes, with permission, attributed by role only ("a student in the Netherlands", "a parent in Surabaya")    |

Real interviews only. If fewer than 10 people were interviewed, the summary says the real number. No invented quotes, no names, no contact details.

### Final run and submit

**S20-11. Final gate run (Tue 13 Oct, finished before 18:00 WIB).** Recorded in `submission/README.md` with times:

- [ ] The final commit is pushed and `ci.yml` is green on it: every job in 02 S02-13, including `e2e-tier1` with no retries used and `preview-smoke`.
- [ ] `deploy-production` deployed that commit; the production URL serves it.
- [ ] Tier 1 on Monad testnet (`e2e-testnet.yml`) passed on that deployment with no retries (19 S19-17).
- [ ] `apps/web/e2e/manual/2026-10-12-results.md` has a passing row for every Tier 3 case and every Tier 2 case not automated; the two-phone script is ticked both ways (19 S19-20, S19-21).
- [ ] No open high or medium finding: code scanning, Dependabot, Slither and Aderyn, the self-review report, the Mon 12 Oct review pass.
- [ ] Three different server wallets (PRD 6). Treasury at least 20.000 AUSD (PRD 10; aim for 40.000 for judging traffic) and above 10 MON plus its daily budget; Card service above 10 MON plus its daily budget; Fee sponsor at least 60 MON.
- [ ] Contract verified; README, docs and SECURITY.md addresses match `deployments/monad-testnet.json`.
- [ ] Envio Cloud deployment promoted, `_meta.isReady` true, auto-deploy turned off (16 S16-15).
- [ ] Landing page, app and docs open on a phone from a logged-out browser; L3 passes on production.
- [ ] An annotated tag `submission-2026-10-13` is pushed on the final commit (a new tag, never a moved one).

At 18:00 WIB code stops. After that, no commit touches `apps/web/src`, `contracts`, `indexer`, `packages/shared` or CI files.

**S20-12. Submit (Tue 13 Oct, by 23:00 WIB).**

1. Make the repository public if it is not yet (after the full-history gitleaks scan is green).
2. Fill every portal field from `submission/portal.md`.
3. Open every link in the portal from a logged-out browser on a phone; each works.
4. Submit the portal form, the Agora bounty form and the Envio bounty entry.
5. Record the submission times and confirmation in `submission/README.md` (no screenshots with personal data in the repository).
6. If anything was cut (S20-14), the description and the docs say so; nothing cut is shown as working.

**S20-13. Buffer rules (Wed 14 Oct, until the 10:59 WIB deadline).**

- No new features, no code changes, no contract changes, no redeploy of the contract.
- Allowed, only to fix an error: a broken portal link; a video re-upload if the host failed; a factual error in README, docs or SECURITY.md text, as a `docs(<area>): …` commit that passes every gate, pushed before 09:00 WIB.
- If production goes down, redeploy the same tagged commit (`ci.yml` run by hand on it); never a new commit.
- Nothing is changed after 10:00 WIB.
- During judging (after the deadline): keep the deployment, database, indexer and wallets running; do not rotate keys; check wallet balances and indexer health once a day until results are announced.

**S20-14. Never cut, and the cut order (PRD 16).**

Never cut: passkey sign-up, split and weekly release, the card decision, the trusted-person approval, Simulate payment, Skip time, the README's real / simulated table, and the gates in section 15.

Cut order, if a day slips. Cut from the top; stop as soon as the schedule fits.

1. Account recovery screens (keep the contract functions and their tests).
2. Lock-off and replacing a trusted person in Settings.
3. Move a purchase.
4. Midtrans Snap (keep the Simulate payment button).
5. Alerts on the parent home.
6. Activity from the indexer. This gives up the Envio bounty, so it goes last.

When something is cut: its cases are marked "cut" in 19's case map; the user guide and Try it drop it; the landing page uses 17's fallback text where one exists; the Envio entry is withdrawn only if item 6 is cut; the portal description does not mention a cut feature.

## Interfaces used

- 02: CI workflow, `deploy-production`, gates. 04: deployment record, self-review. 16: Envio materials. 17: landing page. 18: README, docs (Try it steps), SECURITY.md, `check:wording`. 19: Tier 1 testnet run, hand-run records, case map.

## Screens

None.

## Errors and edge cases

| Case                                            | Behaviour                                                                                                            |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Tier 1 on testnet fails on Tue 13 Oct morning   | Fix, push, wait for green, re-run; recording waits. If not fixed by 15:00 WIB, cut per S20-14 and record what works. |
| Midtrans sandbox down during recording          | The script uses Simulate payment; no change.                                                                         |
| Monad testnet RPC rate-limited during recording | The app's fallback provider takes over (L5); if both fail, wait and re-record the segment.                           |
| Video longer than its limit                     | Trim pauses; never speed up the app's confirmation times.                                                            |
| Portal form rejects a field length              | Shorten the text in `submission/portal.md` first, re-run `check:wording`, then paste.                                |
| Fewer than 10 interviews                        | Say the real number (S20-10).                                                                                        |

## Security

- No keys, tokens, `.env` values or personal contact details in `submission/`, videos or screenshots. Blur any address bar or notification that shows personal data before upload.
- The repository goes public only after the full-history gitleaks scan is green.
- Wallets stay funded for a few days only (PRD 15); top up daily during judging rather than over-funding.

## Tests

| Test                                              | Expected                                             |
| ------------------------------------------------- | ---------------------------------------------------- |
| `npm run check:wording` over `submission/`        | Passes                                               |
| Video lengths                                     | Demo 3:00 or less; pitch and Agora 2:00 or less each |
| Every portal link from a logged-out phone browser | Opens                                                |
| Try it steps pasted in the portal                 | Identical to the docs Try it page                    |
| Final gate run checklist (S20-11)                 | Every box ticked before 18:00 WIB Tue 13 Oct         |

End-to-end case IDs: none owned here. This spec requires all 40 Tier 1 cases green on the final commit and on Monad testnet, and every hand-run case recorded.

## Acceptance checklist

- [ ] Every row of S20-1 is ticked.
- [ ] Demo video follows the PRD 13 script, 3:00 or less.
- [ ] Pitch video and Agora video, 2:00 or less each, with the required contents.
- [ ] Portal: description, track, links, team, go-to-market answer, judge access instructions filled; submitted by 23:00 WIB Tue 13 Oct.
- [ ] Agora and Envio entries submitted.
- [ ] Interview summary is one page and truthful.
- [ ] Final gate run done before 18:00 WIB; tag pushed.
- [ ] Buffer rules followed on Wed 14 Oct.

## Skills to use

- MONSKILLS `addresses` to confirm the AUSD address quoted in the Agora entry against Agora's own docs (PRD 6).
- MONSKILLS `indexer` (endpoint and `_meta` health) for the Envio entry and the final indexer check.
- MONSKILLS `concepts` (reserve balance) when checking wallet balances in the final gate run.

## Decisions made here

1. **All submission texts live in `submission/`** so the wording check covers them and the history shows what was submitted.
2. **Draft portal description and go-to-market answer** are written here, following the wording rules; the go-to-market answer must be adjusted to what the interviews actually covered.
3. **Recording happens after Tier 1 passes on testnet**, on the commit that will be submitted, so the video shows the shipped app.
4. **Buffer-day edits** are limited to fixing errors in links, videos and documentation text, with nothing after 10:00 WIB.
5. **A submission tag** marks the frozen commit; production can be redeployed only from it.
6. **Services stay up through judging**, with daily balance and indexer checks.
7. **`npm run check:submission`** (part of `check:repo`) compares the judge access steps in `submission/portal.md` with the docs Try it page, so the "identical" test in this spec is checked on every push. (Mon 12 Oct)
8. **Values that do not exist yet are marked "To fill"** in `submission/`: deployed URLs, video links, the Envio endpoint and screenshot, the Discord answer on native apps, and the whole interview summary. Nothing is guessed; the builder fills them on Tue 13 Oct. (Mon 12 Oct)

## Additions to 01 (status)

1. §2 layout: `submission/`: Merged into 01 (section 2).
