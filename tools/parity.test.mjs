import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkApps, forkGaps, inForkScope } from "./lib/parity-apps.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// A fake bipe-app checkout with two files.
const files = new Set(["ios/Bipe/A.swift", "android/app/A.kt"]);
const exists = (repo, path) => (repo === "bipe-app" ? files.has(path) : null);
const noCheckout = () => null;

const item = (overrides = {}) => ({
  id: "x",
  name: "X",
  ios: { status: "built", evidence: ["bipe-app/ios/Bipe/A.swift"] },
  android: { status: "built", evidence: ["bipe-app/android/app/A.kt"] },
  web: "planned",
  server: "planned",
  fork: true,
  ...overrides,
});
const problems = (items, ex = exists) => checkApps(items, ex).problems;

test("a built item with evidence on both apps passes", () => {
  assert.deepEqual(problems([item()]), []);
});

test("missing app surfaces and invalid statuses fail", () => {
  const { ios: _, ...noIos } = item();
  assert.match(problems([noIos])[0], /ios status must be one of/);
  assert.match(problems([item({ android: "done" })])[0], /android status must be one of/);
  assert.match(problems([item({ fork: false })])[0], /fork is true or absent/);
});

test("missing evidence fails", () => {
  assert.match(problems([item({ ios: { status: "built" } })])[0], /ios is built without evidence/);
  assert.match(problems([item({ ios: { status: "testing", evidence: ["bipe-app/ios/Bipe/Gone.swift"] } })])[0], /does not exist/);
});

test("a spec or the other platform is not evidence", () => {
  const spec = item({ ios: { status: "built", evidence: ["bipe-shared/product/screens/x.json"] } });
  assert.match(problems([spec])[0], /must start with bipe-app\/ios\//);
  const wrongPlatform = item({ android: { status: "built", evidence: ["bipe-app/ios/Bipe/A.swift"] } });
  assert.match(problems([wrongPlatform])[0], /must start with bipe-app\/android\//);
});

test("evidence on a planned surface fails", () => {
  const planned = item({ ios: { status: "planned", issue: 1, evidence: ["bipe-app/ios/Bipe/A.swift"] }, android: { status: "planned", issue: 1 } });
  assert.match(problems([planned]).join("\n"), /evidence only goes with built or testing/);
});

test("fork scope, planned without an issue fails, with an issue passes", () => {
  const noIssue = item({ ios: "planned", android: "planned" });
  assert.equal(problems([noIssue]).filter((p) => /planned without the issue/.test(p)).length, 2);
  const withIssue = item({ ios: { status: "planned", issue: 7 }, android: { status: "planned", issue: 7 } });
  assert.deepEqual(problems([withIssue]), []);
  assert.deepEqual(checkApps([withIssue], exists).issueRefs.map((r) => r.issue), [7, 7]);
});

test("fork scope, n/a needs an ADR and policy is not allowed", () => {
  const na = item({ ios: { status: "n/a", reason: "r" }, android: { status: "n/a", reason: "r", adr: 143 } });
  assert.deepEqual(problems([na]), ["item x: the fork app ships it, ios is n/a without the ADR that excludes it"]);
  assert.match(problems([item({ ios: "policy", android: "policy" })])[0], /cannot be policy/);
});

test("fork scope, n/a with fork: false passes where the fork does not ship it", () => {
  const androidOnly = item({ ios: { status: "n/a", reason: "r", fork: false }, android: { status: "planned", issue: 7 } });
  assert.deepEqual(problems([androidOnly]), []);
  const wrong = item({ ios: { status: "planned", issue: 7, fork: false }, android: { status: "planned", issue: 7 } });
  assert.deepEqual(problems([wrong]), ["item x: ios fork: false only goes with n/a"]);
});

test("out of fork scope, planned needs no issue", () => {
  const { fork: _, ...notFork } = item({ ios: "planned", android: "planned" });
  const planned = notFork;
  assert.equal(inForkScope(planned), false);
  assert.deepEqual(problems([planned]), []);
});

test("a gap between the apps names an issue", () => {
  const { fork: _, ...gap } = item({ android: "planned" });
  assert.match(problems([gap])[0], /ios is built, android is planned, and no issue closes the gap/);
  assert.deepEqual(problems([{ ...gap, android: { status: "planned", issue: 9 } }]), []);
});

test("without a bipe-app checkout the evidence is not checked", () => {
  const result = checkApps([item({ ios: { status: "built", evidence: ["bipe-app/ios/Gone.swift"] } })], noCheckout);
  assert.deepEqual(result.problems, []);
  assert.deepEqual(result.unchecked, ["bipe-app"]);
});

test("fork gaps list the apps that do not ship a fork item", () => {
  const gaps = forkGaps([item(), item({ id: "y", android: { status: "planned", issue: 3 } })]);
  assert.deepEqual(gaps.map((g) => [g.item.id, g.missing]), [["y", ["android"]]]);
});

test("the ledger has both app surfaces on every item and covers the fork scope", () => {
  const ledger = JSON.parse(readFileSync(join(root, "product/parity.json"), "utf8"));
  // Evidence paths need a bipe-app checkout: tools/parity.mjs checks them against the sibling repos.
  assert.deepEqual(checkApps(ledger.items, noCheckout).problems, []);
});
