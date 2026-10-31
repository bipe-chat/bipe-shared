import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { loadRegistries } from "./lib/registries.mjs";
import { validateOnboarding } from "./lib/gen-onboarding.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const reg = loadRegistries(root);
const o = reg.onboarding;
const start = (key) => o.start.find((s) => s.key === key);
const withOnboarding = (change) => ({ ...reg, onboarding: change(structuredClone(o)) });

test("the invite comes first when sign-up needs one (ADR 0072)", () => {
  assert.equal(start("inviteOnly").primary.to, "inviteCode");
  assert.equal(start("invited").primary.to, "name");
  assert.equal(o.steps[0].key, "inviteCode");
});

test("every start variant offers the way back to an existing account", () => {
  for (const s of o.start) assert.deepEqual(s.text.map((b) => b.to), ["recovery"], s.key);
});

test("sign-up asks for the name, then the PIN, then the fallback", () => {
  assert.deepEqual(o.steps.map((s) => s.key), ["inviteCode", "name", "pin", "fallback"]);
  const fallback = o.steps.at(-1);
  assert.deepEqual([fallback.primary, ...fallback.text].map((b) => b.to), ["create", "create"]);
});

test("the old-phone row stays hidden until it can finish (#203)", () => {
  assert.equal(o.recovery.find((r) => r.key === "oldPhone").gate, "planned:203");
});

test("validation fails when two start variants match one state", () => {
  assert.throws(() => validateOnboarding(withOnboarding((c) => {
    c.start.find((s) => s.key === "open").inviteRequired = null;
    return c;
  })), /variants match/);
});

test("validation fails on a screen without a filled button", () => {
  assert.throws(() => validateOnboarding(withOnboarding((c) => {
    delete c.steps[1].primary;
    return c;
  })), /primary button required/);
});

test("the OS theft protection prompt waits a day and uses the slot (#125)", () => {
  const p = o.prompts.find((x) => x.key === "osTheftProtection");
  assert.equal(p.trigger, "voceAfterDays");
  assert.equal(p.slot, true);
  assert.equal(p.primary.to, "osTheftSettings");
  assert.deepEqual(p.text.map((b) => b.to), ["dismiss"]);
  assert.equal(o.osTheftProtection.afterDays, 1);
});

test("validation fails without the OS theft protection delay", () => {
  assert.throws(() => validateOnboarding(withOnboarding((c) => {
    delete c.osTheftProtection;
    return c;
  })), /osTheftProtection.afterDays/);
});
