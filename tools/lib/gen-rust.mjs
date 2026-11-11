// Registry data for bipe-core, the shared Rust core of bipe-app (bipe ADR 0267, bipe-chat/bipe#1277).
// gen.mjs writes it to bipe-app core/crates/bipe-core/src/generated/registries.rs.
import { rustRegex } from "./rust-regex.mjs";
import { HOME_COUNTRY, hostHomoglyphs } from "./registries.mjs";

export const RUST_REGISTRIES_PATH = "core/crates/bipe-core/src/generated/registries.rs";

// A Rust string literal. JSON escapes are valid Rust escapes, except \u{...}, which JSON does not emit for ASCII.
const rustString = (s) => JSON.stringify(s).replace(/\\u([0-9a-fA-F]{4})/g, "\\u{$1}");
const rustStrings = (list) => `&[${list.map(rustString).join(", ")}]`;
// A homoglyph map as (character, folded) pairs sorted by code point, for a binary search.
const rustFolds = (map) => `&[${Object.entries(map).sort(([a], [b]) => a.codePointAt(0) - b.codePointAt(0))
  .map(([k, v]) => `('\\u{${k.codePointAt(0).toString(16)}}', ${rustString(v)})`).join(", ")}]`;

// Same order as SCAM_PATTERN_GROUPS in registries.mjs: the order of scamMatchIDs.
const SCAM_PATTERN_GROUPS = ["pixKeyPatterns", "pixCopyPastePatterns", "boletoPatterns", "linkPatterns"];
const SCAM_LISTS = ["urgencyPhrases", "receiptKeywords", "pixKeyContextWords", "newNumberPhrases", "newAccountPhrases",
  "deliveryParcelWords", "deliveryHoldWords", "deliveryFeeWords", "lookalikeBrandTokens", "lookalikeHostLabels",
  "officialDomains", "appStoreDomains", "bankAlertSubjectWords", "bankAlertThreatWords", "extortionThreatPhrases",
  "extortionDemandWords", "remoteAppInstallWords", "remoteAppNames", "remoteAppBankWords", "pinRequestAskPhrases",
  "pinRequestSecretWords", "pinRequestSupportWords", "warningKindPriority"];
const constName = (camel) => camel.replace(/([A-Z])/g, "_$1").toUpperCase();

// A registry regex in the Rust syntax (tools/lib/rust-regex.mjs). Group 1 is the JavaScript match.
function rustPattern(name, source) {
  try { return rustRegex(source).regex; } catch (e) { throw new Error(`gen-rust: ${name}: ${e.message}`); }
}

function smallRulesSection(reg) {
  const o = reg.onboarding;
  const st = reg.stickers;
  const a = reg.accounts;
  const pairs = (map) => `&[${Object.entries(map).map(([k, list]) => `(${rustString(k)}, ${rustStrings(list)})`).join(", ")}]`;
  return `
/// registries/onboarding.json (bipe-chat/bipe#202, bipe-chat/bipe#752, bipe-chat/bipe#894).
pub const PIN_REMINDER_DAYS: &[u32] = &[${o.pinReminder.days.join(", ")}];
pub const PIN_REMINDER_THEN_EVERY_DAYS: u32 = ${o.pinReminder.thenEveryDays};
pub const BRING_PEOPLE_STOP_AFTER_DECLINES: u32 = ${o.bringPeople.stopAfterDeclines};
pub const BRING_PEOPLE_FOLLOW_UP_EVERY_DAYS: i64 = ${o.bringPeople.followUpEveryDays};
pub const BRING_PEOPLE_PENDING_AFTER_DAYS: i64 = ${o.bringPeople.pendingAfterDays};
/// (key, tier) in queue order.
pub const CHAT_LIST_PROMPTS: &[(&str, &str)] = &[${o.chatListPrompt.entries.map((e) => `(${rustString(e.key)}, ${rustString(e.tier)})`).join(", ")}];
pub const PROMPT_SLOT_HOURS: i64 = ${o.promptSlot.hours};

/// registries/stickers.json search (ADR 0205). Maps keep registry order.
pub const STICKER_PREFIX_MIN_LENGTH: usize = ${st.prefixMinLength};
pub const STICKER_TAGS: &[&str] = ${rustStrings(st.tags)};
pub const STICKER_WORDS: &[(&str, &[&str])] = ${pairs(st.words)};
pub const STICKER_EMOJI: &[(&str, &[&str])] = ${pairs(st.emoji)};

/// registries/accounts.json PIN check (ADR 0057).
pub const PIN_LENGTH: usize = ${a.pinLength};
pub const PIN_DATE_YEAR_MIN: u32 = ${a.pinDateYearMin};
pub const PIN_DATE_YEAR_MAX: u32 = ${a.pinDateYearMax};
`;
}

function messageSection(reg) {
  const vm = reg.voiceMedia;
  const ps = reg.mcpTools.personalSend;
  const rm = reg.mcpTools.readerMarker;
  const d = reg.drafts;
  const w = reg.workNotes;
  return `
/// registries/voice-media.json forward marks (bipe-chat/bipe#83, bipe-chat/bipe#933).
pub const FORWARD_KEY: &str = ${rustString(vm.forwardKey)};
pub const FORWARDED_MANY_TIMES: u32 = ${vm.forwardedManyTimes};
pub const FORWARD_CHATS: u32 = ${vm.forwardChats};
pub const FORWARD_CHATS_MANY_TIMES: u32 = ${vm.forwardChatsManyTimes};
/// registries/group-power-levels.json publicationOnly.feedPostKey: a forward drops it (bipe-chat/bipe#1260).
pub const FEED_POST_KEY: &str = ${rustString(reg.groupPowerLevels.publicationOnly.feedPostKey)};

/// registries/mcp-tools.json personalSend and readerMarker (ADR 0130, ADR 0210).
pub const ASSISTANT_MARKER_FIELD: &str = ${rustString(ps.markerField)};
pub const ASSISTANT_CLIENT_MAX_LENGTH: usize = ${ps.clientMaxLength};
pub const ASSISTANT_READER_EVENT_TYPE: &str = ${rustString(rm.eventType)};
pub const ASSISTANT_READER_FIELD: &str = ${rustString(rm.field)};

/// registries/drafts.json (ADR 0210).
pub const DRAFT_FIELD: &str = ${rustString(d.field)};
pub const DRAFT_BODY_MAX_LENGTH: usize = ${d.bodyMaxLength};
pub const DRAFT_CLIENT_MAX_LENGTH: usize = ${d.clientMaxLength};

/// registries/work-notes.json (ADR 0284).
pub const WORK_NOTE_FIELD: &str = ${rustString(w.noteField)};
pub const WORK_REPLY_BY_FIELD: &str = ${rustString(w.replyByField)};
pub const WORK_NOTE_BODY_MAX_LENGTH: usize = ${w.bodyMaxLength};
`;
}

function deviceSection(reg) {
  const d = reg.deviceKinds;
  const opt = (v) => (v === undefined ? "None" : `Some(${rustString(v)})`);
  const pattern = (where, src) => rustString(rustPattern(`device-kinds ${where}`, src));
  return `
/// registries/device-kinds.json (ADR 0291, bipe-chat/bipe#1479). Patterns are in the Rust syntax (rust-regex.mjs): a
/// capture group n of the registry pattern is group n + 1 here, and $n in a template names registry group n.
pub const DEVICE_INFO_FIELD: &str = ${rustString(d.field)};
pub const DEVICE_INFO_MSGTYPE: &str = ${rustString(d.msgtype)};
pub const DEVICE_FIELD_MAX_LENGTH: usize = ${d.fieldMaxLength};
pub const DEVICE_UNKNOWN_WARNING: bool = ${d.unknownWarning};
/// (key, icon, label, section, leaves Brazil) in registry order.
pub const DEVICE_KINDS: &[(&str, &str, &str, &str, bool)] = &[${d.kinds.map((k) => `(${rustString(k.key)}, ${rustString(k.icon)}, ${rustString(k.label)}, ${rustString(k.section)}, ${k.leavesBrazil})`).join(", ")}];
/// (pattern, kind, app, model, os) in registry order.
pub const DEVICE_USER_AGENTS: &[(&str, &str, Option<&str>, Option<&str>, Option<&str>)] = &[${d.userAgents.map((r, i) => `(${pattern(`userAgents[${i}]`, r.pattern)}, ${rustString(r.kind)}, ${opt(r.app)}, ${opt(r.model)}, ${opt(r.os)})`).join(", ")}];
/// (pattern, name template) in registry order.
pub const DEVICE_BROWSERS: &[(&str, &str)] = &[${d.browsers.map((r, i) => `(${pattern(`browsers[${i}]`, r.pattern)}, ${rustString(r.name)})`).join(", ")}];
pub const DEVICE_SYSTEMS: &[(&str, &str)] = &[${d.systems.map((r, i) => `(${pattern(`systems[${i}]`, r.pattern)}, ${rustString(r.name)})`).join(", ")}];
`;
}

function factsSection(reg) {
  const pf = reg.profileFacts;
  return `
/// registries/profile-facts.json (ADR 0049).
pub const PROFILE_FACTS_WINDOW_DAYS: i64 = ${pf.windowDays};
pub const PROFILE_FACTS_NEW_ACCOUNT_DAYS: i64 = ${pf.newAccountDays};
pub const PROFILE_FACTS_NOTICE_PAIR_HOURS: i64 = ${pf.noticePairHours};
pub const PROFILE_FACTS_NOTICE_DAYS: i64 = ${pf.noticeDays};
`;
}

function identitySection(reg) {
  const h = reg.handles;
  const ph = reg.phones;
  const p = reg.profiles;
  const reserved = Object.entries(reg.reserved.categories).flatMap(([category, names]) => names.map((n) => [n, category]))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `
/// registries/handles.json (docs/usernames.md). The core checks \`HANDLE_PATTERN\` by hand: it has a look-ahead inside
/// its body. A core test fails when the pattern changes.
pub const HANDLE_MIN_LENGTH: usize = ${h.minLength};
pub const HANDLE_OWNER_MIN_LENGTH: usize = ${h.ownerMinLength};
pub const HANDLE_MAX_LENGTH: usize = ${h.maxLength};
pub const HANDLE_PATTERN: &str = ${rustString(h.pattern)};
pub const HANDLE_SKELETON_STRIP: &str = ${rustString(rustPattern("handles.skeletonStrip", h.skeletonStrip))};
pub const HANDLE_SUGGESTION_CANDIDATES: usize = ${h.suggestions.candidates};

/// registries/reserved-name-owners.json \`handles\`: (handle, owner Matrix user ID), sorted by handle.
pub const OWNED_HANDLES: &[(&str, &str)] = &[${Object.entries(reg.owners.handles).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `(${rustString(k)}, ${rustString(v)})`).join(", ")}];

/// registries/reserved-names.json: (normalised name, category), sorted by name.
pub const RESERVED_NAMES: &[(&str, &str)] = &[${reserved.map(([n, c]) => `(${rustString(n)}, ${rustString(c)})`).join(", ")}];

/// registries/invite-codes.json. Groups 2 to 4 are the three blocks.
pub const INVITE_CODE_PATTERN: &str = ${rustString(rustPattern("inviteCodes.pattern", reg.inviteCodes.pattern))};
pub const INVITE_CODE_MAX_INPUT_LENGTH: usize = ${reg.inviteCodes.maxInputLength};

/// registries/phone-numbers.json.
pub const PHONE_COUNTRY_CODE: &str = ${rustString(ph.countryCode)};
pub const PHONE_AREA_CODES: &[&str] = ${rustStrings(ph.areaCodes)};
pub const PHONE_MOBILE_LENGTH: usize = ${ph.mobileLength};
pub const PHONE_MOBILE_PREFIX: &str = ${rustString(ph.mobilePrefix)};
pub const PHONE_MAX_INPUT_LENGTH: usize = ${ph.maxInputLength};
pub const PHONE_INTERNATIONAL_MIN_DIGITS: usize = ${ph.internationalMinDigits};
pub const PHONE_INTERNATIONAL_MAX_DIGITS: usize = ${ph.internationalMaxDigits};
/// (countryCode, prefix, pattern) in registry order: the first that fits wins.
pub const PHONE_DISPLAY: &[(&str, &str, &str)] = &[${ph.display.map((d) => `(${rustString(d.countryCode)}, ${rustString(d.prefix)}, ${rustString(d.pattern)})`).join(", ")}];

/// registries/profiles.json (ADR 0041, ADR 0228).
pub const PROFILE_NAME_MAX_LENGTH: usize = ${p.nameMaxLength};
pub const PROFILE_BIO_MAX_LENGTH: usize = ${p.bioMaxLength};
pub const PROFILE_BIO_MAX_LINES: usize = ${p.bioMaxLines};
pub const SEAL_LOOKALIKE_EMOJI: &[&str] = ${rustStrings(p.sealLookalikeEmoji)};
/// (id, pattern in the Rust syntax, url with {handle}).
pub const SOCIAL_PLATFORMS: &[(&str, &str, &str)] = &[${p.socials.map((x) => `(${rustString(x.id)}, ${rustString(rustPattern(`socials.${x.id}`, x.pattern))}, ${rustString(x.url)})`).join(", ")}];

/// registries/relationship-names.json (ADR 0018).
pub const RELATIONSHIP_FULL_NAME_MIN_WORDS: usize = ${reg.relationshipNames.fullNameMinimumWords};
`;
}

function scamSection(reg) {
  const s = reg.scam;
  const patterns = SCAM_PATTERN_GROUPS.flatMap((group) => s[group].map((p) => {
    let rust;
    try { rust = rustRegex(p.regex); } catch (e) { throw new Error(`gen-rust: ${group}.${p.id}: ${e.message}`); }
    return `    ScamPattern { group: ${rustString(group)}, id: ${rustString(p.id)}, regex: ${rustString(rust.regex)}, guard_before: ${rust.guardBefore} },`;
  }));
  return `
/// A registries/scam-patterns.json regex, translated by bipe-shared tools/lib/rust-regex.mjs (docs/scam-matching.md).
/// Capture group 1 is the JavaScript match. With \`guard_before\`, the pattern consumes the character before it.
pub struct ScamPattern {
    pub group: &'static str,
    pub id: &'static str,
    pub regex: &'static str,
    pub guard_before: bool,
}

/// Every pattern group in scamMatchIDs order.
pub const SCAM_PATTERNS: &[ScamPattern] = &[
${patterns.join("\n")}
];

${SCAM_LISTS.map((list) => `pub const SCAM_${constName(list)}: &[&str] = ${rustStrings(s[list])};`).join("\n")}

/// registries/family-terms.json \`terms\`.
pub const FAMILY_TERMS: &[&str] = ${rustStrings(reg.family.terms)};

/// registries/homoglyphs.json, sorted by character. normalize() folds with it.
pub const HOMOGLYPHS: &[(char, &str)] = ${rustFolds(reg.homoglyphs.map)};

/// HOMOGLYPHS without the ASCII keys outside [0-9a-z] (hostHomoglyphs in registries.mjs). linkHosts folds with it.
pub const HOST_HOMOGLYPHS: &[(char, &str)] = ${rustFolds(hostHomoglyphs(reg))};
`;
}

const snake = (camel) => camel.replace(/([A-Z])/g, "_$1").toLowerCase();

// registries/trust-facts.json (ADR 0074) compiled to Rust, as gen-trust.mjs does for Swift and Kotlin before
// bipe-chat/bipe#1478. The registry is validated by tools/lib/trust.mjs; reference evaluateTrustFacts.
function trustSection(registry) {
  const fields = Object.entries(registry.inputFields);
  const rustType = { string: "Option<String>", boolean: "Option<bool>", time: "Option<f64>" };
  const fieldType = Object.fromEntries(fields);
  // Returns [code, kind]: kind is "bool" (a Rust bool), "field" (an Option of the field's type), "str", "boolLit" or "null".
  const expr = (node) => {
    if (node === null) return ["None", "null"];
    if (typeof node === "string") return [rustString(node), "str"];
    if (typeof node === "boolean") return [String(node), "boolLit"];
    const [op, value] = Object.entries(node)[0];
    if (op === "field") return [`input.${snake(value)}`, "field"];
    if (op === "rule") return [snake(value), "bool"];
    const cond = (n) => { const [c, k] = expr(n); if (k !== "bool") throw new Error(`gen-rust trust: ${op} needs a condition`); return c; };
    if (op === "all" || op === "any") return [`(${value.map(cond).join(op === "all" ? " && " : " || ")})`, "bool"];
    if (op === "not") return [`!(${cond(value)})`, "bool"];
    if (op === "nonempty") return [`nonempty(&${expr(value)[0]})`, "bool"];
    if (op === "validTime") return [`valid_time(${expr(value)[0]})`, "bool"];
    if (op === "nullableTime") return [`nullable_time(${expr(value)[0]})`, "bool"];
    if (op === "afterChange") return [`after_change(${expr(value[0])[0]}, ${expr(value[1])[0]})`, "bool"];
    if (op === "atOrBefore") return [`at_or_before(${expr(value[0])[0]}, ${expr(value[1])[0]})`, "bool"];
    if (op === "eq" || op === "neq") {
      let [a, b] = value.map(expr);
      if (a[1] !== "field") [a, b] = [b, a];
      if (a[1] !== "field") throw new Error("gen-rust trust: a comparison needs a field");
      const test = b[1] === "field" ? `${a[0]} == ${b[0]}`
        : b[1] === "null" ? `${a[0]}.is_none()`
        : b[1] === "str" ? `${a[0]}.as_deref() == Some(${b[0]})`
        : `${a[0]} == Some(${b[0]})`;
      return [op === "eq" ? `(${test})` : `!(${test})`, "bool"];
    }
    throw new Error(`gen-rust trust: unknown operator ${op}`);
  };
  const nullable = (name) => ["verifiedName", "warningKind"].includes(name);
  const outValue = (name, node) => {
    const [code, kind] = expr(node);
    if (kind === "null") return "None";
    if (kind === "str") return nullable(name) ? `Some(${code}.to_owned())` : `${code}.to_owned()`;
    if (kind === "field" && fieldType[node.field] === "string") return nullable(name) ? `${code}.clone()` : `${code}.clone().unwrap_or_default()`;
    throw new Error(`gen-rust trust: output ${name} must be a string`);
  };
  const outputs = Object.entries(registry.outputs).map(([name, output]) => {
    const branches = output.choose.map((b, i) => `${i ? " else " : ""}if ${expr(b.when)[0]} {\n            ${outValue(name, b.value)}\n        }`).join("");
    return `    let ${snake(name)} = ${branches} else {\n            ${outValue(name, output.else)}\n        };`;
  }).join("\n");
  return `
/// registries/trust-facts.json (ADR 0074): the inputs of trust_facts. Times are Unix seconds.
#[derive(Clone, Debug, Default, PartialEq, uniffi::Record)]
pub struct TrustInput {
${fields.map(([name, type]) => `    pub ${snake(name)}: ${rustType[type]},`).join("\n")}
}

/// The trust facts of one contact. Facts only; no trust score (ADR 0074).
#[derive(Clone, Debug, PartialEq, Eq, uniffi::Record)]
pub struct TrustFacts {
${Object.keys(registry.outputs).map((name) => `    pub ${snake(name)}: ${nullable(name) ? "Option<String>" : "String"},`).join("\n")}
}

/// The rules of registries/trust-facts.json, compiled. Reference: evaluateTrustFacts in tools/lib/trust.mjs.
#[allow(unused_parens, clippy::nonminimal_bool)]
pub(crate) fn trust_rules(input: &TrustInput) -> TrustFacts {
    fn nonempty(value: &Option<String>) -> bool { value.as_deref().is_some_and(|v| !v.is_empty()) }
    fn valid_time(value: Option<f64>) -> bool { value.is_some_and(|v| v.is_finite() && v >= 0.0) }
    fn nullable_time(value: Option<f64>) -> bool { value.is_none() || valid_time(value) }
    fn after_change(proof: Option<f64>, change: Option<f64>) -> bool {
        valid_time(proof) && (change.is_none() || (valid_time(change) && proof > change))
    }
    fn at_or_before(first: Option<f64>, second: Option<f64>) -> bool { valid_time(first) && valid_time(second) && first <= second }
${Object.entries(registry.rules).map(([name, e]) => `    let ${snake(name)} = ${expr(e)[0]};`).join("\n")}
${outputs}
    TrustFacts { ${Object.keys(registry.outputs).map(snake).join(", ")} }
}
`;
}

// registries/home-score.json (ADR 0246). The formula is in home_score.rs; reference tools/lib/home-score.mjs.
function homeScoreSection(h) {
  const f = (n) => { const s = String(n); return /[.e]/.test(s) ? s : `${s}.0`; };
  return `
/// registries/home-score.json (ADR 0246): weights and limits of home_score.rs.
pub const HOME_WEIGHT_MENTION: f64 = ${f(h.weights.mention)};
pub const HOME_WEIGHT_UNREAD_DIRECT: f64 = ${f(h.weights.unreadDirect)};
pub const HOME_WEIGHT_UNREAD_COMPANY_NO_SEAL: f64 = ${f(h.weights.unreadCompanyNoSeal)};
pub const HOME_WEIGHT_UNANSWERED_DIRECT: f64 = ${f(h.weights.unansweredDirect)};
pub const HOME_WEIGHT_FAVOURITE: f64 = ${f(h.weights.favourite)};
pub const HOME_UNREAD_GROUP_MIN: f64 = ${f(h.unreadGroup.min)};
pub const HOME_UNREAD_GROUP_MAX: f64 = ${f(h.unreadGroup.max)};
pub const HOME_UNREAD_GROUP_LOG_SCALE: f64 = ${f(h.unreadGroup.logScale)};
pub const HOME_TIE_MAX: f64 = ${f(h.tie.max)};
pub const HOME_TIE_LOG_SCALE: f64 = ${f(h.tie.logScale)};
pub const HOME_RECENCY_MAX: f64 = ${f(h.recency.max)};
pub const HOME_RECENCY_DECAY_MINUTES: f64 = ${f(h.recency.decayMinutes)};
pub const HOME_UNANSWERED_MAX_MINUTES: i64 = ${h.unansweredMaxMinutes};
pub const HOME_MUTED_FACTOR: f64 = ${f(h.mutedFactor)};
pub const HOME_OFFICIAL_CAP: f64 = ${f(h.officialCap)};
/// (tier, minScore, maxChats) in registry order.
pub const HOME_TIERS: &[(u32, f64, Option<u32>)] = &[${h.tiers.map((t) => `(${t.tier}, ${f(t.minScore)}, ${t.maxChats === null ? "None" : `Some(${t.maxChats})`})`).join(", ")}];
pub const HOME_MODEL_ATTENTION: &[(&str, f64)] = &[${Object.entries(h.model.attention).map(([k, v]) => `(${rustString(k)}, ${f(v)})`).join(", ")}];
pub const HOME_MODEL_DUE: f64 = ${f(h.model.due)};
pub const HOME_MODEL_MAX_WEIGHT: f64 = ${f(h.model.maxWeight)};
`;
}

export function generateRustRegistries(reg, header) {
  const labels = reg.brandMarks.labels;
  const marks = reg.pixMarks;
  return `${header}
//! Registry data that bipe-core reads. Never edit: change bipe-shared/registries and run tools/gen.mjs.

/// \`labels\` of registries/brand-marks.json (bipe ADR 0162). A brand-mark badge with another label is \`malformed\`.
pub const BRAND_MARK_LABELS: [&str; ${labels.length}] = [${labels.map(rustString).join(", ")}];

/// registries/pix-marks.json (bipe ADR 0046, bipe-chat/bipe#130). Rules: pix_marks.rs, test-vectors/pix-marks.json.
pub const PIX_MARK_EVENT_TYPE: &str = ${rustString(marks.eventType)};
pub const PIX_MARK_REL_TYPE: &str = ${rustString(marks.relType)};
pub const PIX_MARKS: [&str; ${marks.marks.length}] = [${marks.marks.map(rustString).join(", ")}];
/// The core checks this format by hand (no regex crate); a test there fails when the pattern changes.
pub const PIX_E2E_ID_PATTERN: &str = ${rustString(marks.e2eIdPattern)};
pub const PIX_TXID_MAX_LENGTH: usize = ${marks.txidMaxLength};
${scamSection(reg)}${identitySection(reg)}${factsSection(reg)}${messageSection(reg)}${deviceSection(reg)}${smallRulesSection(reg)}${trustSection(reg.trust)}${homeScoreSection(reg.homeScore)}
/// \`personAssurance\` of registries/schemes.json (ADR 0275): the person assurances, strongest first, and the seal
/// mark of each. personProofs reads it; test-vectors/person-proofs.json checks it.
/// HOME_COUNTRY of tools/lib/registries.mjs: personProofs puts the proofs of this country first (ADR 0272 decision 7).
pub const HOME_COUNTRY: &str = ${rustString(HOME_COUNTRY)};
pub const PERSON_ASSURANCE: &[(&str, &str)] = &[${reg.schemes.personAssurance.map((a) => `(${rustString(a.id)}, ${rustString(a.mark)})`).join(", ")}];
`;
}
