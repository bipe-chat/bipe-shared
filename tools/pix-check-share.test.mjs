import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// bipe#746 phase 1: the shared result states what the code says, never that it is safe (bipe#295 is phase 2).
const read = (name) => JSON.parse(readFileSync(new URL(`../strings/${name}.json`, import.meta.url))).strings;
const share = ['bipe_pix_check_share_code', 'bipe_pix_check_share_code_open_amount', 'bipe_pix_check_share_key', 'bipe_pix_check_share_altered'];

for (const lang of ['pt-BR', 'en']) {
  test(`${lang}: phase 1 share texts never say safe or verified`, () => {
    const strings = read(lang);
    for (const key of share) {
      assert.ok(strings[key], `${key} is missing`);
      assert.doesNotMatch(strings[key], /segur|verificad|safe|verified/i, key);
    }
  });
}

test('pt-BR share texts keep the wording of bipe#746', () => {
  const strings = read('pt-BR');
  assert.equal(strings.bipe_pix_check_share_code, 'Conferi no Bipe: este Pix vai para %1$s, %2$s. Seu banco vai mostrar o nome. Se for outro nome, não pague. bipe.chat');
  assert.equal(strings.bipe_pix_check_share_altered, 'Conferi no Bipe: este código Pix está alterado ou incompleto.');
});
