# Design Guide (Choose Your Dr)

## Colours (from the owner's sample logo: teal + slate)
All colours live in ONE place: the two blocks at the top of `web/src/app/globals.css`
(`:root` = light theme, `:root[data-theme="dark"]` = dark theme). Change a value there and the whole site follows.

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--brand` | #2aa795 | #3dc2ae | Decorations, gradients (logo teal) |
| `--brand-2` | #4d5764 | #8794a3 | Secondary accents (logo slate) |
| `--btn` / `--btn-ink` | #0f7c70 / #ffffff | #35bfab / #04201c | Buttons (readable text) |
| `--link` | #0d7468 | #62d9c6 | Links, outlines, focus ring |
| `--soft` / `--soft-ink` | #e0f4f0 / #0b6b60 | #143a37 / #7fe3d3 | Chips, badges, highlights |
| `--bg` / `--card` | #f3f9f8 / #ffffff | #0e191c / #15242a | Page and card backgrounds |
| `--ink` / `--mute` / `--line` | #1d2a33 / #56636d / #d5e5e2 | #e6f1ef / #9db2b0 / #28403f | Text, secondary text, borders |
| `--wa` | #128c4a | #1a9f58 | WhatsApp button |

Buttons use a darker teal than the logo teal on purpose: white text on the pure logo teal is too faint to read.

## Light / Dark / Auto
- The header button cycles Auto, Light, Dark. Auto follows the phone or computer setting.
- The choice is saved in the browser (`cyd_theme`). A tiny script in `layout.tsx` applies it before the page paints, so dark-mode visitors never see a white flash.
- `data-theme` on the `<html>` element drives the colours. `color-scheme` is set so form fields and scrollbars match.

## Logo
`src/components/Logo.tsx` and `src/app/icon.svg` are a simple placeholder mark in the brand colours.
The business name is NOT drawn into the logo: it comes from `APP_NAME` (last word highlighted).
The sample logo you shared belongs to another business ("Heal With Care"): only its colours were used, never its artwork or name.
Replace the placeholder with your own final logo when it is ready.

## Rules for new screens
1. Use only the tokens above (`var(--card)`, `var(--ink)` ...). Never write a hex colour in a page or component.
2. Check every new screen in Light AND Dark.
3. Tap targets at least 44px high; no sideways scrolling on phones.
4. Keep the order of therapists free of payment influence; label sort options clearly.
