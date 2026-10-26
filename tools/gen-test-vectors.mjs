// Writes test-vectors/*.json. Every platform implementation must pass them.
// Badge vectors use a TEST-ONLY Ed25519 key derived from a fixed seed.
import { createPrivateKey, createPublicKey, sign } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildBrCode, crc16, pixCheck, pixMarkLines, pixTxid } from "./lib/pix.mjs";
import { cvmLines } from "./lib/cvm.mjs";
import { noticeLinkClickable } from "./lib/notice.mjs";
import { loadSchedulingVectors, writeSchedulingApiFixture } from "./lib/scheduling-vectors.mjs";
import { photoDistance, photoHash, photoMatches, profileFactLines, relationshipNameWarning, newestDmRooms, clearedChatHidden, clearedChatKeepsEvent, clearedChatMarker, clearedChatsWithClear, compareAppVersions, extractInviteCode, handleProblem, isBipeUserID, handleSuggestions, pinReminderNext, pinProblem, remoteBannerState, normalizeCnpj, normalizePhone, handleSkeleton, loadRegistries, normalize, scamMatchIDs, scamWarningKind, trustFacts } from "./lib/registries.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const reg = loadRegistries(root);
// --out <dir> writes elsewhere (tools/check-drift.mjs compares the result with test-vectors/).
const outIndex = process.argv.indexOf("--out");
const out = outIndex >= 0 ? process.argv[outIndex + 1] : join(root, "test-vectors");
const apiIndex = process.argv.indexOf("--api-test-vectors");
const apiVectors = apiIndex >= 0 ? process.argv[apiIndex + 1] : outIndex >= 0 ? null : join(root, "../bipe-api/test/fixtures");
if (apiVectors) writeSchedulingApiFixture(root, apiVectors);
else loadSchedulingVectors(root);
mkdirSync(out, { recursive: true });
const write = (name, data) => writeFileSync(join(out, name), JSON.stringify(data, null, 2) + "\n");

const trustVectors = JSON.parse(readFileSync(join(root, "fixtures/trust-facts.json"), "utf8"));
for (const vector of trustVectors.vectors) {
  if (JSON.stringify(trustFacts(vector.input, reg)) !== JSON.stringify(vector.expected)) {
    throw new Error(`trust-facts: expected outcome differs for ${vector.name}`);
  }
}
write("trust-facts.json", trustVectors);

const profileFactVectors = JSON.parse(readFileSync(join(root, "fixtures/profile-facts.json"), "utf8"));
for (const vector of profileFactVectors.vectors) {
  if (JSON.stringify(profileFactLines(vector.facts, Date.parse(profileFactVectors.now), reg)) !== JSON.stringify(vector.expected)) {
    throw new Error(`profile-facts: expected outcome differs for ${vector.name}`);
  }
}
write("profile-facts.json", profileFactVectors);

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
  sub: "@ana:bipe.net.br",
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
// The sender's master key is ignored for a device-bound badge.
const MASTER_KEY = "dGVzdC1jcm9zcy1zaWduaW5nLW1hc3Rlci1rZXktMDE";
const context = { sender: basePayload.sub, senderDevice: basePayload.dev, senderMasterKey: MASTER_KEY };

// A verified company (lvl "cnpj", bipe#399): bound to the account's cross-signing master key, not a device.
const cnpjPayload = {
  sub: "@lojadaana:bipe.net.br",
  lvl: "cnpj",
  name: "Doces da Ana",
  cnpj: "11222333000181",
  legal_name: "Ana Souza Doces Ltda",
  trade_name: "Doces da Ana",
  method: "ecnpj",
  checked_month: "2026-09",
  msk: MASTER_KEY,
  iat: NOW - 3600,
  exp: NOW - 3600 + reg.badgeKeys.lifeDays * 86400,
};
const cnpjContext = { sender: cnpjPayload.sub, senderDevice: "Y29tcGFueS1zZWNvbmQtc2VhdA", senderMasterKey: MASTER_KEY };
const without = (key) => (({ [key]: _, ...rest }) => rest)(cnpjPayload);
if (normalizeCnpj(cnpjPayload.cnpj) !== cnpjPayload.cnpj) throw new Error("badges: the cnpj vector is not a normalised CNPJ");

// A verified institution (lvl "institution", bipe#245): bound to the account's master key like a company, with
// its verified link domains (ADR 0036).
const institutionPayload = {
  sub: "@prefeitura:bipe.net.br",
  lvl: "institution",
  name: "Prefeitura de Exemplo",
  cnpj: "11222333000181",
  domains: ["exemplo.sp.gov.br"],
  msk: MASTER_KEY,
  iat: NOW - 3600,
  exp: NOW - 3600 + reg.badgeKeys.lifeDays * 86400,
};
const institutionContext = { sender: institutionPayload.sub, senderDevice: "cHJlZmVpdHVyYS1zZWF0LTI", senderMasterKey: MASTER_KEY };
const withoutInst = (key) => (({ [key]: _, ...rest }) => rest)(institutionPayload);
// A brand mark (lvl "brand-mark", ADR 0162, bipe#483): a verified brand vouches for a reseller's work account.
const markPayload = {
  sub: "@bia.revende:bipe.net.br",
  lvl: "brand-mark",
  name: "Doces da Ana",
  mark: "0b6f8a52-6f43-4c1e-9d55-2a8b1f0c7e11",
  brand: cnpjPayload.sub,
  cnpj: cnpjPayload.cnpj,
  label: reg.brandMarks.labels[0],
  msk: "cmVzZWxsZXItbWFzdGVyLWtleS0wMS1mb3ItdGVzdHM",
  iat: NOW - 3600,
  exp: NOW - 3600 + reg.badgeKeys.lifeDays * 86400,
};
const markContext = { sender: markPayload.sub, senderDevice: "cmVzZWxsZXItcGhvbmU", senderMasterKey: markPayload.msk };
const markWithout = (key) => (({ [key]: _, ...rest }) => rest)(markPayload);

write("badges.json", {
  $comment: "TEST-ONLY key. Never trust kid test-only-* in a release build. See docs/badge-attestation.md for the verification order. senderMasterKey is the sender's cross-signing master key as the Matrix SDK reports it (unpadded base64), or null when the app does not know it.",
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
    { name: "subject mismatch", envelope: valid, ...context, sender: "@mallory:bipe.net.br", expect: "subject_mismatch" },
    { name: "device mismatch (new device, badge suspended)", envelope: valid, ...context, senderDevice: "bmV3LWRldmljZQ", expect: "device_mismatch" },
    { name: "unknown level", envelope: envelope({ ...basePayload, lvl: "gold" }), ...context, expect: "malformed" },
    { name: "cnpj: valid", envelope: envelope(cnpjPayload), ...cnpjContext, expect: "valid" },
    { name: "cnpj: valid on any device of the account", envelope: envelope(cnpjPayload), ...cnpjContext, senderDevice: "b3duZXItcGhvbmU", expect: "valid" },
    { name: "cnpj: valid without trade_name", envelope: envelope(without("trade_name")), ...cnpjContext, expect: "valid" },
    { name: "cnpj: valid alphanumeric CNPJ", envelope: envelope({ ...cnpjPayload, cnpj: "12ABC34501DE35", method: "staff" }), ...cnpjContext, expect: "valid" },
    { name: "cnpj: master key mismatch (identity reset)", envelope: envelope(cnpjPayload), ...cnpjContext, senderMasterKey: "bmV3LW1hc3Rlci1rZXk", expect: "master_key_mismatch" },
    { name: "cnpj: sender master key unknown", envelope: envelope(cnpjPayload), ...cnpjContext, senderMasterKey: null, expect: "master_key_mismatch" },
    { name: "cnpj: device-bound instead of msk", envelope: envelope({ ...without("msk"), dev: cnpjContext.senderDevice }), ...cnpjContext, expect: "malformed" },
    { name: "cnpj: missing cnpj", envelope: envelope(without("cnpj")), ...cnpjContext, expect: "malformed" },
    { name: "cnpj: cnpj with separators", envelope: envelope({ ...cnpjPayload, cnpj: "11.222.333/0001-81" }), ...cnpjContext, expect: "malformed" },
    { name: "cnpj: lowercase cnpj", envelope: envelope({ ...cnpjPayload, cnpj: "12abc34501de35" }), ...cnpjContext, expect: "malformed" },
    { name: "cnpj: missing legal_name", envelope: envelope(without("legal_name")), ...cnpjContext, expect: "malformed" },
    { name: "cnpj: empty legal_name", envelope: envelope({ ...cnpjPayload, legal_name: "" }), ...cnpjContext, expect: "malformed" },
    { name: "cnpj: missing method", envelope: envelope(without("method")), ...cnpjContext, expect: "malformed" },
    { name: "cnpj: unknown method", envelope: envelope({ ...cnpjPayload, method: "email" }), ...cnpjContext, expect: "malformed" },
    { name: "cnpj: missing checked_month", envelope: envelope(without("checked_month")), ...cnpjContext, expect: "malformed" },
    { name: "cnpj: bad checked_month", envelope: envelope({ ...cnpjPayload, checked_month: "2026-13" }), ...cnpjContext, expect: "malformed" },
    { name: "cnpj: empty msk", envelope: envelope({ ...cnpjPayload, msk: "" }), ...cnpjContext, expect: "malformed" },
    { name: "cnpj: expired", envelope: envelope({ ...cnpjPayload, exp: NOW - 1 }), ...cnpjContext, expect: "expired" },
    { name: "cnpj: subject mismatch", envelope: envelope(cnpjPayload), ...cnpjContext, sender: "@mallory:bipe.net.br", expect: "subject_mismatch" },
    { name: "cnpj: signed by unknown key", envelope: envelope(cnpjPayload, otherKey), ...cnpjContext, expect: "invalid_signature" },
    { name: "cnpj: valid with a cvm field", envelope: envelope({ ...cnpjPayload, cvm: { st: "stop_order", on: "2026-05-12" } }), ...cnpjContext, expect: "valid" },
    { name: "cnpj: valid with a cvm field the app does not know", envelope: envelope({ ...cnpjPayload, cvm: { st: "later", x: 1 } }), ...cnpjContext, expect: "valid" },
    { name: "institution: valid", envelope: envelope(institutionPayload), ...institutionContext, expect: "valid" },
    { name: "institution: valid on any device of the account", envelope: envelope(institutionPayload), ...institutionContext, senderDevice: "b3V0cm8tYXBhcmVsaG8", expect: "valid" },
    { name: "institution: valid without domains", envelope: envelope(withoutInst("domains")), ...institutionContext, expect: "valid" },
    { name: "institution: valid with empty domains", envelope: envelope({ ...institutionPayload, domains: [] }), ...institutionContext, expect: "valid" },
    { name: "institution: master key mismatch (identity reset)", envelope: envelope(institutionPayload), ...institutionContext, senderMasterKey: "bmV3LW1hc3Rlci1rZXk", expect: "master_key_mismatch" },
    { name: "institution: sender master key unknown", envelope: envelope(institutionPayload), ...institutionContext, senderMasterKey: null, expect: "master_key_mismatch" },
    { name: "institution: device-bound instead of msk", envelope: envelope({ ...withoutInst("msk"), dev: institutionContext.senderDevice }), ...institutionContext, expect: "malformed" },
    { name: "institution: empty msk", envelope: envelope({ ...institutionPayload, msk: "" }), ...institutionContext, expect: "malformed" },
    { name: "institution: missing cnpj", envelope: envelope(withoutInst("cnpj")), ...institutionContext, expect: "malformed" },
    { name: "institution: cnpj with separators", envelope: envelope({ ...institutionPayload, cnpj: "11.222.333/0001-81" }), ...institutionContext, expect: "malformed" },
    { name: "institution: domain with a scheme", envelope: envelope({ ...institutionPayload, domains: ["https://exemplo.sp.gov.br"] }), ...institutionContext, expect: "malformed" },
    { name: "institution: upper-case domain", envelope: envelope({ ...institutionPayload, domains: ["Exemplo.sp.gov.br"] }), ...institutionContext, expect: "malformed" },
    { name: "institution: domain without a dot", envelope: envelope({ ...institutionPayload, domains: ["localhost"] }), ...institutionContext, expect: "malformed" },
    { name: "institution: domains not a list", envelope: envelope({ ...institutionPayload, domains: "exemplo.sp.gov.br" }), ...institutionContext, expect: "malformed" },
    { name: "institution: subject mismatch", envelope: envelope(institutionPayload), ...institutionContext, sender: "@mallory:bipe.net.br", expect: "subject_mismatch" },
    { name: "institution: expired", envelope: envelope({ ...institutionPayload, exp: NOW - 1 }), ...institutionContext, expect: "expired" },
    { name: "brand-mark: valid", envelope: envelope(markPayload), ...markContext, expect: "valid" },
    ...reg.brandMarks.labels.slice(1).map((label) => ({ name: `brand-mark: valid with label ${label}`, envelope: envelope({ ...markPayload, label }), ...markContext, expect: "valid" })),
    { name: "brand-mark: valid on any device of the account", envelope: envelope(markPayload), ...markContext, senderDevice: "b3RoZXItcGhvbmU", expect: "valid" },
    { name: "brand-mark: unknown label", envelope: envelope({ ...markPayload, label: "embaixadora" }), ...markContext, expect: "malformed" },
    { name: "brand-mark: missing label", envelope: envelope(markWithout("label")), ...markContext, expect: "malformed" },
    { name: "brand-mark: missing mark", envelope: envelope(markWithout("mark")), ...markContext, expect: "malformed" },
    { name: "brand-mark: empty mark", envelope: envelope({ ...markPayload, mark: "" }), ...markContext, expect: "malformed" },
    { name: "brand-mark: missing brand", envelope: envelope(markWithout("brand")), ...markContext, expect: "malformed" },
    { name: "brand-mark: missing cnpj", envelope: envelope(markWithout("cnpj")), ...markContext, expect: "malformed" },
    { name: "brand-mark: cnpj with separators", envelope: envelope({ ...markPayload, cnpj: "11.222.333/0001-81" }), ...markContext, expect: "malformed" },
    { name: "brand-mark: device-bound instead of msk", envelope: envelope({ ...markWithout("msk"), dev: markContext.senderDevice }), ...markContext, expect: "malformed" },
    { name: "brand-mark: master key mismatch (identity reset)", envelope: envelope(markPayload), ...markContext, senderMasterKey: MASTER_KEY, expect: "master_key_mismatch" },
    { name: "brand-mark: sender master key unknown", envelope: envelope(markPayload), ...markContext, senderMasterKey: null, expect: "master_key_mismatch" },
    { name: "brand-mark: the brand itself is not the subject", envelope: envelope(markPayload), ...markContext, sender: markPayload.brand, expect: "subject_mismatch" },
    { name: "brand-mark: expired", envelope: envelope({ ...markPayload, exp: NOW - 1 }), ...markContext, expect: "expired" },
  ],
});

// --- Theft marks (ADR 0044, docs/theft-mark.md) ---------------------------------
// The badge envelope with payload typ "theft". Verify: v 1, known kid, signature, typ "theft", sub is the person the
// app asks about, stolen_at and iat <= now < exp. Any failure means no mark (no banner).
const theftPayload = { typ: "theft", sub: "@ana:bipe.net.br", stolen_at: NOW - 1800, iat: NOW - 600, exp: NOW - 600 + 86400 };
write("theft-marks.json", {
  $comment: "Generated by tools/gen-test-vectors.mjs. TEST-ONLY Ed25519 key (seed 01..01), never in a release build. expected: the stolen_at of a valid mark, else the error id.",
  now: NOW,
  publicKeys,
  vectors: [
    { name: "valid", envelope: envelope(theftPayload), subject: theftPayload.sub, expected: { stolenAt: theftPayload.stolen_at } },
    { name: "other subject", envelope: envelope(theftPayload), subject: "@bia:bipe.net.br", expected: { error: "subject_mismatch" } },
    { name: "expired", envelope: envelope({ ...theftPayload, iat: NOW - 2 * 86400, exp: NOW - 86400 }), subject: theftPayload.sub, expected: { error: "expired" } },
    { name: "a badge is not a mark", envelope: valid, subject: basePayload.sub, expected: { error: "malformed" } },
    { name: "other key", envelope: envelope(theftPayload, otherKey), subject: theftPayload.sub, expected: { error: "invalid_signature" } },
    { name: "unknown kid", envelope: envelope(theftPayload, testKey, { kid: "nope" }), subject: theftPayload.sub, expected: { error: "unknown_kid" } },
    { name: "stolen_at missing", envelope: envelope((({ stolen_at: _, ...rest }) => rest)(theftPayload)), subject: theftPayload.sub, expected: { error: "malformed" } },
  ],
});

// --- Signed lists: operator list and issuer registry (docs/signed-lists.md, bipe#637, bipe#645) --------------
// TEST-ONLY list signer keys (seeds 11..11, 12..12, 13..13), separate from the badge key. Verify with the order in
// docs/signed-lists.md. stored is the list the device holds (version and payload bytes), or null.
const listKeys = { a: keyFromSeed("11".repeat(32)), b: keyFromSeed("12".repeat(32)), c: keyFromSeed("13".repeat(32)) };
const LIST_KID = { a: "test-only-list-a", b: "test-only-list-b", c: "test-only-list-c" };
const signerSets = {
  "one-key": { threshold: 1, keys: { [LIST_KID.a]: rawPublicKey(listKeys.a) } },
  "two-of-three": { threshold: 2, keys: Object.fromEntries(Object.entries(LIST_KID).map(([k, kid]) => [kid, rawPublicKey(listKeys[k])])) },
};
const listPayloadBytes = (payload) => Buffer.from(JSON.stringify(payload), "utf8");
function listEnvelope(payload, signers = [["a", listKeys.a]], { v = 1 } = {}) {
  const bytes = listPayloadBytes(payload);
  return { v, payload: b64url(bytes), sigs: signers.map(([k, key]) => ({ kid: LIST_KID[k] ?? k, sig: b64url(sign(null, bytes, key)) })) };
}
const LIST_ISSUED = NOW - 3600;
const LIST_EXPIRES = LIST_ISSUED + 14 * 86400;
const operatorsPayload = {
  typ: "operators",
  version: 3,
  issued: LIST_ISSUED,
  expires: LIST_EXPIRES,
  operators: [
    {
      server_name: "bipe.net.br",
      name: "Bipe",
      status: "valid",
      joined: "2026-10-26",
      signing_keys: { "ed25519:a_test": "dGVzdC1iaXBlLW5ldC1ici1zZXJ2ZXIta2V5LTAwMDE" },
      account_api: "https://api.bipe.net.br",
      push_egress: ["203.0.113.10/32", "2001:db8:10::/64"],
      signup: "open",
    },
    {
      server_name: "coop.exemplo.br",
      name: "Cooperativa Exemplo",
      status: "valid",
      joined: "2026-11-02",
      signing_keys: { "ed25519:k1": "dGVzdC1jb29wLWV4ZW1wbG8tc2VydmVyLWtleS0wMDE" },
      account_api: "https://contas.coop.exemplo.br",
      push_egress: ["198.51.100.20/32"],
      signup: "invite",
    },
    { server_name: "antigo.exemplo.br", name: "Cooperativa Antiga", status: "removed", joined: "2026-11-02", removed: "2027-01-15" },
  ],
};
const issuersPayload = {
  typ: "issuers",
  version: 2,
  issued: LIST_ISSUED,
  expires: LIST_EXPIRES,
  issuers: [
    { id: "bipe", name: "Bipe", status: "valid", accredited: "2026-10-26", levels: ["pix", "govbr", "institution", "cnpj", "brand-mark"], keys: publicKeys },
    { id: "banco-exemplo", name: "Banco Exemplo", status: "valid", accredited: "2026-11-10", levels: ["govbr"], keys: { "test-only-banco-2026-11": rawPublicKey(keyFromSeed("21".repeat(32))) } },
    { id: "cartorio-antigo", name: "Cartório Antigo", status: "removed", accredited: "2026-11-10", removed: "2027-02-01" },
  ],
};
const storedOps = (payload) => ({ version: payload.version, payload: b64url(listPayloadBytes(payload)) });
const opsLookups = [
  { server: "bipe.net.br", expect: "valid" },
  { server: "coop.exemplo.br", expect: "valid" },
  { server: "antigo.exemplo.br", expect: "removed" },
  { server: "evilbipe.net.br", expect: "unknown" },
];
const goodOps = listEnvelope(operatorsPayload);
const opsWithoutRemoved = { ...operatorsPayload, operators: operatorsPayload.operators.slice(0, 2) };
write("signed-lists.json", {
  $comment: "Generated by tools/gen-test-vectors.mjs. TEST-ONLY list signer keys (seeds 11..11, 12..12, 13..13) and test issuer key (seed 21..21), never in a release build. Verify each envelope with the order in docs/signed-lists.md: typ is the expected list type, signerSet names an item of signerSets, stored is the list the verifier holds (null for none). expect is valid or the error id. lookups: for a valid operator list, the answer of the rule 'who is a Bipe user' for a server name.",
  now: NOW,
  signerSets,
  vectors: [
    { name: "operators: valid", typ: "operators", signerSet: "one-key", envelope: goodOps, stored: null, expect: "valid", lookups: opsLookups },
    { name: "operators: valid, replaces a lower version", typ: "operators", signerSet: "one-key", envelope: goodOps, stored: storedOps({ ...opsWithoutRemoved, version: 2 }), expect: "valid", lookups: opsLookups },
    { name: "operators: same version, same bytes", typ: "operators", signerSet: "one-key", envelope: goodOps, stored: storedOps(operatorsPayload), expect: "valid", lookups: opsLookups },
    { name: "operators: removed server stays removed in a later version", typ: "operators", signerSet: "one-key", envelope: listEnvelope({ ...operatorsPayload, version: 4 }), stored: storedOps(operatorsPayload), expect: "valid", lookups: [{ server: "antigo.exemplo.br", expect: "removed" }] },
    { name: "operators: expired", typ: "operators", signerSet: "one-key", envelope: listEnvelope({ ...operatorsPayload, issued: NOW - 15 * 86400, expires: NOW - 86400 }), stored: null, expect: "expired" },
    { name: "operators: expires now", typ: "operators", signerSet: "one-key", envelope: listEnvelope({ ...operatorsPayload, expires: NOW }), stored: null, expect: "expired" },
    { name: "operators: rolled back (lower version)", typ: "operators", signerSet: "one-key", envelope: listEnvelope({ ...opsWithoutRemoved, version: 2 }), stored: storedOps(operatorsPayload), expect: "rolled_back" },
    { name: "operators: same version, other bytes", typ: "operators", signerSet: "one-key", envelope: listEnvelope(opsWithoutRemoved), stored: storedOps(operatorsPayload), expect: "rolled_back" },
    { name: "operators: tampered payload", typ: "operators", signerSet: "one-key", envelope: { ...goodOps, payload: b64url(listPayloadBytes(opsWithoutRemoved)) }, stored: null, expect: "invalid_signature" },
    { name: "operators: signed by a key not in the signer set", typ: "operators", signerSet: "one-key", envelope: listEnvelope(operatorsPayload, [["a", otherKey]]), stored: null, expect: "invalid_signature" },
    { name: "operators: unknown kid only", typ: "operators", signerSet: "one-key", envelope: listEnvelope(operatorsPayload, [["list-unknown", listKeys.b]]), stored: null, expect: "invalid_signature" },
    { name: "operators: badge key cannot sign a list", typ: "operators", signerSet: "one-key", envelope: listEnvelope(operatorsPayload, [[KID, testKey]]), stored: null, expect: "invalid_signature" },
    { name: "operators: no signatures", typ: "operators", signerSet: "one-key", envelope: { ...goodOps, sigs: [] }, stored: null, expect: "invalid_signature" },
    { name: "operators: unsupported version", typ: "operators", signerSet: "one-key", envelope: listEnvelope(operatorsPayload, undefined, { v: 2 }), stored: null, expect: "unsupported_version" },
    { name: "operators: an issuer registry is not an operator list", typ: "operators", signerSet: "one-key", envelope: listEnvelope(issuersPayload), stored: null, expect: "wrong_type" },
    { name: "operators: duplicate server_name", typ: "operators", signerSet: "one-key", envelope: listEnvelope({ ...operatorsPayload, operators: [...operatorsPayload.operators, { ...operatorsPayload.operators[1], name: "Outra" }] }), stored: null, expect: "malformed" },
    { name: "operators: valid entry without signing_keys", typ: "operators", signerSet: "one-key", envelope: listEnvelope({ ...operatorsPayload, operators: [(({ signing_keys: _, ...rest }) => rest)(operatorsPayload.operators[0])] }), stored: null, expect: "malformed" },
    { name: "operators: unknown status", typ: "operators", signerSet: "one-key", envelope: listEnvelope({ ...operatorsPayload, operators: [{ ...operatorsPayload.operators[0], status: "suspended" }] }), stored: null, expect: "malformed" },
    { name: "operators: unknown signup value", typ: "operators", signerSet: "one-key", envelope: listEnvelope({ ...operatorsPayload, operators: [{ ...operatorsPayload.operators[0], signup: "maybe" }] }), stored: null, expect: "malformed" },
    { name: "operators: 2 of 3, two signers", typ: "operators", signerSet: "two-of-three", envelope: listEnvelope(operatorsPayload, [["a", listKeys.a], ["c", listKeys.c]]), stored: null, expect: "valid", lookups: opsLookups },
    { name: "operators: 2 of 3, one signer", typ: "operators", signerSet: "two-of-three", envelope: listEnvelope(operatorsPayload, [["b", listKeys.b]]), stored: null, expect: "invalid_signature" },
    { name: "operators: 2 of 3, one signer twice counts once", typ: "operators", signerSet: "two-of-three", envelope: listEnvelope(operatorsPayload, [["a", listKeys.a], ["a", listKeys.a]]), stored: null, expect: "invalid_signature" },
    { name: "operators: 2 of 3, one bad signature does not count", typ: "operators", signerSet: "two-of-three", envelope: listEnvelope(operatorsPayload, [["a", listKeys.a], ["b", otherKey]]), stored: null, expect: "invalid_signature" },
    { name: "operators: 2 of 3, a bad signature beside two good ones", typ: "operators", signerSet: "two-of-three", envelope: listEnvelope(operatorsPayload, [["a", listKeys.a], ["b", otherKey], ["c", listKeys.c]]), stored: null, expect: "valid", lookups: opsLookups },
    { name: "operators: 2 of 3, an unknown signer is ignored", typ: "operators", signerSet: "two-of-three", envelope: listEnvelope(operatorsPayload, [["a", listKeys.a], ["list-new-2027-01", otherKey], ["b", listKeys.b]]), stored: null, expect: "valid", lookups: opsLookups },
    { name: "issuers: valid", typ: "issuers", signerSet: "one-key", envelope: listEnvelope(issuersPayload), stored: null, expect: "valid" },
    { name: "issuers: expired", typ: "issuers", signerSet: "one-key", envelope: listEnvelope({ ...issuersPayload, expires: NOW - 1 }), stored: null, expect: "expired" },
    { name: "issuers: rolled back", typ: "issuers", signerSet: "one-key", envelope: listEnvelope({ ...issuersPayload, version: 1 }), stored: storedOps(issuersPayload), expect: "rolled_back" },
    { name: "issuers: bad signature", typ: "issuers", signerSet: "one-key", envelope: listEnvelope(issuersPayload, [["a", otherKey]]), stored: null, expect: "invalid_signature" },
    { name: "issuers: an operator list is not an issuer registry", typ: "issuers", signerSet: "one-key", envelope: goodOps, stored: null, expect: "wrong_type" },
    { name: "issuers: a kid in two issuers", typ: "issuers", signerSet: "one-key", envelope: listEnvelope({ ...issuersPayload, issuers: [issuersPayload.issuers[0], { ...issuersPayload.issuers[1], keys: publicKeys }] }), stored: null, expect: "malformed" },
    { name: "issuers: unknown level", typ: "issuers", signerSet: "one-key", envelope: listEnvelope({ ...issuersPayload, issuers: [{ ...issuersPayload.issuers[1], levels: ["gold"] }] }), stored: null, expect: "malformed" },
    { name: "issuers: bad issuer id", typ: "issuers", signerSet: "one-key", envelope: listEnvelope({ ...issuersPayload, issuers: [{ ...issuersPayload.issuers[1], id: "Banco Exemplo" }] }), stored: null, expect: "malformed" },
  ],
});

// --- Badges with an issuer ID (docs/badge-attestation.md "Issuer", bipe#637) ---------------------------------
// trustedIssuers is the decoded valid issuer registry above (removed entries included, as the device holds them).
const bancoKey = keyFromSeed("21".repeat(32));
const BANCO_KID = "test-only-banco-2026-11";
const bancoPayload = { ...basePayload, lvl: "govbr", iss: "banco-exemplo", iat: NOW - 3600, exp: NOW - 3600 + reg.badgeKeys.lifeDays * 86400 };
const issuerEnvelope = (payload, key, { iss, kid }) => ({ ...envelope(payload, key, { kid }), ...(iss === undefined ? {} : { iss }) });
const bancoValid = issuerEnvelope(bancoPayload, bancoKey, { iss: "banco-exemplo", kid: BANCO_KID });
const bipeIssuerPayload = { ...basePayload, exp: NOW - 3600 + reg.badgeKeys.lifeDays * 86400 };
write("badge-issuers.json", {
  $comment: "Generated by tools/gen-test-vectors.mjs. TEST-ONLY keys (badge seed 01..01, issuer seed 21..21), never in a release build. Verify with the order in docs/badge-attestation.md, with trustedIssuers as the device's issuer registry. A badge without iss is from issuer bipe. lifeDays is registries/badge-keys.json lifeDays.",
  now: NOW,
  lifeDays: reg.badgeKeys.lifeDays,
  trustedIssuers: issuersPayload.issuers,
  vectors: [
    { name: "no iss: issuer bipe, as before", envelope: envelope(bipeIssuerPayload), ...context, expect: "valid" },
    { name: "iss bipe in envelope and payload", envelope: issuerEnvelope({ ...bipeIssuerPayload, iss: "bipe" }, testKey, { iss: "bipe", kid: KID }), ...context, expect: "valid" },
    { name: "other issuer: valid", envelope: bancoValid, ...context, expect: "valid" },
    { name: "other issuer: unknown issuer", envelope: issuerEnvelope({ ...bancoPayload, iss: "banco-falso" }, bancoKey, { iss: "banco-falso", kid: BANCO_KID }), ...context, expect: "unknown_issuer" },
    { name: "other issuer: removed issuer", envelope: issuerEnvelope({ ...bancoPayload, iss: "cartorio-antigo" }, bancoKey, { iss: "cartorio-antigo", kid: BANCO_KID }), ...context, expect: "unknown_issuer" },
    { name: "other issuer: kid of another issuer", envelope: issuerEnvelope(bancoPayload, testKey, { iss: "banco-exemplo", kid: KID }), ...context, expect: "unknown_kid" },
    { name: "other issuer's kid without iss", envelope: issuerEnvelope(bancoPayload, bancoKey, { kid: BANCO_KID }), ...context, expect: "unknown_kid" },
    { name: "other issuer: bad signature", envelope: issuerEnvelope(bancoPayload, otherKey, { iss: "banco-exemplo", kid: BANCO_KID }), ...context, expect: "invalid_signature" },
    { name: "other issuer: payload without iss", envelope: issuerEnvelope((({ iss: _, ...rest }) => rest)(bancoPayload), bancoKey, { iss: "banco-exemplo", kid: BANCO_KID }), ...context, expect: "issuer_mismatch" },
    { name: "bipe envelope, payload claims another issuer", envelope: envelope({ ...bipeIssuerPayload, iss: "banco-exemplo" }), ...context, expect: "issuer_mismatch" },
    { name: "other issuer: level not allowed", envelope: issuerEnvelope({ ...bancoPayload, lvl: "pix" }, bancoKey, { iss: "banco-exemplo", kid: BANCO_KID }), ...context, expect: "level_not_allowed" },
    { name: "other issuer: life over lifeDays", envelope: issuerEnvelope({ ...bancoPayload, exp: NOW + 30 * 86400 }, bancoKey, { iss: "banco-exemplo", kid: BANCO_KID }), ...context, expect: "life_too_long" },
    { name: "other issuer: expired", envelope: issuerEnvelope({ ...bancoPayload, iat: NOW - 8 * 86400, exp: NOW - 86400 }, bancoKey, { iss: "banco-exemplo", kid: BANCO_KID }), ...context, expect: "expired" },
    { name: "other issuer: subject mismatch", envelope: bancoValid, ...context, sender: "@mallory:bipe.net.br", expect: "subject_mismatch" },
  ],
});

// --- CVM line in the company seal (ADR 0077, bipe#238) ----------------------

const cvmCases = [
  ["absent", undefined],
  ["registered, one category", { st: "registered", cat: ["corretora"] }],
  ["registered, several categories, one line each", { st: "registered", cat: ["corretora", "gestor de recursos"] }],
  ["registered, a repeated category shows once", { st: "registered", cat: ["corretora", " corretora "] }],
  ["registered without categories", { st: "registered", cat: [] }],
  ["registered with an empty category", { st: "registered", cat: ["corretora", ""] }],
  ["cancelled", { st: "cancelled", on: "2010-05-06" }],
  ["cancelled without a date", { st: "cancelled" }],
  ["cancelled with a bad date", { st: "cancelled", on: "2010-13-06" }],
  ["stop order: red, overrides", { st: "stop_order", on: "2026-05-12" }],
  ["stop order without a date", { st: "stop_order" }],
  ["financial CNAE without registration", { st: "no_registration" }],
  ["unknown state", { st: "authorised" }],
  ["not an object", "registered"],
];
write("cvm-lines.json", {
  $comment: "The signed badge field cvm (docs/badge-attestation.md) to the lines of the company seal detail (ADR 0077 point 3). Reference: tools/lib/cvm.mjs. lines: string keys with an optional argument; danger: the stop-order line is red and chats from the account show bipe_cvm_stop_order_card. A field that is missing or not well formed shows nothing. The detail ends with bipe_cvm_source when it shows a line.",
  vectors: cvmCases.map(([name, cvm]) => ({ name, ...(cvm === undefined ? {} : { cvm }), ...cvmLines(cvm) })),
});

// --- Links in official notices (ADR 0036, bipe#245) -------------------------

const noticeDomains = ["exemplo.sp.gov.br", "bipe.chat"];
const noticeCases = [
  ["the verified domain", "https://exemplo.sp.gov.br/iptu"],
  ["a subdomain", "https://servicos.exemplo.sp.gov.br/agendar?dia=2"],
  ["upper-case scheme and host", "HTTPS://Exemplo.SP.gov.br/"],
  ["host only", "https://exemplo.sp.gov.br"],
  ["a trailing dot", "https://exemplo.sp.gov.br./"],
  ["a fragment right after the host", "https://bipe.chat#inicio"],
  ["http, not https", "http://exemplo.sp.gov.br/iptu"],
  ["another domain", "https://exemplo-sp.gov.com/iptu"],
  ["the domain as a prefix", "https://exemplo.sp.gov.br.golpe.com/iptu"],
  ["the domain glued to another name", "https://falsoexemplo.sp.gov.br/"],
  ["user info before the host", "https://exemplo.sp.gov.br@golpe.com/"],
  ["a port", "https://exemplo.sp.gov.br:8443/"],
  ["an IP address", "https://192.168.0.1/"],
  ["an IPv6 literal", "https://[::1]/"],
  ["a non-ASCII host", "https://exemplo.sp.gоv.br/"],
  ["a punycode host not in the list", "https://xn--exmplo-6ua.sp.gov.br/"],
  ["no scheme", "exemplo.sp.gov.br/iptu"],
  ["empty host", "https:///iptu"],
  ["javascript", "javascript:alert(1)"],
];
write("notice-links.json", {
  $comment: "A link in an official notice from an account with a valid institution badge (docs/badge-attestation.md, domains) is clickable only when clickable is true. Reference: tools/lib/notice.mjs. The rule is lexical: https, then the text up to the first /, ? or # is the host; it must be ASCII letters, digits, dots and hyphens only, and after lower-casing and one trailing dot removed it equals a domain or ends with '.' + a domain. Every other link shows as plain text.",
  domains: noticeDomains,
  vectors: noticeCases.map(([name, url]) => ({ name, url, clickable: noticeLinkClickable(noticeDomains, url) })),
});

// --- Normalisation and reserved names --------------------------------------

const reservedSet = new Map();
for (const [cat, names] of Object.entries(reg.reserved.categories)) for (const n of names) reservedSet.set(n, cat);

const nameCases = ["Itaú", "ІТАÚ", "Nubаnk", "Banco  do   Brasil", "B4nco do Br4sil", "Receita Federal", "Bipe Oficial", "Maria Souza", "Ana", "gov.br", "Caixa Tem", "Novidades do Bipe", "Novidades Bipe", "Nоvidades do Bіpe"];
write("normalization.json", {
  $comment: "normalize(): NFKD, strip combining marks, lowercase, fold homoglyphs (registries/homoglyphs.json), collapse whitespace. reserved: category if the normalised name is in registries/reserved-names.json.",
  vectors: nameCases.map((input) => {
    const normalized = normalize(input, reg.homoglyphs.map);
    return { input, normalized, reserved: reservedSet.get(normalized) ?? null };
  }),
});

// --- Scam detection --------------------------------------------------------

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
  "Seu pacote está retido. Pague a taxa de R$ 9,90 pelo link pra liberar a entrega: entrega-rapida.com",
  "Acompanhe em https://loja.com.br/rastreio ou escreva pra ajuda@loja.com.br",
];
write("scam-detection.json", {
  $comment: "Regexes run on the raw message; phrases and keywords match on normalize(message) without homoglyph folding. Expected ids are generated by the reference implementation.",
  vectors: messages.map((message) => ({ message, matches: scamMatchIDs(message, reg) })),
});

const warningMessages = [
  ...messages,
  "Me liga no (11) 98765-4321",
  "Meu e-mail é ana.souza@example.com",
  "Minha chave é ana.souza@example.com",
  "CPF 123.456.789-09 para o cadastro",
  "Salva esse número, é urgente",
  "Comprovante enviado, me empresta mais um pouco hoje ainda",
  "Paga esse boleto: 23793.38128 60000.000003 00000.000400 1 84340000010000",
  "Boleto 23793.38128 60000.000003 00000.000400 1 84340000010000 e o pix 00020126580014br.gov.bcb.pix0136a1b2c3d4",
  "Faz um pix pra minha chave (11) 98765-4321, troquei de número",
  "CORREIOS: sua encomenda foi taxada. Pague o imposto em https://correios-rastreio.top/pagar",
  "URGENTE! Sua encomenda está retida, pague a taxa em www.libera-pacote.net hoje ainda",
  "Seu pedido saiu para entrega",
  "Seu pedido saiu para entrega. Acompanhe em loja.com.br/rastreio",
  "Paguei a taxa de entrega no site loja.com",
  "Seu pacote está retido, pague a taxa na agência",
  "Oi filha, perdi meu celular. Essa é minha conta nova",
  "Troquei de celular, essa é minha conta nova, salva aqui",
  "Mãe, tô com conta nova aqui no Bipe",
  "Essa é minha nova conta, preciso de um pix hoje ainda",
  "Salva essa conta, depois te explico",
  "Criei uma conta nova no banco",
  "Minha conta nova do Bipe tá ótima",
  "A conta nova do novo banco chegou",
  "Contanova é o nome da loja",
  "Vou criar uma conta nova pro Tiago",
  "Itaú: acesse itau-seguranca.online pra continuar",
  "Sua conta será bloqueada. Regularize em www.itau-seguranca.online",
  "Acesse https://www.іtau.com.br/token",
  "Entra em bradesc0.com.br pra ver",
  "Resgate em gov.br.valores-a-receber.top",
  "WWW.NUBANK-PROMO.SITE",
  "Entra em https://www.itau.com.br pra ver",
  "Escreve pra itau@gmail.com",
  "Vi no www1.bradesco.com.br",
  "Consulta a multa em detran.sp.gov.br",
  "Olha esse vídeo youtube.com/@itau",
  "Rastreie em correios.com.br",
  "Seu Pix foi bloqueado. Regularize em pix-seguro.com",
  "BANCO: detectamos acesso suspeito na sua conta. Confirme seus dados em seguranca-app.net",
  "Seu cartão será cancelado, atualize o cadastro: cartao-online.site",
  "Seu Pix foi bloqueado, me liga",
  "Atualizei o app do banco, ficou bom",
  "Abri conta no banco, olha o site nubank.com.br",
  // bipe#178: short public-body and bank names as a whole host label.
  "Você tem R$ 1.240 em valores a receber. Consulte e resgate hoje em valoresareceber-bcb.site",
  "Consulte seu benefício em meu-inss.online",
  "Restituição liberada: receita-restituicao.site",
  "Entra no gov-br.site pra ver",
  "Atualize o app pelo bb-atualiza.app",
  "Consulta seus valores em valoresareceber.bcb.gov.br",
  "Fiz bolo com a receita de receitasdavovo.com.br",
  "Olha essa receita: receitas.globo.com/bolo",
  // bipe#179: a request to install a remote-access app.
  "Pra cancelar a compra, instala o app de proteção pelo link protecao-cartao.app e me fala o código que aparecer",
  "Baixa o AnyDesk e me passa o número que aparecer",
  "Instale o Team Viewer pra gente resolver o problema da sua conta",
  "Pra liberar o estorno, baixa esse app de segurança: estorno-seguro.online",
  "Instala o app do banco pelo site nubank.com.br",
  "Baixa o app do banco na loja: play.google.com/store/apps/details?id=com.nu.production",
  "Instalei o app novo do banco, ficou ótimo",
  "Baixa o app da escola pra ver o boletim do Pedro",
  // bipe#181: a threat with a payment demand.
  "Tenho o print da nossa chamada. Se não pagar R$ 2.000 hoje ainda, mando pra todos os seus contatos",
  "Sei onde você mora e o nome da sua mãe. Faz um pix de 3 mil hoje ainda e fica tudo bem",
  "Seus nudes vão vazar. Faz um pix de 500 reais ou vou postar",
  "Me paga a pizza senão vou contar pra todo mundo kkk",
  "Vou espalhar pra todo mundo que você ganhou no truco",
  "Sei onde você mora, passo aí sábado pra gente ver o jogo",
  // bipe#182: fake support asks for the PIN or a code.
  "Olá, aqui é do suporte do Bipe. Sua conta vai ser desativada hoje. Me passa sua senha de 8 números pra confirmar que é você",
  "Aqui é a Ana do atendimento do Bipe. Me informe o código que chegou no seu e-mail",
  "Qual a sua senha do Bipe? É do suporte, pra liberar sua conta",
  "Me passa a senha do wifi da casa nova?",
  "O suporte de TI pediu pra trocar a senha do e-mail amanhã",
  "Esqueci minha senha do Bipe, como faço?",
];
write("scam-warnings.json", {
  $comment: "warningKind: the first kind in registries/scam-patterns.json warningKindPriority whose rule applies to the scam-detection matches, or null. pixKey needs a pixKeyContextWords entry in normalize(message) without homoglyph folding. newNumber needs a matched urgency phrase from newNumberPhrases, or a newAccountPhrases entry in normalize(message) without homoglyph folding together with a family term as a whole word or a matched urgency phrase. Link hosts: every linkPatterns match on normalize(message) folded with the host homoglyphs (registries/homoglyphs.json without ASCII keys outside [0-9a-z]); the plain host is the same UTF-16 range of normalize(message) without folding. deliveryFee needs a link host and an entry from each of deliveryParcelWords, deliveryHoldWords and deliveryFeeWords in normalize(message) without homoglyph folding. lookalikeLink needs a folded host that, without dots and hyphens, contains a lookalikeBrandTokens entry, with a plain host that is not an officialDomains entry or a subdomain of one. bankAlert needs a link host and an entry from each of bankAlertSubjectWords and bankAlertThreatWords. lookalikeLink also applies when a folded host label (split on dots and hyphens) is a lookalikeHostLabels entry. extortion needs an extortionThreatPhrases entry and an extortionDemandWords entry. remoteApp needs a remoteAppInstallWords whole word and either a remoteAppNames whole word, or a link host whose plain host is not under officialDomains or appStoreDomains together with a remoteAppBankWords entry. pinRequest needs a pinRequestAskPhrases entry, a pinRequestSecretWords whole word and a pinRequestSupportWords whole word. Whole word: each run of characters outside [0-9a-z] becomes one space, then the term needs a space on each side. Expected kinds are generated by the reference implementation.",
  vectors: warningMessages.map((message) => ({ message, kind: scamWarningKind(message, reg) })),
});

console.log(`wrote test vectors to ${out}`);

// --- Handles --------------------------------------------------------------

const handleInputs = [
  "ana.souza", "ana_souza", "anasouza", "a1b", "ab", "a".repeat(30), "a".repeat(31),
  "Ana", "ana..souza", ".ana", "ana.", "ana_", "_ana", "ana-souza", "ana souza", "anã",
  "itau", "1tau", "it.au", "b4nco.inter", "bipe", "b1pe", "suporte.bipe",
];
// Owned handles (ADR 0065). claimant: the Matrix user ID that wants the handle. Without it the case is a
// lookup (shape only). The owner comes from registries/reserved-name-owners.json.
const mzOwner = reg.owners.handles.mz;
const claimCases = [
  ...Object.values(reg.officialAccounts.accounts).flatMap(({ handle, userId }) => [
    { input: handle },
    { input: handle, claimant: userId },
    { input: handle, claimant: "@ana:bipe.net.br" },
    { input: handle, claimant: "" },
    { input: `${handle[0]}.${handle.slice(1)}`, claimant: userId },
    { input: `${handle[0]}.${handle.slice(1)}`, claimant: "@ana:bipe.net.br" },
  ]),
  { input: "novidades_bipe", claimant: "@ana:bipe.net.br" },
  { input: "novidades_do_bipe", claimant: "@ana:bipe.net.br" },
  { input: "mz" },
  { input: "mz", claimant: mzOwner },
  { input: "mz", claimant: "@ana:bipe.net.br" },
  { input: "mz", claimant: "" },
  { input: "m.z", claimant: mzOwner },
  { input: "m.z", claimant: "@ana:bipe.net.br" },
  { input: "qx" },
  { input: "qx", claimant: "@ana:bipe.net.br" },
  { input: "m_" },
  { input: "MZ" },
  { input: "m" },
];
write("handles.json", {
  description: "Handle validation and skeletons. problem is null when valid. Equal skeletons collide. A case without claimant is a lookup (shape only); with claimant it is a claim by that Matrix user ID (\"\" for a new account).",
  cases: [
    ...handleInputs.map((input) => ({ input, problem: handleProblem(input, reg), skeleton: handleSkeleton(input, reg) })),
    ...claimCases.map(({ input, claimant }) => ({ input, ...(claimant === undefined ? {} : { claimant }), problem: handleProblem(input, reg, claimant), skeleton: handleSkeleton(input, reg) })),
  ],
});

// --- Handle suggestions (bipe-chat/bipe#200) ----------------------------------

const suggestionNames = [
  "Ana Souza", "Ana Maria de Souza", "José da Silva", "Zé", "Ana", "Bo", "Ângela Müller", "Maria-Luísa Prado",
  "  ana   souza  ", "李小龙", "Ana 2", "Pedro Henrique Alcântara de Oliveira Bragança", "O'Neil", "ana.souza", "",
  "Bipe", "123", "Dr. João Pedro",
];
write("handle-suggestions.json", {
  description: "handleSuggestions(displayName): handles of the right shape for Escolha seu @, in order (registries/handles.json suggestions). The app checks availability in this order and shows the first suggestions.shown that are free.",
  cases: suggestionNames.map((name) => ({ name, suggestions: handleSuggestions(name, reg) })),
});

// --- Onboarding schedules (bipe-chat/bipe#202) --------------------------------

const pinCases = [];
for (const step of [0, 1, 2, 3, 4, 5, 9]) for (const result of ["right", "wrong", "later"]) pinCases.push({ step, result });
write("onboarding-schedule.json", {
  description: "Onboarding schedules (registries/onboarding.json pinReminder, bipe-chat/bipe#202). After a check at step with result (right, wrong, later): the next step and the days until the next reminder.",
  pinReminder: pinCases.map((c) => ({ ...c, ...(({ step, gapDays }) => ({ nextStep: step, gapDays }))(pinReminderNext(c.step, c.result, reg)) })),
});

// --- Invite codes ------------------------------------------------------------
// Hand-written cases (test-vectors/invite-codes.json). Check them against the reference; fail closed.

const inviteCases = JSON.parse(readFileSync(join(root, "test-vectors", "invite-codes.json"), "utf8")).vectors;
for (const { input, code } of inviteCases) {
  const got = extractInviteCode(input, reg);
  if (got !== code) throw new Error(`invite-codes.json: ${JSON.stringify(input)} gives ${got}, expected ${code}`);
}

// --- CNPJ --------------------------------------------------------------------
// Hand-written cases (test-vectors/cnpj.json). Check them against the reference; fail closed.

const cnpjCases = JSON.parse(readFileSync(join(root, "test-vectors", "cnpj.json"), "utf8")).vectors;
for (const { input, cnpj } of cnpjCases) {
  const got = normalizeCnpj(input);
  if (got !== cnpj) throw new Error(`cnpj.json: ${JSON.stringify(input)} gives ${got}, expected ${cnpj}`);
}

// --- Phone numbers -----------------------------------------------------------
// Hand-written cases (test-vectors/phone-numbers.json). Check them against the reference; fail closed.

const phoneCases = JSON.parse(readFileSync(join(root, "test-vectors", "phone-numbers.json"), "utf8")).vectors;
for (const { input, e164 } of phoneCases) {
  const got = normalizePhone(input, reg);
  if (got !== e164) throw new Error(`phone-numbers.json: ${JSON.stringify(input)} gives ${got}, expected ${e164}`);
}

// --- Bipe servers (ADR 0168, bipe-chat/bipe#680) -----------------------------
// Hand-written cases (test-vectors/bipe-servers.json). Check them against the reference; fail closed.

const serverCases = JSON.parse(readFileSync(join(root, "test-vectors", "bipe-servers.json"), "utf8")).vectors;
for (const { userId, bipe } of serverCases) {
  if (isBipeUserID(userId, reg) !== bipe) throw new Error(`bipe-servers.json: ${JSON.stringify(userId)} gives ${!bipe}, expected ${bipe}`);
}

// --- Pix check ("Conferir no Bipe", bipe ADR 0091) -------------------------

// The static example in Banco Central's "Manual de Padrões para Iniciação do Pix". Its CRC anchors crc16().
const BCB_EXAMPLE = "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D";
if (crc16(BCB_EXAMPLE.slice(0, -4)) !== "1D3D") throw new Error("pix: crc16 does not match the Banco Central example");
const phoneCode = buildBrCode({ key: "+5511987654321", info: "aluguel", name: "ANA SOUZA", city: "SAO PAULO", amount: "50.00", txid: "BIPE7KX2" });
const dynamicCode = buildBrCode({ url: "pix.example.com/qr/v2/9d36b84f2c", name: "LOJA EXEMPLO LTDA", city: "RECIFE", singleUse: true });
const pixInputs = [
  BCB_EXAMPLE,
  BCB_EXAMPLE.slice(0, -1) + "E",
  BCB_EXAMPLE.replace("Fulano de Tal", "Fulano de Taz"),
  BCB_EXAMPLE.slice(0, 60),
  `Segue o pix:\n${phoneCode}\nobrigada!`,
  phoneCode.toLowerCase().replace("br.gov.bcb.pix", "BR.GOV.BCB.PIX"),
  dynamicCode,
  buildBrCode({ key: "joao@example.com", name: "JOÃO DA CONCEIÇÃO", city: "SÃO LUÍS", amount: "1250.90" }),
  buildBrCode({ key: "11222333000181", name: "EMPRESA EXEMPLO", city: "CURITIBA" }),
  buildBrCode({ key: "52998224725", name: "MARIA LIMA", city: "NATAL", amount: "10" }),
  `URGENTE, paga agora: ${BCB_EXAMPLE}`,
  "minha chave pix é 123.456.789-09 ou ana@example.com",
  "a chave é 11987654321",
  "Oi mãe, troquei de número. Faz um pix pra essa chave 11987654321",
  "chave aleatória 123e4567-e12b-12d1-a456-426655440000 e cnpj 11.222.333/0001-81",
  "pedido 000201 confirmado",
  "bom dia",
  "",
];
write("pix-check.json", {
  $comment: "pixCheck(text) (tools/lib/pix.mjs): code is the first BR Code (EMV TLV from a '000201' with br.gov.bcb.pix after it; lengths count code points; CRC-16/CCITT-FALSE over the UTF-8 bytes through '6304'): status valid, badCrc or malformed, and its fields when not malformed. keys: matches of registries/scam-patterns.json pixKeyPatterns in the text with the code span replaced by one space, one entry per span in text order (longer first on a tie), types in pattern order. warning: scamWarningKind() of that same text without the code, passing over pixCode and pixKey. Expected values are generated by the reference implementation.",
  vectors: pixInputs.map((text) => ({ text, ...pixCheck(text, reg) })),
});

// --- PINs (ADR 0057) ---------------------------------------------------------

const pinInputs = [
  // Strong enough.
  "73914862", "40817352", "02468135", "12121212", "13579246", "31041990", "29021900", "00001234", "19000000", "21003112",
  // Shape.
  "", "1234567", "123456789", "1234 5678", "1234-5678", "12a45678", "\uff11\uff12\uff13\uff14\uff15\uff16\uff17\uff18", " 73914862",
  // All one digit.
  "00000000", "11111111", "99999999",
  // Sequences, up and down, with wrap.
  "12345678", "23456789", "01234567", "78901234", "90123456", "87654321", "98765432", "76543210", "21098765",
  // Dates: DDMMYYYY and YYYYMMDD, leap days, the year range.
  "25121990", "01012000", "31122099", "01011900", "29022000", "29022024", "19901225", "20000229", "20991231",
  "29022023", "31121899", "01012100", "32011990", "00011990", "15131990", "21000101",
];
write("pins.json", {
  $comment: "pinProblem(): null when the PIN is strong enough, else not_digits, wrong_length, repeated_digit, sequence or date, checked in that order. Rule and numbers: registries/accounts.json. Expected values are generated by the reference implementation.",
  cases: pinInputs.map((input) => ({ input, problem: pinProblem(input, reg) })),
});

// --- Remote critical banner (ADR 0117, bipe#386) ------------------------------

const bannerFixture = JSON.parse(readFileSync(join(root, "fixtures/remote-banner.json"), "utf8"));
write("remote-banner.json", {
  $comment: bannerFixture.$comment,
  state: bannerFixture.state.map((c) => ({ ...c, expected: remoteBannerState(c.banner, c.app_version, c.now) })),
  compare: bannerFixture.compare.map((c) => ({ ...c, expected: compareAppVersions(c.a, c.b) })),
});

// --- Cleared DMs (bipe-chat/bipe#464) ---------------------------------------

const clearedFixture = JSON.parse(readFileSync(join(root, "fixtures/cleared-chats.json"), "utf8"));
write("cleared-chats.json", {
  $comment: clearedFixture.$comment,
  event_type: reg.clearedChats.eventType,
  marker: clearedFixture.marker.map((c) => ({ ...c, expected: clearedChatMarker(c.content, c.room_id) })),
  hidden: clearedFixture.hidden.map((c) => ({ ...c, expected: clearedChatHidden(c.marker, c.latest_ts) })),
  keeps: clearedFixture.keeps.map((c) => ({ ...c, expected: clearedChatKeepsEvent(c.marker, c.event_ts) })),
  clear: clearedFixture.clear.map((c) => ({ ...c, expected: clearedChatsWithClear(c.content, c.room_id, c.ts) })),
});

// --- Pix request marks (ADR 0046, bipe-chat/bipe#130) -------------------------

const pixMarksFixture = JSON.parse(readFileSync(join(root, "fixtures/pix-marks.json"), "utf8"));
write("pix-marks.json", {
  $comment: pixMarksFixture.$comment,
  event_type: reg.pixMarks.eventType,
  lines: pixMarksFixture.lines.map((c) => ({ ...c, expected: pixMarkLines(c.card, c.events, reg.pixMarks) })),
  txid: pixMarksFixture.txid.map((c) => ({ ...c, expected: pixTxid(c.request_id, reg.pixMarks) })),
});

// --- One DM per person (ADR 0141) ------------------------------------------
const dmFixture = JSON.parse(readFileSync(join(root, "fixtures/dm-selection.json"), "utf8"));
for (const item of dmFixture.cases) {
  if (JSON.stringify(newestDmRooms(item.candidates)) !== JSON.stringify(item.expected)) throw new Error(`dm-selection: fixture differs for ${item.name}`);
  if (item.includingCleared && JSON.stringify(newestDmRooms(item.candidates, { includingCleared: true })) !== JSON.stringify(item.includingCleared)) throw new Error(`dm-selection: cleared fallback differs for ${item.name}`);
}
write("dm-selection.json", dmFixture);

const relationshipVectors = JSON.parse(readFileSync(join(root, "fixtures/relationship-names.json"), "utf8"));
for (const vector of relationshipVectors.vectors) {
  if (relationshipNameWarning(vector.savedName, vector.verifiedName, vector.nicknameConfirmed, reg) !== vector.expected) throw new Error(`relationship-names: fixture differs for ${vector.name}`);
}
write("relationship-names.json", relationshipVectors);

const archiveVectors = JSON.parse(readFileSync(join(root, "fixtures/chat-archive.json"), "utf8"));
write("chat-archive.json", archiveVectors);

// --- Photo match (ADR 0049) ---------------------------------------------
// Fixed 9 x 8 grayscale grids from a seeded generator. Platforms hash the grid and compare the pair; decoding and
// scaling are platform code and are not in the vectors.
function photoGrid(seed) {
  let x = seed >>> 0;
  const next = () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x >>> 24; };
  return Array.from({ length: reg.photoMatch.height }, () => Array.from({ length: reg.photoMatch.width }, next));
}
const flipped = (grid, cells) => grid.map((row, y) => row.map((v, x) => (cells.some(([cy, cx]) => cy === y && cx === x) ? 255 - v : v)));
const gradient = Array.from({ length: 8 }, (_, y) => Array.from({ length: 9 }, (_, x) => x * 28 + y));
const photoBase = photoGrid(7);
const photoPairs = [
  ["same grid", photoBase, photoBase],
  ["two cells changed", photoBase, flipped(photoBase, [[0, 0], [7, 8]])],
  ["three cells changed", photoBase, flipped(photoBase, [[1, 1], [2, 4], [5, 6]])],
  ["four cells changed", photoBase, flipped(photoBase, [[1, 1], [2, 4], [5, 6], [6, 2]])],
  ["unrelated grids", photoGrid(7), photoGrid(99)],
  ["gradient and its mirror", gradient, gradient.map((row) => [...row].reverse())],
];
write("photo-match.json", {
  $comment: "Generated by tools/gen-test-vectors.mjs from registries/photo-match.json. hashA/hashB: photoHash of gridA/gridB; distance: photoDistance; matches: photoMatches.",
  maxDistance: reg.photoMatch.maxDistance,
  cases: photoPairs.map(([name, gridA, gridB]) => {
    const hashA = photoHash(gridA, reg);
    const hashB = photoHash(gridB, reg);
    return { name, gridA, gridB, hashA, hashB, distance: photoDistance(hashA, hashB), matches: photoMatches(hashA, hashB, reg) };
  }),
});
