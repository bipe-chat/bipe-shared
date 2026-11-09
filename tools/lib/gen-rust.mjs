// Registry data for bipe-core, the shared Rust core of bipe-app (bipe ADR 0267, bipe-chat/bipe#1277).
// gen.mjs writes it to bipe-app core/crates/bipe-core/src/generated/registries.rs.
export const RUST_REGISTRIES_PATH = "core/crates/bipe-core/src/generated/registries.rs";

// A Rust string literal. JSON escapes are valid Rust escapes, except \u{...}, which JSON does not emit for ASCII.
const rustString = (s) => JSON.stringify(s).replace(/\\u([0-9a-fA-F]{4})/g, "\\u{$1}");

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
`;
}
