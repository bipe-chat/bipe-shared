// Sample cast (product/cast.json): the fictional people, groups and institutions of the site simulations
// and the store screenshots (bipe#454). Generates the Swift fixture the iOS screenshot mode reads.
// Photos stay in bipe-web (src/cast/photos/<photo>.jpg, made by bipe-web scripts/cast.mjs).
import { readFileSync } from "node:fs";
import { join } from "node:path";

const KINDS = new Set(["person", "group", "institution"]);
const TRUSTS = new Set(["none", "profile", "pix", "govbr", "contact", "institution", "company", "external", "suspended"]);

function fail(msg) {
  throw new Error(`cast validation failed: ${msg}`);
}

export function loadCast(root) {
  const data = JSON.parse(readFileSync(join(root, "product/cast.json"), "utf8"));
  validateCast(data);
  return data.cast;
}

export function validateCast(data) {
  if (!Array.isArray(data.cast) || !data.cast.length) fail("cast must be a non-empty list");
  const ids = new Set(data.cast.map((e) => e.id));
  if (ids.size !== data.cast.length) fail("ids must be unique");
  for (const e of data.cast) {
    if (!/^[a-z][a-z0-9]*$/.test(e.id ?? "")) fail(`id "${e.id}" must be lower-case letters and digits`);
    if (!KINDS.has(e.kind)) fail(`${e.id}: kind "${e.kind}"`);
    if (!TRUSTS.has(e.trust)) fail(`${e.id}: trust "${e.trust}"`);
    if (e.photo?.copyOf && !ids.has(e.photo.copyOf)) fail(`${e.id}: copyOf "${e.photo.copyOf}" is not a cast id`);
  }
}

/** The photo file stem: the entry's own id, the copied id, or null for initials. */
const photoStem = (e) => (e.photo ? e.photo.copyOf ?? e.id : null);

export function generateCast(cast, header, quote) {
  const opt = (v) => (v === null || v === undefined ? "nil" : quote(v));
  const entries = cast.map((e) =>
    `BipeCastEntry(id: ${quote(e.id)}, kind: .${e.kind}, name: ${opt(e.name)}, short: ${opt(e.short)}, handle: ${opt(e.handle)}, ` +
    `trust: ${quote(e.trust)}, cnpj: ${opt(e.cnpj)}, members: ${e.members ?? "nil"}, photo: ${opt(photoStem(e))})`);
  return `${header}
public enum BipeCastKind: String, Sendable {
    case person
    case group
    case institution
}

/// One fictional person, group or institution (bipe-shared/product/cast.json). Every entry is fictional.
public struct BipeCastEntry: Sendable, Equatable {
    public let id: String
    public let kind: BipeCastKind
    /// Verified or full name; for an unverified account, the name it chose.
    public let name: String?
    /// The name friends use in chats.
    public let short: String?
    /// Without the "@".
    public let handle: String?
    /// Trust state as in bipe/docs/design/trust-ui.md.
    public let trust: String
    public let cnpj: String?
    public let members: Int?
    /// Photo file stem in bipe-web/src/cast/photos (\`<photo>.jpg\`). \`nil\`: initials.
    public let photo: String?
}

/// The sample cast for the site simulations and the store screenshots (bipe#454).
public enum BipeCast {
    public static let entries: [BipeCastEntry] = ${"[\n" + entries.map((e) => `        ${e},`).join("\n") + "\n    ]"}

    private static let byID = Dictionary(uniqueKeysWithValues: entries.map { ($0.id, $0) })

    /// The entry with this id. Fails on an unknown id: the fixtures and the cast must agree.
    public static func entry(_ id: String) -> BipeCastEntry {
        guard let entry = byID[id] else { preconditionFailure("No cast entry \\(id)") }
        return entry
    }
}
`;
}
