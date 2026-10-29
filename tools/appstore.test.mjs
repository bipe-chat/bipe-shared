import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { accessibilityAnswers, checkAccessibility, checkAppstore, loadAppstore, parseAppstore, playAccessibility, playFullDescription } from "./lib/appstore.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ledger = JSON.parse(readFileSync(join(root, "product/parity.json"), "utf8"));
const text = readFileSync(join(root, "product/appstore.md"), "utf8");

test("product/appstore.md passes the store listing check", () => {
  assert.deepEqual(checkAppstore(loadAppstore(root), ledger), []);
});

test("Android full description falls back to the iOS description, then the accessibility paragraph", () => {
  const listing = parseAppstore(text);
  const a11y = JSON.parse(readFileSync(join(root, "product/accessibility.json"), "utf8"));
  assert.equal(playFullDescription(listing, "pt-BR"), `${listing.platforms.ios.locales["pt-BR"].description}\n\n${playAccessibility(a11y, "pt-BR")}`);
});

test("## Accessibility matches product/accessibility.json, and a label is yes only when all its items are", () => {
  const a11y = JSON.parse(readFileSync(join(root, "product/accessibility.json"), "utf8"));
  assert.deepEqual(checkAccessibility(loadAppstore(root), a11y), []);
  const one = structuredClone(a11y);
  one.items.find((i) => i.id === "text-size").status.ios = "partial";
  assert.equal(accessibilityAnswers(one).find((a) => a.id === "larger-text").answer, "no");
  assert.equal(accessibilityAnswers(a11y).find((a) => a.id === "captions").answer, "no");
  assert.match(checkAccessibility(loadAppstore(root), one).join("\n"), /differs/);
  one.appStore.labels[0].items.push("nope");
  assert.match(checkAccessibility(loadAppstore(root), one).join("\n"), /unknown item nope/);
});
