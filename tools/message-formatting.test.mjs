import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateMessageFormatting } from "./lib/registries.mjs";

const policy = JSON.parse(readFileSync(new URL("../registries/message-formatting.json", import.meta.url), "utf8"));
test("message formatting rejects active-content and local-file schemes", () => {
  validateMessageFormatting(policy);
  for (const scheme of ["javascript", "data", "file", "vbscript"]) {
    assert.throws(() => validateMessageFormatting({ ...policy, safeSchemes: [...policy.safeSchemes, scheme] }), /unsafe scheme/);
  }
});
test("message formatting requires bounded parsing", () => {
  assert.throws(() => validateMessageFormatting({ ...policy, maxDepth: 100000 }), /parser limits/);
  assert.throws(() => validateMessageFormatting({ ...policy, maxHtmlLength: 1000000000 }), /parser limits/);
});
