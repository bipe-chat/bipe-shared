// SPDX-License-Identifier: AGPL-3.0-only
// Additional permission: APP-STORE-PERMISSION.md (AGPL section 7)
// Copyright 2026 Bipe contributors

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { appearanceModule, fruitModule } from './lib/gen-appearance.mjs';
import { fruitTile } from '../design/chat-fruits.mjs';
const tokens = JSON.parse(readFileSync(new URL('../design/tokens.json', import.meta.url)));
const catalogue = text => Object.fromEntries([...text.matchAll(/export const (\w+) = (.*) as const;/g)].map(m => [m[1], JSON.parse(m[2])]));

test('web palette and background choices follow native order, defaults and localized labels', () => {
  const web = appearanceModule(tokens, '');
  const lists = catalogue(web);
  assert.deepEqual(lists.PALETTES, Object.keys(tokens.appThemes.palettes));
  assert.deepEqual(lists.BACKGROUNDS, tokens.appThemes.chatBackground.options);
  assert.deepEqual(lists.CHAT_BACKGROUND, tokens.appThemes.chatBackground);
  assert.ok(web.includes(JSON.stringify(tokens.appThemes.default)));
  for (const locale of ['pt-BR', 'en']) {
    const strings = JSON.parse(readFileSync(new URL('../strings/' + locale + '.json', import.meta.url))).strings;
    for (const id of lists.PALETTES) assert.ok(strings['bipe_colors_' + id], id);
    for (const id of lists.BACKGROUNDS) assert.ok(strings['bipe_chats_background_' + id], id);
  }
});

test('lazy web fruit artwork preserves the native tile and rounded placement geometry', () => {
  const generated = catalogue(fruitModule('')).CHAT_FRUITS;
  const source = fruitTile();
  assert.equal(generated.tile, source.tile);
  assert.equal(generated.scale, source.scale);
  assert.equal(generated.stroke, source.stroke);
  assert.equal(generated.glyphs.length, source.glyphs.length);
  const round = n => Math.round(n * 100) / 100;
  assert.deepEqual(generated.placements, source.placements.map(p => ({ ...p, x: round(p.x), y: round(p.y), size: round(p.size), rotation: round(p.rotation) })));
});
