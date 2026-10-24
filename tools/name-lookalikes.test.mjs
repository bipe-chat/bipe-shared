import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { contactCollision, loadRegistries, sealLookalike } from "./lib/registries.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const reg = loadRegistries(root);

test("seal lookalike marks are found with or without a variation selector", () => {
  assert.equal(sealLookalike("Ana Souza ✅", reg), "✅");
  assert.equal(sealLookalike("Ana ✔️", reg), "✔");
  assert.equal(sealLookalike("💜 Banco", reg), "💜");
  assert.equal(sealLookalike("Ana Souza", reg), null);
  assert.equal(sealLookalike("Ana 😀", reg), null);
});

test("a non-contact name that folds to a contact's name collides", () => {
  const contacts = ["Maria Souza", "Mãe"];
  assert.equal(contactCollision("maria  souza", contacts, reg), "Maria Souza");
  assert.equal(contactCollision("Mаria Sоuza", contacts, reg), "Maria Souza"); // Cyrillic а and о
  assert.equal(contactCollision("mae", contacts, reg), "Mãe");
  assert.equal(contactCollision("Maria Silva", contacts, reg), null);
  assert.equal(contactCollision("   ", contacts, reg), null);
});
