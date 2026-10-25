import assert from "node:assert/strict";
import { test } from "node:test";
import { loadRegistries, validateDmPowerLevels } from "./lib/registries.mjs";
import { dmPowerLevelsContent, generateDmPowerLevels } from "./lib/gen-dm-power-levels.mjs";

const root = new URL("..", import.meta.url).pathname;
const pl = loadRegistries(root).dmPowerLevels;

test("DM power levels: nobody can invite or change the room, both can talk (ADR 0141)", () => {
  const content = JSON.parse(dmPowerLevelsContent(pl, ["@b:example.test", "@a:example.test", "@a:example.test"]));
  assert.deepEqual(Object.keys(content), [...Object.keys(content)].sort());
  assert.deepEqual(content.users, { "@a:example.test": 0, "@b:example.test": 0 });
  const top = Math.max(...Object.values(content.users), content.users_default);
  for (const key of ["invite", "kick", "ban", "redact", "state_default"]) assert.ok(content[key] > top, key);
  assert.ok(content.notifications.room > top);
  for (const type of ["m.room.name", "m.room.avatar", "m.room.topic", "m.room.power_levels", "m.room.join_rules", "m.room.history_visibility"]) assert.ok(content.events[type] > top, type);
  for (const type of ["m.room.message", "m.reaction", "m.room.redaction", "org.matrix.msc3401.call.member"]) assert.ok(content.events[type] <= top, type);
  assert.ok(content.events_default <= top);
});

test("DM power levels: user ids are JSON-escaped", () => {
  const content = JSON.parse(dmPowerLevelsContent(pl, ['@"odd\\:example.test']));
  assert.deepEqual(Object.keys(content.users), ['@"odd\\:example.test']);
});

test("DM power levels: Swift and Kotlin hold the same content around the users", () => {
  const quote = (s) => JSON.stringify(s);
  const content = dmPowerLevelsContent(pl, []);
  const [prefix, suffix] = content.split('"users":{}');
  for (const lang of ["swift", "kotlin"]) {
    const code = generateDmPowerLevels(pl, lang, "", quote);
    assert.ok(code.includes(quote(prefix + '"users":{')), lang);
    assert.ok(code.includes(quote("}" + suffix)), lang);
  }
});

test("DM power levels: a level that unlocks the room fails validation", () => {
  assert.throws(() => validateDmPowerLevels({ ...pl, invite: pl.usersDefault }), /above usersDefault/);
  assert.throws(() => validateDmPowerLevels({ ...pl, events: { ...pl.events, "m.room.name": 0 } }), /m.room.name must be locked/);
  assert.throws(() => validateDmPowerLevels({ ...pl, events: { ...pl.events, "m.room.message": 100 } }), /must stay open/);
});
