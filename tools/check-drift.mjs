// Drift check (ADR 0031, rule 5): regenerates everything bipe-shared generates into a temporary folder and
// compares it with the generated files in the sibling repos (bipe-app Swift and Kotlin, the bipe-api copy,
// bipe/docs/product.md) and with test-vectors/. The Element X forks are archived and not checked (ADR 0155).
// Usage: node tools/check-drift.mjs [--against worktree|head] [--repos <dir>]
//   worktree (default): compare with the files on disk. The pre-commit hook uses this.
//   head: compare with each repo's committed HEAD. CI uses this.
//   --repos: the folder that holds bipe, bipe-api and bipe-app (default: next to this repo).
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
    repo: "bipe-api",
    tmpBase: join(tmp, "api/src/generated"),
    repoBase: "src/generated",
    generatedOnly: ["."],
  },
  // Test fixtures from gen-test-vectors.mjs. The folder also holds hand-written files.
  { repo: "bipe-api", tmpBase: join(tmp, "api/test/fixtures"), repoBase: "test/fixtures", generatedOnly: [] },
  // Bipe's own client (bipe-chat/bipe#550).
  {
    repo: "bipe-app",
    tmpBase: join(tmp, "app/ios/BipeKit/Sources/BipeKit"),
    repoBase: "ios/BipeKit/Sources/BipeKit",
    generatedOnly: ["Generated"],
  },
  {
    repo: "bipe-app",
    tmpBase: join(tmp, "app/android/libraries/bipe/src/main"),
    repoBase: "android/libraries/bipe/src/main",
    generatedOnly: ["kotlin/chat/bipe/shared/generated"],
  },
  // Store captures (bipe-chat/bipe#457): the sample data of the Android capture source.
  {
    repo: "bipe-app",
    tmpBase: join(tmp, "app/android/app/src/screenshotTest/kotlin/chat/bipe/app/store"),
    repoBase: "android/app/src/screenshotTest/kotlin/chat/bipe/app/store",
    generatedOnly: ["generated"],
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
  node("gen.mjs", "--app", join(tmp, "app"), "--api", join(tmp, "api/src/generated"));
  node("gen-test-vectors.mjs", "--out", join(tmp, "test-vectors"), "--api-test-vectors", join(tmp, "api/test/fixtures"));
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


  // bipe/docs/product.md is generated from product/.
  const umbrella = join(reposDir, "bipe");
  if (!existsSync(umbrella)) warnings.push(`bipe: not found in ${reposDir}, skipped`);
  else if (repoFile(umbrella, "docs/product.md") !== readFileSync(join(tmp, "product.md"), "utf8")) {
    problems.push("bipe: docs/product.md is out of date (run node tools/gen-product-doc.mjs)");
  }

  // test-vectors: generated files must match; invite-codes.json is hand-written and checked by gen-test-vectors.
  for (const file of walk(join(tmp, "test-vectors"))) {
    const path = join("test-vectors", relative(join(tmp, "test-vectors"), file));
    const actual = repoFile(root, path);
    if (actual !== readFileSync(file, "utf8")) problems.push(`bipe-shared: ${path} is out of date (run node tools/gen-test-vectors.mjs)`);
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
