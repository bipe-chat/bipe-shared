// Writes test-vectors/*.json. Every platform implementation must pass them.
// Badge vectors use a TEST-ONLY Ed25519 key derived from a fixed seed.
import { createPrivateKey, createPublicKey, sign } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { extractInviteCode, handleProblem, normalizeCnpj, normalizePhone, handleSkeleton, loadRegistries, normalize, scamMatchIDs, scamWarningKind } from "./lib/registries.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const reg = loadRegistries(root);
// --out <dir> writes elsewhere (tools/check-drift.mjs compares the result with test-vectors/).
const outIndex = process.argv.indexOf("--out");
const out = outIndex >= 0 ? process.argv[outIndex + 1] : join(root, "test-vectors");
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
];
write("scam-warnings.json", {
  $comment: "warningKind: the first kind in registries/scam-patterns.json warningKindPriority whose rule applies to the scam-detection matches, or null. pixKey needs a pixKeyContextWords entry in normalize(message) without homoglyph folding. newNumber needs a matched urgency phrase from newNumberPhrases, or a newAccountPhrases entry in normalize(message) without homoglyph folding together with a family term as a whole word or a matched urgency phrase. Link hosts: every linkPatterns match on normalize(message) folded with the host homoglyphs (registries/homoglyphs.json without ASCII keys outside [0-9a-z]); the plain host is the same UTF-16 range of normalize(message) without folding. deliveryFee needs a link host and an entry from each of deliveryParcelWords, deliveryHoldWords and deliveryFeeWords in normalize(message) without homoglyph folding. lookalikeLink needs a folded host that, without dots and hyphens, contains a lookalikeBrandTokens entry, with a plain host that is not an officialDomains entry or a subdomain of one. bankAlert needs a link host and an entry from each of bankAlertSubjectWords and bankAlertThreatWords. Expected kinds are generated by the reference implementation.",
  vectors: warningMessages.map((message) => ({ message, kind: scamWarningKind(message, reg) })),
});

console.log(`wrote test vectors to ${out}`);

// --- Handles --------------------------------------------------------------

const handleInputs = [
  "ana.souza", "ana_souza", "anasouza", "a1b", "ab", "a".repeat(30), "a".repeat(31),
  "Ana", "ana..souza", ".ana", "ana.", "ana_", "_ana", "ana-souza", "ana souza", "anã",
  "itau", "1tau", "it.au", "b4nco.inter", "proseio", "pr0seio", "suporte.proseio",
];
write("handles.json", {
  description: "Handle validation and skeletons. problem is null when valid. Equal skeletons collide.",
  cases: handleInputs.map((input) => ({ input, problem: handleProblem(input, reg), skeleton: handleSkeleton(input, reg) })),
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
