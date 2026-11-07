// SPDX-License-Identifier: AGPL-3.0-only
// Additional permission: APP-STORE-PERMISSION.md (AGPL section 7)
// Copyright 2026 Bipe contributors

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateMessageReactions, reactionKeyText, generateReactions } from './lib/reactions.mjs';

const rule = JSON.parse(readFileSync(new URL('../registries/message-reactions.json', import.meta.url)));
test('reaction presets reject duplicates, split graphemes and invalid limits', () => {
  validateMessageReactions(rule);
  for (const changed of [{ ...rule, quickKeys: ['👍', '👍'] }, { ...rule, quickKeys: ['two'] }, { ...rule, displayKeyMaxGraphemes: 0 }])
    assert.throws(() => validateMessageReactions(changed));
});
test('reaction labels keep joined emoji, modifiers and flags whole at the boundary', () => {
  for (const unit of ['👨‍👩‍👧‍👦', '👍🏽', '🇧🇷', '❤️', '1️⃣']) {
    assert.equal(reactionKeyText(unit.repeat(16), rule), unit.repeat(16));
    assert.equal(reactionKeyText(unit.repeat(17), rule), unit.repeat(16) + '…');
  }
  for (const language of ['swift', 'kotlin']) {
    const generated = generateReactions(rule, language, '', JSON.stringify);
    for (const key of rule.quickKeys) assert.ok(generated.includes(key));
  }
});
