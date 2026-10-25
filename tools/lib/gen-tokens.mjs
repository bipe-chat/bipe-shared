// Colour tokens of Bipe's own client (bipe-chat/bipe#551; design/tokens.json). Validates the tokens and generates
// SwiftUI and Compose colours for bipe-app. The forks keep bipe-tokens and get none of this.
import { contrast, loadTokens, solveRamps } from "../../design/ramps/ramp.mjs";

export const VARIANTS = ["light", "dark", "lightHighContrast", "darkHighContrast"];
const THEME_OF = { light: "light", dark: "dark", lightHighContrast: "light", darkHighContrast: "dark" };

// Contrast rules (identity.md, trust-ui.md): AAA (7:1) for ink on the base surface in the normal themes, 10:1 in
// high contrast; trust ink AAA on its own wash; ink.onAccent AAA on accent.fill.
export const CONTRAST_RULES = [
  ...["ink.primary", "ink.secondary", "accent.ink", "glyph.primary", "glyph.secondary",
    "trust.verified.ink", "trust.caution.ink", "trust.danger.ink", "trust.neutral.ink", "status.success"]
    .map((fg) => ({ fg, bg: "surface.base", min: 7, minHighContrast: 10 })),
  ...["verified", "caution", "danger", "neutral"].map((s) => ({ fg: `trust.${s}.ink`, bg: `trust.${s}.wash`, min: 7, minHighContrast: 7 })),
  { fg: "ink.onAccent", bg: "accent.fill", min: 7, minHighContrast: 7 },
  { fg: "ink.primary", bg: "bubble.own", min: 7, minHighContrast: 10 },
  { fg: "ink.primary", bg: "bubble.other", min: 7, minHighContrast: 10 },
];

// Bipe's own names: group.role, lower camel case. Compound's naming (color.bg.*, color.text.*, ...) must not come back.
const NAME = /^(surface|ink|glyph|line|accent|bubble|trust|status)\.[a-z][A-Za-z]*(\.[a-z][A-Za-z]*)?$/;

export function resolveTokens(tokens = loadTokens()) {
  const solved = solveRamps(tokens);
  if (JSON.stringify(tokens.ramps) !== JSON.stringify(solved)) {
    throw new Error("tokens.json: ramps differ from design/ramps/ramp.mjs. Run node design/ramps/ramp.mjs --write.");
  }
  const out = {};
  for (const [name, token] of Object.entries(tokens.semantic)) {
    if (!NAME.test(name)) throw new Error(`tokens.json: semantic name "${name}" does not follow group.role`);
    out[name] = {};
    for (const variant of VARIANTS) {
      const ref = token[variant];
      const theme = THEME_OF[variant];
      let hex;
      if (ref === "background") hex = tokens.themes[theme].background;
      // A literal hex is for a platform system value that no ramp step matches (surface.*, bipe-chat/bipe#612).
      else if (/^#[0-9A-F]{6}$/.test(ref ?? "")) hex = ref;
      else {
        const [ramp, step] = (ref ?? "").split(".");
        hex = tokens.ramps[ramp]?.[theme]?.[step];
      }
      if (!hex) throw new Error(`tokens.json: ${name}.${variant} references unknown "${ref}"`);
      out[name][variant] = hex;
    }
  }
  for (const rule of CONTRAST_RULES) {
    for (const variant of VARIANTS) {
      const fg = out[rule.fg]?.[variant];
      const bg = out[rule.bg]?.[variant];
      if (!fg || !bg) throw new Error(`tokens.json: contrast rule names a missing token (${rule.fg} on ${rule.bg})`);
      const min = variant.endsWith("HighContrast") ? rule.minHighContrast : rule.min;
      // Ramp steps are solved to the target and then rounded to 8 bits, so allow 0.1 below it.
      const ratio = contrast(fg, bg);
      if (ratio < min - 0.1) throw new Error(`tokens.json: ${rule.fg} on ${rule.bg} (${variant}) is ${ratio.toFixed(2)}:1, needs ${min}:1`);
    }
  }
  return out;
}

const camelName = (name) => name.replace(/\.([a-z])/g, (_, c) => c.toUpperCase());
const hex24 = (hex) => `0x${hex.slice(1).toUpperCase()}`;
const hex32 = (hex) => `0xFF${hex.slice(1).toUpperCase()}`;

export function generateColors(lang, tokens = loadTokens()) {
  const resolved = resolveTokens(tokens);
  const entries = Object.entries(resolved);
  if (lang === "swift") {
    const props = entries.map(([name, v]) =>
      `    /// ${tokens.semantic[name].description}\n    public static let ${camelName(name)} = dynamic(${VARIANTS.map((k) => hex24(v[k])).join(", ")})`);
    return `import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

/// Bipe's colour tokens. Each colour follows the system light or dark mode and the Increase Contrast setting.
public enum BipeColor {
${props.join("\n\n")}

    private static func dynamic(_ light: UInt32, _ dark: UInt32, _ lightHighContrast: UInt32, _ darkHighContrast: UInt32) -> Color {
        #if canImport(UIKit)
        return Color(uiColor: UIColor { traits in
            let high = traits.accessibilityContrast == .high
            let value = traits.userInterfaceStyle == .dark ? (high ? darkHighContrast : dark) : (high ? lightHighContrast : light)
            return UIColor(
                red: CGFloat((value >> 16) & 0xFF) / 255,
                green: CGFloat((value >> 8) & 0xFF) / 255,
                blue: CGFloat(value & 0xFF) / 255,
                alpha: 1
            )
        })
        #else
        return Color(red: Double((light >> 16) & 0xFF) / 255, green: Double((light >> 8) & 0xFF) / 255, blue: Double(light & 0xFF) / 255)
        #endif
    }
}
`;
  }
  const fields = entries.map(([name]) => `    /** ${tokens.semantic[name].description} */\n    val ${camelName(name)}: Color,`);
  const sets = VARIANTS.map((variant) => {
    const label = { light: "Light", dark: "Dark", lightHighContrast: "LightHighContrast", darkHighContrast: "DarkHighContrast" }[variant];
    const args = entries.map(([name, v]) => `    ${camelName(name)} = Color(${hex32(v[variant])}),`);
    return `val Bipe${label}Colors: BipeColors = BipeColors(\n${args.join("\n")}\n)`;
  });
  return `import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.Color

/** Bipe's colour tokens. Pick the set for the system dark mode and the high contrast text setting. */
@Immutable
data class BipeColors(
${fields.join("\n\n")}
)

${sets.join("\n\n")}
`;
}
