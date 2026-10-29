import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { accessibilityAnswers, ascAccessibility, checkAccessibility, checkAppstore, loadAppstore, parseAppstore, playAccessibilityBlock, playFullDescription, playListing, writeAccessibility } from "./lib/appstore.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ledger = JSON.parse(readFileSync(join(root, "product/parity.json"), "utf8"));
const text = readFileSync(join(root, "product/appstore.md"), "utf8");
const a11y = JSON.parse(readFileSync(join(root, "product/accessibility.json"), "utf8"));

test("product/appstore.md passes the store listing check", () => {
  assert.deepEqual(checkAppstore(loadAppstore(root), ledger), []);
});

test("Android full description is required in every locale (bipe-chat/bipe#457)", () => {
  const listing = parseAppstore(text);
  for (const locale of ["pt-BR", "en-US"]) assert.ok(playFullDescription(listing, locale).length > 0);
  delete listing.platforms.android.locales["en-US"].full_description;
  assert.ok(checkAppstore(listing, ledger).includes("android.en-US.full_description: missing"));
});

test("Play listing of a locale has the edits.listings fields", () => {
  const listing = parseAppstore(text);
  const pt = playListing(listing, "pt-BR");
  assert.deepEqual(Object.keys(pt), ["language", "title", "shortDescription", "fullDescription"]);
  assert.equal(pt.language, "pt-BR");
  assert.equal(pt.title, listing.platforms.android.locales["pt-BR"].title);
});

test("Play full description has a limit of 4000 characters", () => {
  const listing = parseAppstore(text);
  listing.platforms.android.locales["pt-BR"].full_description = "a".repeat(4001);
  assert.ok(checkAppstore(listing, ledger).includes("android.pt-BR.full_description: 4001 characters, limit 4000"));
});

// Accessibility (bipe-chat/bipe#503).
test("appstore.md accessibility table and Play paragraphs match the register", () => {
  assert.deepEqual(checkAccessibility(parseAppstore(text), a11y), []);
  assert.equal(writeAccessibility(text, a11y), text);
});

test("an Apple label is yes only when every register item it names is yes on that platform", () => {
  const copy = structuredClone(a11y);
  const answer = (id, platform = "ios") => accessibilityAnswers(copy, platform).find((a) => a.id === id).supported;
  assert.equal(answer("voiceover"), true);
  assert.equal(answer("voice-control"), false);
  copy.items.find((it) => it.id === "gestures").status.ios = "partial";
  assert.equal(answer("voiceover"), false);
  assert.equal(answer("voiceover", "android"), true);
});

test("the App Store declaration comes from the appstore.md table", () => {
  const [iphone] = ascAccessibility(parseAppstore(text));
  assert.equal(iphone.deviceFamily, "IPHONE");
  assert.equal(Object.keys(iphone.attributes).length, a11y.appStore.labels.length);
  for (const a of accessibilityAnswers(a11y, "ios")) assert.equal(iphone.attributes[a.attribute], a.supported, a.name);
});

test("a changed register makes the check fail until --write", () => {
  const copy = structuredClone(a11y);
  copy.items.find((it) => it.id === "reduce-motion").status.android = "partial";
  const problems = checkAccessibility(parseAppstore(text), copy);
  assert.ok(problems.some((p) => p.startsWith("android.pt-BR.full_description: the accessibility paragraph")));
  copy.items.find((it) => it.id === "reduce-motion").status.ios = "partial";
  assert.ok(checkAccessibility(parseAppstore(text), copy).some((p) => p.startsWith("accessibility: the table differs")));
  const written = writeAccessibility(text, copy);
  assert.deepEqual(checkAccessibility(parseAppstore(written), copy), []);
  assert.ok(!playAccessibilityBlock(copy, "pt-BR").includes("Remover animações"));
});
