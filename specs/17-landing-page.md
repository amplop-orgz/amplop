# 17. Landing page

Status: Ready · Source: PRD sections 1, 2, 5 (board 0.0), 13, 14 (L1, L3) · Depends on: 01, 02, 06 · Mock-up: `design/boards/Landing.dc.html`

## Goal

Board 0.0 at `/`: the page a judge or a parent opens first, on a phone. It explains Amplop in plain words, sends people to `/app`, and never mentions crypto, blockchain, the hackathon or Monad. It is fast, works at phone width, and has proper meta, social card and icons.

## In scope

- The `/` route in `apps/web`, every section and every line of copy from `Landing.dc.html`.
- Header with the Kiriman logo, menu links that scroll to sections, "Open the app" to `/app`.
- The footer line saying it is a preview in test mode (PRD 2).
- Responsive layout, performance budget, accessibility basics.
- Page metadata, Open Graph image, robots and sitemap, the favicon set from `design/logo/web`.
- E2E cases L1 and L3.

## Out of scope

- The app under `/app`, its manifest and service worker (06). This spec only adds the icon files that both share.
- Bahasa Indonesia for this page (see Decisions).
- The demo video itself (20) and the docs site (18). This page only links to them.

## Requirements

### Route and structure

**S17-1. Route.** `apps/web/src/app/(marketing)/page.tsx`, a server component with no `"use client"` in the page or its sections. The page ships no page-specific client JavaScript. It reads nothing from the contract, server or indexer (PRD 5: reads nothing, writes nothing). It shows no demo banner.

**S17-2. Sections, in order.** Copy is exact, including punctuation, the comma decimal separator, and "can't". Do not add, drop or reword anything except where S17-8 says.

| #   | Section        | `id`   | Background                                           | Content                                                                                                                 |
| --- | -------------- | ------ | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 1   | Header         | none   | ground `#F2F3EE`                                     | Logo link (S17-3); menu (S17-4)                                                                                         |
| 2   | Hero           | none   | ground                                               | H1, intro, two links (table below)                                                                                      |
| 3   | Envelope fan   | none   | ground                                               | Five tilted envelope cards (table below); `aria-label="Five envelopes: Food, Transport, Study, Everyday and Emergency"` |
| 4   | Weekly release | none   | ground, `3px` ink top border                         | H2, paragraph, four date tiles                                                                                          |
| 5   | Card           | none   | ink `#111B33`, white text                            | H2, paragraph, five shop rows                                                                                           |
| 6   | Emergency      | `safe` | Emergency red `#B5302A`, white text, guilloche lines | H2, paragraph, tilted approval card                                                                                     |
| 7   | Parent view    | none   | ground                                               | H2, two paragraphs, five total rows                                                                                     |
| 8   | How it works   | `how`  | ground                                               | H2, three numbered steps                                                                                                |
| 9   | Questions      | `faq`  | ground                                               | H2, six questions and answers                                                                                           |
| 10  | Final call     | none   | Food green `#2B7A4B`, white text, guilloche lines    | H2, "Open the app", QR code with caption                                                                                |
| 11  | Footer         | none   | ground, muted text                                   | Licence line, Docs and Source code links, preview line                                                                  |

Copy by section:

| Section        | Element                            | Text                                                                                                                                                                                                                                 |
| -------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Hero           | H1                                 | Allowance that lasts the whole month.                                                                                                                                                                                                |
| Hero           | Intro                              | Parents send rupiah once. It arrives split into envelopes, and each envelope opens one week at a time.                                                                                                                               |
| Hero           | Primary link                       | Open the app → `/app`                                                                                                                                                                                                                |
| Hero           | Text link                          | Watch the demo → `NEXT_PUBLIC_DEMO_VIDEO_URL` (opens in a new tab, `rel="noopener noreferrer"`)                                                                                                                                      |
| Envelope fan   | Cards (name, amount, line)         | Food, $400, $100 every Monday · Transport, $150, $37,50 every Monday · Study, $150, $37,50 every Monday · Everyday, $200, $50 every Monday · Emergency, $100, Locked                                                                 |
| Weekly release | H2                                 | Four Mondays, four shares.                                                                                                                                                                                                           |
| Weekly release | Paragraph                          | An envelope never hands over the whole month. Food releases $100 on arrival and $100 on each of the next three Mondays, so week four is funded before week one begins.                                                               |
| Weekly release | Tiles (date, amount, state)        | Mon, 28 Sep, $100, Released on arrival · Mon, 5 Oct, $100, Released · Mon, 12 Oct, $100, Opens on Monday · Mon, 19 Oct, $100, Opens in two weeks. First two tiles filled Food green; last two dashed outline.                        |
| Card           | H2                                 | The card knows which envelope pays.                                                                                                                                                                                                  |
| Card           | Paragraph                          | You never choose at the till. The kind of shop decides, and if that envelope is short, Everyday pays instead.                                                                                                                        |
| Card           | Rows (shop, pill)                  | Supermarket, Food pays · Tram and train, Transport pays · Bookshop, Study pays · Cinema, Everyday pays · Gambling site, Declined. Pill colours: Food, Transport, Study, Everyday, Emergency red for Declined.                        |
| Emergency      | H2                                 | Emergency needs a second yes.                                                                                                                                                                                                        |
| Emergency      | Paragraph                          | The Emergency envelope stays shut until a trusted person approves with a fingerprint or face. If they can't answer, it opens by itself after 48 hours.                                                                               |
| Emergency      | Card                               | Raka asks to open Emergency · $70,00 · Laptop broke, needs repair before next week's exams. · Approve with passkey · Opens by itself on Fri, 9 Oct at 14:05                                                                          |
| Parent view    | H2                                 | Mama sees totals, not receipts.                                                                                                                                                                                                      |
| Parent view    | Paragraph 1                        | Parents pay in rupiah by bank transfer and see what is left in each envelope. Where the money was spent stays with the student.                                                                                                      |
| Parent view    | Paragraph 2                        | They see an alert in the app when an envelope runs low, a blocked purchase is tried, or Emergency is requested.                                                                                                                      |
| Parent view    | Rows (colour square, name, amount) | Food $244,61 · Transport $101,25 · Study $105,00 · Everyday $109,00 · Emergency, locked $100,00                                                                                                                                      |
| How it works   | H2                                 | From invite to first allowance in minutes.                                                                                                                                                                                           |
| How it works   | Step 1                             | 1 · Set your envelopes · Create a passkey and choose how each allowance is split.                                                                                                                                                    |
| How it works   | Step 2                             | 2 · Invite your parent · Send one link by WhatsApp. They create their own passkey.                                                                                                                                                   |
| How it works   | Step 3                             | 3 · Rupiah in, envelopes filled · They pay by bank transfer in rupiah. It arrives already split.                                                                                                                                     |
| Questions      | H2                                 | Questions people ask.                                                                                                                                                                                                                |
| Questions      | Q1                                 | Where is my money kept? · As digital dollars, held under envelope rules that are public, so anyone can check that they do what this page says.                                                                                       |
| Questions      | Q2                                 | Where does the card work? · In shops and online, wherever cards are accepted. Each payment is taken from the envelope that matches the kind of shop.                                                                                 |
| Questions      | Q3                                 | Why is my balance in dollars? · The rupiah is converted once, on the day your parent pays. After that the amount stays the same, whatever the exchange rate does.                                                                    |
| Questions      | Q4                                 | Can my parent see what I buy? · No. They see each envelope's total and alerts in the app, for example when a blocked purchase is tried. They never see the shop.                                                                     |
| Questions      | Q5                                 | What if my trusted person doesn't answer? · The Emergency envelope opens automatically 48 hours after you ask.                                                                                                                       |
| Questions      | Q6                                 | What if I lose my phone? · Your passkey is saved in your phone's password manager, so it comes back when you sign in on a new phone. If the passkey itself is lost, your trusted person can approve a new one, which takes 48 hours. |
| Final call     | H2                                 | Give the allowance a plan.                                                                                                                                                                                                           |
| Final call     | Link                               | Open the app → `/app` (white button, ink text)                                                                                                                                                                                       |
| Final call     | QR caption                         | Scan to open on your phone                                                                                                                                                                                                           |
| Footer         | Line 1                             | Amplop is open source under the MIT licence.                                                                                                                                                                                         |
| Footer         | Links                              | Docs → `NEXT_PUBLIC_DOCS_URL` · Source code → `NEXT_PUBLIC_REPO_URL`                                                                                                                                                                 |
| Footer         | Preview line                       | Preview version: payments run in test mode and the card is a demo card. Amplop is not a bank.                                                                                                                                        |

The approval card in section 6 is a picture of the approval screen, not a control: its "Approve with passkey" is a styled `<div>` (as in the mock-up), not a button or link, and the card has `aria-hidden="true"` with a visually hidden sentence before it: "Example: Raka asks Mama to open $70,00 from Emergency."

The questions are plain headings and paragraphs (always open), as in the mock-up. Each question is an `<h3>`.

**S17-3. Logo.** The header link is the Kiriman logo (mark plus name), full colour for light backgrounds, from `design/logo/svg/amplop-logo.svg`, inlined as SVG at 34 px tall (at least 96 px wide, per the logo README). The `<a>` has `href="/"` and `aria-label="Amplop home"`; the SVG has `aria-hidden="true"`. Keep the logo's clear space; never stretch or recolour it.

**S17-4. Menu (L1).** In the header, in this order: "How it works" → `#how`, "Emergency" → `#safe`, "Questions" → `#faq`, "Docs" → `NEXT_PUBLIC_DOCS_URL`, "Open the app" → `/app` (ink pill). Each item is at least 44 px tall. The three in-page links:

- are plain `<a href="#id">`, so they work with JavaScript off;
- scroll the section's top into view, under no sticky header (the header is not sticky);
- scroll smoothly through CSS `scroll-behavior: smooth` on `html`, turned off under `prefers-reduced-motion: reduce`;
- update the URL hash, so a link to `/#faq` opens at the Questions section.

**S17-5. "Open the app".** All three "Open the app" links go to `/app` with a normal navigation (Next.js `<Link>`). `/app` shows board 0.2 Welcome, or 0.1 inside a chat app's browser (06, 07).

**S17-6. QR code.** Encodes `<NEXT_PUBLIC_SITE_URL>/app`. Rendered as an inline SVG at build time on the server (132 × 132 px, white tile, 12 px radius, dark modules `#111B33`), with `role="img"` and `aria-label="QR code that opens the app"`. Shown at every width (on a phone it is still useful to show someone else). The library used to make it runs only on the server and adds nothing to the browser bundle.

**S17-7. Footer preview line (PRD 2).** Exactly one footer line says the page is a preview in test mode: "Preview version: payments run in test mode and the card is a demo card. Amplop is not a bank." No other "test mode" or "demo" notice appears on this page.

**S17-8. Copy that may change.** Only these:

- If 13's recovery screens are cut (PRD 16 cut order 1), Q6's second sentence becomes: "If the passkey itself is lost, a new one cannot be added in this preview." Nothing else changes.
- If a sample date in the weekly tiles or approval card no longer matches the demo video, leave it: they are sample data, matching the mock-up and the sample people in PRD 1.

### Words that must never appear (L3)

**S17-9. Banned words.** The words "crypto", "blockchain", "hackathon" and "Monad" (any case, also as part of a longer word, such as "cryptocurrency" or "monad-testnet") never appear in anything `/` serves or references:

- visible text and visually hidden text;
- `alt`, `title`, `aria-label` and `aria-describedby` targets;
- `<title>`, every `<meta>` (description, Open Graph, Twitter), JSON-LD if any, canonical and other `<link>` URLs;
- every `href` and `src` on the page, including the docs, repository and video URLs (so the repository and docs addresses must not contain these words, or the link is left out);
- `robots.txt`, `sitemap.xml`, the web manifest's `name`, `short_name` and `description`;
- the Open Graph image's text (S17-13).

Also absent, as a style rule from the mock-up spec: "wallet", "token", "chain", "gas", "stablecoin", "AUSD". ("digital dollars" in Q1 is allowed.)

**S17-10. Banned-word check.** `apps/web/src/app/(marketing)/banned-words.test.ts` (Vitest) renders the page to HTML and scans it, and also scans `robots.ts`, `sitemap.ts` and the manifest output, failing on any banned word from S17-9 (both lists). The same scan runs in the browser as L3 (Tests).

### Layout and look

**S17-11. Look.** Follow the mock-up: Theme A tokens (ground `#F2F3EE`, ink `#111B33`, muted `#55606E`, link `#2A5CA6`, envelope colours from `design/SPEC.md`), Plus Jakarta Sans for body (18 px base, line-height 1.5), Archivo at `font-stretch: 125%` and weight 800 for H1 and H2 with the mock-up's `clamp()` sizes. Fonts are loaded with `next/font/google` (self-hosted at build; Archivo with the `wdth` axis), so the page makes no request to Google at runtime. Guilloche lines are inline SVG with `aria-hidden="true"`. Content width max 1200 px with 32 px side padding on wide screens.

**S17-12. Responsive.** Must work at 360, 390, 768, 1280 and 1440 px wide.

- Side padding: 16 px below 480 px wide, 32 px above.
- No horizontal page scroll at any of those widths. The envelope fan (wider than a phone by design) clips inside its own section (`overflow: hidden`); `body` gets `overflow-x: clip` as a second guard.
- Two-column sections stack on phones (the mock-up's `flex-wrap` behaviour); headings come before their content.
- The header menu wraps onto a second line on phones, as in the mock-up; every item stays 44 px tall.
- Footer links are 44 px tall tap targets (the mock-up shows 24 px; this spec raises it for touch).
- Text stays readable at the phone's largest text size: no fixed-height boxes around text except the fan cards, whose text has room for 200% zoom.

### Metadata, icons and SEO

**S17-13. Metadata.** Through the Next.js `metadata` export, with `metadataBase` = `NEXT_PUBLIC_SITE_URL`:

| Tag                                                                   | Value                                                                                                  |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `<html lang>`                                                         | `en`                                                                                                   |
| `title`                                                               | Amplop: allowance that lasts the whole month                                                           |
| `description`                                                         | Parents send rupiah once. It arrives split into envelopes, and each envelope opens one week at a time. |
| canonical                                                             | `/`                                                                                                    |
| `og:type` / `og:site_name` / `og:title` / `og:description` / `og:url` | `website` / Amplop / same title / same description / `/`                                               |
| `og:image`                                                            | `/opengraph-image.png`, 1200 × 630, `og:image:alt` "Amplop: allowance that lasts the whole month"      |
| `twitter:card`                                                        | `summary_large_image` (title, description, image as above)                                             |
| `theme-color`                                                         | `#F2F3EE`                                                                                              |
| `robots`                                                              | `index, follow` for `/`                                                                                |

The Open Graph image is a static PNG at `apps/web/src/app/opengraph-image.png`, made once from the mock-up's look: ground `#F2F3EE`, the full-colour logo top left, the H1 "Allowance that lasts the whole month." in Archivo 800 expanded, and the five envelope colours as a strip of five rounded cards along the bottom. No other text.

**S17-14. Icons.** From `design/logo/web/`, using the Next.js file conventions the logo README describes:

| Source                                                  | Destination                                               |
| ------------------------------------------------------- | --------------------------------------------------------- |
| `favicon.ico`                                           | `apps/web/src/app/favicon.ico`                            |
| `favicon.svg`                                           | `apps/web/src/app/icon.svg` (keeps its dark-mode colours) |
| `apple-touch-icon.png`                                  | `apps/web/src/app/apple-icon.png`                         |
| `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` | `apps/web/public/` (used by 06's manifest)                |

The web manifest is 06's (PWA, `start_url: /app`); it uses the three PNGs above, `theme_color` and `background_color` `#F2F3EE`, and the name "Amplop".

**S17-15. Robots and sitemap.** `app/robots.ts`: allow `/`; disallow `/app`, `/invite`, `/approve`, `/recover`, `/api`. `app/sitemap.ts`: `/` only. 06 adds `noindex` to app routes.

### Performance and accessibility

**S17-16. Budget.** Measured with Lighthouse (mobile preset: Moto G-class emulation, slow 4G) on a production build:

| Metric                                    | Budget                                                                                                            |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Performance score                         | at least 90                                                                                                       |
| Accessibility, Best Practices, SEO scores | at least 95 each                                                                                                  |
| Largest Contentful Paint                  | at most 2,5 s                                                                                                     |
| Cumulative Layout Shift                   | at most 0,05                                                                                                      |
| Total Blocking Time                       | at most 200 ms                                                                                                    |
| JavaScript transferred for `/` (gzip)     | at most 120 KB (framework runtime only)                                                                           |
| Images                                    | no raster image on the page; logo, QR and guilloche are inline SVG (the Open Graph PNG is not loaded by the page) |
| Fonts                                     | at most 4 font files, `font-display: swap`, preloaded by `next/font`                                              |

`npm run lhci -w apps/web` runs Lighthouse CI (`@lhci/cli`, exact version, vetted per 02) against `next start` with `apps/web/lighthouserc.json` holding these assertions. 02's `build` job runs it on every push.

**S17-17. Accessibility.** One H1; H2 per section; H3 per question. Colour contrast at least 4.5:1 for body text (white on each envelope colour and on ink meets this; check muted `#55606E` on ground). Every link has a visible focus style. Tap targets at least 44 px tall. Decorative SVG is `aria-hidden`. The page is usable with JavaScript off.

**S17-18. Security headers.** The page is served under 05's headers and Content-Security-Policy. If 05's nonce-based CSP makes Next.js render every page on request, `/` is rendered on request too and must still meet S17-16. No inline script or style attribute that the CSP would block; styles come from the stylesheet (Tailwind classes), not from `style` attributes copied from the mock-up.

## Interfaces used

- 01 §6 routes (`/`, `/app`).
- 05: headers and CSP. 06: manifest, `noindex` on app routes, design tokens, Tailwind setup.
- Public environment variables (01 §7): `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_DOCS_URL`, `NEXT_PUBLIC_REPO_URL`, `NEXT_PUBLIC_DEMO_VIDEO_URL`.
- `design/boards/Landing.dc.html`, `design/SPEC.md`, `design/logo/`.

## Screens

Board 0.0 Landing, `/`. Desktop preview in the mock-up is 1280 × 5190; phone is 390 wide.

## Errors and edge cases

| Case                                                     | Behaviour                                                                                          |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_DEMO_VIDEO_URL` not set                     | "Watch the demo" is not rendered (no dead `#` link). The build logs a warning in development only. |
| `NEXT_PUBLIC_DOCS_URL` or `NEXT_PUBLIC_REPO_URL` not set | That link is not rendered. Production build fails if either is missing (checked in `next.config`). |
| Docs, repository or video URL contains a banned word     | S17-10 fails the build; choose another address or drop the link.                                   |
| JavaScript off or failed to load                         | Every link and anchor works; the page looks the same.                                              |
| Opened inside a chat app's browser                       | The landing page works; "Open the app" leads to board 0.1 (07).                                    |
| Reduced motion                                           | No smooth scrolling.                                                                               |

## Security

- No user data, no forms, no third-party scripts, no analytics, no embedded video player.
- External links use `rel="noopener noreferrer"`.
- Fonts are self-hosted; no runtime request to Google.
- Covered by 05's CSP and headers.

## Tests

**Unit (Vitest)**

| Test                  | Expected                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------- |
| Banned words (S17-10) | Rendered HTML, robots, sitemap and manifest contain none of the S17-9 words                 |
| Copy                  | Rendered HTML contains every string in the S17-2 copy table, in order                       |
| Anchors               | Elements with `id` `how`, `safe`, `faq` exist; the three menu links point at them           |
| Links                 | All three "Open the app" links have `href="/app"`; footer preview line appears exactly once |

**End-to-end cases** (Playwright, harness from 19, phone 390 × 844, Chromium and WebKit). Both are also part of 19's preview smoke set, so they run on every push against the Vercel preview.

| ID  | Kind   | Case                                                                          | Expected                                                 | Tier |
| --- | ------ | ----------------------------------------------------------------------------- | -------------------------------------------------------- | ---- |
| L1  | Normal | Landing page: Open the app                                                    | Goes to Welcome; the menu links scroll to their sections | 2    |
| L3  | Edge   | The words "crypto", "blockchain", "hackathon" and "Monad" on the landing page | None appear                                              | 2    |

L1 steps: open `/`; tap "How it works", check `#how` is in the viewport and the URL ends in `#how`; same for "Emergency" (`#safe`) and "Questions" (`#faq`); tap the header "Open the app" and check board 0.2 Welcome is shown at `/app`; go back and repeat with the hero and final-call buttons.

L3 steps: open `/`; collect `document.documentElement.outerHTML`, all `alt`, `title`, `aria-label` values, every `<meta>` `content`, every `href` and `src`; fetch `/robots.txt`, `/sitemap.xml` and the manifest; assert none matches `/crypto|blockchain|hackathon|monad/i`.

**Budget:** `npm run lhci -w apps/web` passes S17-16 in CI.

**By hand (Mon 12 Oct):** open `/` on the Android phone and the iPhone from the two-phone script; check no horizontal scroll, the QR code scans to `/app`, the social card renders when the link is pasted into WhatsApp.

## Acceptance checklist

- [ ] Every section and every line of copy in S17-2 is on the page, in order.
- [ ] Header shows the Kiriman logo and the five menu items; "Open the app" goes to `/app`.
- [ ] Menu links scroll to `#how`, `#safe`, `#faq` (L1 passes).
- [ ] No banned word anywhere, including alt text, meta, URLs, robots, sitemap, manifest (L3 and S17-10 pass).
- [ ] Exactly one footer line says preview and test mode.
- [ ] No horizontal scroll at 360, 390, 768, 1280, 1440 px.
- [ ] Lighthouse budget passes in CI.
- [ ] Metadata, Open Graph image and favicon set are in place; the social card shows in a WhatsApp preview.
- [ ] Page works with JavaScript off.

## Skills to use

- MONSKILLS `monskill` (routing only). No Monad-specific skill applies: the page has no chain code. Keep the scaffold gotcha (ES2020 target) from 02.
- The `frontend-design` skill, if available to the implementer, for typography and spacing checks against the mock-up.

## Decisions made here

1. **English only.** The mock-up has English copy only; the app (06) handles Bahasa Indonesia.
2. **"Bookshop: Study pays"** stays as in the mock-up. R9 makes Everyday the default for bookshops and Study after one move, "the state the card screen shows"; the landing page shows the same state.
3. **Questions are always open** (no accordion), as in the mock-up, so the page needs no client JavaScript.
4. **The approval card is a picture**, hidden from screen readers with a one-sentence text alternative, so nobody tries to tap "Approve with passkey" on the landing page.
5. **Missing optional links are hidden, not dead.** The mock-up's `#` placeholders become real URLs from environment variables.
6. **Q6 has a fallback sentence** in case recovery screens are cut.
7. **Footer links are raised to 44 px** tap targets.
8. **Budget numbers** (Lighthouse 90/95, LCP 2,5 s, CLS 0,05, TBT 200 ms, 120 KB JavaScript) are set here; the PRD gives none.
9. **Archivo ships as a static 800-weight, 125%-width instance cut to Basic Latin** (`(marketing)/fonts/archivo-expanded-800.woff2`, 6,7 KB, with its OFL licence), loaded with `next/font/local`. The Google variable font with its `wdth` axis was 91 KB and put the H1's Largest Contentful Paint at 3,0 s; the instance brings it to 2,3 s. Text keeps the mock-up's look.
10. **The script budget is 150 KB, not 120 KB.** Measured on the production build, Next.js 16 and React 19's runtime alone transfer about 145 KB gzip on `/`; the page adds no client code. Every other S17-16 number holds (Lighthouse: performance 99, accessibility, best practices and SEO 100; LCP 2,3 s; CLS 0; TBT 10 ms).
11. **The Open Graph PNG was rendered once with `next/og`** from the logo SVG and the Archivo instance, and is committed as `src/app/opengraph-image.png` with its alt text file.
12. **Link addresses are checked when `next.config` loads**: any build fails if a public link URL contains a S17-9 word, and a Vercel production build fails without the docs and source links.

## Additions to 01 (status)

1. `NEXT_PUBLIC_SITE_URL`: Merged into 01 (section 7).
2. `NEXT_PUBLIC_DOCS_URL`, `NEXT_PUBLIC_REPO_URL`, `NEXT_PUBLIC_DEMO_VIDEO_URL`: Merged into 01 (section 7). The rule that none may contain the S17-9 words stays here (S17-9, S17-10).
