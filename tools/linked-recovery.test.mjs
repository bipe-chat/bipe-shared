import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { validateLinkedRecovery } from "./lib/registries.mjs";

const accounts = JSON.parse(readFileSync(new URL("../registries/accounts.json", import.meta.url), "utf8"));
test("linked recovery cannot bypass the existing PIN, delay or provider limit", () => {
  validateLinkedRecovery(accounts);
  for (const patch of [
    { delayHours: 0 }, { requiresPin: false }, { allowsPinReset: true },
    { maxAccountsPerProvider: 2 }, { providers: ["google"] }, { providers: ["apple", "google", "other"] },
  ]) assert.throws(() => validateLinkedRecovery({ ...accounts, linkedRecovery: { ...accounts.linkedRecovery, ...patch } }), /linked recovery/);
});
