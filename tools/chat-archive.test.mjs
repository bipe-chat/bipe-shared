import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { chatArchived, loadRegistries } from './lib/registries.mjs';
const root = new URL('../', import.meta.url).pathname;
loadRegistries(root);
const fixture = JSON.parse(readFileSync(new URL('../fixtures/chat-archive.json', import.meta.url)));
for (const v of fixture.vectors) test(v.name, () => assert.equal(chatArchived(v.marker, v.incoming), v.expected));
test('archive cannot clear history or change membership', () => {
  const policy = loadRegistries(root).chatArchive;
  assert.equal(policy.history, 'preserve');
  assert.equal(policy.membership, 'preserve');
});
