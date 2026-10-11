// Loads and validates registries. Reference normalisation lives here: every
// platform implementation must match it via test-vectors/.
import { readFileSync } from "node:fs";
import { join } from "node:path";

export function loadRegistries(root) {
  const read = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));
  const reg = {
    reserved: read("registries/reserved-names.json"),
    family: read("registries/family-terms.json"),
    scam: read("registries/scam-patterns.json"),
    homoglyphs: read("registries/homoglyphs.json"),
    strings: read("strings/pt-BR.json"),
  };
  validate(reg);
  return reg;
}

function fail(msg) {
  throw new Error(`registry validation failed: ${msg}`);
}

function validate(reg) {
  for (const [name, r] of Object.entries(reg)) {
    if (r.version !== 1) fail(`${name}: version must be 1`);
  }
  for (const [cat, names] of Object.entries(reg.reserved.categories)) {
    if (!/^[a-z]+$/.test(cat)) fail(`reserved category id "${cat}"`);
    // Entries must already be in normalised form so lookups are exact.
    for (const n of names) if (normalize(n, reg.homoglyphs.map) !== n) fail(`reserved name "${n}" is not normalised`);
  }
  for (const t of reg.family.terms) if (normalize(t, reg.homoglyphs.map) !== t) fail(`family term "${t}" is not normalised`);
  for (const group of ["pixKeyPatterns", "pixCopyPastePatterns", "boletoPatterns"]) {
    for (const p of reg.scam[group]) {
      if (!/^[a-z-]+$/.test(p.id)) fail(`${group} id "${p.id}"`);
      try { new RegExp(p.regex); } catch (e) { fail(`${group}.${p.id} regex: ${e.message}`); }
    }
  }
  for (const k of Object.keys(reg.homoglyphs.map)) if ([...k].length !== 1) fail(`homoglyph key "${k}" must be one character`);
  for (const key of Object.keys(reg.strings.strings)) if (!/^proseio_[a-z0-9_]+$/.test(key)) fail(`string key "${key}"`);
}

// NFKD, strip combining marks, lowercase, fold homoglyphs, collapse whitespace.
export function normalize(input, homoglyphMap) {
  const stripped = input.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
  const folded = [...stripped].map((c) => homoglyphMap[c] ?? c).join("");
  return folded.replace(/\s+/g, " ").trim();
}
