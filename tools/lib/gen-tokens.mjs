// Colour tokens of Bipe's own client (bipe-chat/bipe#551; design/tokens.json). Validates the tokens and generates
// SwiftUI and Compose colours for bipe-app, and CSS custom properties for bipe-web.
import { contrast, loadTokens, solveRamps, STEPS } from "../../design/ramps/ramp.mjs";

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

// App themes (bipe-chat/bipe#811): the palettes the user can pick, the tokens they swap, the icon step of each.
// Fails closed: a themed token must name acai in every variant, a trust token is never themed.
export function appThemes(tokens = loadTokens()) {
  const themes = tokens.appThemes;
  if (!themes) throw new Error("tokens.json: appThemes is missing");
  const palettes = Object.keys(themes.palettes ?? {});
  if (palettes[0] !== "acai" || themes.default !== "acai") throw new Error("tokens.json: appThemes must start with the default palette acai");
  for (const [palette, { iconStep }] of Object.entries(themes.palettes)) {
    if (!tokens.ramps[palette]) throw new Error(`tokens.json: appThemes palette "${palette}" is not a ramp`);
    if (!STEPS.includes(Number(iconStep))) throw new Error(`tokens.json: appThemes.${palette}.iconStep "${iconStep}" is not a ramp step`);
  }
  for (const name of themes.themed ?? []) {
    const token = tokens.semantic[name];
    if (!token) throw new Error(`tokens.json: appThemes themes unknown token "${name}"`);
    if (name.startsWith("trust.")) throw new Error(`tokens.json: appThemes must not theme ${name}: trust states never change`);
    for (const variant of VARIANTS) {
      if (!/^acai\.\d+$/.test(token[variant] ?? "")) throw new Error(`tokens.json: themed ${name}.${variant} must name an acai step`);
    }
  }
  return { palettes, themed: themes.themed ?? [], iconStep: (p) => themes.palettes[p].iconStep };
}

// Every palette of appThemes, resolved and checked against the contrast rules.
export function resolveThemes(tokens = loadTokens()) {
  return Object.fromEntries(appThemes(tokens).palettes.map((palette) => [palette, resolveTokens(tokens, palette)]));
}

// The app icon background of each palette: its light iconStep. The mark on it is white.
export function appIconColors(tokens = loadTokens()) {
  const themes = appThemes(tokens);
  return themes.palettes.map((palette) => ({ palette, background: tokens.ramps[palette].light[themes.iconStep(palette)] }));
}

export function resolveTokens(tokens = loadTokens(), palette = "acai") {
  const solved = solveRamps(tokens);
  if (JSON.stringify(tokens.ramps) !== JSON.stringify(solved)) {
    throw new Error("tokens.json: ramps differ from design/ramps/ramp.mjs. Run node design/ramps/ramp.mjs --write.");
  }
  const themed = palette === "acai" ? [] : appThemes(tokens).themed;
  if (palette !== "acai" && !tokens.appThemes.palettes[palette]) throw new Error(`tokens.json: unknown palette "${palette}"`);
  const out = {};
  for (const [name, token] of Object.entries(tokens.semantic)) {
    if (!NAME.test(name)) throw new Error(`tokens.json: semantic name "${name}" does not follow group.role`);
    out[name] = {};
    for (const variant of VARIANTS) {
      const ref = themed.includes(name) ? token[variant].replace(/^acai\./, `${palette}.`) : token[variant];
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
      if (ratio < min - 0.1) {
        const where = palette === "acai" ? variant : `${variant}, palette ${palette}`;
        throw new Error(`tokens.json: ${rule.fg} on ${rule.bg} (${where}) is ${ratio.toFixed(2)}:1, needs ${min}:1`);
      }
    }
  }
  return out;
}

const camelName = (name) => name.replace(/\.([a-z])/g, (_, c) => c.toUpperCase());
const hex24 = (hex) => `0x${hex.slice(1).toUpperCase()}`;
const hex32 = (hex) => `0xFF${hex.slice(1).toUpperCase()}`;

const pascal = (id) => id[0].toUpperCase() + id.slice(1);
// iOS alternate app icon name of a palette; the default palette uses the primary icon "AppIcon".
export const iosIconName = (palette) => (palette === "acai" ? "AppIcon" : `AppIcon-${pascal(palette)}`);

export function generateColors(lang, tokens = loadTokens()) {
  const resolved = resolveTokens(tokens);
  if (lang === "css") return cssColors(tokens, resolved);
  const themes = appThemes(tokens);
  const byPalette = resolveThemes(tokens);
  const icons = appIconColors(tokens);
  const entries = Object.entries(resolved);
  if (lang === "swift") {
    const props = entries.map(([name, v]) => {
      const doc = `    /// ${tokens.semantic[name].description}`;
      if (!themes.themed.includes(name)) return `${doc}\n    public static let ${camelName(name)} = dynamic(${VARIANTS.map((k) => hex24(v[k])).join(", ")})`;
      const id = camelName(name);
      const cases = themes.palettes.map((p) => `        case .${p}: ${id}${pascal(p)}`);
      const lets = themes.palettes.map((p) => `    private static let ${id}${pascal(p)} = dynamic(${VARIANTS.map((k) => hex24(byPalette[p][name][k])).join(", ")})`);
      return `${doc} Follows the app theme (BipeTheme).
    public static var ${id}: Color { ${id}(BipeTheme.shared.palette) }

${doc.replace(/\.$/, "")}, in the given palette.
    public static func ${id}(_ palette: BipePalette) -> Color {
        switch palette {
${cases.join("\n")}
        }
    }

${lets.join("\n")}`;
    });
    const paletteCases = themes.palettes.map((p) => `    case ${p}`);
    const iconCases = icons.map(({ palette, background }) => `        case .${palette}: ${hex24(background)}`);
    const nameCases = themes.palettes.map((p) => `        case .${p}: ${p === "acai" ? "nil" : `"${iosIconName(p)}"`}`);
    return `import Foundation
import Observation
import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

/// The palettes of the app theme (bipe-chat/bipe#811). Each one sets the themed accent and own-bubble colours and
/// the app icon. Trust colours never change.
public enum BipePalette: String, CaseIterable, Sendable {
${paletteCases.join("\n")}

    /// The palette of a new install.
    public static let standard: BipePalette = .${tokens.appThemes.default}

    /// Background of the app icon (a white mark on it), as 0xRRGGBB.
    public var iconBackground: UInt32 {
        switch self {
${iconCases.join("\n")}
        }
    }

    /// Colour of the mark on the app icon, as 0xRRGGBB.
    public static let iconMark: UInt32 = ${hex24(tokens.appThemes.icon.markColour)}

    /// Name of the alternate app icon for UIApplication.setAlternateIconName; nil is the primary icon.
    public var alternateIconName: String? {
        switch self {
${nameCases.join("\n")}
        }
    }
}

/// The palette the app shows. A SwiftUI view that reads a themed colour in its body redraws when the palette
/// changes (Observation). The app sets it at launch from its stored choice and when the user picks a palette.
public final class BipeTheme: Observable, @unchecked Sendable {
    public static let shared = BipeTheme()

    private let registrar = ObservationRegistrar()
    private let lock = NSLock()
    private var stored = BipePalette.standard

    public var palette: BipePalette {
        get {
            registrar.access(self, keyPath: \\.palette)
            return lock.withLock { stored }
        }
        set {
            registrar.withMutation(of: self, keyPath: \\.palette) {
                lock.withLock { stored = newValue }
            }
        }
    }
}

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
  const LABEL = { light: "Light", dark: "Dark", lightHighContrast: "LightHighContrast", darkHighContrast: "DarkHighContrast" };
  const fields = entries.map(([name]) => `    /** ${tokens.semantic[name].description} */\n    val ${camelName(name)}: Color,`);
  const sets = VARIANTS.map((variant) => {
    const args = entries.map(([name, v]) => `    ${camelName(name)} = Color(${hex32(v[variant])}),`);
    return `val Bipe${LABEL[variant]}Colors: BipeColors = BipeColors(\n${args.join("\n")}\n)`;
  });
  const CONDITION = { darkHighContrast: "dark && highContrast", dark: "dark", lightHighContrast: "highContrast", light: "else" };
  const ORDER = ["darkHighContrast", "dark", "lightHighContrast", "light"];
  const paletteEntries = icons.map(({ palette, background }) => `    ${palette.toUpperCase()}("${palette}", Color(${hex32(background)})),`);
  const branches = themes.palettes.map((p) => {
    if (p === "acai") return `        BipePalette.ACAI -> base`;
    const cases = ORDER.map((variant) => {
      const args = themes.themed.map((name) => `${camelName(name)} = Color(${hex32(byPalette[p][name][variant])})`);
      return `            ${CONDITION[variant]} -> base.copy(${args.join(", ")})`;
    });
    return `        BipePalette.${p.toUpperCase()} -> when {\n${cases.join("\n")}\n        }`;
  });
  return `import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.Color

/** Bipe's colour tokens. Pick the set for the system dark mode and the high contrast text setting. */
@Immutable
data class BipeColors(
${fields.join("\n\n")}
)

${sets.join("\n\n")}

/**
 * The palettes of the app theme (bipe-chat/bipe#811). Each one sets the themed accent and own-bubble colours and
 * the app icon. Trust colours never change. iconBackground is the app icon background (a white mark on it).
 */
enum class BipePalette(val id: String, val iconBackground: Color) {
${paletteEntries.join("\n")}
    ;

    companion object {
        /** The palette of a new install. */
        val DEFAULT: BipePalette = ${tokens.appThemes.default.toUpperCase()}

        /** Colour of the mark on the app icon. */
        val ICON_MARK: Color = Color(${hex32(tokens.appThemes.icon.markColour)})

        /** The stored palette id, or DEFAULT for a missing or unknown id. */
        fun fromId(id: String?): BipePalette = entries.firstOrNull { it.id == id } ?: DEFAULT
    }
}

/** The colour set of a palette for the system dark mode and the high contrast setting. */
fun bipeColors(palette: BipePalette, dark: Boolean, highContrast: Boolean): BipeColors {
    val base = when {
        dark && highContrast -> BipeDarkHighContrastColors
        dark -> BipeDarkColors
        highContrast -> BipeLightHighContrastColors
        else -> BipeLightColors
    }
    return when (palette) {
${branches.join("\n")}
    }
}
`;
}

const kebab = (name) => name.replace(/\./g, "-").replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

// bipe-web reads this at build time (vite.config.ts). Every ramp step and the theme background follow the
// system light or dark mode; the semantic tokens also follow prefers-contrast: more. The ramps have no
// high contrast set: a high contrast variant is a choice of step, so it lives in the semantic tokens only.
function cssColors(tokens, resolved) {
  const block = (theme, variant) => {
    const lines = [];
    if (theme) {
      lines.push(`  --bipe-background: ${tokens.themes[theme].background};`);
      for (const [ramp, themes] of Object.entries(tokens.ramps)) {
        for (const [step, hex] of Object.entries(themes[theme])) lines.push(`  --bipe-${ramp}-${step}: ${hex};`);
      }
    }
    for (const [name, v] of Object.entries(resolved)) lines.push(`  --bipe-${kebab(name)}: ${v[variant]};`);
    return `:root {\n${lines.join("\n")}\n}`;
  };
  return `/* Bipe's colour tokens (bipe-shared design/tokens.json). Generated by tools/lib/gen-tokens.mjs. Do not edit. */
${block("light", "light")}
@media (prefers-color-scheme: dark) {
${block("dark", "dark")}
}
@media (prefers-contrast: more) {
${block(null, "lightHighContrast")}
}
@media (prefers-color-scheme: dark) and (prefers-contrast: more) {
${block(null, "darkHighContrast")}
}
`;
}
