# Design tokens

Colour tokens of Bipe's own client (`bipe-chat/bipe-app`, bipe-chat/bipe#551) and of bipe.chat (`bipe-chat/bipe-web`).

bipe-tokens is a fork of Element's compound-design-tokens (AGPL). Bipe's own client cannot use it (ADR 0143). This folder has none of its code, names or file layout.

## Files

- `tokens.json`: the source.
  - `themes`: the background and the 14 contrast targets (steps 100 to 1400) of the light and dark theme. The targets are the ones in `bipe/docs/design/identity.md`.
  - `rampParameters`: hue and peak chroma (OKLCH) of each ramp: `acai`, `gray`, `amber`, `red`, `green`, and the expressive ramps `pitanga`, `caju`, `jabuticaba`, `jenipapo`, and the app-theme ramps `goiaba` and `maracuja`. An optional `shade` turns the hue in the dark steps (`ramps/ramp.mjs`). The expressive ramps are for bipe-web art (link-preview cards, store panels, backgrounds); `goiaba` and `maracuja` are for app themes only. No semantic token names them (`tools/tokens.test.mjs`). They reach the app only through `appThemes`.
  - `ramps`: the solved hex value of each step. Written by `ramps/ramp.mjs --write`. Never edit by hand.
  - `appThemes`: the app theme (bipe-chat/bipe#811). `palettes` lists the palettes the user can pick, in picker order, the default (`acai`) first, each with the `iconStep` of its app icon background (light ramp). The tokens in `themed` name an `acai` step in every variant; each palette swaps that ramp for its own, at the same step. Trust tokens are never themed. `icon` is the Bipe mark and its place on the iOS and Android icons. `tools/lib/gen-tokens.mjs` fails closed on each rule and checks the contrast rules for every palette.
  - `semantic`: Bipe's semantic tokens (`surface`, `ink`, `glyph`, `line`, `accent`, `bubble`, `trust`, `status`). Each names a ramp step (or `background`) for `light`, `dark`, `lightHighContrast` and `darkHighContrast`. The `surface` tokens are literal hex values instead: they are the iOS system backgrounds, so custom screens match the standard iOS and Android lists (bipe-chat/bipe#612).
- `ramps/ramp.mjs`: Bipe's ramp solver. For each step it finds the OKLCH lightness whose WCAG contrast with the theme background is the target. Chroma follows a bell over lightness and stays in sRGB.

## Change a token

1. Edit `themes`, `rampParameters` or `semantic` in `tokens.json`.
2. Run `node design/ramps/ramp.mjs --write` (ramps) and `node tools/gen.mjs` (Swift and Kotlin).
3. Run `node --test tools/*.test.mjs`. `tools/tokens.test.mjs` fails when the ramps are stale, a step misses its target, a reference is unknown, a name is not `group.role`, or a contrast rule fails.

Contrast rules (`tools/lib/gen-tokens.mjs`, from identity.md and trust-ui.md): ink and glyph tokens are AAA (7:1) on `surface.base`, 10:1 in high contrast; trust ink is AAA on its own wash; `ink.onAccent` is AAA on `accent.fill`; `ink.primary` is AAA on both bubbles.

## Output

`tools/lib/gen-tokens.mjs` `generateColors("css")` gives the CSS custom properties of bipe-web: `--bipe-background`, `--bipe-<ramp>-<step>` and `--bipe-<group>-<role>` (for example `--bipe-trust-verified-ink`). bipe-web's `vite.config.ts` writes them at build time; nothing is committed in bipe-web.

`tools/gen.mjs` writes `BipeColors.swift` (`BipeColor`, SwiftUI `Color` that follows dark mode and Increase Contrast; `BipePalette` and `BipeTheme`, the palette the app shows: a view that reads a themed colour redraws when it changes) into `bipe-app/ios/BipeKit/Sources/BipeKit/Generated` and `BipeColors.kt` (`BipeColors` and four sets: `BipeLightColors`, `BipeDarkColors`, `BipeLightHighContrastColors`, `BipeDarkHighContrastColors`, plus `BipePalette` and `bipeColors(palette, dark, highContrast)`) into `bipe-app/android/libraries/bipe`.

`tools/lib/gen-app-icons.mjs` draws the app icons: a white mark on the icon background of each palette. It writes `Generated/AppIcons.xcassets` (one 1024 px PNG per palette, `AppIcon` for açaí and `AppIcon-<Palette>` for the others; the Bipe app target compiles it) into BipeKit, and the colours (`res/values/bipe_app_icons.xml`), the mark (`res/drawable/bipe_app_icon_mark.xml`) and one adaptive icon per palette (`res/mipmap-anydpi-v26/bipe_app_icon_<palette>.xml`) into `android/libraries/bipe`. The PNG encoder is Bipe's own (Node built-ins): its bytes depend only on the input, so the drift check is stable.
