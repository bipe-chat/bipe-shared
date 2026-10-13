// Drift check (ADR 0031, rule 5): regenerates everything proseio-shared generates into a temporary
// folder and compares it with the generated files in the sibling repos (Swift, Kotlin, API copy,
// proseio/docs/product.md) and with test-vectors/.
// Usage: node tools/check-drift.mjs [--against worktree|head] [--repos <dir>]
//   worktree (default): compare with the files on disk. The pre-commit hook uses this.
//   head: compare with each repo's committed HEAD. CI uses this.
//   --repos: the folder that holds proseio, proseio-ios, proseio-android and proseio-api (default: next to this repo).
// A missing sibling repo is skipped with a warning. Exit 1 on any difference.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const option = (flag, fallback) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : fallback);
const against = option("--against", "worktree");
if (!["worktree", "head"].includes(against)) throw new Error(`--against must be worktree or head, not ${against}`);
const reposDir = resolve(option("--repos", join(root, "..")));

const tmp = mkdtempSync(join(tmpdir(), "bipe-drift-"));
const node = (script, ...scriptArgs) => execFileSync(process.execPath, [join(root, "tools", script), ...scriptArgs], { stdio: "pipe" });

// Where gen.mjs writes, mirrored in tmp. `generatedOnly` folders hold nothing but generated files,
// so an extra file there is stale output.
const TARGETS = [
  {
    repo: "proseio-ios",
    tmpBase: join(tmp, "ios/Sources/BipeKit"),
    repoBase: "Components/BipeKit/Sources/BipeKit",
    generatedOnly: ["Generated"],
  },
  {
    repo: "proseio-android",
    tmpBase: join(tmp, "android/src/main"),
    repoBase: "libraries/bipe/src/main",
    generatedOnly: ["kotlin/io/element/android/libraries/bipe/generated"],
  },
  {
    repo: "proseio-api",
    tmpBase: join(tmp, "api/src/generated"),
    repoBase: "src/generated",
    generatedOnly: ["."],
  },
];

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

function repoFile(repoPath, path) {
  if (against === "worktree") {
    const p = join(repoPath, path);
    return existsSync(p) ? readFileSync(p, "utf8") : null;
  }
  try {
    return execFileSync("git", ["-C", repoPath, "show", `HEAD:${path}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}

function repoFiles(repoPath, dir) {
  if (against === "worktree") return walk(join(repoPath, dir)).map((p) => relative(repoPath, p));
  const out = execFileSync("git", ["-C", repoPath, "ls-files", dir], { encoding: "utf8" });
  return out.split("\n").filter(Boolean);
}

const problems = [];
const warnings = [];
try {
  mkdirSync(join(tmp, "api/src"), { recursive: true }); // gen.mjs writes the API copy only when ../.. exists
  node("gen.mjs", "--swift", join(tmp, "ios/Sources/BipeKit/Generated"), "--kotlin", join(tmp, "android/src/main"), "--api", join(tmp, "api/src/generated"));
  node("gen-test-vectors.mjs", "--out", join(tmp, "test-vectors"));
  node("gen-product-doc.mjs", "--out", join(tmp, "product.md"));

  for (const target of TARGETS) {
    const repoPath = join(reposDir, target.repo);
    if (!existsSync(repoPath)) {
      warnings.push(`${target.repo}: not found in ${reposDir}, skipped`);
      continue;
    }
    const expected = new Set();
    for (const file of walk(target.tmpBase)) {
      const path = join(target.repoBase, relative(target.tmpBase, file));
      expected.add(path);
      const actual = repoFile(repoPath, path);
      if (actual === null) problems.push(`${target.repo}: ${path} is missing`);
      else if (actual !== readFileSync(file, "utf8")) problems.push(`${target.repo}: ${path} differs from the generator output`);
    }
    for (const dir of target.generatedOnly) {
      for (const path of repoFiles(repoPath, join(target.repoBase, dir))) {
        if (!expected.has(path) && !path.endsWith(".DS_Store")) problems.push(`${target.repo}: ${path} is not generator output (stale?)`);
      }
    }
  }

  // proseio/docs/product.md is generated from product/.
  const umbrella = join(reposDir, "proseio");
  if (!existsSync(umbrella)) warnings.push(`proseio: not found in ${reposDir}, skipped`);
  else if (repoFile(umbrella, "docs/product.md") !== readFileSync(join(tmp, "product.md"), "utf8")) {
    problems.push("proseio: docs/product.md is out of date (run node tools/gen-product-doc.mjs)");
  }

  // test-vectors: generated files must match; invite-codes.json is hand-written and checked by gen-test-vectors.
  for (const file of walk(join(tmp, "test-vectors"))) {
    const path = join("test-vectors", relative(join(tmp, "test-vectors"), file));
    const actual = repoFile(root, path);
    if (actual !== readFileSync(file, "utf8")) problems.push(`proseio-shared: ${path} is out of date (run node tools/gen-test-vectors.mjs)`);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

for (const w of warnings) console.warn(`warning: ${w}`);
if (problems.length) {
  console.error(`drift check failed (${problems.length}, against ${against}):\n- ${problems.join("\n- ")}\nFix: node tools/gen.mjs, then commit the generated files in each repo.`);
  process.exit(1);
}
console.log(`drift check ok (against ${against})`);
