import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { handleProblem, loadRegistries, profileProblem, validateOfficialAccounts } from "./lib/registries.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const reg = loadRegistries(root);

test("only the official owner can claim a Bipe handle or its skeleton", () => {
  for (const [handle, owner] of [["bipe", "@bipe:bipe.net.br"], ["suporte", "@suporte:bipe.net.br"]]) {
    for (const input of [handle, `${handle[0]}.${handle.slice(1)}`, `${handle[0]}_${handle.slice(1)}`]) {
      assert.equal(handleProblem(input, reg), null, `lookup ${input}`);
      assert.equal(handleProblem(input, reg, owner), null, `owner ${input}`);
      for (const claimant of ["", "@ana:bipe.net.br", owner.replace(":bipe.net.br", ":example.com")]) {
        assert.equal(handleProblem(input, reg, claimant), "reserved", `${claimant} cannot claim ${input}`);
      }
    }
  }
  assert.equal(handleProblem("banco_do_brasil", reg, "@bipe:bipe.net.br"), "reserved");
  assert.equal(handleProblem("novidades_bipe", reg, "@ana:bipe.net.br"), "reserved");
  assert.equal(handleProblem("novidades_do_bipe", reg, "@ana:bipe.net.br"), "reserved");
});

test("news display names and homoglyphs remain reserved for normal accounts", () => {
  for (const name of ["Bipe", "Suporte Bipe", "Novidades do Bipe", "Novidades Bipe", "Nоvidades do Bіpe"]) {
    assert.equal(profileProblem({ name, bio: "" }, reg), "name_reserved", name);
  }
  assert.equal(profileProblem({ name: "Ana Souza", bio: "" }, reg), null);
});

test("official account IDs must be valid, unique and match handle ownership", () => {
  for (const patch of [
    { userId: "bipe" },
    { userId: "@bipe:example.com" },
    { userId: "@suporte:bipe.net.br", handle: "suporte" },
    { handle: "b.ipe" },
    { handle: "novidades" },
  ]) {
    const changed = structuredClone(reg);
    Object.assign(changed.officialAccounts.accounts.news, patch);
    assert.throws(() => validateOfficialAccounts(changed), /official accounts/);
  }
});

test("a reserved name cannot get an owner without a matching official account", () => {
  const fixture = mkdtempSync(join(tmpdir(), "bipe-official-"));
  try {
    for (const dir of ["registries", "strings"]) cpSync(join(root, dir), join(fixture, dir), { recursive: true });
    const path = join(fixture, "registries/reserved-name-owners.json");
    const owners = JSON.parse(readFileSync(path, "utf8"));
    owners.handles.itau = "@ana:bipe.net.br";
    writeFileSync(path, JSON.stringify(owners));
    assert.throws(() => loadRegistries(fixture), /reserved name without an official account/);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
