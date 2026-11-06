# Attestation verifier conformance proposal

Date: 6 November 2026. Status: proposed specification for review. This file changes no runtime, generated output or signed format.

This proposal defines the evidence needed to compare generated/native verifiers with a possible Rust implementation. It does not select Rust. The existing [badge format](badge-attestation.md) and [signed-list format](signed-lists.md) remain the authorities for verification order and wire behavior. [ADR 0267](https://github.com/bipe-chat/bipe/blob/docs/shared-rust-core-evaluation/docs/adr/0267-retain-generators-gate-rust-attestation-core.md) proposes retaining the current architecture and gating any Rust experiment.

## Verification contexts

Every consumer must name its context. Proposed internal result names below are not API or wire schemas.

| Context | Required inputs | What success establishes |
| --- | --- | --- |
| Bound sender badge | Exact envelope bytes, trusted issuer snapshot, current Unix time, authenticated expected Matrix sender ID and its current SDK master key | The specified issuer attests to the named sender and the badge binds to that sender's current cryptographic identity. |
| Public issuer statement | Exact envelope bytes, trusted keys or issuer snapshot, current Unix time and the public page's allowed subject policy | The issuer signed the displayed statement. This cannot establish binding to an authenticated conversation sender or its master key. |
| Issuer or operator list | Exact envelope bytes, expected list type, allowed signer set and threshold, current Unix time, stored accepted version and payload bytes | The specified list passed the shared signature, type, expiry and rollback rules. Persistence must complete before a later operation relies on the new stored version. |

Return distinct results such as `BoundSenderBadge` and `VerifiedIssuerStatement`. Do not use one boolean for both. A public statement cannot be converted to a bound badge without the missing authenticated inputs. These names describe a proposed internal interface, not an instruction to change current UI claims in this documentation change.

Current contexts, verified on 6 November 2026:

- Native `BadgeVerifier` checks signatures, payload shape, time, subject and master key with static Bipe keys.
- `bipe-web/src/badge.ts` verifies company statements for public pages. It deliberately has no Matrix client or exact expected sender/master-key input.
- `bipe-app/web` consumes shared scam and trust reference rules. Its vector suite does not consume badge, issuer or signed-list verification vectors.
- The native suites consume `badges.json`. No native or browser messenger consumer of `badge-issuers.json` or `signed-lists.json` was found.

## Policy and interface requirements

Any proposed implementation must:

1. Verify the original decoded payload bytes. Never sign or verify a JSON serialization reconstructed from parsed fields.
2. Follow the existing format's failure order. Specify any new parser error mapping in the shared format before changing consumers.
3. Bind a sender badge to authenticated SDK identity inputs. Missing identity context yields no bound badge. Caller-supplied `valid` or display/profile fields are not proof.
4. Apply issuer selection, status, envelope/payload issuer agreement, level permissions and lifetime rules from the badge specification when issuer support is built.
5. Keep list signer keys, issuer keys and badge keys distinct. Count distinct valid signer keys for thresholds. Use standard Ed25519 verification, with no new cryptographic construction.
6. Accept time explicitly in Unix seconds. Define representable ranges before conversion across Swift, Kotlin and JavaScript. Use checked arithmetic and preserve exact boundary outcomes.
7. Take trusted issuer/list snapshots as explicit inputs. Fetching, cache expiry, revocation responses and authenticated SDK lifecycle remain adapter responsibilities.
8. Reject an invalid or unavailable result without producing a seal. An alternate implementation is not an acceptance fallback after disagreement or a binding failure.
9. Keep `bipe-shared` authoritative. A future Rust target consumes generated shared policy and the same independently checked vectors as the other targets.

## Parser choices requiring review

The current formats do not settle every adversarial parser case. Resolve these choices in the relevant format and independent fixtures before an implementation experiment. Do not copy a parser library's defaults into the specification implicitly.

| Choice | Proposed direction | Evidence required before adoption |
| --- | --- | --- |
| Duplicate JSON fields | Reject ambiguity in envelope and payload | Cases with duplicated version, issuer, key ID, subject, master key and timestamps; define error and order. |
| Input limits | Bounded envelope/payload bytes, nesting and collection sizes | Exact limits, maximum valid specimens and one-over-limit cases. Preserve current valid production envelopes. |
| UTF-8 and JSON types | Strict UTF-8 and specified types | Invalid sequences, nulls, booleans, numeric strings, fractional and out-of-range times. |
| Base64url | Preserve the wire alphabet and padding policy | Invalid lengths, mixed alphabets, padding and unused-bit encodings. Resolve whether to reject noncanonical encodings. |
| Signature/key encodings | A documented acceptance set across providers | Compare malformed and noncanonical values in CryptoKit, Tink, Web Crypto and any proposed maintained Rust primitive. |
| Unknown fields and versions | Preserve documented forward compatibility without accepting unknown policy | Independent cases for unknown version, level, issuer and optional fields. |
| Public subject policy | Keep its weaker context explicit | Cases that cannot pass full sender binding even though an issuer signature is valid. Any broader homeserver policy belongs to existing federation work. |

These directions are proposed. They do not amend the accepted verification order or authorize a behavior change until reviewed.

## Vector and consumer plan

| Dataset | Existing cases at inspection | Required comparison |
| --- | ---: | --- |
| `badges.json` | 67 | Swift and Kotlin bound verification; browser messenger when it gains this feature. Public website applies only its explicit company-statement context. |
| `badge-issuers.json` | 14 | Issuer-aware consumers under [bipe#637](https://github.com/bipe-chat/bipe/issues/637); do not claim a complete issuer implementation from static-key badge tests. |
| `signed-lists.json` | 33 | Shared list verifier plus actual native/browser persistence adapters under [bipe#645](https://github.com/bipe-chat/bipe/issues/645). |
| New adversarial fixtures | Proposed | Independently authored inputs and outcomes for the choices above. Include at least one case for each specified failure and boundary. |
| SDK and network lifecycle cases | Proposed | Identity reset, unknown master key, issuer removal, revoked badge, failed fetch, stale cache and persisted-version rollback. |

Expected decisions must be hand-authored or checked by an independent oracle. The implementation being evaluated must not generate its own expected outcomes. Cryptographic signatures in synthetic fixtures may use the existing deterministic test keys through maintained libraries. Release registries must continue to reject test-only keys.

Add an explicit coverage manifest when this work is authorized. Each dataset/context names its consumer and command, or a dated exclusion with its tracking issue. CI should detect a dataset that silently loses its intended consumer. Counted files or generated code alone do not establish a feature is integrated.

Hash-chain history proposed in the latest #645 discussion is outside the current v1 list payload. Reconcile that proposal and its expected outcomes before testing a new chain rule; do not assume it is already implemented.

## Conditional experiment boundaries

The smallest Rust experiment would implement only the existing single-issuer badge format after this baseline is reviewed. It would expose owned bytes, bounded strings, records, enums and errors. It would own no network, filesystem, signing secret, Matrix session or system clock.

Native wrappers preserve existing interfaces. A separate small WASM wrapper calls the same evaluator. The Node API signer stays unchanged. Compare this with generated payload validators using current crypto providers before deciding which has lower maintenance cost.

Acceptance requires all applicable vectors, independent adversarial cases, packaged Swift/Kotlin/WASM boundary tests, supported-browser tests and real SDK lifecycle evidence. The evaluation's size, latency, release-ownership and rollback gates also apply. No new runtime or test code is introduced by this proposed specification.

## Review and ownership

The architecture decision and parser choices require review before any experiment. Existing issues #637 and #645 retain ownership of issuer/list implementation. [Conformance review #1168](https://github.com/bipe-chat/bipe/issues/1168) and [architecture decision #1169](https://github.com/bipe-chat/bipe/issues/1169) are separate tracker items. Both have `needs-decision`. Keep the work out of the ready implementation queue until the explicit decision is recorded.

The [technical evaluation](https://github.com/bipe-chat/bipe/blob/docs/shared-rust-core-evaluation/docs/shared-rust-core-evaluation.md) contains source snapshots, the full decision matrix, cost estimates and rollback criteria. This document adds a shared conformance review contract; it does not move authoritative policy into another repository.

## Sources

- [Badge attestation format](badge-attestation.md), [signed-list format](signed-lists.md) and [trust adapter contract](trust-facts.md), read 6 November 2026.
- [Shared vectors](../test-vectors/) and [vector generator](../tools/gen-test-vectors.mjs), read 6 November 2026.
- [Swift verifier](https://github.com/bipe-chat/bipe-app/blob/d52a198d4f1cf7dc62cd6f3bea590a894ce52551/ios/BipeKit/Sources/BipeKit/BadgeVerifier.swift), [Kotlin verifier](https://github.com/bipe-chat/bipe-app/blob/d52a198d4f1cf7dc62cd6f3bea590a894ce52551/android/libraries/bipe/src/main/kotlin/chat/bipe/shared/BadgeVerifier.kt) and [website verifier](https://github.com/bipe-chat/bipe-web/blob/9866440c7ec254c53c57a728569a1b082bea78af/src/badge.ts), inspected 6 November 2026.
- [Issuer issue #637](https://github.com/bipe-chat/bipe/issues/637), [list issue #645](https://github.com/bipe-chat/bipe/issues/645) and its latest history-chain proposal, read with `gh` on 6 November 2026.
