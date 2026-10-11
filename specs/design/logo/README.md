# Amplop logo (Kiriman)

A large ink envelope (home, the parent) releases a smaller card upward (the allowance, the student).

## Files
- `svg/` the logo (mark + name) and the mark alone, in four versions:
  - full colour for light backgrounds
  - `on-dark` for dark backgrounds, with a lighter card
  - `mono` all ink
  - `white` all paper
- `amplop-logo.png`, `amplop-logo-on-dark.png`: large PNGs with transparent backgrounds, for slides and the hackathon portal.
- `app-icon/ios/`: 1024 px light, dark and tinted icons. Use them in Xcode or Icon Composer; iOS rounds the corners itself.
- `app-icon/android/`: adaptive icon layers at 432 px (108 dp at 4x).
  - Foreground and monochrome are transparent; set the background colour to `#F2F3EE`.
  - `play-store-512.png` is the store listing icon.
- `web/`: the favicon set.

## Web: put the web files in your site root and add this to `<head>`
```html
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="#F2F3EE">
```
`favicon.svg` switches to light colours when the browser is in dark mode. In Next.js you can instead drop `favicon.ico`, `icon.svg` (renamed from favicon.svg) and `apple-icon.png` into `app/`.

## Colours
| Name | Hex | Use |
|---|---|---|
| Ink | #111B33 | envelope, name |
| Paper | #F2F3EE | backgrounds |
| Card brown (Everyday) | #8C5A2B | the card on light backgrounds |
| Card tan | #C08A55 | the card on dark backgrounds |

Inside the app, the card may take the colour of the active envelope:
- Food #2B7A4B
- Transport #6E4A9C
- Study #2A5CA6
- Everyday #8C5A2B
- Emergency #B5302A

## Rules
- Keep the card to the right of centre. Centred, the mark looks like a "user profile" icon.
- Keep the card plain: no "$", no banknote lines, no stack.
- Keep clear space around the logo at least as wide as the card.
- Smallest sizes:
  - the full logo at 96 px wide
  - the mark at 24 px
  - below that, use the favicon, which is redrawn for 16 px
- Do not stretch, outline, add shadows or recolour outside these colours.
- Name type: Archivo ExtraBold, expanded width (SIL Open Font License), already converted to outlines.
