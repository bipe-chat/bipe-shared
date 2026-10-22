import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkNewSurfaces, inSwitchScope, switchGaps } from "./lib/parity-new.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// A fake bipe-app checkout with two files.
const files = new Set(["ios/Bipe/A.swift", "android/app/A.kt"]);
const exists = (repo, path) => (repo === "bipe-app" ? files.has(path) : null);
const noCheckout = () => null;

const item = (overrides = {}) => ({
  id: "x",
  name: "X",
  ios: { status: "built", evidence: ["bipe-ios/X.swift"] },
  android: { status: "built", evidence: ["bipe-android/X.kt"] },
  web: "planned",
  server: "planned",
  "ios-new": { status: "built", evidence: ["bipe-app/ios/Bipe/A.swift"] },
  "android-new": { status: "built", evidence: ["bipe-app/android/app/A.kt"] },
  ...overrides,
});
const problems = (items, ex = exists) => checkNewSurfaces(items, ex).problems;

test("a built item with evidence on both new surfaces passes", () => {
  assert.deepEqual(problems([item()]), []);
});

test("missing new surfaces and invalid statuses fail", () => {
  const { "ios-new": _, ...noIosNew } = item();
  assert.match(problems([noIosNew])[0], /ios-new status must be one of/);
  assert.match(problems([item({ "android-new": "done" })])[0], /android-new status must be one of/);
});

test("missing evidence fails", () => {
  assert.match(problems([item({ "ios-new": { status: "built" } })])[0], /ios-new is built without evidence/);
  assert.match(problems([item({ "ios-new": { status: "testing", evidence: ["bipe-app/ios/Bipe/Gone.swift"] } })])[0], /does not exist/);
});

test("a spec or the other platform is not evidence", () => {
  const spec = item({ "ios-new": { status: "built", evidence: ["bipe-shared/product/screens/x.json"] } });
  assert.match(problems([spec])[0], /must start with bipe-app\/ios\//);
  const wrongPlatform = item({ "android-new": { status: "built", evidence: ["bipe-app/ios/Bipe/A.swift"] } });
  assert.match(problems([wrongPlatform])[0], /must start with bipe-app\/android\//);
});

test("evidence on a planned surface fails", () => {
  const planned = item({ "ios-new": { status: "planned", issue: 1, evidence: ["bipe-app/ios/Bipe/A.swift"] }, "android-new": { status: "planned", issue: 1 } });
  assert.match(problems([planned]).join("\n"), /evidence only goes with built or testing/);
});

test("in switch scope, planned without an issue fails, with an issue passes", () => {
  const noIssue = item({ "ios-new": "planned", "android-new": "planned" });
  assert.equal(problems([noIssue]).filter((p) => /planned without the issue/.test(p)).length, 2);
  const withIssue = item({ "ios-new": { status: "planned", issue: 7 }, "android-new": { status: "planned", issue: 7 } });
  assert.deepEqual(problems([withIssue]), []);
  assert.deepEqual(checkNewSurfaces([withIssue], exists).issueRefs.map((r) => r.issue), [7, 7]);
});

test("in switch scope, n/a needs an ADR and policy is not allowed", () => {
  const na = item({ "ios-new": { status: "n/a", reason: "r" }, "android-new": { status: "n/a", reason: "r", adr: 143 } });
  assert.deepEqual(problems([na]), ["item x: in switch scope, ios-new is n/a without the ADR that excludes it"]);
  assert.match(problems([item({ "ios-new": "policy", "android-new": "policy" })])[0], /cannot be policy/);
});

test("out of switch scope, planned needs no issue", () => {
  const planned = item({ ios: "planned", android: "planned", "ios-new": "planned", "android-new": "planned" });
  assert.equal(inSwitchScope(planned), false);
  assert.deepEqual(problems([planned]), []);
});

test("a gap between the new apps names an issue", () => {
  const gap = item({ ios: "planned", android: "planned", "android-new": "planned" });
  assert.match(problems([gap])[0], /ios-new is built, android-new is planned, and no issue closes the gap/);
  assert.deepEqual(problems([{ ...gap, "android-new": { status: "planned", issue: 9 } }]), []);
});

test("without a bipe-app checkout the evidence is not checked", () => {
  const result = checkNewSurfaces([item({ "ios-new": { status: "built", evidence: ["bipe-app/ios/Gone.swift"] } })], noCheckout);
  assert.deepEqual(result.problems, []);
  assert.deepEqual(result.unchecked, ["bipe-app"]);
});

test("switch gaps list the new surfaces that do not ship an in-scope item", () => {
  const gaps = switchGaps([item(), item({ id: "y", "android-new": { status: "planned", issue: 3 } })]);
  assert.deepEqual(gaps.map((g) => [g.item.id, g.missing]), [["y", ["android-new"]]]);
});

test("the ledger has both new surfaces on every item and covers the switch scope", () => {
  const ledger = JSON.parse(readFileSync(join(root, "product/parity.json"), "utf8"));
  // Evidence paths need a bipe-app checkout: tools/parity.mjs checks them against the sibling repos.
  assert.deepEqual(checkNewSurfaces(ledger.items, noCheckout).problems, []);
});
