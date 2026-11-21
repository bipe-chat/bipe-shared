import assert from "node:assert/strict";
import { test } from "node:test";
import { featureMap, looseEnds, needsNoScreen, surfaceStatus } from "./lib/feature-map.mjs";

const item = (id, ios, extra = {}) => ({ id, name: id, ios, android: ios, web: "n/a", server: "n/a", macos: "planned", windows: "planned", ...extra });
const items = [
  item("chat", { status: "built", evidence: ["x"] }, { issue: 7 }),
  item("edit", "testing"),
  item("free", "policy"),
  item("push", "n/a", { server: { status: "built" } }),
  item("orphan", "planned"),
];
const screens = [
  { id: "timeline", flow: "chat", parity: ["chat", "edit"] },
  { id: "message-edit", flow: "chat", parity: ["edit"] },
  { id: "games-menu", flow: "chat", parity: [] },
];
const product = {
  tentpoles: [{ id: "core", status: "built", en: { name: "Core" }, features: ["chat"] }],
  areas: [{ id: "talk", en: "Chat" }],
  features: [{ id: "chat", area: "talk", en: { name: "Chat", body: "Send | read." } }],
};

test("a surface value is a string or an object with status", () => {
  assert.equal(surfaceStatus(items[0], "ios"), "built");
  assert.equal(surfaceStatus(items[1], "ios"), "testing");
  assert.equal(surfaceStatus(items[3], "server"), "built");
});

test("server-only and policy items need no screen", () => {
  assert.deepEqual(items.filter(needsNoScreen).map((i) => i.id), ["free", "push"]);
  assert.deepEqual(looseEnds(items, screens), { onNoScreen: ["orphan"], exempt: ["free", "push"], noCapability: ["games-menu"] });
});

test("the map has every section, the status codes and the screens of each capability", () => {
  const text = featureMap({ product, items, screens });
  for (const h of ["## 1. How the pieces connect", "## 2. Status at a glance", "## 3. Tentpoles", "## 4. Marketed features", "## 5. Other capabilities", "## 6. Screens by flow", "## 7. Loose ends"]) assert.ok(text.includes(h), h);
  assert.ok(text.includes("| `chat` | Chat | Send / read. | B | B | - | - | P | P | `timeline` |"));
  assert.ok(text.includes("### Flow: chat"));
  assert.ok(text.includes("| `edit` | edit | T | T | - | - | P | P |  |"));
  assert.ok(text.includes("- **chat** (3): `games-menu`, `message-edit`, `timeline`"));
  assert.ok(!text.includes("Source:"));
  assert.ok(featureMap({ product, items, screens, source: "Source: abc." }).includes("Source: abc."));
});
