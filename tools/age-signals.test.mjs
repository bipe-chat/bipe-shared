import assert from "node:assert/strict";
import { test } from "node:test";
import { ageBand, ageTreatedAsMinor, loadRegistries, validateAgeSignals } from "./lib/registries.mjs";

// Age signals (bipe ADR 0229, bipe-chat/bipe#994).
const root = new URL("..", import.meta.url).pathname;
const reg = loadRegistries(root);

test("an OS range maps to the band of its lowest age", () => {
  const cases = [
    [null, null, "unknown"],
    [undefined, undefined, "unknown"],
    [null, 12, "under_13"],
    [0, 12, "under_13"],
    [13, 15, "13_15"],
    [16, 17, "16_17"],
    [18, null, "18_plus"],
    [21, 25, "18_plus"],
    [13, 17, "13_15"],
    [null, 17, "under_13"],
    [-1, null, "unknown"],
    [1.5, null, "unknown"],
  ];
  for (const [lower, upper, band] of cases) assert.equal(ageBand(lower, upper, reg), band, `${lower}-${upper}`);
});

test("only the adult band leaves the under-18 defaults", () => {
  assert.equal(ageTreatedAsMinor("18_plus", reg), false);
  for (const band of ["unknown", "under_13", "13_15", "16_17"]) assert.equal(ageTreatedAsMinor(band, reg), true, band);
});

test("bad registries are refused", () => {
  const good = reg.ageSignals;
  assert.throws(() => validateAgeSignals({ ...good, appleGates: [13, 16, 18, 21] }));
  assert.throws(() => validateAgeSignals({ ...good, appleGates: [16, 13] }));
  assert.throws(() => validateAgeSignals({ ...good, bands: [{ id: "a", max: 12 }, { id: "b", min: 14 }] }));
  assert.throws(() => validateAgeSignals({ ...good, adultBand: "adult" }));
  assert.throws(() => validateAgeSignals({ ...good, sources: ["apple"] }));
});
