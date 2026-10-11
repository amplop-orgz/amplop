# Amplop mock-up spec (Theme A: Rupiah notes)

Amplop is an allowance wallet for Indonesian students studying far from home. A parent sends rupiah; the money
(held as digital dollars) splits into envelopes, is released week by week, a demo card pays from the right
envelope, and the Emergency envelope opens only when a trusted person approves with a passkey or after 48 hours.

You are redrawing phone screens as `.dc.html` files in
`/tmp/claude-0/-home-claude/82fabd75-5304-5ebd-bf8e-90b38b00aacb/scratchpad/amplop-design/project/`.
Read `project/ThemeA.dc.html` first: it is the canonical look (home screen). Reuse its markup patterns exactly.
Existing files in `project/` show the previous layout of each screen; keep their structure, change look, data
and copy as this spec says. Overwrite files with the Write tool (Read an existing file before overwriting it).
Do NOT touch `canvas.json`, `Landing.dc.html`, `Map.dc.html`, `ThemeA/B/C.dc.html`. Do not publish anything.

## File format rules (each one fails silently if broken)
- Copy the skeleton of ThemeA.dc.html exactly: doctype, `<html lang="en">`, head with `<title>` (a few words,
  unique per screen) and the line `<script src="./support.js"></script>`, body, `<x-dc>`, `<helmet>` with the
  Google Fonts link and the small `<style>`, ONE root `<div>`, `</x-dc>`, then the
  `<script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":390,"height":844}}'>` block.
- Root is `width: 390px; height: 844px; overflow: hidden; display: flex; flex-direction: column`.
  Everything must fit: keep total content height at or under 844px. Over-full screens are the main failure.
- All styling is inline `style="..."`. Lay out with flex and `gap`. Close every non-void element, quote every
  attribute. For SVG children write explicit closing tags (`<path ...></path>`).
- Real elements: `<a href="X.dc.html">` for anything that navigates (style the `<a>` itself as the button),
  `<button type="button">` for actions that do not navigate, `<label for>` + `<input id>` for fields.
  Never put a `<button>` inside an `<a>`. `aria-label` on icon-only buttons.
- Icons: inline stroke SVG only (24 viewBox, stroke currentColor, stroke-width 2, round caps). No emoji, no
  images, no fake phone status bar, no gradients.
- Text is never smaller than 13px. Touch targets at least 44px tall. Amounts get
  `font-variant-numeric: tabular-nums`.
- Language: English. The student calls his mother "Ibu". Parent-facing screens say "you" and "Raka".
- No crypto words (wallet, token, chain, gas, address, stablecoin, AUSD, Monad) on screens, except inside a
  "Detail" box on receipts, which may say `14,39 AUSD` and "digital dollar".

## Tokens
- Ground `#F2F3EE`; card `#FFFFFF`; card border `#D9DCD3`; ink (text, primary button) `#111B33`;
  muted text `#55606E`; quiet surface `#E7E9E2`; input border `#7C8591`; link `#2A5CA6`.
- Font: `'Plus Jakarta Sans', system-ui, sans-serif`. Student screens 16px base; parent and trusted-person
  screens 17px base. Radius 16 for tiles, cards and buttons; 999 for pills; 12 for inputs.
- Page padding 20px sides. Gaps 10 to 20px.
- Envelope colours (solid fill, WHITE text, with the four wavy "guilloche" lines from ThemeA.dc.html):
  Food `#2B7A4B`, Transport `#6E4A9C`, Study `#2A5CA6`, Everyday `#8C5A2B`, Emergency `#B5302A`.
  Small envelope chip = pill with that solid colour and white 13px bold text.
- Status badges (pill, 13px bold, icon + word, tinted background):
  Approved / Collected / Released `#0D6332` on `#D9F8E0` (circle-check icon);
  On hold / Waiting `#7E4F04` on `#FEEDC5` (clock icon);
  Declined / Blocked `#A51F1E` on `#FFE7E4` (circle-x icon);
  Locked / Not yet `#444D61` on `#E6EAF2` (lock icon).
- Primary button: `height: 52px` (56px on parent screens), `border-radius: 16px; background: #111B33;
  color: #FFFFFF; font-weight: 700`, full width. Secondary: white, `border: 1px solid #7C8591`, ink text.
  Text button: no background, link colour `#2A5CA6` (or `#A51F1E` for cancel), 48px tall.
- List card: white, radius 16, `padding: 0 16px`, rows 52 to 60px tall separated by `1px solid #D9DCD3`.
- Info box: `background: #E6EAF2; color: #444D61; border-radius: 16px; padding: 14px 16px`, clock or info icon.
- Detail box (receipts): `background: #E7E9E2; border-radius: 16px; padding: 14px 16px`, heading "Detail" 14px
  bold muted, rows 14px.
- Sub-page top bar: 56px tall, back chevron `<a>` 44x44, title 18px bold.
- Result screens (approved, declined, sent): 72px circle with icon, tinted status background, title 24px bold in
  the status text colour, amount 32px.
- Student tab bar (only on Home, Card, Activity, HomeEmpty): exactly as ThemeA.dc.html but each item is an
  `<a>` to `Main.dc.html`, `Card.dc.html`, `Activity.dc.html`; selected item ink and bold, others `#55606E`.
- Demo card: 350x221, `background: #111B33`, radius 16, the guilloche lines in white at 0.12 opacity, top row
  "Amplop" with the envelope icon and a pill "Demo card" (white outline), bottom "•••• •••• •••• 4821" and
  "RAKA PRATAMA". No Visa or Mastercard marks.

## Numbers and data (use exactly; Indonesian number format: dot thousands, comma decimals)
- Student: Raka Pratama, studying in Amsterdam. Parent and trusted person: Ibu.
- Student screens show dollars first (`$59,00`), with rupiah as a small reference only where stated.
  Parent pays in rupiah. Sample rate $1 = Rp16.500. Shop prices in euro appear as secondary text.
- Allowance: Ibu sends Rp16.500.000 = $1.000,00 on Mon, 28 Sep. Fee Rp0.
- Split (set by Raka): Food 40% $400,00 ($100,00 a week); Transport 15% $150,00 ($37,50 a week);
  Study 15% $150,00 ($37,50 a week); Everyday 20% $200,00 ($50,00 a week); Emergency 10% $100,00 locked.
  The first weekly share is released on arrival, then on the next three Mondays (5, 12, 19 Oct).
  Unspent money stays in its envelope. Everyday is the default for shops that fit no other envelope.
- "Today" is Wed, 7 Oct, week 2 of 4. Next release Mon, 12 Oct: $225,00.
- Available now: Food $59,00 (bar 59%), later $200,00. Transport $26,25 (bar 70%), later $75,00.
  Study $30,00 (bar 80%), later $75,00. Everyday $9,00 (bar 18%, "Spending fast"), later $100,00.
  Emergency $100,00 locked. Total available this week $124,25 (about Rp2.050.000). Pace tick at 57%.
- Card purchase: Supermarket, Amsterdam, €12,50 = $14,39, from Food. Food left this week $44,61.
  Status "On hold" until the shop collects, then "Collected".
- Blocked: gambling. Declined, no money taken, Ibu is told the category only, never the shop.
- Empty-envelope decline: Cinema €11,00 = $12,66, Everyday has only $9,00.
- Wrong match example: Bookshop €18,00 = $20,72, Tue 6 Oct, matched to Everyday; Raka moves it to Study.
- Emergency request: $70,00 of $100,00, reason "Laptop broke, needs repair before next week's exams."
  Sent Wed, 7 Oct at 14:05. Opens automatically Fri, 9 Oct at 14:05 ("47 h 12 min"). The rest, $30,00, stays
  locked. The trusted person can open it sooner but cannot block it. Once opened, the $70,00 moves into the
  Everyday envelope.
- Parent totals after the supermarket purchase: Food $244,61; Transport $101,25; Study $105,00;
  Everyday $109,00; Emergency $100,00 (locked). "About Rp10,9 million in total at the sample rate."
- Rule changes (split, switching the Emergency lock off) take 48 hours and the trusted person is told.
- A lost passkey cannot be recovered in this version; say so plainly in Settings.

## Self-check (required)
After writing your files run, for each file:
`cd /tmp/claude-0/-home-claude/82fabd75-5304-5ebd-bf8e-90b38b00aacb/scratchpad/render && python3 shot.py <Name>.dc.html`
It prints overflow info and writes `out/<Name>.png`. Read each PNG and fix: clipped or overlapping content,
text wrapping awkwardly, content squeezed against the bottom, white-on-white, missing closing tags.
Re-run until every screen is clean. In your final message list each file, what it shows, and any deviation
from this spec.
