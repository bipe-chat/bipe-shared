// Writes test-vectors/*.json. Every platform implementation must pass them.
// Badge vectors use a TEST-ONLY Ed25519 key derived from a fixed seed.
import { createPrivateKey, createPublicKey, sign } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildBrCode, crc16, pixCheck } from "./lib/pix.mjs";
import { cvmLines } from "./lib/cvm.mjs";
import { loadSchedulingVectors, writeSchedulingApiFixture } from "./lib/scheduling-vectors.mjs";
import { photoDistance, photoHash, photoMatches, relationshipNameWarning, newestDmRooms, clearedChatHidden, clearedChatKeepsEvent, clearedChatMarker, clearedChatsWithClear, compareAppVersions, extractInviteCode, handleProblem, pinProblem, remoteBannerState, normalizeCnpj, normalizePhone, handleSkeleton, loadRegistries, normalize, scamMatchIDs, scamWarningKind, trustFacts } from "./lib/registries.mjs";

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
