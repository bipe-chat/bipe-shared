import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { loadRegistries, trustFacts } from './lib/registries.mjs';
import { validateTrustRegistry } from './lib/trust.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const reg = loadRegistries(root);
const fixtures = JSON.parse(readFileSync(join(root, 'fixtures/trust-facts.json'), 'utf8'));

for (const vector of fixtures.vectors) test(vector.name, () => {
  assert.deepEqual(trustFacts(vector.input, reg), vector.expected);
});

test('registry rejects forward references and non-boolean conditions', () => {
  const forward = structuredClone(reg.trust);
  forward.rules.contextKnown = { rule: 'identityVerified' };
  assert.throws(() => validateTrustRegistry(forward), /forward/);
  const wrongType = structuredClone(reg.trust);
  wrongType.rules.contextKnown = { all: [{ field: 'accountId' }] };
  assert.throws(() => validateTrustRegistry(wrongType), /boolean/);
});

test('registry rejects unknown operators and numeric comparisons on names', () => {
  const unknown = structuredClone(reg.trust);
  unknown.rules.contextKnown = { permit: true };
  assert.throws(() => validateTrustRegistry(unknown), /unknown operator/);
  const wrongType = structuredClone(reg.trust);
  wrongType.rules.contextKnown = { afterChange: [{ field: 'accountId' }, { field: 'deviceChangedAt' }] };
  assert.throws(() => validateTrustRegistry(wrongType), /timestamps/);
});

test('non-finite lifecycle times cannot verify identity or personal confirmation', () => {
  const input = fixtures.vectors.find((v) => v.name === 'personally-confirmed-identity').input;
  const facts = trustFacts({ ...input, deviceChangedAt: Infinity }, reg);
  assert.equal(facts.identity, 'unverified');
  assert.equal(facts.contact, 'unconfirmed');
  assert.equal(facts.change, 'unknown');
});
