// Writes bipe/docs/feature-map.md from product/product.json, product/parity.json and product/screens/
// (bipe-chat/bipe#1619): how marketed features, capabilities and screens connect, with the status per surface.
// The text is in tools/lib/feature-map.mjs. check-drift.mjs fails when the file in bipe is out of date.
// Usage: node tools/gen-feature-map.mjs [--out <file>] [--print]
//   --print: write to stdout, with a line that names the bipe-shared commit. Paste that text into the
//   Starlings document "Feature map: Bipe" (/product/feature-map-bipe). Starlings has no write path from CI yet.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { featureMap } from "./lib/feature-map.mjs";
import { loadScreens } from "./lib/screens.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const outIndex = args.indexOf("--out");
const out = resolve(outIndex >= 0 ? args[outIndex + 1] : join(root, "../bipe/docs/feature-map.md"));
const print = args.includes("--print");

const product = JSON.parse(readFileSync(join(root, "product/product.json"), "utf8"));
const { items } = JSON.parse(readFileSync(join(root, "product/parity.json"), "utf8"));
const screens = loadScreens(root).map(({ spec }) => spec);

let source;
if (print) {
  const run = (...a) => execFileSync("git", ["-C", root, ...a], { encoding: "utf8" }).trim();
  const dirty = run("status", "--porcelain", "--", "product").length > 0;
  source = `Source: \`bipe-shared\` commit \`${run("rev-parse", "--short", "HEAD")}\` (${run("show", "-s", "--format=%cs", "HEAD")})${dirty ? ", with uncommitted changes in product/" : ""}.`;
}
const text = `${featureMap({ product, items, screens, source })}\n`;
if (print) process.stdout.write(text);
else {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, text);
  console.log(`wrote ${out}`);
}
