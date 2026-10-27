import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { loadRegistries, stickerEmojiKey, stickerMatches, stickerQueryTags, stickerSearchFold, validateStickers } from './lib/registries.mjs';
const root = new URL('../', import.meta.url).pathname;
const reg = loadRegistries(root);
const vectors = JSON.parse(readFileSync(new URL('../test-vectors/sticker-search.json', import.meta.url)));

test('vectors follow the reference rules', () => {
  for (const v of vectors.fold) assert.equal(stickerSearchFold(v.input), v.expected, v.input);
  for (const v of vectors.emoji_key) assert.equal(stickerEmojiKey(v.input), v.expected, v.input);
  for (const v of vectors.tags) assert.deepEqual(stickerQueryTags(v.query, reg), v.expected, v.query);
  for (const v of vectors.matches) assert.equal(stickerMatches(v.query, v.sticker, reg), v.expected, v.name);
});

test('Brazilian laughter, accents and emoji find their tags', () => {
  assert.deepEqual(stickerQueryTags('kkkkkkk', reg), ['riso']);
  assert.deepEqual(stickerQueryTags('Fé', reg), ['amem']);
  assert.deepEqual(stickerQueryTags('🙏🏽', reg), ['obrigado', 'amem']);
  assert.deepEqual(stickerQueryTags('pa', reg), []);
});

test('validation fails closed', () => {
  const bad = (change) => assert.throws(() => validateStickers({ ...structuredClone(reg.stickers), ...change }));
  bad({ words: { 'Kkkk': ['riso'] } });
  bad({ words: { 'risada': ['nope'] } });
  bad({ words: { 'bom dia': ['bom-dia'] } });
  bad({ emoji: { '❤️': ['amor'] } });
  bad({ madePixels: 2048 });
  bad({ packField: 'bipe.pack' });
  bad({ packLinkBase: 'http://bipe.chat/s' });
});
