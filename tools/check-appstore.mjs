// Store listing check (bipe-chat/bipe#453): parses product/appstore.md and fails on a field over
// its limit, a missing locale, a space after a keyword comma, an em or en dash, "pra" in Bipe
// voice, a panel for a feature that is planned, a panel title or sub over its limit, or sample data in
// product/store-captures.json that the reference scam and Pix logic does not back.
// Usage: node tools/check-appstore.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkAppstore, LOCALES, loadAppstore } from "./lib/appstore.mjs";
import { loadRegistries } from "./lib/registries.mjs";
import { checkStoreCaptures, loadStoreCaptures, missingCaptures } from "./lib/store-captures.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const listing = loadAppstore(root);
const ledger = JSON.parse(readFileSync(join(root, "product/parity.json"), "utf8"));
const captures = loadStoreCaptures(root);
const problems = [...checkAppstore(listing, ledger), ...checkStoreCaptures(captures, loadRegistries(root)).map((p) => `store-captures.json: ${p}`)];
if (problems.length) {
  for (const p of problems) console.error(`appstore.md: ${p}`);
  process.exit(1);
}
const panels = listing.screenshots[LOCALES[0]].length;
const missing = missingCaptures(captures);
if (missing.length) console.warn(`check-appstore: no Android capture source yet for ${missing.join(", ")} (product/store-captures.json, bipe-chat/bipe#457)`);
console.log(`check-appstore: ok (iOS and Android, ${LOCALES.join(" and ")}, ${panels} panels)`);
