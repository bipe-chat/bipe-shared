import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { accessibilityAnswers, checkAccessibility, checkAppstore, loadAppstore, parseAppstore, playAccessibility, playFullDescription, playListing } from "./lib/appstore.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ledger = JSON.parse(readFileSync(join(root, "product/parity.json"), "utf8"));
const text = readFileSync(join(root, "product/appstore.md"), "utf8");

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

test("Play full description ends with the locale's accessibility paragraph (bipe-chat/bipe#503)", () => {
  const listing = parseAppstore(text);
  const a11y = JSON.parse(readFileSync(join(root, "product/accessibility.json"), "utf8"));
  for (const locale of ["pt-BR", "en-US"]) {
    const full = playFullDescription(listing, locale);
    assert.equal(full, `${listing.platforms.android.locales[locale].full_description}\n\n${playAccessibility(a11y, locale)}`);
    assert.ok(full.length <= 4000, `${locale}: ${full.length} characters`);
  }
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
