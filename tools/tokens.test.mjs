import assert from "node:assert/strict";
import { test } from "node:test";
import { contrast, hexToOklch, loadTokens, solveRamps, STEPS } from "../design/ramps/ramp.mjs";
import { generateColors, resolveTokens, VARIANTS } from "./lib/gen-tokens.mjs";

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
  assert.match(swift, /public static let accentFill = dynamic\(0x[0-9A-F]{6}, /);
  for (const set of ["BipeLightColors", "BipeDarkColors", "BipeLightHighContrastColors", "BipeDarkHighContrastColors"]) {
    assert.match(kotlin, new RegExp(`val ${set}: BipeColors`));
  }
  assert.equal((kotlin.match(/^    trustVerifiedInk = Color\(0xFF[0-9A-F]{6}\),$/gm) ?? []).length, 4);
});
