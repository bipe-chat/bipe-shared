// SPDX-License-Identifier: AGPL-3.0-only
// Additional permission: APP-STORE-PERMISSION.md (AGPL section 7)
// Copyright 2026 Bipe contributors

// Colour ramps for Bipe's own client (bipe-chat/bipe#551). Node built-ins only.
//
// A ramp has 14 steps (100 to 1400) per theme. Each step is solved to a WCAG 2 contrast target
// against the theme background (design/tokens.json "themes"), so the same step has the same
// contrast in every hue. The targets come from bipe/docs/design/identity.md (açaí ramp).
//
// Colour model: OKLCH. For a hue, chroma follows a bell over lightness:
//   chroma(L) = peakChroma * (L - 0.1) * (1 - L) / 0.2025      (peak at L = 0.55)
// and is cut to the sRGB gamut. The solver finds L by bisection.
// An optional `shade` turns the hue as the step gets darker: at lightness shade.lightness[1] and above
// the hue is `hue`, at shade.lightness[0] and below it is shade.hue, linear in between. A warm hue
// that loses its blue channel in the dark steps keeps its orange this way (caju).
//
// Usage:
//   node design/ramps/ramp.mjs           prints every ramp with its contrast
//   node design/ramps/ramp.mjs --write   writes the solved hex values into design/tokens.json "ramps"
//   node design/ramps/ramp.mjs --check   fails when design/tokens.json "ramps" differs from the solver

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const STEPS = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400];
export const TOKENS_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "tokens.json");

// sRGB <-> linear
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLinear = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

export function hexToRgb(hex) {
  const m = /^#([0-9A-Fa-f]{6})$/.exec(hex);
  if (!m) throw new Error(`ramp: "${hex}" is not #RRGGBB`);
  return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255);
}

export function rgbToHex(rgb) {
  return "#" + rgb.map((c) => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, "0").toUpperCase()).join("");
}

// OKLab (Björn Ottosson, 2020) from linear sRGB, and back.
function linearToOklab([r, g, b]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToLinear([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

export function hexToOklch(hex) {
  const [L, a, b] = linearToOklab(hexToRgb(hex).map(toLinear));
  return [L, Math.hypot(a, b), ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360];
}

function oklchToLinear(L, C, H) {
  const h = (H * Math.PI) / 180;
  return oklabToLinear([L, C * Math.cos(h), C * Math.sin(h)]);
}

const inGamut = (lin) => lin.every((c) => c >= -1e-6 && c <= 1 + 1e-6);

// The largest chroma <= wanted that stays in sRGB at this lightness and hue.
function gamutChroma(L, C, H) {
  if (inGamut(oklchToLinear(L, C, H))) return C;
  let lo = 0;
  let hi = C;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(oklchToLinear(L, mid, H))) lo = mid;
    else hi = mid;
  }
  return lo;
}

export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// WCAG 2 contrast ratio.
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export function chromaAt(L, peakChroma) {
  return Math.max(0, (peakChroma * (L - 0.1) * (1 - L)) / 0.2025);
}

export function hueAt(L, hue, shade) {
  if (!shade) return hue;
  const [dark, light] = shade.lightness;
  const t = Math.min(1, Math.max(0, (L - dark) / (light - dark)));
  return shade.hue + (hue - shade.hue) * t;
}

export function colourAt(L, hue, peakChroma, shade) {
  const H = hueAt(L, hue, shade);
  const C = gamutChroma(L, chromaAt(L, peakChroma), H);
  return rgbToHex(oklchToLinear(L, C, H).map(fromLinear));
}

// Solves one step: the colour of this hue whose contrast with `background` is `target`.
// On a light background the step is darker than the background; on a dark one, lighter.
export function solveStep(target, background, hue, peakChroma, shade) {
  const darkBackground = luminance(background) < 0.18;
  let lo = darkBackground ? hexToOklch(background)[0] : 0;
  let hi = darkBackground ? 1 : hexToOklch(background)[0];
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const c = contrast(colourAt(mid, hue, peakChroma, shade), background);
    // Contrast grows as L moves away from the background.
    if (darkBackground ? c < target : c > target) lo = mid;
    else hi = mid;
  }
  return colourAt((lo + hi) / 2, hue, peakChroma, shade);
}

export function solveRamps(tokens) {
  const out = {};
  for (const [name, ramp] of Object.entries(tokens.rampParameters)) {
    out[name] = {};
    for (const [theme, spec] of Object.entries(tokens.themes)) {
      out[name][theme] = Object.fromEntries(
        STEPS.map((step, i) => [String(step), solveStep(spec.contrastTargets[i], spec.background, ramp.hue, ramp.peakChroma, ramp.shade)]),
      );
    }
  }
  return out;
}

export function loadTokens(path = TOKENS_PATH) {
  return JSON.parse(readFileSync(path, "utf8"));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const tokens = loadTokens();
  const solved = solveRamps(tokens);
  if (process.argv.includes("--write")) {
    tokens.ramps = solved;
    writeFileSync(TOKENS_PATH, JSON.stringify(tokens, null, 2) + "\n");
    console.log(`ramp: wrote ${Object.keys(solved).length} ramps to design/tokens.json`);
  } else if (process.argv.includes("--check")) {
    if (JSON.stringify(tokens.ramps) !== JSON.stringify(solved)) {
      console.error("ramp: design/tokens.json ramps differ from the solver. Run node design/ramps/ramp.mjs --write.");
      process.exit(1);
    }
    console.log("ramp: ok");
  } else {
    for (const [name, themes] of Object.entries(solved)) {
      for (const [theme, steps] of Object.entries(themes)) {
        const bg = tokens.themes[theme].background;
        console.log(`${name} ${theme}: ` + Object.entries(steps).map(([s, hex]) => `${s} ${hex} (${contrast(hex, bg).toFixed(2)})`).join(", "));
      }
    }
  }
}
