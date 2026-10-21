// Store listing check (bipe-chat/bipe#453): parses product/appstore.md and fails on a field over
// its limit, a missing locale, a space after a keyword comma, an em or en dash, "pra" in Bipe
// voice, a panel for a feature that is planned, or a panel title or sub over its limit.
// Usage: node tools/check-appstore.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkAppstore, LOCALES, loadAppstore } from "./lib/appstore.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const listing = loadAppstore(root);
const product = JSON.parse(readFileSync(join(root, "product/product.json"), "utf8"));
const problems = checkAppstore(listing, product);
if (problems.length) {
  for (const p of problems) console.error(`appstore.md: ${p}`);
  process.exit(1);
}
const panels = listing.screenshots[LOCALES[0]].length;
console.log(`check-appstore: ok (iOS and Android, ${LOCALES.join(" and ")}, ${panels} panels)`);
