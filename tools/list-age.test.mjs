import assert from "node:assert/strict";
import { test } from "node:test";
import { listAgeProblems } from "./lib/list-age.mjs";

const DAY = 86400;
const now = 1_800_000_000;
const fresh = (version, issuedDaysAgo, expiresInDays) => ({
  newest: { version, issued: now - issuedDaysAgo * DAY },
  served: { version, expires: now + expiresInDays * DAY },
});
const both = (f) => ({ newest: { operators: f.newest, issuers: f.newest }, served: { operators: f.served, issuers: f.served }, now });

test("a list signed this week and served with more than 5 days left is fine", () => {
  assert.deepEqual(listAgeProblems(both(fresh(2, 3, 11))), []);
});

test("a list signed more than 8 days ago is overdue", () => {
  const problems = listAgeProblems(both(fresh(2, 8.5, 5.5)));
  assert.equal(problems.length, 2);
  assert.match(problems[0], /signed 8\.5 days ago/);
});

test("a served list that expires within 5 days alerts, also when main is fresh", () => {
  const input = both(fresh(3, 1, 4));
  assert.equal(listAgeProblems(input).filter((p) => /expires in 4\.0 days/.test(p)).length, 2);
});

test("a core behind main alerts after the grace time only", () => {
  const behind = (days) => ({ ...both(fresh(3, days, 10)), served: { operators: { version: 2, expires: now + 10 * DAY }, issuers: { version: 3, expires: now + 10 * DAY } } });
  assert.deepEqual(listAgeProblems(behind(1)), []);
  assert.match(listAgeProblems(behind(3))[0], /serves version 2, main has version 3/);
});

test("no list on main or at the core is a problem", () => {
  assert.equal(listAgeProblems({ newest: {}, served: {}, now }).length, 2);
  assert.equal(listAgeProblems({ newest: both(fresh(1, 1, 13)).newest, served: { operators: null, issuers: null }, now }).length, 2);
});
