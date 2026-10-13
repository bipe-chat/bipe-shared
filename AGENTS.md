# bipe-shared: agent notes

Source of truth for registries, strings, API contract and test vectors shared by bipe-ios, bipe-android and the web console.

- Edit `registries/` and `strings/`, then run `node tools/gen.mjs` and `node tools/gen-test-vectors.mjs`. Never hand-edit generated Swift or Kotlin.
- Registry entries must already be normalised (`tools/lib/registries.mjs` validates and fails closed).
- Regexes must stay portable: ICU (Swift), java.util.regex (Kotlin), V8 (Node 24). Fixed-length lookbehind only; `(?i:...)` modifiers are fine.
- `tools/lib/registries.mjs` `normalize()` is the reference implementation. Platform code must match `test-vectors/normalization.json`.
- Generate, never copy (ADR 0031): a rule more than one surface uses lives in `registries/` and reaches Swift, Kotlin and the API through `tools/gen.mjs`.
- After a contract change, run `node tools/check-contract.mjs`. After a registry or vector change, run `swift test` in `../bipe-ios/Components/BipeKit`.
- A string, registry or product change is done only when `node tools/check-drift.mjs` passes: regenerate, then commit the generated files in every sibling repo. The pre-commit hook runs it (`git config core.hooksPath .githooks`).
- No npm dependencies. Node built-ins only.
- Write docs in ASD-STE100 style. pt-BR strings follow `../bipe/docs/design/linguagem.md` (ADR 0039). UI strings are draft until they pass the humanizer.
- `product/version.json` is the app version name and the one build number for iOS and Android (ADR 0076). Change it only with `node tools/bump-build.mjs`, once before each tester upload.
- `product/product.json` (promise, tentpoles, features with status per platform) and `product/distribution.json` (download links) feed bipe-web and `bipe/docs/product.md`. After a change, run `node tools/gen-product-doc.mjs`; it validates and fails closed. Status per platform: `testing` only when it is in a tester build; `built` when the code is merged on that platform but not in a tester build; else `planned` (or `policy`). Set `built` in the same change that merges the feature (ADR 0031).

## Decisions

Product and architecture decisions for all Bipe repos are ADRs in the umbrella repo: `../bipe/docs/adr/` (index: `README.md`). Check them before changing a decided behaviour. A new decision gets an ADR there, not a note in this repo.
