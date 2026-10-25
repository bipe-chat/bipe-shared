# Design tokens

Colour tokens of Bipe's own client (`bipe-chat/bipe-app`, bipe-chat/bipe#551). The forks (bipe-ios, bipe-android) keep bipe-tokens and do not read this folder.

bipe-tokens is a fork of Element's compound-design-tokens (AGPL). Bipe's own client cannot use it (ADR 0143). This folder has none of its code, names or file layout.

## Files

- `tokens.json`: the source.
  - `themes`: the background and the 14 contrast targets (steps 100 to 1400) of the light and dark theme. The targets are the ones in `bipe/docs/design/identity.md`.
  - `rampParameters`: hue and peak chroma (OKLCH) of each ramp: `acai`, `gray`, `amber`, `red`, `green`.
  - `ramps`: the solved hex value of each step. Written by `ramps/ramp.mjs --write`. Never edit by hand.
  - `semantic`: Bipe's semantic tokens (`surface`, `ink`, `glyph`, `line`, `accent`, `bubble`, `trust`, `status`). Each names a ramp step (or `background`) for `light`, `dark`, `lightHighContrast` and `darkHighContrast`. The `surface` tokens are literal hex values instead: they are the iOS system backgrounds, so custom screens match the standard iOS and Android lists (bipe-chat/bipe#612).
- `ramps/ramp.mjs`: Bipe's ramp solver. For each step it finds the OKLCH lightness whose WCAG contrast with the theme background is the target. Chroma follows a bell over lightness and stays in sRGB.

## Change a token

1. Edit `themes`, `rampParameters` or `semantic` in `tokens.json`.
2. Run `node design/ramps/ramp.mjs --write` (ramps) and `node tools/gen.mjs` (Swift and Kotlin).
3. Run `node --test tools/*.test.mjs`. `tools/tokens.test.mjs` fails when the ramps are stale, a step misses its target, a reference is unknown, a name is not `group.role`, or a contrast rule fails.

Contrast rules (`tools/lib/gen-tokens.mjs`, from identity.md and trust-ui.md): ink and glyph tokens are AAA (7:1) on `surface.base`, 10:1 in high contrast; trust ink is AAA on its own wash; `ink.onAccent` is AAA on `accent.fill`; `ink.primary` is AAA on both bubbles.

## Output

`tools/gen.mjs` writes `BipeColors.swift` (`BipeColor`, SwiftUI `Color` that follows dark mode and Increase Contrast) into `bipe-app/ios/BipeKit/Sources/BipeKit/Generated` and `BipeColors.kt` (`BipeColors` and four sets: `BipeLightColors`, `BipeDarkColors`, `BipeLightHighContrastColors`, `BipeDarkHighContrastColors`) into `bipe-app/android/libraries/bipe`.
