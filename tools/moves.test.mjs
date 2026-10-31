// Account move (docs/move-statements.md, bipe-chat/bipe#693): the vectors check with the reference code.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { canonicalJson, checkMoved, moveError, sentAfterMove, signedBytes } from "./lib/moves.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const vectors = JSON.parse(readFileSync(join(root, "test-vectors/moves.json"), "utf8"));

test("move statements", () => {
  for (const c of vectors.move) assert.equal(moveError(c.statement, vectors.pinned) ?? "valid", c.expect, c.name);
  assert.equal(signedBytes(vectors.move[0].statement).toString("utf8"), vectors.signedBytes);
});

test("moved statements", () => {
  for (const c of vectors.moved) {
    const got = checkMoved(c.envelope, c.subject, vectors.badgeKeys);
    assert.equal(got.error ?? "valid", c.expect, c.name);
    if (c.payload) assert.deepEqual(got.payload, c.payload);
  }
});

test("warning after the move", () => {
  for (const c of vectors.afterMove.cases) assert.equal(sentAfterMove(c.originServerTs, vectors.afterMove.moved), c.expect, c.name);
});

test("canonical JSON sorts keys, keeps UTF-8 and refuses floats", () => {
  assert.equal(canonicalJson({ b: 1, a: { d: [], c: "ã" } }), '{"a":{"c":"ã","d":[]},"b":1}');
  assert.throws(() => canonicalJson({ ts: 1.5 }));
});
