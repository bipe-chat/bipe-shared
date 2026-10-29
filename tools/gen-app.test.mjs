import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const p = join(dir, name);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

// bipe-chat/bipe#550: the bipe-app output carries the Bipe licence header, Bipe's own Kotlin package,
// the screen ids, and no Element name (plan section 1).
test("gen.mjs --app writes clean bipe-app output", () => {
  const tmp = mkdtempSync(join(tmpdir(), "bipe-gen-app-"));
  try {
    const out = (name) => join(tmp, name);
    execFileSync(process.execPath, [join(root, "tools/gen.mjs"), "--app", out("app"), "--api", out("none/api/src/generated")], { stdio: "pipe" });
    const files = walk(out("app")).filter((f) => /\.(swift|kt)$/.test(f));
    assert.ok(files.some((f) => f.endsWith("ios/BipeKit/Sources/BipeKit/Generated/BipeScreen.swift")));
    assert.ok(files.some((f) => f.endsWith("android/libraries/bipe/src/main/kotlin/chat/bipe/shared/generated/BipeScreen.kt")));
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      assert.doesNotMatch(text, /io\.element|element-hq/i, file);
      assert.match(text, /SPDX-License-Identifier: AGPL-3\.0-only\n.*Additional permission: APP-STORE-PERMISSION\.md \(AGPL section 7\)/, file);
      // The store captures (bipe-chat/bipe#457) live in the app's screenshotTest source set, with their own package.
      if (file.endsWith("/store/generated/StoreCaptures.kt")) assert.match(text, /^package chat\.bipe\.app\.store\.generated$/m, file);
      else if (file.endsWith(".kt")) assert.match(text, /^package chat\.bipe\.shared\.generated$/m, file);
    }
    assert.match(readFileSync(join(out("app"), "ios/BipeKit/Sources/BipeKit/Generated/BipeScreen.swift"), "utf8"), /case accountStart = "account-start"/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
