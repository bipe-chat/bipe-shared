import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { newestDmRooms } from "./lib/registries.mjs";

const fixture = JSON.parse(readFileSync(new URL("../fixtures/dm-selection.json", import.meta.url), "utf8"));
for (const item of fixture.cases) {
  test(`DM selection: ${item.name}`, () => {
    assert.deepEqual(newestDmRooms(item.candidates), item.expected);
    assert.deepEqual(newestDmRooms([...item.candidates].reverse()), item.expected);
  });
}

test("a newer read DM does not reveal an older unread/name-matching DM", () => {
  const rooms = [
    { roomId: "!old", peerUserId: "@ana", latestActivityMs: 1, eligible: true, unread: true, name: "Old name" },
    { roomId: "!new", peerUserId: "@ana", latestActivityMs: 2, eligible: true, unread: false, name: "Ana" },
  ];
  const chosen = newestDmRooms(rooms);
  const visible = rooms.filter((r) => chosen[r.peerUserId] === r.roomId);
  assert.deepEqual(visible.filter((r) => r.unread), []);
  assert.deepEqual(visible.filter((r) => r.name.includes("Old")), []);
  assert.equal(rooms.length, 2, "both histories must remain");
});
