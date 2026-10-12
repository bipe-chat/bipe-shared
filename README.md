# proseio-shared

Single source of truth for Proseio logic that iOS, Android and the web console share. Plain JSON and contracts; zero dependencies. Each platform generates code from here and must pass the same test vectors.

| Path | Content |
|---|---|
| `registries/` | Reserved names, family terms, scam patterns, homoglyphs |
| `strings/pt-BR.json` | Proseio-owned UI strings (Element strings stay on Localazy). Draft copy. |
| `api/openapi.yaml` | Proseio API contract (verification, badges) |
| `docs/badge-attestation.md` | Signed badge format and verification order |
| `test-vectors/` | Generated cases every platform must pass: badges, normalisation, scam detection, scam warnings |
| `tools/` | Generators (Node 24, no npm packages) |

## Commands

```bash
node tools/gen.mjs
```

Writes `ProseioRegistries.swift` and `ProseioStrings.swift` into `../proseio-ios/Components/ProseioKit/Sources/ProseioKit/Generated`, and `ProseioRegistries.kt` plus `res/values*/proseio_strings.xml` into `../proseio-android/libraries/proseio/src/main`. Pass `--swift <dir>` or `--kotlin <dir>` to override.

```bash
node tools/gen-test-vectors.mjs
```

Regenerates `test-vectors/` from the registries and the reference implementation in `tools/lib/registries.mjs`.

## Rules

- Change a registry here, never in generated platform code.
- Every registry change: run both generators, commit the generated Swift in `proseio-ios` and the vectors here.
- `test-vectors/badges.json` uses a TEST-ONLY key. Never trust `kid` `test-only-*` in a release build.
- Registries are starter lists. Review before launch (reserved names, phrases, confusables table).

Design tokens (colours, trust states) are not here. They live in the `proseio-tokens` fork of Compound, which generates Swift, Kotlin and web. See `proseio/docs/design/system.md`.

## Licence and contributing

AGPL-3.0-only, see [LICENSE](LICENSE). Contributions need a DCO sign-off (`git commit -s`): see the [Proseio contributing guide](https://github.com/proseio/.github/blob/main/CONTRIBUTING.md). The Proseio name and logo are not covered by the licence: see [TRADEMARKS.md](https://github.com/proseio/.github/blob/main/TRADEMARKS.md).
