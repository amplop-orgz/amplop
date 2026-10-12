# 18. Docs site, README and SECURITY.md

Status: Ready · Source: PRD sections 1, 3, 4 (R27), 6, 7, 8, 9, 11, 12, 13, 15, 18 · Depends on: 01, 02, 03, 04, 05

## Goal

Three pieces of writing that judges read: the root `README.md`, the docs site in `apps/docs`, and `SECURITY.md`. Each says plainly what Amplop is, what is real and what is simulated, how to run and test it, and how it is kept safe. All follow the PRD 13 wording rules, and a script checks the rules that a machine can check.

## In scope

- Root `README.md` with every item in the PRD 13 README row.
- Astro Starlight docs site with the nine page topics in PRD 13, plus an overview page.
- `SECURITY.md` with the contents PRD 15 requires.
- Shared text fragments so PRD tables appear unchanged everywhere they are required.
- The wording check (`npm run check:wording`) and the fragment check (`npm run check:fragments`).

## Out of scope

- The self-audit report itself (04, `audits/2026-10-self-review.md`).
- Portal text, video scripts and bounty entries (20). They follow the same wording rules and 20 runs the same check on them.
- The landing page (17), which has its own stricter word rules.
- The indexer write-up `indexer/README.md` (16); the docs link to it.

## Requirements

### Shared fragments

**S18-1. Fragments.** Text that the PRD says must appear "unchanged" lives once in `apps/docs/src/fragments/` and is copied into the README and SECURITY.md between HTML comment markers:

| Fragment            | Content                                         | Appears in                                      |
| ------------------- | ----------------------------------------------- | ----------------------------------------------- |
| `real-simulated.md` | The PRD 3 table, exactly as in S18-2            | README, docs Overview                           |
| `threats.md`        | The PRD 15 threat table, exactly as in S18-21   | SECURITY.md, docs Trust and security            |
| `accepted-risks.md` | The PRD 15 accepted risks, exactly as in S18-22 | SECURITY.md, docs Trust and security            |
| `roadmap.md`        | The PRD 18 list, exactly as in S18-17           | docs Roadmap                                    |
| `demo-time.md`      | The PRD 12 README sentence (S18-6)              | README, docs Try it                             |
| `r27.md`            | The R27 disclosure (S18-10)                     | README, docs Trust and security, docs Contracts |

Docs pages import fragments (MDX import). README and SECURITY.md hold copies between `<!-- fragment:<name>:start -->` and `<!-- fragment:<name>:end -->`. `npm run check:fragments` (`scripts/check-fragments.mjs`) fails if a copy differs from its fragment after removing Markdown link syntax (link text kept, URL dropped) and normalising whitespace. 02's `static` job runs it.

**S18-2. Real, simulated and not built.** This table goes into the README and the docs site unchanged (PRD 3). The words "section 12" and "section 18" stay as written; they may be links to the docs Try it page (demo controls) and the Roadmap page.

| Piece                                                    | State                 | Detail                                                                                          |
| -------------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------- |
| Envelope rules (split, weekly release, locks, limits)    | Real                  | A contract on Monad testnet holds the AUSD and enforces every rule.                             |
| Card decision (approve, decline, which envelope)         | Real                  | Decided by the contract in one transaction. The server cannot spend locked or unreleased money. |
| Trusted-person approval                                  | Real                  | A second passkey account signs a transaction.                                                   |
| Passkey accounts                                         | Real                  | Mera derives a normal account from the passkey. No password, no seed phrase.                    |
| AUSD                                                     | Real testnet token    | From the Agora faucet: 10.000 AUSD per request, once a minute.                                  |
| Rupiah payment                                           | Simulated             | Midtrans sandbox. No real rupiah moves.                                                         |
| Rupiah to dollar conversion                              | Simulated             | A treasury wallet holds test AUSD and pays out at a fixed sample rate.                          |
| Card and shop                                            | Simulated             | A checkout screen stands in for the shop's card machine. No card network.                       |
| Alerts to the parent                                     | In-app only           | Shown when the parent opens the app. No push notification.                                      |
| Time                                                     | Skippable in the demo | See section 12. Real values are 7 days and 48 hours.                                            |
| Real card issuer, real rupiah, identity checks, cash-out | Not built             | Listed in section 18.                                                                           |

If day-one checks changed a fact in this table (PRD 17, for example the faucet amount), the PRD is updated first and the fragment follows it; the fragment never drifts from the PRD on its own.

### Wording rules

**S18-3. Rules (PRD 13).** These apply to README, SECURITY.md, every docs page, and (through 20) the video scripts and portal text.

| Topic                      | Rule                                                                                                                                                                                                                                                       | Checked by                                                                                                                                                                                     |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The crypto-free experience | Stated once per document (once in README, once on the whole docs site, on the "How Amplop differs" page), as a design principle, using the text in S18-4. Marked with `<!-- principle:crypto-free -->` right before it.                                    | `check:wording`: the marker appears exactly once in README and exactly once across `apps/docs/src/content/docs/**`                                                                             |
| Innovation                 | Never call it an innovation. The stem "innovat" never appears.                                                                                                                                                                                             | `check:wording`                                                                                                                                                                                |
| Companies                  | Never compare Amplop with another company or product. The eight cards reviewed are named only in the footnote of the "How Amplop differs" page (S18-15).                                                                                                   | `check:wording`: each name in `apps/docs/src/fragments/reviewed-cards.txt` (matched case-sensitive, as a whole word) appears only inside that footnote; manual review for any other comparison |
| What is new                | Lead with the five points in S18-5, in that order, where Amplop's value is described (README "What is new", docs Overview, docs "How Amplop differs").                                                                                                     | `check:wording`: the five lines appear in README                                                                                                                                               |
| The "what is new" claim    | Docs site only, exactly: "We reviewed eight stablecoin cards launched or announced by October 2026. On their public pages, none offered purpose envelopes, timed release, or a second person who can approve." The eight names and links go in a footnote. | `check:wording`: the exact sentence appears exactly once, on that page, and nowhere else (not in README, SECURITY.md or 20's texts)                                                            |
| Privacy                    | Say "the parent sees totals, not shops". Never say "private" or "privacy". The technical term "private key" (and variable names such as `TREASURY_PRIVATE_KEY`) is allowed.                                                                                | `check:wording`: the phrase appears in README and on the docs Overview; `/\bprivate\b(?!\s+keys?\b)/i` and `/\bprivacy\b/i` match nothing outside code spans and code blocks                   |
| The self-audit             | Say "self-reviewed, findings published". Never "audited".                                                                                                                                                                                                  | `check:wording`: README contains "self-reviewed, findings published"; `/audited/i` matches nothing, so "unaudited" and "not audited" are out too (say "no external audit" instead)             |

`npm run check:wording` (`scripts/check-wording.mjs`) runs these checks over `README.md`, `SECURITY.md`, `CONTRIBUTING.md`, `apps/docs/src/content/docs/**`, `apps/docs/src/fragments/**` and `submission/**` (20). It prints file, line and rule for every hit. 02's `static` job runs it.

`reviewed-cards.txt` holds the eight names from the research report "Crypto cards tweet vs Amplop 2", one per line, exactly as in S18-15: MoneyGram Card, Phemex Card, Solid, Bix, Moto, Nu Global, vPay, Stealf.

**S18-4. Design principle text.** Use this text as written (README and the docs "How Amplop differs" page):

> **No new vocabulary.** Parents and students should not need new words to send or spend an allowance. So sign-in is a passkey, with no recovery phrase. The user never sees or pays a network fee. There is no wallet prompt. The token's name appears only in the small detail panel beside a transaction proof.

**S18-5. What is new.** The five points, in this order and wording:

1. Money split into envelopes on arrival.
2. Weekly release.
3. The contract itself deciding each card payment.
4. A trusted person who can open Emergency but cannot block it.
5. A parent who sees totals, not shops.

### README

**S18-6. README sections.** `README.md` at the root has these sections, in this order. Every PRD 13 README item is covered (column 3).

| #   | Heading                                | PRD 13 item                         | Content                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | -------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `# Amplop`                             | What it is in three sentences       | Exactly three sentences: "Amplop is an allowance wallet for Indonesian students studying far from home. A parent pays rupiah once; the money arrives as digital dollars (AUSD on Monad testnet), splits into five envelopes, and is released one weekly share at a time. A card pays from the envelope that matches the kind of shop, and the Emergency envelope opens when a trusted person approves, or by itself after 48 hours." |
| 2   | Live links                             | Live links                          | App (`NEXT_PUBLIC_SITE_URL`), docs, try-it guide, demo video, pitch video, contract on the explorer.                                                                                                                                                                                                                                                                                                                                 |
| 3   | What is new                            | (wording rule)                      | The five points in S18-5.                                                                                                                                                                                                                                                                                                                                                                                                            |
| 4   | Design principle                       | (wording rule)                      | S18-4, once, with its marker.                                                                                                                                                                                                                                                                                                                                                                                                        |
| 5   | What is real, simulated, and not built | Real / simulated table              | Fragment `real-simulated` (S18-2).                                                                                                                                                                                                                                                                                                                                                                                                   |
| 6   | Time in the demo                       | (PRD 12)                            | Fragment `demo-time`: "Real values are 7 days between shares, 48 hours for every wait, 7 days for a hold; the demo deployment keeps those values and adds a skip." Plus one line naming the four demo controls and that they do not exist in a real deployment.                                                                                                                                                                      |
| 7   | Contract addresses                     | Contract addresses                  | Table (S18-7).                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 8   | Architecture and tech stack            | Architecture and tech stack         | The architecture diagram (S18-12) and the PRD 6 table (Piece, Built with, Job). One line each on: the three server keys and what each can do (R3); fees are sponsored in this version and a relayer replaces the top-up for a real launch (PRD 9); the indexer is not needed for balances, totals, schedule, Emergency or card results (PRD 11). Link to docs Architecture.                                                          |
| 9   | What the chain shows                   | (R27)                               | Fragment `r27`, and "the parent sees totals, not shops".                                                                                                                                                                                                                                                                                                                                                                             |
| 10  | Repository layout                      | Four folders                        | `apps/web`, `apps/docs`, `contracts`, `indexer` (plus `packages/shared`, `audits`, `deployments`), one line each.                                                                                                                                                                                                                                                                                                                    |
| 11  | Set-up                                 | Set-up steps                        | S18-8.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 12  | Tests                                  | Tests, with the command to run them | S18-9.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 13  | Security                               | (PRD 15)                            | "Self-reviewed, findings published." Links to `audits/2026-10-self-review.md` and `SECURITY.md`. One line: the gates in PRD 15 run on every push and production deploys only from green commits.                                                                                                                                                                                                                                     |
| 14  | AI tools used                          | AI-tool disclosure                  | S18-11.                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 15  | Attribution                            | Attribution                         | S18-11.                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 16  | Licence                                | MIT licence                         | "MIT. See LICENSE."                                                                                                                                                                                                                                                                                                                                                                                                                  |

The README never names any of the eight reviewed cards, never uses the claim sentence, and contains no "innovation", "private" (as a claim), "privacy" or "audited".

**S18-7. Contract addresses table.** Values come from `deployments/monad-testnet.json` (04). Network: Monad testnet, chain 10143.

| Name                                        | Shows                                                                      |
| ------------------------------------------- | -------------------------------------------------------------------------- |
| `AmplopEnvelopes`                           | Address, explorer link to the verified source, deploy block, deploy commit |
| AUSD (testnet)                              | Address, explorer link, decimals as read by `decimals()`                   |
| Settlement wallet                           | Address                                                                    |
| Treasury, Card service, Fee sponsor wallets | Addresses (three different wallets by submission, PRD 6)                   |

A test (`scripts/check-readme-addresses.mjs`, in `static`) fails if any address in the README differs from `deployments/monad-testnet.json`.

**S18-8. Set-up steps.** Numbered, copy-paste ready, tested on a clean machine on Mon 12 Oct. Commands are the root scripts in 01 §9 and 02 S02-9.

1. Install Node 22 (version in `.nvmrc`), Foundry (version in `tools/versions.env`), Docker, and gitleaks.
2. Clone, then `npm ci` (this also installs the git hooks).
3. `cp .env.example apps/web/.env.local`.
4. Start Postgres and run migrations: `npm run db:up`, then `npm run db:migrate` (05).
5. Start Anvil and deploy the contract in demo mode with the stand-in AUSD: `npm run chain:up` in one terminal, then `npm run deploy:local` (04); it writes `deployments/anvil.json`.
6. Start the indexer against Anvil: `npx envio --config config.e2e.yaml dev` in `indexer/` (16).
7. Start the app: `npm run dev -w apps/web`; open `http://localhost:3000`.
8. Optional: the docs site with `npm run dev -w apps/docs`.
9. Optional: install the pinned AI skills with `scripts/install-ai-skills.sh` (02).

**S18-9. Tests section.** A table of commands with what each proves:

| Command                      | Runs                                                    |
| ---------------------------- | ------------------------------------------------------- |
| `npm run test`               | Unit and server tests (Vitest)                          |
| `npm run test:coverage`      | Same, with the 85% floor on server logic                |
| `npm run test:contracts`     | Foundry tests, one per rule (R1 to R24)                 |
| `npm run test:contracts:ci`  | Same, with fuzz at 10,000 runs and the invariant tests  |
| `npm run coverage:contracts` | Contract coverage, floors 95% lines and 90% branches    |
| `npm run analyze:contracts`  | Slither and Aderyn                                      |
| `npm run test:e2e`           | Every automated end-to-end case on the local stack (19) |
| `npm run e2e:tier1:ci`       | The 40 Tier 1 end-to-end cases on a local chain         |
| `npm run gates`              | Every local gate in order                               |

Plus one paragraph: 140 end-to-end cases in three tiers (40 automated before recording, 65 automated or run by hand on Mon 12 Oct, 35 by hand); the case map is in `specs/19-e2e-harness.md`; hand-run results are in `apps/web/e2e/manual/`.

**S18-10. R27 disclosure.** Fragment `r27.md`, text:

> Shop names are kept on the server and shown only to the student. The chain records the envelope, the amount, the time and the kind of shop. Anyone who looks up the contract can see those. The same data is served by the public indexer.

**S18-11. AI-tool disclosure and attribution.**

AI tools used (README section 14) states:

- Which tools: Claude Code (Anthropic) as the coding agent, and Claude for drafting the PRD and specs, with the model names used.
- What for: specs, application and contract code, tests, documentation, and the first pass of the self-review.
- Pinned skills: MONSKILLS at commit `3f8efd2` (plugin 0.7.2) and pashov/skills at commit `92b0ea6`, not updated during the freeze.
- How output was checked: every commit passed the same gates as hand-written code (PRD 15); an AI-reported finding counted only after a failing test proved it or it was marked a false positive with a reason (PRD 15 self-audit step 4); the two-phone script was run by hand.
- That the builder reviewed and is responsible for all code in the repository.

Attribution (README section 15) names what Amplop is built with, as credit, never as comparison: Mera (`@category-labs/mera`), AUSD by Agora, Envio HyperIndex, Midtrans sandbox, OpenZeppelin Contracts, Foundry, Next.js, React, Tailwind CSS, shadcn/ui, viem, wagmi CLI, Astro Starlight, Playwright, Plus Jakarta Sans and Archivo (SIL Open Font License), MONSKILLS, pashov/skills. Each with a link and its licence.

### Docs site

**S18-12. Site set-up.** `apps/docs`, Astro Starlight (exact versions, per 02):

- `title: "Amplop docs"`, logo from `design/logo/svg/amplop-logo.svg` (light) and `amplop-logo-on-dark.svg` (dark), favicon from `design/logo/web/favicon.svg`.
- Theme A accents: ink `#111B33`, ground `#F2F3EE`, link `#2A5CA6`; body font Plus Jakarta Sans (self-hosted through a pinned `@fontsource-variable` package).
- `social`: link to the repository. `editLink` to the repository. `lastUpdated: true`. Built-in search (Pagefind).
- `starlight-links-validator` plugin (exact version) so `astro build` fails on a broken internal link.
- Architecture diagram as a hand-made SVG in `apps/docs/src/assets/architecture.svg` (also used by the README), showing the five pieces (Web app, Server, Contract, Indexer, Docs site) and these seven connections, labelled: Web app → Contract (user transactions and reads); Web app → Server (API); Server → Contract (Treasury deposits, Card service decisions); Server → passkey accounts (Fee sponsor sends test MON); Midtrans → Server (payment notifications); Contract → Indexer (events); Indexer → Web app (activity and alerts). Text in the SVG is real text, readable in light and dark mode.
- Deployed by 02's `deploy-production` job to the `amplop-docs` Vercel project; its address is `NEXT_PUBLIC_DOCS_URL`. The address must not contain the words banned on the landing page (17), because the landing page links to it.

**S18-13. Pages and sidebar order.** Files in `apps/docs/src/content/docs/`:

| #   | Page (file)                                   | PRD 13 topic                        | Must contain                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --- | --------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Overview (`index.mdx`)                        | (entry)                             | Three-sentence summary (same as README); the five points (S18-5); "the parent sees totals, not shops"; fragment `real-simulated`; links to Try it and the live app.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 2   | Try it (`try-it.mdx`)                         | Try-it guide                        | S18-14.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 3   | User guide (`user-guide.mdx`)                 | User guide                          | For the student: create a passkey, set envelopes and what the percentages mean (R4), weekly shares (R5–R8), which envelope pays (R9–R11, the MCC table from 01 §3 in plain words), declines (R10, R12), holds and collection (R13), moving a purchase (R15), asking for Emergency (R16–R19), Settings: split change after 48 hours (R21), Emergency lock off (R20), invite and replace the trusted person (R22), recovery (R23), cancelling a pending change (R24). For the parent: accepting the invite, sending an allowance in rupiah (limits Rp100.000 to Rp50.000.000, sample rate), what you see (R25) and the alerts (R26), approving Emergency, approving a recovery. Uses Raka and Mama. |
| 4   | Architecture (`architecture.mdx`)             | Architecture                        | The diagram; the PRD 6 table; how people sign their own transactions; the three server keys and what each can and cannot do (R3, 01 §3 "Gap filled"); reserve balance note (each wallet above 10 MON plus its daily budget); fees sponsored in this version, a relayer for a real launch (PRD 9); the indexer and what does not depend on it (PRD 11, spec 16 S16-14), with the Envio screenshot (16 S16-19); demo controls and how Skip time works through the account clock (PRD 12); the two Monad points from PRD 6 (a card decision is one transaction final in about a second; every money screen links to its transaction).                                                                |
| 5   | Contracts (`contracts.mdx`)                   | Contracts                           | Address table (same as S18-7); constructor and roles; every function with caller and rule number (01 §3 writes and reads); every event; enums; the six always-true statements (PRD 7); weeks and the account clock (PRD 7 "Details to get right"); EIP-712 invite binding; decimals read at deploy; fragment `r27`; link to the verified source and the self-review report.                                                                                                                                                                                                                                                                                                                       |
| 6   | API (`api.mdx`)                               | API                                 | Base path, error shape and status codes (01 §4); auth kinds; the signed request format and replay rules; every endpoint in 01 §4 with method, path, auth, action name, request and response; rate limits; the Midtrans webhook check (SHA-512 signature, then status fetch, deposit once per order).                                                                                                                                                                                                                                                                                                                                                                                              |
| 7   | Issuer integration (`issuer-integration.mdx`) | Issuer integration                  | The authorisation message (card token, amount, currency, merchant name, merchant city, merchant category code) and how it maps to `POST /api/card/authorize`; what a real issuer changes: its HMAC replaces the owner signature (PRD 15), its clearing calls `collect`, reversals call `releaseHold`, refunds call `refund`; the 7-day hold (R13); decline reasons; MCC to envelope table; currency conversion at the sample rate (R14); that swapping in a real issuer is a server change only (PRD 8).                                                                                                                                                                                          |
| 8   | Trust and security (`trust-and-security.mdx`) | Trust and security                  | Summary of SECURITY.md: fragment `threats`, fragment `accepted-risks`, link to the self-review report ("self-reviewed, findings published"), link to SECURITY.md and how to report; what the server keys can and cannot do; fragment `r27`; fees sponsored, relayer later; testnet only.                                                                                                                                                                                                                                                                                                                                                                                                          |
| 9   | How Amplop differs (`how-amplop-differs.mdx`) | How Amplop differs from other cards | S18-15.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 10  | Roadmap (`roadmap.mdx`)                       | Roadmap                             | S18-17.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

Two checks run in 02's `static` job:

- `scripts/check-docs-contract.mjs`: every function and event name in `packages/shared/abi/AmplopEnvelopes.json` appears on `contracts.mdx`.
- `scripts/check-docs-api.mjs`: every `route.ts` under `apps/web/src/app/api/` maps to a method and path that appears on `api.mdx`, and every endpoint on the page has a route file.

**S18-14. Try it (judge guide).** One page, phone first, eight numbered steps that follow the 3-minute video, using View as Mama so one person finishes alone in under 5 minutes. Open with: the app address as a link and a QR code, "Use your phone's normal browser (Chrome on Android, Safari on iPhone). Takes about 5 minutes." Steps:

1. Open the app and tap **Open the app**. Create a passkey and type the name Raka.
2. Keep the five envelopes as they are (Food 40%, Transport 15%, Study 15%, Everyday 20%, Emergency 10%) and continue.
3. Invite Mama: type her name and create the link. Then tap **View as Mama**: the app makes Mama's own passkey and accepts the invite as her.
4. As Mama, tap **Send allowance**, enter Rp16.500.000, and tap **Simulate payment**. You see Allowance sent, with its transaction proof.
5. Tap **View as Raka**. The allowance has arrived as $1.000,00, already split; this week's shares are available now.
6. Open **Card**. Pay at the Supermarket: approved from Food in about a second. Then try the Gambling site: declined. Tap **View as Mama**: her alert shows the category, never the shop.
7. As Raka, open **Settings** and tap **Skip to next Monday**. The next weekly share is released.
8. Open **Emergency**, ask for $70,00 and write a reason. Tap **View as Mama** and **Approve with passkey**. Back as Raka, the $70,00 is in Everyday.

Then: "Every step above wrote to Monad testnet; each money screen has a View transaction proof link." Then fragment `demo-time`, and the demo controls table from PRD 12. Then: "If your phone cannot keep two passkeys for this site apart, use two browsers, or two phones, one for Raka and one for Mama" (PRD 17 fallback; keep this line only if the day-one check failed).

Button names must match the built app. On Mon 12 Oct the builder follows the guide on a real phone with a timer, fixes any step that does not match, and records the time in `apps/web/e2e/manual/try-it-run.md`. The same eight steps go into the portal's judge access field (20).

**S18-15. How Amplop differs.** In this order:

1. The five points (S18-5), each with one or two sentences on how it works.
2. The design principle (S18-4), with its marker. This is the only place on the docs site where it is stated.
3. The claim, exactly: "We reviewed eight stablecoin cards launched or announced by October 2026. On their public pages, none offered purpose envelopes, timed release, or a second person who can approve." followed by a footnote marker.
4. The footnote, between `<!-- footnote:reviewed-cards:start -->` and `<!-- footnote:reviewed-cards:end -->`: the eight names in this order, each linked to the public page that was reviewed, then one line: "Reviewed from their public pages only; the apps themselves were not opened."

| Card           | Public page reviewed                                                                                                                                                  |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MoneyGram Card | https://x.com/MoneyGram/status/2098088301571838050                                                                                                                    |
| Phemex Card    | https://phemex.com/help-center/how-to-make-payments-with-phemex-card                                                                                                  |
| Solid          | https://support.solid.xyz/en/articles/13185531-what-is-the-solid-card                                                                                                 |
| Bix            | https://www.theblock.co/press-releases/bix-card-targets-us-growth-as-demand-for-crypto-enabled-payments-accelerates-416375                                            |
| Moto           | https://www.moto-card.com/legals/terms-and-conditions                                                                                                                 |
| Nu Global      | https://www.businesswire.com/news/home/20260910943114/en/Nu-Takes-Next-Step-in-International-Expansion-With-Launch-in-the-United-States-and-introduction-of-Nu-Global |
| vPay           | https://x.com/vPay_Global/status/2100142646123725199                                                                                                                  |
| Stealf         | https://www.stealf.xyz/terms                                                                                                                                          |

Stealf has announced a card but has none yet; "launched or announced by October 2026" covers it, so it stays in the list without a note.

No other company or product is named or compared on this page or elsewhere on the site.

**S18-16. Monad and crypto words in docs.** Unlike the landing page, the README and docs may say Monad, testnet, AUSD, contract and transaction, because they explain how it works. They still follow S18-3.

**S18-17. Roadmap.** Undated. Heading "Later". Intro: "None of this is built for this preview." Then the PRD 18 list as written:

- An external audit or audit contest of the contract before any real money.
- A real card through a licensed issuer, using the same authorisation message.
- Real rupiah in and a licensed conversion partner; IDRX if it reaches Monad.
- A relayer in place of the fee top-up, so accounts never hold MON.
- Push notifications for the trusted person.
- More than one trusted person, and a separate role for someone who only sends money.
- A parent with several children.
- Envelopes the student names, and more or fewer than five.
- A release rhythm other than four weekly shares.
- Identity checks and spending limits required by regulation.
- Sending leftover money back, and cash-out.
- Purchase amounts hidden on the chain.

### SECURITY.md

**S18-18. Sections**, in this order:

| #   | Heading                      | Content                                                                                                                                                                                                                      |
| --- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Status                       | Testnet only, sandbox payments; the contract address (from `deployments/monad-testnet.json`); "self-reviewed, findings published".                                                                                           |
| 2   | Reporting a problem          | S18-19.                                                                                                                                                                                                                      |
| 3   | Threats and the required fix | S18-21.                                                                                                                                                                                                                      |
| 4   | Contract self-review         | Link to `audits/2026-10-self-review.md`; the commit reviewed; counts of findings by severity and status; "no high or medium finding is open".                                                                                |
| 5   | Server and app review        | Result of the Mon 12 Oct security review pass (PRD 15 "Before submission" step 1): who or what reviewed (second person or Claude Code `/security-review`), date, each finding fixed (with commit) or accepted (with reason). |
| 6   | Accepted risks               | S18-22.                                                                                                                                                                                                                      |
| 7   | Accepted analysis findings   | Every entry of `audits/accepted-findings.json` (02 S02-16) as a row: tool, detector, location, reason. 02's check fails if one is missing here.                                                                              |
| 8   | Gates                        | One line per PRD 15 gate row, and that production deploys only from green commits. Link to the CI workflow.                                                                                                                  |
| 9   | Supported versions           | Only the latest commit on `main` and its testnet deployment.                                                                                                                                                                 |

**S18-19. Reporting.** "Use GitHub's private vulnerability reporting: open the repository's Security tab and choose Report a vulnerability." (02 S02-12 turns it on.) Ask for: what you found, steps to reproduce, the transaction or request if any. "We reply within 72 hours, best effort. There is no bounty. Everything runs on testnet, so please do not try to take test money from other people's accounts; a description is enough." Do not put a personal email address in the file.

**S18-20. Wording.** SECURITY.md follows S18-3. It may use "private key" and "private vulnerability reporting" (GitHub's feature name), which the check allows by adding `private vulnerability reporting` to its allowed phrases. The PRD threat table, copied unchanged, contains the cell "Private text, profile, card"; that exact cell is also an allowed phrase, only inside the `threats` fragment and its copies. Everywhere else, say "server-held text" (names, reasons, shop names) instead of "private text".

**S18-21. Threat table.** Fragment `threats.md`: the PRD 15 table "Threats and the required fix" with its three columns copied unchanged (all 15 rows), plus a fourth column "Proof" naming the test or check that shows the fix holds (for example, "05 server test: card authorise without signature refused before any chain call"). The fourth column is filled from 05 and 03 once their tests exist.

**S18-22. Accepted risks.** Fragment `accepted-risks.md`, unchanged from PRD 15:

- Testnet only; no real money moves.
- Purchase amounts are public on the chain (R27).
- Someone with many addresses can still get some test MON, within the caps.
- One deployer address sets the contract up.
- No external audit; the contract has a self-audit only. A launch with real money needs an external audit first.

Any risk accepted later (from the self-review or the Mon 12 Oct pass) is added below these five, never by editing them.

## Interfaces used

- 01 §3 contract interface and §4 API (docs Contracts and API pages).
- 02: `static` job, `audits/accepted-findings.json`, scripts, `deploy-production`.
- 03: function and test names. 04: `deployments/monad-testnet.json`, self-review report, accepted findings. 05: threat proofs, local database commands.
- 16: indexer write-up and screenshot. 17: landing page links to the docs address. 20: reuses Try it steps and runs `check:wording` on `submission/`.

## Screens

None in the app. Docs site pages as in S18-13.

## Errors and edge cases

| Case                                             | Behaviour                                                                                                                                                          |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Contract redeployed                              | README, docs Contracts page and SECURITY.md addresses update in the same commit as `deployments/monad-testnet.json`; `check-readme-addresses` fails until they do. |
| A day-one fact changes (faucet amount, decimals) | Update the PRD first, then the fragment; `check:fragments` keeps copies in line.                                                                                   |
| A feature is cut (PRD 16 cut order)              | User guide and Try it remove the cut feature in the same commit; the README real/simulated table does not change (it has no cut-dependent rows).                   |
| A docs link breaks                               | `astro build` fails (links validator).                                                                                                                             |

## Security

- No secrets, keys or real personal data in any document. Addresses are public.
- SECURITY.md routes reports through GitHub's private reporting, not a public issue.
- R27 is disclosed plainly in README, docs Trust and security, and docs Contracts.

## Tests

| Test                                                  | Expected                                                                                                                                                            |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check:wording`                               | Passes on all files in scope. Fails on a planted "innovative", "audited", "private data", a reviewed-card name outside the footnote, or a second copy of the claim. |
| `npm run check:fragments`                             | README and SECURITY.md copies equal the fragments.                                                                                                                  |
| `check-readme-addresses`                              | README addresses equal `deployments/monad-testnet.json`.                                                                                                            |
| `check-docs-contract`, `check-docs-api`               | Every ABI function and event, and every API route, is documented.                                                                                                   |
| `astro build` with the links validator                | Passes (in 02's `build` job).                                                                                                                                       |
| Set-up steps on a clean machine (by hand, Mon 12 Oct) | A fresh clone reaches a running local app by following S18-8 only.                                                                                                  |
| Try it on a real phone (by hand, Mon 12 Oct)          | All eight steps work as written in under 5 minutes; time recorded.                                                                                                  |

End-to-end case IDs: none owned here.

## Acceptance checklist

- [ ] README has all 16 sections in S18-6, including three sentences, live links, contract addresses, set-up steps, architecture and tech stack, the unchanged real/simulated table, tests with commands, attribution, AI-tool disclosure.
- [ ] README says "self-reviewed, findings published" and never "audited".
- [ ] Docs site has all ten pages in S18-13, building with no broken links.
- [ ] Try it has eight steps matching the video, uses View as Mama, and was timed under 5 minutes on a phone.
- [ ] Roadmap lists PRD 18 unchanged and undated.
- [ ] The crypto-free principle appears once in README and once on the docs site.
- [ ] The claim sentence appears once, on "How Amplop differs", with the footnote of eight names; no company is named elsewhere.
- [ ] "the parent sees totals, not shops" appears; "private" (as a claim), "privacy", "innovation" and "audited" do not.
- [ ] R27 disclosure appears in README and docs; fees sponsored and relayer later are stated.
- [ ] SECURITY.md has the threat table, link to the self-review, accepted risks verbatim, accepted findings, and how to report.
- [ ] `check:wording`, `check:fragments` and the docs checks run in CI and pass.

## Skills to use

- MONSKILLS `concepts` (reserve balance, block states) and `gas` for the Architecture page's facts about fees, reserve balance and finality. Check numbers against the Monad docs, not memory.
- MONSKILLS `addresses` to cross-check the AUSD address shown in the README against Agora's own docs (PRD 6).
- MONSKILLS `indexer` for how the Architecture page describes the indexer and its endpoint.

## Decisions made here

1. **Fragments with markers** keep PRD tables unchanged across README, SECURITY.md and the docs, checked by a script.
2. **"Once" means once per document**: once in README, once across the docs site. Repeating it on every page would break "state it once".
3. **"private key" is allowed** as a technical term; the ban is on privacy claims ("private", "privacy").
4. **The wording check covers `submission/`**, so 20's portal and video texts follow the same rules.
5. **An Overview page** is added as the docs home; PRD 13's nine topics are pages 2 to 10.
6. **A "Proof" column** is added to the threat table in SECURITY.md; the three PRD columns stay unchanged.
7. **No personal email** in SECURITY.md; reports go through GitHub private reporting.
8. **The README's three sentences** are taken from PRD 1, adjusted only to fit three sentences.
9. **Try it step 3 follows the built app:** Raka taps **Copy invite link**, pastes it into the same browser and taps **Accept and create a passkey**. View as switches only between profiles that already exist on the phone (15 S15-6), so it cannot create Mama's passkey. Steps 5, 6 and 8 name the built controls ("Demo only: view as Raka", Settings **Switch**, the approval link on Mama's home).
10. **Live links that do not exist yet say so.** The app and docs addresses come from the first Vercel production deploy, and the two videos from 20; the README names where each comes from instead of a guessed address. The docs site's live-app link renders from `NEXT_PUBLIC_SITE_URL` at build time.
11. **"How Amplop differs" is a `.md` page,** because MDX does not allow the HTML-comment markers S18-3 and S18-15 use.
12. **The docs site's packages are devDependencies** (the site is static), and it pins `cookie@2.0.1` so Astro's prerenderer does not pick up the older copy hoisted for Lighthouse CI's Express.
13. **The fee sponsor's address is in `deployments/monad-testnet.json`** (`feeSponsor`), so the README address check covers all six addresses from one record.
14. **Explorer links use MonadVision** (`testnet.monadvision.com`), one of the two testnet explorers in Monad's docs; the contract is verified on Sourcify, which MonadVision reads.
15. **SECURITY.md's server and app review section is pending** until the Mon 12 Oct review pass is run; the accepted risks found in the self-review are listed below the five PRD ones, as S18-22 allows.

## Additions to 01 (status)

1. §2 layout: `apps/docs/src/fragments/` and `submission/`: Merged into 01 (section 2).
2. Root scripts the README's set-up names (`db:up`, `db:migrate`, `chain:up`, `deploy:local`, `test`, `test:e2e`, `check:wording`, `check:fragments`): Merged into 01 (section 9); S18-8 and S18-9 use them.
