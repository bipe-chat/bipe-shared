import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { checkAppstore, loadAppstore, parseAppstore, playFullDescription, playListing } from "./lib/appstore.mjs";

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
