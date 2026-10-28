// The public routes of the contract are marked, so the bipe-web docs page lists each of them (lib/public-routes.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { operations, publicRoutes } from "./lib/public-routes.mjs";

const yaml = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../api/openapi.yaml"), "utf8");
const ops = operations(yaml);

test("the reader finds the operations", () => {
  assert.ok(ops.length > 100, `only ${ops.length} operations read`);
  assert.ok(ops.every((o) => o.summary), "an operation has no summary");
});

test("a route that says it needs no auth has security: []", () => {
  const unmarked = ops.filter((o) => !o.public && /^(no auth|public\b)/i.test(o.description.trim()));
  assert.deepEqual(unmarked.map((o) => `${o.method} ${o.path}`), []);
});

test("every public route has a pt summary", () => {
  assert.ok(publicRoutes(yaml).every((r) => r.en && r.pt));
});
