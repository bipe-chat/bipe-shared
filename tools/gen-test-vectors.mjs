// Writes test-vectors/*.json. Every platform implementation must pass them.
// Badge vectors use a TEST-ONLY Ed25519 key derived from a fixed seed.
import { createPrivateKey, createPublicKey, sign } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadRegistries, normalize } from "./lib/registries.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const reg = loadRegistries(root);
const out = join(root, "test-vectors");
mkdirSync(out, { recursive: true });
const write = (name, data) => writeFileSync(join(out, name), JSON.stringify(data, null, 2) + "\n");

// --- Badges ---------------------------------------------------------------

const PKCS8_ED25519_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");
const keyFromSeed = (seedHex) => createPrivateKey({ key: Buffer.concat([PKCS8_ED25519_PREFIX, Buffer.from(seedHex, "hex")]), format: "der", type: "pkcs8" });
const rawPublicKey = (priv) => createPublicKey(priv).export({ format: "jwk" }).x;
const b64url = (buf) => Buffer.from(buf).toString("base64url");

const testKey = keyFromSeed("01".repeat(32));
const otherKey = keyFromSeed("02".repeat(32));
const KID = "test-only-2026-10";
const publicKeys = { [KID]: rawPublicKey(testKey) };

const NOW = 1791720000; // 2026-10-11T12:00:00Z
const basePayload = {
  sub: "@ana:proseio.com.br",
  lvl: "pix",
  name: "Ana Souza",
  dev: "dGVzdC1kZXZpY2Uta2V5LWZpbmdlcnByaW50",
  iat: NOW - 3600,
  exp: NOW + 30 * 86400,
};

function envelope(payload, key = testKey, { v = 1, kid = KID } = {}) {
  const bytes = Buffer.from(JSON.stringify(payload), "utf8");
  return { v, kid, payload: b64url(bytes), sig: b64url(sign(null, bytes, key)) };
}

const valid = envelope(basePayload);
const tampered = { ...valid, payload: b64url(Buffer.from(JSON.stringify({ ...basePayload, name: "Ana Souza Lima" }), "utf8")) };
const context = { sender: basePayload.sub, senderDevice: basePayload.dev };

write("badges.json", {
  $comment: "TEST-ONLY key. Never trust kid test-only-* in a release build. See docs/badge-attestation.md for the verification order.",
  now: NOW,
  publicKeys,
  vectors: [
    { name: "valid", envelope: valid, ...context, expect: "valid" },
    { name: "tampered payload", envelope: tampered, ...context, expect: "invalid_signature" },
    { name: "signed by unknown key", envelope: envelope(basePayload, otherKey), ...context, expect: "invalid_signature" },
    { name: "unknown kid", envelope: envelope(basePayload, testKey, { kid: "prod-unknown" }), ...context, expect: "unknown_kid" },
    { name: "unsupported version", envelope: envelope(basePayload, testKey, { v: 2 }), ...context, expect: "unsupported_version" },
    { name: "expired", envelope: envelope({ ...basePayload, exp: NOW - 1 }), ...context, expect: "expired" },
    { name: "not yet valid", envelope: envelope({ ...basePayload, iat: NOW + 60 }), ...context, expect: "not_yet_valid" },
    { name: "missing name", envelope: envelope((({ name, ...rest }) => rest)(basePayload)), ...context, expect: "malformed" },
    { name: "subject mismatch", envelope: valid, sender: "@mallory:proseio.com.br", senderDevice: basePayload.dev, expect: "subject_mismatch" },
    { name: "device mismatch (new device, badge suspended)", envelope: valid, sender: basePayload.sub, senderDevice: "bmV3LWRldmljZQ", expect: "device_mismatch" },
  ],
});

// --- Normalisation and reserved names --------------------------------------

const reservedSet = new Map();
for (const [cat, names] of Object.entries(reg.reserved.categories)) for (const n of names) reservedSet.set(n, cat);

const nameCases = ["Itaú", "ІТАÚ", "Nubаnk", "Banco  do   Brasil", "B4nco do Br4sil", "Receita Federal", "Proseio Oficial", "Maria Souza", "Ana", "gov.br", "Caixa Tem"];
write("normalization.json", {
  $comment: "normalize(): NFKD, strip combining marks, lowercase, fold homoglyphs (registries/homoglyphs.json), collapse whitespace. reserved: category if the normalised name is in registries/reserved-names.json.",
  vectors: nameCases.map((input) => {
    const normalized = normalize(input, reg.homoglyphs.map);
    return { input, normalized, reserved: reservedSet.get(normalized) ?? null };
  }),
});

// --- Scam detection --------------------------------------------------------

const groups = ["pixKeyPatterns", "pixCopyPastePatterns", "boletoPatterns"];
function detect(message) {
  const ids = [];
  for (const g of groups) for (const p of reg.scam[g]) if (new RegExp(p.regex).test(message)) ids.push(`${g}:${p.id}`);
  const n = normalize(message, {});
  for (const phrase of reg.scam.urgencyPhrases) if (n.includes(phrase)) ids.push(`urgency:${phrase}`);
  for (const kw of reg.scam.receiptKeywords) if (n.includes(kw)) ids.push(`receipt:${kw}`);
  return ids;
}

const messages = [
  "Oi mãe, troquei de número. Salva esse aqui",
  "Faz um pix pra mim? É urgente, te devolvo amanhã. Chave 123.456.789-09",
  "Me passa o código que chegou no seu celular",
  "Segue o comprovante, pix enviado",
  "Pode pagar nesse: 00020126580014br.gov.bcb.pix0136a1b2c3d4",
  "Chave aleatória 123e4567-e89b-12d3-a456-426614174000",
  "Meu pix é (11) 98765-4321",
  "PIX: 00020126580014BR.GOV.BCB.PIX0136a1b2c3d4",
  "Bom dia! A reunião do condomínio é às 19h",
];
write("scam-detection.json", {
  $comment: "Regexes run on the raw message; phrases and keywords match on normalize(message) without homoglyph folding. Expected ids are generated by the reference implementation.",
  vectors: messages.map((message) => ({ message, matches: detect(message) })),
});

console.log(`wrote test vectors to ${out}`);
