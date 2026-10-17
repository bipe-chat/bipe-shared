# Separate trust facts

Decision: bipe/docs/adr/0074-pilot-outcomes-and-separate-trust-facts.md. Implementation: bipe#226. Rendering belongs to #227 and #229; identity issuance and lifecycle sources remain #31 and #33.

The evaluator returns identity proof, personal confirmation, a change fact and the already-selected message warning separately. It returns no score or safe classification. Its rules live in registries/trust-facts.json. The generator compiles those expressions into Swift and Kotlin. The reference uses the same registry.

## Trusted inputs

The flat input is an adapter contract for the apps and reference library. It is not a public API or a signed attestation format. Do not fill it from display names, Matrix profile fields or claims supplied by the sender.

| Input | Source and meaning |
|---|---|
| accountId, deviceKey | The actual sender and sending-device key for the event |
| lifecycleKnown | True only after the adapter has complete authenticated lifecycle information. Missing or false keeps identity and personal confirmation unverified |
| deviceChangedAt, identityChangedAt | Latest relevant change watermarks, in Unix seconds. Null means the complete source reports no such change. Preserve watermarks after showing a notice |
| badgeStatus | Result of the existing badge verifier, including revocation checks. Only valid can verify identity; these rules do not verify a signature |
| badgeAccountId, badgeDeviceKey, badgeName, badgeIssuedAt | Fields from the successfully decoded verified payload; issue time in Unix seconds |
| badgeDeviceKey for a `cnpj` badge | A company badge binds to the account master key, not a device (docs/badge-attestation.md). The verifier already checked `msk` against the sender's master key, so the adapter passes the sending device key. A master key change still suspends it: the verifier answers `master_key_mismatch` |
| confirmationMethod | in_person for a completed in-person check; old_device_approval for an authenticated approval by the old device; invite_pair never confirms the person |
| confirmationAccountId, confirmationDeviceKey, confirmedAt | The account/device and time bound to that local confirmation or approved handover |
| priorInPersonConfirmedAt | For old-device approval, the prior in-person confirmation of the same account/relationship. The adapter must establish that provenance; an arbitrary timestamp is not proof |
| warningKind | The local detector's result after the selected sender policy. These rules preserve it and never re-gate it using identity or contact status |

Times must be finite and nonnegative. A proof must be strictly after each applicable change. Equal timestamps do not establish order and leave the proof suspended or the contact unconfirmed until fresh evidence exists. Adapters must use the same clock unit; milliseconds must be converted to Unix seconds.

The source adapter must reject revoked or expired attestations and unauthorized handovers before these facts can be asserted. The pure evaluator cannot authenticate a caller-supplied valid status or confirmation method. An unavailable backend is unknown, not verified.

## Outputs

| Fact | Values | Meaning |
|---|---|---|
| identity | verified, suspended, unverified | Current identity proof is bound to the sender/device and is fresh after known changes. Stale or wrong-device proof is suspended. Invalid proof gives no verified name |
| verifiedName | Name or null | Present only with current verified identity |
| contact | confirmed, unconfirmed | An in-person confirmation is current, or an approved old device carries forward an existing relationship |
| change | unknown, none, device, identity, device_and_identity | Lifecycle information and change facts, independent of fresh proof |
| warningKind | Selected kind or null | A warning can coexist with verified identity and a confirmed contact. Null carries no safety assertion |

An identity badge cannot create personal confirmation. A personally confirmed person need not have a global badge. An invite can skip the message-request queue under ADR 0034 while all trust protections still apply.

A device change requires a fresh in-person check or authenticated approval carrying the existing in-person relationship. A verified-identity change also requires a new in-person identity check. An old-device approval cannot carry a confirmation from before that identity change. New identity proof alone does not recreate the personal relationship.

## Generation and checks

Run both generators, `node tools/check-contract.mjs`, `node tools/check-drift.mjs` and `node --test tools/trust-facts.test.mjs`. The 38 hand-authored cases cover independent facts, invalid proofs, unknown lifecycle data, changed devices/identities, approved handover and equal-time ambiguity. The generator compares the reference result to each authored expectation before writing test-vectors/trust-facts.json.

Swift and Kotlin consume that same file through their existing vector runners. The generated BipeTrustInput and BipeTrustFacts types are ready for the UI tasks. This does not implement the source adapters or promote a feature to tester status.

## Copy review

Existing labels distinguish the verified name and a contact confirmed in person. New explanation strings state the limits of identity proof and an absent warning, with one action for an unknown contact or a changed account. The pt-BR uses verificar for the seal, confirmar for the personal check, conferir for an app check and aparelho for a device. The English follows that meaning.

The humanizer review removed promotional certainty, unnecessary jargon and decorative punctuation. New strings contain no emoji or em/en dashes. Their comprehension remains a research task in #147/#148.

## Sources

- bipe/docs/security.md rules 2 to 4 and 9: signed proof, relationships, changes and warnings.
- bipe/docs/adr/0018-relationship-mismatch-warning.md and 0034-invite-pairs-trusted.md: mismatches and the limited invite-pair privilege.
- bipe/docs/adr/0074-pilot-outcomes-and-separate-trust-facts.md: approved separation and limits.
- docs/badge-attestation.md: existing signature result and device binding.
- bipe/docs/design/linguagem.md: pt-BR vocabulary and grammar.
