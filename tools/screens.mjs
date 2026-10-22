#!/usr/bin/env node
// Checks the screen specs in product/screens/ (bipe-chat/bipe#546). Exit 1 on a problem.
// Usage: node tools/screens.mjs
// The same check runs in CI through tools/screens.test.mjs.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkScreens, loadScreens } from "./lib/screens.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const problems = checkScreens(root);
if (problems.length) {
  for (const problem of problems) console.error(`screens: ${problem}`);
  process.exitCode = 1;
} else {
  console.log(`screens: ${loadScreens(root).length} specs ok`);
}
