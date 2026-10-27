import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { chatArchived, chatArchiveSync, loadRegistries } from './lib/registries.mjs';
const root = new URL('../', import.meta.url).pathname;
loadRegistries(root);
const fixture = JSON.parse(readFileSync(new URL('../fixtures/chat-archive.json', import.meta.url)));
for (const v of fixture.vectors) test(v.name, () => assert.equal(chatArchived(v.marker, v.incoming), v.expected));
test('archive cannot clear history or change membership', () => {
  const policy = loadRegistries(root).chatArchive;
  assert.equal(policy.history, 'preserve');
  assert.equal(policy.membership, 'preserve');
});

const sync = JSON.parse(readFileSync(new URL('../test-vectors/archive-sync.json', import.meta.url)));
for (const v of sync.cases) test('sync: ' + v.name, () => {
  assert.deepEqual(chatArchiveSync(v.marker, v.synced, v.serverArchived, v.activity, v.incoming), v.expected);
});
