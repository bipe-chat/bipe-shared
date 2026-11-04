import assert from "node:assert/strict";
import { test } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadRegistries, validateBusinessTools } from "./lib/registries.mjs";

const reg = loadRegistries(join(dirname(fileURLToPath(import.meta.url)), ".."));

test("business tools reject an incomplete path and unknown references", () => {
  const order = structuredClone(reg);
  order.businessTools.sectors[0].step_order.pop();
  assert.throws(() => validateBusinessTools(order), /step_order/);
  const tool = structuredClone(reg);
  tool.businessTools.sectors[0].first_tool = "nope";
  assert.throws(() => validateBusinessTools(tool), /first_tool/);
  const template = structuredClone(reg);
  template.businessTools.sectors[0].agenda_template = "nope";
  assert.throws(() => validateBusinessTools(template), /agenda_template/);
  const string = structuredClone(reg);
  delete string.stringsEn.strings.bipe_sector_food;
  assert.throws(() => validateBusinessTools(string), /no string/);
});
