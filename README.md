# proseio-shared

Single source of truth for Proseio logic that iOS, Android, the API and the website share. Plain JSON and contracts; zero dependencies. Each surface generates code from here and must pass the same test vectors ([ADR 0031](https://github.com/bipe-chat/proseio/blob/main/docs/adr/0031-platform-lockstep.md): generate, never copy).

| Path | Content |
|---|---|
| `registries/` | Reserved names, family terms, scam patterns, homoglyphs, handle rules, invite-code rule |
| `strings/pt-BR.json`, `strings/en.json` | Proseio-owned UI strings (Element strings stay on Localazy). Draft copy. |
| `api/openapi.yaml` | Proseio API contract (sign-up, invites, handles, verification, badges) |
| `docs/badge-attestation.md` | Signed badge format and verification order |
| `test-vectors/` | Cases every platform must pass: badges, normalisation, scam detection, scam warnings, handles (generated), invite codes (hand-written, checked against the reference) |
| `product/` | Promise, features with status per platform, download links. Feeds proseio-web and `proseio/docs/product.md` |
| `tools/` | Generators and checks (Node 24, no npm packages). `tools/lib/registries.mjs` is the reference implementation |

## Commands

```bash
node tools/gen.mjs
```

Writes `ProseioRegistries.swift` and `ProseioStrings.swift` into `../proseio-ios/Components/ProseioKit/Sources/ProseioKit/Generated`, `ProseioRegistries.kt` plus `res/values*/proseio_strings.xml` into `../proseio-android/libraries/proseio/src/main`, and the registries with the reference library into `../proseio-api/src/generated`. Pass `--swift`, `--kotlin` or `--api <dir>` to override.

```bash
node tools/gen-test-vectors.mjs
```

Regenerates `test-vectors/` from the registries and the reference implementation in `tools/lib/registries.mjs`, and checks the hand-written invite-code cases against it. Fails closed.

```bash
node tools/check-contract.mjs
```

Checks the hand-written API clients (Swift in proseio-ios, Kotlin in proseio-android) against `api/openapi.yaml`: every field of every schema the apps use, and the error, invite-status and handle-problem enums. A new schema must be mapped in the script or listed as not used by the apps. Known gaps are listed with their issue. Fails closed.

```bash
node tools/check-drift.mjs
```

Regenerates everything into a temporary folder and compares it with the generated files in proseio-ios, proseio-android, proseio-api and `proseio/docs/product.md`, and with `test-vectors/`. Default: the files on disk. `--against head`: the committed files (CI). Fails on any difference, and on stale files in generated-only folders.

### Hook and CI

- Pre-commit hook (`.githooks/pre-commit`): runs the contract check and the drift check. Enable it once per clone: `git config core.hooksPath .githooks`.
- CI (`.github/workflows/checks.yml`): the same checks against every repo's `main`, on push, pull request and daily. It needs the repository secret `PROSEIO_REPOS_TOKEN` (read access to the private sibling repos).

## Where the vectors run

| Surface | Command | Suite |
|---|---|---|
| Reference (Node) | `node tools/gen-test-vectors.mjs` | Writes the generated vectors; checks invite codes |
| iOS | `swift test` in `proseio-ios/Components/ProseioKit` | `Tests/ProseioKitTests/SharedVectorTests.swift` |
| Android | `./gradlew :libraries:proseio:testDebugUnitTest` in `proseio-android` | `libraries/proseio/src/test/.../SharedVectorTest.kt` (not run yet: no JDK on the dev Mac) |

Both app suites read the JSON files here directly. `PROSEIO_SHARED=<path>` points them at another checkout.

## Rules

- Change a registry here, never in generated platform code.
- Every registry or string change: run both generators, commit the generated code in `proseio-ios`, `proseio-android` and `proseio-api`, and the vectors here. Run both app suites. The drift check fails until every repo has the new output.
- Every contract change: run `node tools/check-contract.mjs`, then update the Swift and Kotlin clients until it passes.
- A rule that more than one surface uses lives here and is generated. Never copy a pattern or list into a platform by hand.
- `test-vectors/badges.json` uses a TEST-ONLY key. Never trust `kid` `test-only-*` in a release build.
- Registries are starter lists. Review before launch (reserved names, phrases, confusables table).

Design tokens (colours, trust states) are not here. They live in the `proseio-tokens` fork of Compound, which generates Swift, Kotlin and web. See `proseio/docs/design/system.md`.

## Licence and contributing

AGPL-3.0-only, see [LICENSE](LICENSE). Contributions need a DCO sign-off (`git commit -s`): see the [Proseio contributing guide](https://github.com/bipe-chat/.github/blob/main/CONTRIBUTING.md). The Proseio name and logo are not covered by the licence: see [TRADEMARKS.md](https://github.com/bipe-chat/.github/blob/main/TRADEMARKS.md).
