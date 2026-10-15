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
- `product/version.json` is the app version name and the one build number for iOS and Android (ADR 0088). Change it only with `node tools/bump-build.mjs`, once before each tester upload.
- `product/product.json` (promise, tentpoles, features with status per platform) and `product/distribution.json` (download links) feed bipe-web and `bipe/docs/product.md`. After a change, run `node tools/gen-product-doc.mjs`; it validates and fails closed. Status per platform: `testing` only when it is in a tester build; `built` when the code is merged on that platform but not in a tester build; else `planned` (or `policy`). Set `built` in the same change that merges the feature (ADR 0031).
- Every feature page shows an in-app mockup (a scene or a sim). A planned feature gets one too, labelled as a simulation with the planned status. Every feature in `product/product.json` has `figures` (scene or sim ids from `../bipe-web/src/sim/scenes.ts`); `node tools/gen-product-doc.mjs` fails with "figures required (a mockup of the app)" otherwise. Add the scene in bipe-web before the feature.
- `product/parity.json` is the parity ledger (ADR 0092): status per capability on iOS, Android, web and server, with evidence paths. A change that merges a capability on one surface sets its status there, with evidence, in the same change. A gap between the apps names its issue. A behaviour difference between the apps goes in `differences`, then `node tools/parity.mjs --write` regenerates both `BIPE.md` tables. `node tools/parity.mjs` must pass.
- `product/data.json` is the LGPD record of processing (ADR 0090) and feeds `/lgpd/` on bipe-web. A new table, log or third-party service that holds personal data gets an item in the same change. List only what runs today. `node tools/gen-product-doc.mjs` validates it.
- `product/privacy.json` is who can read what (ADR 0109) and feeds `/quem-pode-ler/` on bipe-web. When a fact about message data changes (a new party such as Google push, calls confirmed encrypted), change it with `data.json` in the same change. Thing names start in lower case.

## Decisions

Product and architecture decisions for all Bipe repos are ADRs in the umbrella repo: `../bipe/docs/adr/` (index: `README.md`). Check them before changing a decided behaviour. A new decision gets an ADR there, not a note in this repo.
