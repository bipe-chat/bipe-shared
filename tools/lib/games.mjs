// Games in chat (bipe-chat/bipe#1535, registries/games.json).
// The apps match these rules through test-vectors/games.json.
import { createHash } from "node:crypto";

const HEX = (bytes) => new RegExp(`^[0-9a-f]{${bytes * 2}}$`);

export function validateGames(reg) {
  if (!/^chat\.bipe\.[a-z_]+$/.test(reg.eventType ?? "")) throw new Error("games: eventType must be chat.bipe.*");
  if (JSON.stringify(reg.steps) !== JSON.stringify(["challenge", "commit", "reveal", "decline", "roll", "answer"])) throw new Error("games: steps changed");
  for (const key of ["saltBytes", "seedBytes"]) if (reg[key] !== 32) throw new Error(`games: ${key} must be 32`);
  for (const key of ["reasonMaxGraphemes", "duelExpirySeconds", "rollRevealTimeoutSeconds"]) if (!Number.isInteger(reg[key]) || reg[key] < 1) throw new Error(`games: ${key} must be a positive integer`);
  const k = reg.kinds ?? {};
  if (JSON.stringify(k.parOuImpar?.sides) !== '["par","impar"]' || k.parOuImpar.minNumber !== 0 || !(k.parOuImpar.maxNumber > 0)) throw new Error("games: parOuImpar");
  if (JSON.stringify(k.jokenpo?.hands) !== '["pedra","papel","tesoura"]') throw new Error("games: jokenpo hands must be pedra, papel, tesoura in that order");
  const d = k.dice ?? {};
  if (d.minSides !== 2 || !(d.maxSides >= d.minSides) || d.maxSides > 65536) throw new Error("games: dice sides");
  if (!(d.defaultSides >= d.minSides && d.defaultSides <= d.maxSides)) throw new Error("games: dice defaultSides");
  if (!d.presetSides?.every((s) => Number.isInteger(s) && s >= d.minSides && s <= d.maxSides)) throw new Error("games: dice presetSides");
  if (d.minCount !== 1 || !(d.maxCount >= 1)) throw new Error("games: dice count");
  for (const [name, kind] of Object.entries(k)) {
    if (kind.type === "roll" && name !== "dice" && kind.outcomes?.length !== kind.sides) throw new Error(`games: ${name} needs one outcome per side`);
  }
  return reg;
}

const sha256 = (...parts) => createHash("sha256").update(Buffer.concat(parts.map((p) => (typeof p === "string" ? Buffer.from(p, "utf8") : p)))).digest();

// The commit a phone sends before it reveals. choice is the canonical string:
// a number "0".."10" for par ou ímpar, "pedra" | "papel" | "tesoura" for jokenpô,
// "roll" for a roll seed (the seed then is the salt). saltHex is lowercase hex.
export function gameCommit(reg, gameId, userId, choice, saltHex) {
  if (!HEX(reg.saltBytes).test(saltHex)) throw new Error("games: salt must be lowercase hex of saltBytes");
  return sha256(`${reg.commitDomain}\n${gameId}\n${userId}\n${choice}\n`, Buffer.from(saltHex, "hex")).toString("hex");
}

export function checkReveal(reg, gameId, userId, choice, saltHex, commitHex) {
  try {
    return gameCommit(reg, gameId, userId, choice, saltHex) === commitHex;
  } catch {
    return false;
  }
}

// Par ou ímpar. challengerSide is "par" or "impar"; the opponent has the other.
// Returns "challenger" or "opponent", or null when a number is out of range.
export function parOuImparWinner(reg, challengerSide, challengerNumber, opponentNumber) {
  const k = reg.kinds.parOuImpar;
  if (!k.sides.includes(challengerSide)) return null;
  for (const n of [challengerNumber, opponentNumber]) if (!Number.isInteger(n) || n < k.minNumber || n > k.maxNumber) return null;
  const sum = challengerNumber + opponentNumber;
  return (sum % 2 === 0 ? "par" : "impar") === challengerSide ? "challenger" : "opponent";
}

// Jokenpô: each hand beats the one before it in the list (papel > pedra, tesoura > papel, pedra > tesoura).
// Returns "challenger", "opponent", "draw", or null for an unknown hand.
export function jokenpoWinner(reg, challengerHand, opponentHand) {
  const hands = reg.kinds.jokenpo.hands;
  const a = hands.indexOf(challengerHand);
  const b = hands.indexOf(opponentHand);
  if (a < 0 || b < 0) return null;
  if (a === b) return "draw";
  return (a - b + 3) % 3 === 1 ? "challenger" : "opponent";
}

// Null when the roll is allowed, else "sides" or "count".
export function checkRoll(reg, kind, sides, count) {
  const k = reg.kinds[kind];
  if (!k || k.type !== "roll") return "kind";
  if (kind !== "dice") return sides === k.sides && count === 1 ? null : "sides";
  if (!Number.isInteger(sides) || sides < k.minSides || sides > k.maxSides) return "sides";
  if (!Number.isInteger(count) || count < k.minCount || count > k.maxCount) return "count";
  return null;
}

// The roll result, values 1..sides. Blocks are SHA-256(domain "\nroll\n" gameId "\n" seedA seedB counter),
// counter a 4-byte big-endian number from 0. Each block gives eight 4-byte big-endian numbers x;
// x at or above the largest multiple of sides below 2^32 is skipped (rejection sampling), else value = x % sides + 1.
export function rollValues(reg, gameId, senderSeedHex, answerSeedHex, sides, count) {
  for (const s of [senderSeedHex, answerSeedHex]) if (!HEX(reg.seedBytes).test(s)) throw new Error("games: seed must be lowercase hex of seedBytes");
  const out = [];
  for (let counter = 0; out.length < count; counter++) {
    const c = Buffer.alloc(4);
    c.writeUInt32BE(counter);
    const block = sha256(`${reg.commitDomain}\nroll\n${gameId}\n`, Buffer.from(senderSeedHex, "hex"), Buffer.from(answerSeedHex, "hex"), c);
    for (let i = 0; i < 32 && out.length < count; i += 4) {
      const value = wordToValue(block.readUInt32BE(i), sides);
      if (value !== null) out.push(value);
    }
  }
  return out;
}

// One 4-byte number to a value 1..sides, or null when rejection sampling skips it.
export function wordToValue(x, sides) {
  return x < Math.floor(2 ** 32 / sides) * sides ? (x % sides) + 1 : null;
}

// The outcome name of an emoji roll (soccer, basketball, darts), from its single value.
export function rollOutcome(reg, kind, value) {
  return reg.kinds[kind]?.outcomes?.[value - 1] ?? null;
}
