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
${scamSection(reg)}${identitySection(reg)}
/// \`personAssurance\` of registries/schemes.json (ADR 0275): the person assurances, strongest first, and the seal
/// mark of each. personProofs reads it; test-vectors/person-proofs.json checks it.
/// HOME_COUNTRY of tools/lib/registries.mjs: personProofs puts the proofs of this country first (ADR 0272 decision 7).
pub const HOME_COUNTRY: &str = ${rustString(HOME_COUNTRY)};
pub const PERSON_ASSURANCE: &[(&str, &str)] = &[${reg.schemes.personAssurance.map((a) => `(${rustString(a.id)}, ${rustString(a.mark)})`).join(", ")}];
`;
}
