import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { checkAmigoSecretoPairs, checkAmigoSecretoSetup, drawAmigoSecreto, validateAmigoSecreto } from './lib/amigo-secreto.mjs';

const reg = validateAmigoSecreto(JSON.parse(readFileSync(new URL('../registries/amigo-secreto.json', import.meta.url))));
const vectors = JSON.parse(readFileSync(new URL('../test-vectors/amigo-secreto.json', import.meta.url)));
const ids = (n) => Array.from({ length: n }, (_, i) => `@p${i + 1}:bipe.net.br`);

test('vectors follow the reference rules', () => {
  for (const v of vectors.setups) assert.equal(checkAmigoSecretoSetup(v.participants, v.exclusions, reg), v.expected, v.name);
  for (const v of vectors.pairs) assert.equal(checkAmigoSecretoPairs(v.participants, v.exclusions, v.pairs), v.expected, v.name);
});

test('the vectors cover every problem and both outcomes', () => {
  const problems = new Set(vectors.setups.map((v) => v.expected));
  for (const p of [null, 'tooFew', 'tooMany', 'duplicate', 'exclusionUnknown', 'exclusionSelf', 'tooManyExclusions', 'impossible']) assert.ok(problems.has(p), String(p));
  assert.ok(vectors.pairs.some((v) => v.expected) && vectors.pairs.some((v) => !v.expected));
});

test('every draw is valid, for many sizes and random sources', () => {
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let n = 3; n <= 40; n++) {
    const people = ids(n);
    const exclusions = n >= 4 ? [[people[0], people[1]], [people[2], people[3]]] : [];
    for (let round = 0; round < 20; round++) {
      const pairs = drawAmigoSecreto(people, exclusions, rand);
      assert.ok(pairs && checkAmigoSecretoPairs(people, exclusions, pairs), `n=${n}`);
    }
  }
});

test('a setup that cannot be drawn returns null', () => {
  const [a, b, c] = ids(3);
  assert.equal(drawAmigoSecreto([a, b, c], [[a, b]], Math.random), null);
});

test('the draw does not favour one receiver', () => {
  const people = ids(5);
  const counts = new Map(people.map((p) => [p, 0]));
  for (let i = 0; i < 4000; i++) {
    const receiver = drawAmigoSecreto(people, [], Math.random)[people[0]];
    counts.set(receiver, counts.get(receiver) + 1);
  }
  for (const p of people.slice(1)) assert.ok(counts.get(p) > 700, `${p}: ${counts.get(p)}`);
});

test('validation fails closed', () => {
  const bad = (change) => assert.throws(() => validateAmigoSecreto({ ...structuredClone(reg), ...change }));
  bad({ minParticipants: 2 });
  bad({ maxParticipants: 2 });
  bad({ wishKeyBytes: 16 });
  bad({ wishCipher: 'AES-128-CBC' });
  bad({ resultEventType: 'net.bipe.result' });
  bad({ wishEventType: 'chat.bipe.amigo_secreto' });
  bad({ states: ['open'] });
});
