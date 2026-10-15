import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { loadSchedulingVectors, validateSchedulingVectors } from "./lib/scheduling-vectors.mjs";

const document = loadSchedulingVectors(fileURLToPath(new URL("..", import.meta.url)));

test("scheduling oracles have stable names, complete date ranges and time-only public slots", () => {
  validateSchedulingVectors(document);
});

test("scheduling oracle lint rejects duplicate IDs and leaked booking data", () => {
  const duplicate = structuredClone(document);
  duplicate.vectors.push(duplicate.vectors[0]);
  assert.throws(() => validateSchedulingVectors(duplicate), /duplicate scheduling vector/);
  const leaked = structuredClone(document);
  leaked.vectors[0].expected.slots.days[0].slots[0].customer_id = "synthetic";
  assert.throws(() => validateSchedulingVectors(leaked));
});

test("scheduling oracle lint rejects unsorted times and choices outside the free slots", () => {
  const unsorted = structuredClone(document);
  unsorted.vectors[0].expected.slots.days[0].slots.reverse();
  assert.throws(() => validateSchedulingVectors(unsorted), /unique and sorted/);
  const badChoice = structuredClone(document);
  badChoice.vectors[0].expected.picks.push({ start: "2026-10-16T00:00:00.000Z", agenda_id: "a" });
  assert.throws(() => validateSchedulingVectors(badChoice), /chosen agenda needs a free slot/);
});
