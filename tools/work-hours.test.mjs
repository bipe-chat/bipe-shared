import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { isWithinWorkHours, loadRegistries, workHoursProblem } from "./lib/registries.mjs";

// Work side opening hours (ADR 0138 rule 4, bipe-chat/bipe#511).
const root = new URL("..", import.meta.url).pathname;
const reg = loadRegistries(root);
const vectors = JSON.parse(readFileSync(new URL("../test-vectors/work-hours.json", import.meta.url), "utf8"));

test("every work-hours vector passes the reference", () => {
  for (const c of vectors.cases) assert.equal(isWithinWorkHours(c.days, c.timeZone, Date.parse(c.at)), c.open, c.name);
});

test("the default hours are valid and bad hours are refused", () => {
  const max = reg.workHours.maxRangesPerDay;
  assert.equal(workHoursProblem({ days: reg.workHours.defaultDays }, max), null);
  for (const days of [
    [{ day: 0, ranges: [] }],
    [{ day: 1, ranges: [] }, { day: 1, ranges: [] }],
    [{ day: 1, ranges: [{ start: "18:00", end: "08:00" }] }],
    [{ day: 1, ranges: [{ start: "08:00", end: "12:00" }, { start: "12:00", end: "13:00" }] }],
    [{ day: 1, ranges: [{ start: "8:00", end: "12:00" }] }],
    [{ day: 1, ranges: [{ start: "24:00", end: "24:00" }] }],
    [{ day: 1, ranges: Array.from({ length: max + 1 }, (_, i) => ({ start: `0${i}:00`, end: `0${i}:30` })) }],
  ]) assert.notEqual(workHoursProblem({ days }, max), null, JSON.stringify(days));
});
