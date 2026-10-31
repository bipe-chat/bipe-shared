import assert from "node:assert/strict";
import { test } from "node:test";
import { contrast, hexToOklch, loadTokens, solveRamps, STEPS } from "../design/ramps/ramp.mjs";
import { inflateSync } from "node:zlib";
import { iconPng, parsePath, zlibFixed } from "./lib/gen-app-icons.mjs";
import { appIconColors, appThemes, generateColors, resolveThemes, resolveTokens, VARIANTS } from "./lib/gen-tokens.mjs";

const tokens = loadTokens();

// bipe-chat/bipe#551: design/tokens.json ramps are the solver output, never hand-edited.
test("tokens.json ramps equal the solver output", () => {
  assert.deepEqual(tokens.ramps, solveRamps(tokens));
});

test("every ramp step meets its contrast target against the theme background", () => {
  for (const [name, themes] of Object.entries(tokens.ramps)) {
    for (const [theme, steps] of Object.entries(themes)) {
      const { background, contrastTargets } = tokens.themes[theme];
      STEPS.forEach((step, i) => {
        const ratio = contrast(steps[step], background);
        // 8-bit rounding moves a dark, saturated step by up to about 1.5 %.
        assert.ok(Math.abs(ratio / contrastTargets[i] - 1) <= 0.015, `${name}.${step} ${theme}: ${ratio.toFixed(2)} vs ${contrastTargets[i]}`);
      });
    }
  }
});

// identity.md: brand plum acai.1100 is #80307B light and #D993D2 dark.
test("acai.1100 is the documented brand plum", () => {
  const near = (a, b) => {
    const [l1, c1, h1] = hexToOklch(a);
    const [l2, c2, h2] = hexToOklch(b);
    return Math.abs(l1 - l2) < 0.01 && Math.abs(c1 - c2) < 0.01 && Math.abs(h1 - h2) < 2;
  };
  assert.ok(near(tokens.ramps.acai.light["1100"], "#80307B"), tokens.ramps.acai.light["1100"]);
  assert.ok(near(tokens.ramps.acai.dark["1100"], "#D993D2"), tokens.ramps.acai.dark["1100"]);
});

test("semantic tokens resolve in all four variants and pass the contrast rules", () => {
  const resolved = resolveTokens(tokens);
  for (const [name, v] of Object.entries(resolved)) {
    for (const variant of VARIANTS) assert.match(v[variant], /^#[0-9A-F]{6}$/, `${name}.${variant}`);
  }
});

test("a semantic token below its contrast rule fails", () => {
  const broken = structuredClone(tokens);
  broken.semantic["ink.secondary"].light = "gray.700";
  assert.throws(() => resolveTokens(broken), /ink.secondary on surface.base \(light\)/);
});

test("surface tokens are the iOS system backgrounds (bipe-chat/bipe#612)", () => {
  const resolved = resolveTokens(tokens);
  assert.deepEqual(Object.values(resolved["surface.base"]), ["#FFFFFF", "#000000", "#FFFFFF", "#000000"]);
  assert.deepEqual(Object.values(resolved["surface.raised"]), ["#F2F2F7", "#1C1C1E", "#EBEBF0", "#242426"]);
});

test("a malformed literal hex fails", () => {
  const broken = structuredClone(tokens);
  broken.semantic["surface.raised"].light = "#F2F2F";
  assert.throws(() => resolveTokens(broken), /surface.raised.light references unknown "#F2F2F"/);
});

test("semantic names are Bipe's own, not Compound's", () => {
  const broken = structuredClone(tokens);
  broken.semantic["color.text.primary"] = broken.semantic["ink.primary"];
  assert.throws(() => resolveTokens(broken), /does not follow group.role/);
  for (const name of Object.keys(tokens.semantic)) assert.doesNotMatch(name, /^(color|bg|text|border|icon)\./);
});

test("generated Swift and Kotlin hold every semantic token", () => {
  const swift = generateColors("swift");
  const kotlin = generateColors("kotlin");
  assert.match(swift, /public static let inkPrimary = dynamic\(0x[0-9A-F]{6}, /);
  assert.match(swift, /public static var accentFill: Color \{ accentFill\(BipeTheme.shared.palette\) \}/);
  assert.match(swift, /private static let accentFillJenipapo = dynamic\(0x005678, /);
  for (const set of ["BipeLightColors", "BipeDarkColors", "BipeLightHighContrastColors", "BipeDarkHighContrastColors"]) {
    assert.match(kotlin, new RegExp(`val ${set}: BipeColors`));
  }
  assert.equal((kotlin.match(/^    trustVerifiedInk = Color\(0xFF[0-9A-F]{6}\),$/gm) ?? []).length, 4);
});

test("generated CSS holds the background, every ramp step and every semantic token in each mode", () => {
  const css = generateColors("css");
  assert.match(css, /^:root \{\n  --bipe-background: #FFFFFF;$/m);
  assert.match(css, /^  --bipe-caju-1100: #[0-9A-F]{6};$/m);
  assert.match(css, /^  --bipe-trust-verified-ink: #[0-9A-F]{6};$/m);
  assert.equal((css.match(/--bipe-ink-on-accent:/g) ?? []).length, 4);
  assert.equal((css.match(/--bipe-acai-1100:/g) ?? []).length, 2);
  assert.match(css, /@media \(prefers-color-scheme: dark\) and \(prefers-contrast: more\)/);
});

// The expressive ramps reach the app only as an app theme (design/README.md, bipe-chat/bipe#811): no semantic
// token names one; appThemes swaps the acai steps of the themed tokens.
test("no semantic token uses an expressive ramp", () => {
  for (const [name, token] of Object.entries(tokens.semantic)) {
    for (const variant of VARIANTS) assert.doesNotMatch(token[variant], /^(pitanga|caju|jabuticaba|jenipapo|goiaba|maracuja)\./, `${name}.${variant}`);
  }
});

test("every palette passes the contrast rules and keeps the trust colours", () => {
  const themes = resolveThemes(tokens);
  assert.deepEqual(Object.keys(themes), ["acai", "goiaba", "pitanga", "maracuja", "jenipapo", "jabuticaba"]);
  for (const [palette, resolved] of Object.entries(themes)) {
    for (const name of Object.keys(resolved).filter((n) => n.startsWith("trust."))) {
      assert.deepEqual(resolved[name], themes.acai[name], `${palette} ${name}`);
    }
  }
  assert.equal(themes.jenipapo["accent.fill"].light, tokens.ramps.jenipapo.light["1100"]);
  assert.equal(themes.pitanga["bubble.own"].dark, tokens.ramps.pitanga.dark["400"]);
});

test("app icon backgrounds are the icon step of each palette (MZ, bipe-chat/bipe#811)", () => {
  assert.deepEqual(appIconColors(tokens).map(({ background }) => background), ["#802F7C", "#C52A7A", "#BC4500", "#7B6C00", "#005678", "#4E4694"]);
});

test("appThemes fails closed", () => {
  const trust = structuredClone(tokens);
  trust.appThemes.themed.push("trust.verified.ink");
  assert.throws(() => appThemes(trust), /must not theme trust.verified.ink/);
  const notAcai = structuredClone(tokens);
  notAcai.semantic["accent.wash"].light = "gray.200";
  assert.throws(() => appThemes(notAcai), /themed accent.wash.light must name an acai step/);
  const step = structuredClone(tokens);
  step.appThemes.palettes.maracuja.iconStep = "950";
  assert.throws(() => appThemes(step), /iconStep "950" is not a ramp step/);
  const ramp = structuredClone(tokens);
  ramp.appThemes.palettes.manga = { iconStep: "900" };
  assert.throws(() => appThemes(ramp), /palette "manga" is not a ramp/);
});

test("the icon PNG decodes with zlib and puts the white mark on the background", () => {
  const data = Uint8Array.from({ length: 5000 }, (_, i) => (i < 3000 ? 7 : i % 251));
  assert.deepEqual(new Uint8Array(inflateSync(zlibFixed(data))), data);
  const size = 64;
  const png = iconPng(tokens.appThemes.icon, "#005678", size);
  let offset = 8;
  const chunks = {};
  while (offset < png.length) {
    const len = new DataView(png.buffer, offset).getUint32(0);
    const type = String.fromCharCode(...png.slice(offset + 4, offset + 8));
    chunks[type] = png.slice(offset + 8, offset + 8 + len);
    offset += 12 + len;
  }
  const raw = inflateSync(chunks.IDAT);
  const colour = (x, y) => [...chunks.PLTE.slice(raw[y * (size + 1) + 1 + x] * 3, raw[y * (size + 1) + 1 + x] * 3 + 3)];
  assert.deepEqual(colour(0, 0), [0x00, 0x56, 0x78]);
  assert.deepEqual(colour(32, 32), [255, 255, 255]);
  assert.equal(parsePath(tokens.appThemes.icon.path).length, 1);
  assert.deepEqual(iconPng(tokens.appThemes.icon, "#005678", size), png);
});
