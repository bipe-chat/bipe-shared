import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { loadRegistries } from "./lib/registries.mjs";
import { checkStoreCaptures, generateStoreCaptures, loadStoreCaptures, missingCaptures } from "./lib/store-captures.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const reg = loadRegistries(root);
const fresh = () => loadStoreCaptures(root);

test("product/store-captures.json passes its check", () => {
  assert.deepEqual(checkStoreCaptures(fresh(), reg), []);
});

test("store captures name only cast ids and slugs of the screenshot table", () => {
  const input = fresh();
  input.data.captures.pedidos.requests[0].from = "nobody";
  input.data.captures["no-such-slug"] = {};
  const problems = checkStoreCaptures(input, reg);
  assert.ok(problems.includes("captures.pedidos.requests[0]: unknown cast id nobody"));
  assert.ok(problems.includes("captures.no-such-slug: not a slug of the appstore.md screenshot table"));
});

test("the scam capture needs a message that the reference detector warns about", () => {
  const input = fresh();
  input.data.captures["aviso-golpe"].messages = [{ from: "viewer", time: "09:00", text: "Bom dia" }];
  assert.ok(checkStoreCaptures(input, reg).includes("captures.aviso-golpe: no message gets a scam warning"));
});

test("the generated Kotlin carries the detector's warning and a valid BR Code", () => {
  const kotlin = generateStoreCaptures(fresh(), reg, JSON.stringify, "// header");
  assert.match(kotlin, /"pixKey"\),/);
  assert.match(kotlin, /val pixCode: String = "000201/);
  assert.match(kotlin, /val captured: List<String> = listOf\("aviso-golpe"/);
});

test("slugs with no capture source are listed", () => {
  const input = fresh();
  delete input.data.captures["seu-arroba"];
  assert.ok(missingCaptures(input).includes("seu-arroba"));
});
