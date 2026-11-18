// Amigo secreto rules (bipe-chat/bipe#1527, registries/amigo-secreto.json).
// The apps match these rules through test-vectors/amigo-secreto.json.

const EVENT = /^chat\.bipe\.[a-z_]+$/;

export function validateAmigoSecreto(reg) {
  const ints = ["minParticipants", "maxParticipants", "maxExclusionsPerPerson", "nameMaxGraphemes", "inviteeNameMaxGraphemes", "priceLimitMaxCents", "wishlistMaxItems", "wishMaxGraphemes", "wishKeyBytes", "wishTagBytes"];
  for (const key of ints) if (!Number.isInteger(reg[key]) || reg[key] < 1) throw new Error(`amigo-secreto: ${key} must be a positive integer`);
  if (reg.minParticipants < 3) throw new Error("amigo-secreto: minParticipants must be 3 or more (with 2 people each knows who drew them)");
  if (reg.maxParticipants < reg.minParticipants) throw new Error("amigo-secreto: maxParticipants below minParticipants");
  if (reg.wishKeyBytes !== 32) throw new Error("amigo-secreto: wishKeyBytes must be 32 for AES-256-GCM");
  if (reg.wishCipher !== "AES-256-GCM") throw new Error("amigo-secreto: wishCipher must be AES-256-GCM");
  for (const key of ["setupEventType", "resultEventType", "wishEventType"]) if (!EVENT.test(reg[key] ?? "")) throw new Error(`amigo-secreto: ${key} must be chat.bipe.*`);
  if (new Set([reg.setupEventType, reg.resultEventType, reg.wishEventType]).size !== 3) throw new Error("amigo-secreto: event types must differ");
  if (JSON.stringify(reg.states) !== JSON.stringify(["open", "drawn", "cancelled"])) throw new Error("amigo-secreto: states must be open, drawn, cancelled");
  return reg;
}

const pairKey = (a, b) => (a < b ? `${a}\n${b}` : `${b}\n${a}`);

// participants: list of user IDs. exclusions: list of [a, b].
// Returns null when the setup can be drawn, else the first problem:
// tooFew, tooMany, duplicate, exclusionUnknown, exclusionSelf, tooManyExclusions, impossible.
export function checkAmigoSecretoSetup(participants, exclusions, reg) {
  if (participants.length < reg.minParticipants) return "tooFew";
  if (participants.length > reg.maxParticipants) return "tooMany";
  if (new Set(participants).size !== participants.length) return "duplicate";
  const known = new Set(participants);
  const count = new Map();
  for (const [a, b] of exclusions) {
    if (!known.has(a) || !known.has(b)) return "exclusionUnknown";
    if (a === b) return "exclusionSelf";
  }
  for (const key of new Set(exclusions.map(([a, b]) => pairKey(a, b)))) {
    for (const id of key.split("\n")) count.set(id, (count.get(id) ?? 0) + 1);
  }
  if ([...count.values()].some((n) => n > reg.maxExclusionsPerPerson)) return "tooManyExclusions";
  return search(participants, exclusions, (list) => list) ? null : "impossible";
}

// The draw. rand() returns a number in [0, 1); the apps use a secure random source.
// Returns { giver: receiver } or null when no draw exists.
export function drawAmigoSecreto(participants, exclusions, rand) {
  const shuffle = (list) => {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  return search(participants, exclusions, shuffle);
}

// A draw is valid when every participant gives once and gets once, nobody draws
// themself and no excluded pair draws each other in either direction.
export function checkAmigoSecretoPairs(participants, exclusions, pairs) {
  const ids = new Set(participants);
  const givers = Object.keys(pairs);
  if (givers.length !== ids.size || givers.some((g) => !ids.has(g))) return false;
  const receivers = Object.values(pairs);
  if (new Set(receivers).size !== ids.size || receivers.some((r) => !ids.has(r))) return false;
  const banned = new Set(exclusions.map(([a, b]) => pairKey(a, b)));
  return givers.every((g) => pairs[g] !== g && !banned.has(pairKey(g, pairs[g])));
}

function search(participants, exclusions, order) {
  const banned = new Set(exclusions.map(([a, b]) => pairKey(a, b)));
  const givers = order(participants);
  const taken = new Set();
  const pairs = {};
  const step = (i) => {
    if (i === givers.length) return true;
    const giver = givers[i];
    for (const receiver of order(participants)) {
      if (receiver === giver || taken.has(receiver) || banned.has(pairKey(giver, receiver))) continue;
      taken.add(receiver);
      pairs[giver] = receiver;
      if (step(i + 1)) return true;
      taken.delete(receiver);
      delete pairs[giver];
    }
    return false;
  };
  return step(0) ? pairs : null;
}
