import assert from "node:assert/strict";
import { test } from "node:test";
import { validateRegions } from "./lib/registries.mjs";

const region = { id: "br", name: "Brasil", coreApi: "https://api.bipe.net.br", servers: ["bipe.net.br"], floor: "e2ee" };
const reg = (regions, servers = ["bipe.net.br"]) => ({ regions: { regions }, bipeServers: { servers } });

test("every Bipe server belongs to one region", () => {
  validateRegions(reg([region]));
  assert.throws(() => validateRegions(reg([region], ["bipe.net.br", "bipe.ch"])), /bipe\.ch/);
  assert.throws(() => validateRegions(reg([region, { ...region, id: "ch" }])), /bipe\.net\.br/);
  assert.throws(() => validateRegions(reg([{ ...region, servers: ["bipe.net.br", "bipe.ch"] }])), /bipe\.ch/);
});

test("a region has a valid id, name, core API and floor", () => {
  assert.throws(() => validateRegions(reg([{ ...region, id: "BR" }])), /id/);
  assert.throws(() => validateRegions(reg([{ ...region, servers: [] }, { ...region, servers: [] }], [])), /duplicate/);
  assert.throws(() => validateRegions(reg([{ ...region, name: "" }])), /name/);
  assert.throws(() => validateRegions(reg([{ ...region, coreApi: "http://api.bipe.net.br" }])), /coreApi/);
  assert.throws(() => validateRegions(reg([{ ...region, floor: "some" }])), /floor/);
  assert.throws(() => validateRegions(reg([])), /at least one/);
});
