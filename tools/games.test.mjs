import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { checkReveal, checkRoll, gameCommit, jokenpoWinner, parOuImparWinner, rollOutcome, rollValues, validateGames, wordToValue } from './lib/games.mjs';

const raw = JSON.parse(readFileSync(new URL('../registries/games.json', import.meta.url)));
const reg = validateGames(raw);
const v = JSON.parse(readFileSync(new URL('../test-vectors/games.json', import.meta.url)));
const hex = (s) => createHash('sha256').update(String(s)).digest('hex');

test('vectors follow the reference rules', () => {
  for (const c of v.commits) assert.equal(gameCommit(reg, c.gameId, c.userId, c.choice, c.saltHex), c.commitHex);
  for (const c of v.reveals) assert.equal(checkReveal(reg, c.gameId, c.userId, c.choice, c.saltHex, c.commitHex), c.expected, c.name);
  for (const c of v.parOuImpar) assert.equal(parOuImparWinner(reg, c.challengerSide, c.challengerNumber, c.opponentNumber), c.expected);
  for (const c of v.jokenpo) assert.equal(jokenpoWinner(reg, c.challengerHand, c.opponentHand), c.expected);
  for (const c of v.rollChecks) assert.equal(checkRoll(reg, c.kind, c.sides, c.count), c.expected);
  for (const c of v.rolls) assert.deepEqual(rollValues(reg, c.gameId, c.senderSeedHex, c.answerSeedHex, c.sides, c.count), c.expected);
  for (const c of v.words) assert.equal(wordToValue(c.x, c.sides), c.expected);
  for (const c of v.outcomes) assert.equal(rollOutcome(reg, c.kind, c.value), c.expected);
});

test('the vectors cover every outcome', () => {
  assert.deepEqual(new Set(v.reveals.map((c) => c.expected)), new Set([true, false]));
  assert.ok(v.reveals.some((c) => c.name.includes('copied') && c.expected === false));
  assert.deepEqual(new Set(v.parOuImpar.map((c) => c.expected)), new Set(['challenger', 'opponent', null]));
  assert.deepEqual(new Set(v.jokenpo.map((c) => c.expected)), new Set(['challenger', 'opponent', 'draw', null]));
  assert.deepEqual(new Set(v.rollChecks.map((c) => c.expected)), new Set([null, 'sides', 'count', 'kind']));
  assert.ok(v.words.some((c) => c.expected === null) && v.words.some((c) => c.expected !== null));
  for (const s of reg.kinds.dice.presetSides) assert.ok(v.rolls.some((c) => c.sides === s), `sides ${s}`);
  assert.ok(v.rolls.some((c) => c.sides === reg.kinds.dice.maxSides && c.count === reg.kinds.dice.maxCount));
});

test('jokenpô: each hand beats exactly one other', () => {
  for (const a of reg.kinds.jokenpo.hands) {
    const wins = reg.kinds.jokenpo.hands.filter((b) => jokenpoWinner(reg, a, b) === 'challenger');
    assert.equal(wins.length, 1, a);
    assert.equal(jokenpoWinner(reg, wins[0], a), 'opponent');
  }
});

test('every value is in range and no face is favoured', () => {
  for (const sides of [2, 6, 7, 20, 1000]) {
    const counts = new Array(sides).fill(0);
    const n = sides * 400;
    for (let i = 0; i < n / 5; i++) for (const x of rollValues(reg, `g${i}`, hex(`s${i}`), hex(`a${i}`), sides, 5)) {
      assert.ok(Number.isInteger(x) && x >= 1 && x <= sides);
      counts[x - 1]++;
    }
    const expected = n / sides;
    const chi = counts.reduce((sum, c) => sum + (c - expected) ** 2 / expected, 0);
    assert.ok(chi < sides + 6 * Math.sqrt(2 * sides), `sides ${sides}: chi ${chi}`);
  }
});

test('the answer seed changes the result, so the sender alone cannot pick it', () => {
  const seen = new Set();
  for (let i = 0; i < 50; i++) seen.add(rollValues(reg, 'g', hex('sender'), hex(`answer${i}`), 6, 1)[0]);
  assert.equal(seen.size, 6);
});

test('validation fails closed', () => {
  const broken = (patch) => () => validateGames({ ...structuredClone(raw), ...patch(structuredClone(raw)) });
  assert.throws(broken(() => ({ eventType: 'net.bipe.game' })));
  assert.throws(broken(() => ({ saltBytes: 16 })));
  assert.throws(broken((r) => ({ kinds: { ...r.kinds, jokenpo: { type: 'duel', hands: ['pedra', 'tesoura', 'papel'] } } })));
  assert.throws(broken((r) => ({ kinds: { ...r.kinds, dice: { ...r.kinds.dice, minSides: 1 } } })));
  assert.throws(broken((r) => ({ kinds: { ...r.kinds, soccer: { ...r.kinds.soccer, outcomes: ['goal'] } } })));
  assert.throws(() => gameCommit(reg, 'g', '@a:b', '1', 'AB'.repeat(32)));
});
