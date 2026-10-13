// Takes the next build number for a tester upload (ADR 0072), then regenerates the apps.
// Usage: node tools/bump-build.mjs [--version YY.MM.N]
//   Adds 1 to build in product/version.json. --version also sets the version name; it must not go down.
// Then commit and push bipe-shared, bipe-ios and bipe-android. The push to bipe-shared main claims the number.
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadVersion, saveVersion, validateVersion } from "./lib/version.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const current = loadVersion(root);
const next = { ...current, build: current.build + 1 };

if (args.includes("--version")) {
  next.version = args[args.indexOf("--version") + 1];
  validateVersion(next);
  const parts = (v) => v.split(".").map(Number);
  const [a, b] = [parts(current.version), parts(next.version)];
  const cmp = a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  if (cmp > 0) throw new Error(`--version ${next.version} is lower than ${current.version}`);
}

saveVersion(root, next);
console.log(`${current.version} (${current.build}) -> ${next.version} (${next.build})`);
execFileSync(process.execPath, [join(root, "tools/gen.mjs")], { stdio: "inherit" });
