#!/usr/bin/env node
// Checks the screen specs in product/screens/ (bipe-chat/bipe#546). Exit 1 on a problem.
// Usage: node tools/screens.mjs
// The same check runs in CI through tools/screens.test.mjs.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkScreens, loadScreens } from "./lib/screens.mjs";
import { looseEnds } from "./lib/feature-map.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const problems = checkScreens(root);
// A screen with no capability is a loose end of the feature map (bipe-chat/bipe#1619): a warning, not a failure.
const { items } = JSON.parse(readFileSync(join(root, "product/parity.json"), "utf8"));
const { noCapability } = looseEnds(items, loadScreens(root).map(({ spec }) => spec));
if (noCapability.length) console.warn(`screens: warning: ${noCapability.length} specs list no parity item: ${noCapability.join(", ")}`);
if (problems.length) {
  for (const problem of problems) console.error(`screens: ${problem}`);
  process.exitCode = 1;
} else {
  console.log(`screens: ${loadScreens(root).length} specs ok`);
}
