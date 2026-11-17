import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { generateHomeScore } from "./lib/gen-home-score.mjs";
import { generateRustRegistries } from "./lib/gen-rust.mjs";
import { homePlan, homeScore, homeUnits } from "./lib/home-score.mjs";
import { loadRegistries, validateHomeScore } from "./lib/registries.mjs";

const root = new URL("../", import.meta.url).pathname;
const reg = loadRegistries(root);
const policy = reg.homeScore;
const vectors = JSON.parse(readFileSync(new URL("../test-vectors/home-score.json", import.meta.url)));

for (const c of vectors.score) test(`score: ${c.name}`, () => {
  const { score, reason } = homeScore(c.input, policy);
  assert.deepEqual({ score, reason, tier: homePlan([c.input], policy)[0].tier }, c.expected);
});
for (const c of vectors.plan) test(`plan: ${c.name}`, () => {
  assert.deepEqual(homePlan(c.input, policy).map(({ id, score, tier }) => ({ id, score, tier })), c.expected);
});

test("the vectors cover each rule of ADR 0246", () => {
  const scores = new Set(vectors.score.map((c) => c.expected.score));
  for (const needed of [0.6, 0.3, 0.14]) assert.ok(scores.has(needed), `no vector at ${needed}`);
  assert.ok(vectors.score.some((c) => c.input.muted && c.input.mentioned), "muted with a mention");
  assert.ok(vectors.score.some((c) => c.input.muted && !c.input.mentioned), "muted without a mention");
  assert.ok(vectors.score.some((c) => c.input.kind === "company" && !c.input.hasSeal), "company without a seal");
  assert.ok(vectors.score.some((c) => c.input.official), "official");
  assert.ok(vectors.score.some((c) => !("modelAttention" in c.input)), "model fields absent");
  assert.ok(vectors.score.some((c) => "modelAttention" in c.input), "model fields present");
  assert.ok(vectors.plan.some((c) => c.expected.some((t) => t.tier === null)), "a chat with no tile");
});

test("the vectors hold fixture IDs only", () => {
  for (const c of [...vectors.score.map((v) => v.input), ...vectors.plan.flatMap((v) => v.input)]) assert.match(c.id, /:example\.test$/);
});

test("the ADR limits hold", () => {
  assert.deepEqual(policy.tiers.map((t) => [t.minScore, t.maxChats]), [[0.6, 2], [0.3, 6], [0.14, null], [0, 12]]);
  assert.equal(policy.model.status, "unused-step-1");
  assert.equal(homeUnits(policy.model.maxWeight), 2600);
});

test("an invalid registry fails closed", () => {
  const broken = [
    (h) => { h.weights.mention = "0.24"; },
    (h) => { h.weights.extra = 0.1; },
    (h) => { delete h.tie.max; },
    (h) => { h.weights.favourite = 0.12345; },
    (h) => { h.mutedFactor = 1; },
    (h) => { h.tiers[0].minScore = 0.2; },
    (h) => { h.tiers[0].maxChats = null; },
    (h) => { h.officialCap = 0.5; },
    (h) => { h.model.status = "active"; },
    (h) => { h.model.attention.none = 0.1; },
    (h) => { h.model.maxWeight = 0.1; },
  ];
  for (const change of broken) assert.throws(() => validateCopy(change), /home-score/);
});

function validateCopy(change) {
  const copy = structuredClone(policy);
  change(copy);
  return validateHomeScore(copy);
}

test("generated code carries the registry values", () => {
  // The app wrappers call bipe-core (bipe-chat/bipe#1478) and keep the tier table.
  for (const [language, quote] of [["swift", JSON.stringify], ["kotlin", JSON.stringify]]) {
    const text = generateHomeScore(policy, language, "// header\n", quote);
    assert.match(text, /BipeHomeScore/);
    assert.match(text, /BipeHomeChat/);
    assert.match(text, /homePlan\(/);
    assert.ok(text.includes(String(Math.floor(policy.tiers[0].minScore * 100 + 0.5))));
  }
  // The weights reach the core through gen-rust.mjs.
  const rust = generateRustRegistries(loadRegistries(root), "// header\n");
  assert.ok(rust.includes(`HOME_WEIGHT_MENTION: f64 = ${policy.weights.mention}`));
  assert.ok(rust.includes(`HOME_UNANSWERED_MAX_MINUTES: i64 = ${policy.unansweredMaxMinutes}`));
});

test("the web gets the reference and the registry", () => {
  assert.match(readFileSync(new URL("./lib/gen-web.mjs", import.meta.url), "utf8"), /"home-score\.mjs"/);
  assert.doesNotMatch(readFileSync(new URL("./lib/home-score.mjs", import.meta.url), "utf8"), /node:/);
});
