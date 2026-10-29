// Store listing check (bipe-chat/bipe#453): parses product/appstore.md and fails on a field over
// its limit, a missing locale, a space after a keyword comma, an em or en dash, "pra" in Bipe
// voice, a panel for a feature that is planned, or a panel title or sub over its limit.
// The ## Accessibility section is generated from product/accessibility.json (bipe-chat/bipe#503).
// Usage: node tools/check-appstore.mjs [--write]
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { accessibilityBody, checkAccessibility, checkAppstore, LOCALES, loadAppstore } from "./lib/appstore.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const a11y = JSON.parse(readFileSync(join(root, "product/accessibility.json"), "utf8"));
if (process.argv.includes("--write")) {
  const path = join(root, "product/appstore.md");
  const text = readFileSync(path, "utf8");
  const section = `## Accessibility\n\n${accessibilityBody(a11y)}\n\n`;
  const start = text.indexOf("## Accessibility\n");
  const next = start < 0 ? -1 : text.indexOf("\n## ", start + 1);
  const updated = start < 0
    ? text.replace("## Screenshots\n", `${section}## Screenshots\n`)
    : text.slice(0, start) + section + (next < 0 ? "" : text.slice(next + 1));
  writeFileSync(path, updated);
}
const listing = loadAppstore(root);
const ledger = JSON.parse(readFileSync(join(root, "product/parity.json"), "utf8"));
const problems = [...checkAppstore(listing, ledger), ...checkAccessibility(listing, a11y)];
if (problems.length) {
  for (const p of problems) console.error(`appstore.md: ${p}`);
  process.exit(1);
}
const panels = listing.screenshots[LOCALES[0]].length;
console.log(`check-appstore: ok (iOS and Android, ${LOCALES.join(" and ")}, ${panels} panels)`);
