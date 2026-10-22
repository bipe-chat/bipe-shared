import assert from "node:assert/strict";
import { test } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkScreens, loadScreens, validateScreens } from "./lib/screens.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const context = { strings: { s_one: "One" }, stringsPt: { s_one: "Um" }, parityIds: new Set(["e2ee"]) };
const valid = () => ({
  file: "chat-x.json",
  spec: {
    id: "chat-x",
    title: "Chat x",
    flow: "chat",
    summary: "A test screen.",
    types: { Row: { id: { type: "string", description: "Key." } } },
    state: {
      phase: { type: "enum", values: ["loading", "loaded"], description: "Phase." },
      rows: { type: "list", of: { type: "Row", description: "A row." }, description: "Rows." },
    },
    actions: { open: { params: { id: { type: "string", description: "Row." } }, effect: "Opens it." } },
    strings: ["s_one"],
    sdk: ["Room.timeline"],
    parity: ["e2ee"],
  },
});

test("the screen specs in product/screens are valid", () => {
  assert.ok(loadScreens(root).length > 0);
  assert.deepEqual(checkScreens(root), []);
});

test("a valid spec passes", () => {
  assert.deepEqual(validateScreens([valid()], context), []);
});

test("unknown strings, parity ids, types and keys fail", () => {
  const cases = [
    [(s) => s.strings.push("s_missing"), /s_missing is not in strings\/en.json/],
    [(s) => s.parity.push("nope"), /parity id nope/],
    [(s) => { s.state.rows.of.type = "Nope"; }, /unknown type "Nope"/],
    [(s) => { s.extra = 1; }, /unknown key "extra"/],
    [(s) => { s.state.phase.values = ["one"]; }, /enum needs two or more/],
    [(s) => { delete s.actions.open.effect; }, /effect required/],
    [(s) => { s.id = "Chat_X"; }, /kebab-case/],
  ];
  for (const [change, message] of cases) {
    const item = valid();
    change(item.spec);
    assert.match(validateScreens([item], context).join("\n"), message);
  }
});

test("a missing pt-BR string and a duplicate id fail", () => {
  assert.match(validateScreens([valid()], { ...context, stringsPt: {} }).join("\n"), /not in strings\/pt-BR.json/);
  assert.match(validateScreens([valid(), valid()], context).join("\n"), /duplicate id chat-x/);
});
