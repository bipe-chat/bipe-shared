// tools/lib/rust-regex.mjs: the registry regexes reach bipe-core in the Rust `regex` syntax (docs/scam-matching.md).
import { test } from "node:test";
import assert from "node:assert/strict";
import { rustRegex } from "./lib/rust-regex.mjs";
import { loadRegistries } from "./lib/registries.mjs";

test("guards become consumed characters around group 1", () => {
  assert.deepEqual(rustRegex("(?<![0-9])9[0-9]{4}(?![0-9A-Za-z-])"), { regex: "(?:^|[^0-9])(9[0-9]{4})(?:[^0-9A-Za-z-]|$)", guardBefore: true });
  assert.deepEqual(rustRegex("a+@b"), { regex: "(a+@b)", guardBefore: false });
});

test("JavaScript classes become explicit", () => {
  assert.match(rustRegex(String.raw`a\sb`).regex, /^\(a\[\\t\\n.*\\x\{FEFF\}\]b\)$/);
  assert.equal(rustRegex(String.raw`[\d.]`).regex, "([0-9.])");
  assert.equal(rustRegex("x.*y").regex, String.raw`(x[^\n\r\x{2028}\x{2029}]*y)`);
  assert.equal(rustRegex("(?i:pix)").regex, "((?i-u:pix))");
  assert.equal(rustRegex(String.raw`a\/b`).regex, "(a/b)");
});

test("constructs outside the subset fail", () => {
  for (const bad of ["a(?=b)", "(?<!a)b", "(?<![^a])b", "a.b", "a.{3}", "[^a]", "\\bword", "(a)\\1", "é", "(?<x>a)", "[a"]) {
    assert.throws(() => rustRegex(bad), undefined, bad);
  }
});

test("every scam pattern translates", () => {
  const reg = loadRegistries(new URL("..", import.meta.url).pathname);
  for (const group of ["pixKeyPatterns", "pixCopyPastePatterns", "boletoPatterns", "linkPatterns"]) {
    for (const p of reg.scam[group]) assert.doesNotThrow(() => rustRegex(p.regex), `${group}.${p.id}`);
  }
});
