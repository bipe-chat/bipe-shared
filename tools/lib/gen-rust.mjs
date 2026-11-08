// Registry data for bipe-core, the shared Rust core of bipe-app (bipe ADR 0267, bipe-chat/bipe#1277).
// gen.mjs writes it to bipe-app core/crates/bipe-core/src/generated/registries.rs.
export const RUST_REGISTRIES_PATH = "core/crates/bipe-core/src/generated/registries.rs";

// A Rust string literal. JSON escapes are valid Rust escapes, except \u{...}, which JSON does not emit for ASCII.
const rustString = (s) => JSON.stringify(s).replace(/\\u([0-9a-fA-F]{4})/g, "\\u{$1}");

export function generateRustRegistries(reg, header) {
  const labels = reg.brandMarks.labels;
  return `${header}
//! Registry data that bipe-core reads. Never edit: change bipe-shared/registries and run tools/gen.mjs.

/// \`labels\` of registries/brand-marks.json (bipe ADR 0162). A brand-mark badge with another label is \`malformed\`.
pub const BRAND_MARK_LABELS: [&str; ${labels.length}] = [${labels.map(rustString).join(", ")}];
`;
}
