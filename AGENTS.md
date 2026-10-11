# proseio-shared: agent notes

Source of truth for registries, strings, API contract and test vectors shared by proseio-ios, proseio-android and the web console.

- Edit `registries/` and `strings/`, then run `node tools/gen.mjs` and `node tools/gen-test-vectors.mjs`. Never hand-edit generated Swift or Kotlin.
- Registry entries must already be normalised (`tools/lib/registries.mjs` validates and fails closed).
- Regexes must stay portable: ICU (Swift), java.util.regex (Kotlin), V8 (Node 24). Fixed-length lookbehind only; `(?i:...)` modifiers are fine.
- `tools/lib/registries.mjs` `normalize()` is the reference implementation. Platform code must match `test-vectors/normalization.json`.
- No npm dependencies. Node built-ins only.
- Write docs in ASD-STE100 style. UI strings are draft until they pass the humanizer.

## Decisions

Product and architecture decisions for all Proseio repos are ADRs in the umbrella repo: `../proseio/docs/adr/` (index: `README.md`). Check them before changing a decided behaviour. A new decision gets an ADR there, not a note in this repo.
