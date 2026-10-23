import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { loadRegistries, relationshipNameWarning } from './lib/registries.mjs';
import { generateRelationshipNames } from './lib/gen-relationship-names.mjs';
const root = new URL('../', import.meta.url).pathname;
const reg = loadRegistries(root);
const fixtures = JSON.parse(readFileSync(new URL('../fixtures/relationship-names.json', import.meta.url)));
for (const vector of fixtures.vectors) test(vector.name, () => {
  assert.equal(relationshipNameWarning(vector.savedName, vector.verifiedName, vector.nicknameConfirmed, reg), vector.expected);
});
test('native generators use the target package and shared normaliser', () => {
  const kotlin = generateRelationshipNames(reg.relationshipNames, 'kotlin', '', 'chat.bipe.shared.generated');
  assert.match(kotlin, /import chat\.bipe\.shared\.NameNormalizer/);
  assert.doesNotMatch(kotlin, /io\.element/);
  assert.match(generateRelationshipNames(reg.relationshipNames, 'swift', ''), /NameNormalizer\.normalize/);
});
