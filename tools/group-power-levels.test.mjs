import assert from "node:assert/strict";
import { test } from "node:test";
import { loadRegistries, validateGroupPowerLevels } from "./lib/registries.mjs";
import { generateGroupPowerLevels } from "./lib/gen-group-power-levels.mjs";

const root = new URL("..", import.meta.url).pathname;
const pl = loadRegistries(root).groupPowerLevels;

test("group power levels: a moderator removes, bans and deletes, only an admin changes the group (bipe#733)", () => {
  const { admin, moderator, member } = pl.roles;
  for (const key of ["kick", "ban", "redact"]) assert.ok(pl[key] <= moderator && pl[key] > member, key);
  for (const type of ["m.room.name", "m.room.avatar", "m.room.topic", "m.room.power_levels", "m.room.join_rules"]) assert.ok(pl.events[type] > moderator && pl.events[type] <= admin, type);
  assert.ok(pl.stateDefault > moderator && pl.notifications.room > moderator);
  for (const type of ["m.room.message", "m.reaction", "m.room.redaction", "chat.bipe.assistant"]) assert.ok(pl.events[type] <= member, type);
});

test("group power levels: Swift and Kotlin list every event", () => {
  const quote = (s) => JSON.stringify(s);
  for (const lang of ["swift", "kotlin"]) {
    const code = generateGroupPowerLevels(pl, lang, "", quote);
    for (const type of Object.keys(pl.events)) assert.ok(code.includes(quote(type)), `${lang} ${type}`);
    assert.ok(code.includes(quote(pl.publicationOnly.stateEvent)), `${lang} publication-only event`);
  }
});

test("group power levels: a level off the three roles fails validation", () => {
  assert.throws(() => validateGroupPowerLevels({ ...pl, kick: pl.roles.admin }), /kick must be moderator/);
  assert.throws(() => validateGroupPowerLevels({ ...pl, events: { ...pl.events, "m.room.name": pl.roles.moderator } }), /m.room.name must be admin/);
  assert.throws(() => validateGroupPowerLevels({ ...pl, events: { ...pl.events, "m.room.topic": 75 } }), /must sit at a role/);
  assert.throws(() => validateGroupPowerLevels({ ...pl, roles: { admin: 100, moderator: 0, member: 0 } }), /admin > moderator > member/);
});
