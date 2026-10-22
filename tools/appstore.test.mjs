import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { checkAppstore, loadAppstore, parseAppstore, playFullDescription } from "./lib/appstore.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const product = JSON.parse(readFileSync(join(root, "product/product.json"), "utf8"));
const text = readFileSync(join(root, "product/appstore.md"), "utf8");

test("product/appstore.md passes the store listing check", () => {
  assert.deepEqual(checkAppstore(loadAppstore(root), product), []);
});

test("Android full description falls back to the iOS description", () => {
  const listing = parseAppstore(text);
  assert.equal(playFullDescription(listing, "pt-BR"), listing.platforms.ios.locales["pt-BR"].description);
});
