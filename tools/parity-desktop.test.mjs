import assert from "node:assert/strict";
import { test } from "node:test";
import { checkDesktop } from "./lib/parity-desktop.mjs";

const item = (macos, windows = { status: "planned", issue: 1019 }) => ({ id: "example", macos, windows });
test("desktop gaps name their tracker and cannot silently disappear", () => {
  const checked = checkDesktop([item({ status: "planned", issue: 1018 })], () => true);
  assert.deepEqual(checked.problems, []);
  assert.deepEqual(checked.issueRefs.map(ref => ref.issue), [1018, 1019]);
  assert.match(checkDesktop([item("planned", undefined)], () => true).problems.join(), /open issue/);
  assert.match(checkDesktop([{ id: "missing" }], () => true).problems.join(), /valid status/);
});
test("shared code or phone UI alone cannot claim desktop parity", () => {
  for (const evidence of [["bipe-app/ios/BipeKit/Sources/BipeKit/Example.swift"], ["bipe-app/ios/Bipe/Example.swift"], ["bipe-app/windows/Example.kt"]]) {
    assert.ok(checkDesktop([item({ status: "built", evidence })], () => true).problems.length);
  }
  assert.deepEqual(checkDesktop([item({ status: "built", evidence: ["bipe-app/macos/BipeMac/Example.swift"] })], () => true).problems, []);
  assert.match(checkDesktop([item({ status: "testing", evidence: ["bipe-app/macos/Missing.swift"] })], () => false).problems.join(), /does not exist/);
});
test("desktop exclusions need a policy decision and evidence is checked only for implemented entries", () => {
  assert.ok(checkDesktop([item({ status: "n/a", reason: "phone" })], () => true).problems.length);
  assert.ok(checkDesktop([item({ status: "policy", adr: 266 })], () => true).problems.length);
  assert.deepEqual(checkDesktop([item({ status: "policy", reason: "Phone approval", adr: 266 })], () => true).problems, []);
  assert.ok(checkDesktop([item({ status: "planned", issue: 1018, evidence: ["bipe-app/macos/Example.swift"] })], () => true).problems.length);
});
