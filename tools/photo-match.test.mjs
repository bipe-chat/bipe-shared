import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { loadRegistries, photoDistance, photoHash, photoMatches } from "./lib/registries.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const reg = loadRegistries(root);
const vectors = JSON.parse(readFileSync(new URL("../test-vectors/photo-match.json", import.meta.url), "utf8"));

test("photo-match vectors follow the reference and cover both sides of the threshold", () => {
  for (const c of vectors.cases) {
    assert.equal(photoHash(c.gridA, reg), c.hashA, c.name);
    assert.equal(photoHash(c.gridB, reg), c.hashB, c.name);
    assert.equal(photoDistance(c.hashA, c.hashB), c.distance, c.name);
    assert.equal(photoMatches(c.hashA, c.hashB, reg), c.matches, c.name);
  }
  assert.ok(vectors.cases.some((c) => c.matches && c.distance > 0));
  assert.ok(vectors.cases.some((c) => !c.matches && c.distance <= reg.photoMatch.maxDistance + 2));
});

test("photoHash rejects a grid of the wrong size", () => {
  assert.throws(() => photoHash([[0, 1]], reg));
});
