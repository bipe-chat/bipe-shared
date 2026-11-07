# Badge attestation format (v1)

A verified badge is a statement signed by an attestation issuer: the Bipe verification service (issuer `bipe`) or another accredited issuer (ADR 0170, see "Issuer"). Apps verify the signature locally against public keys that ship in the app. Apps never read a badge from a Matrix profile field, display name or room state (security rule 2).

## Envelope

```json
{
  "v": 1,
  "kid": "prod-2026-10",
  "payload": "<base64url, no padding: UTF-8 JSON payload bytes>",
  "sig": "<base64url, no padding: Ed25519 signature over the decoded payload bytes>"
}
```

- The signature covers the **exact payload bytes**. Verifiers do not re-serialise JSON, so no canonicalisation is needed across platforms.
- `kid` selects the public key. Unknown `kid` means invalid.
- `iss`, optional: the issuer ID (see "Issuer"). Absent means `bipe`. Together with `kid` it selects the key, before the signature check. The payload repeats it under the signature.
- Algorithm: Ed25519 (Swift CryptoKit `Curve25519.Signing`, Android Ed25519 via the platform provider or Tink).
- The same envelope and badge key carry the **moved statement** of the account move (`typ: "moved"`). Its format and the move statement are in `docs/move-statements.md`.

## Payload

Fields for every level:

| Field | Type | Meaning |
|---|---|---|
| `sub` | string | Matrix user ID, e.g. `@ana:bipe.net.br` |
| `lvl` | `"pix"` \| `"govbr"` \| `"institution"` \| `"cnpj"` \| `"brand-mark"` \| `"person"` \| `"org"` | Verification level |
| `name` | string | Verified name. For `cnpj`: the trade name when the registry has one, else the legal name. For `brand-mark`: the brand's name, as `name` of the brand's own `cnpj` badge |
| `iat` | integer | Issued at, Unix seconds |
| `exp` | integer | Expires at, Unix seconds |
| `iss` | string, optional | Issuer ID. Absent means `bipe`. Must equal the envelope `iss` (both absent is equal) |

Binding. Every badge binds to the account (ADR 0239):

| Field | Levels | Meaning |
|---|---|---|
| `msk` | every level | The account's cross-signing master key (Matrix unpadded base64), as the homeserver has it when the server signs. The master key signs every device of the account, so the badge shows on any of its devices. A company or institution account has several devices (ADR 0087, bipe#270). The Matrix SDK gives no sending device per event (bipe-chat/bipe#245, bipe-chat/bipe#596), so a device-bound badge cannot show on a message |

A badge with `dev` and no `msk` is `malformed` on every level. The verifier ignores `dev` when `msk` is present. `dev` was the device binding of `pix` and `govbr` before ADR 0239; no such badge was issued.

Company fields (`lvl: "cnpj"`, a verified company, ADR 0042):

| Field | Type | Meaning |
|---|---|---|
| `cnpj` | string | The normalised CNPJ of `test-vectors/cnpj.json`: 14 characters, digits and uppercase letters, no separators. Also on `institution` |
| `legal_name` | string | Razão social from the Receita Federal registry. Not empty |
| `trade_name` | string, optional | Nome fantasia, when the registry has one |
| `method` | `"ecnpj"` \| `"partner"` \| `"staff"` | How the company proved control |
| `checked_month` | string | The Receita Federal release that last showed the CNPJ as active, `YYYY-MM` |
| `cvm` | object, optional | The CVM register line (ADR 0077, bipe-chat/bipe#237). Absent: no CVM line (no registration and no financial CNAE, or the server's CVM table is older than 7 days) |

`cvm` has `st` and the fields of that state:

| `st` | Fields | Line in the seal detail (`test-vectors/cvm-lines.json`, reference `tools/lib/cvm.mjs`) |
|---|---|---|
| `"registered"` | `cat`: 1 to 10 category names from CVM's data, lower case | One `bipe_cvm_registered` line per category |
| `"cancelled"` | `on`: `YYYY-MM-DD`, the newest cancel date | `bipe_cvm_cancelled` |
| `"stop_order"` | `on`: `YYYY-MM-DD`, the newest stop order (ato declaratório) for the CNPJ | `bipe_cvm_stop_order`, red; it overrides the other lines, and chats from the account show `bipe_cvm_stop_order_card` |
| `"no_registration"` | none | `bipe_cvm_no_registration` and `bipe_cvm_bank_note`, neutral. Only for a CNPJ whose main or secondary CNAE is in division 64, 65 or 66 |

The detail shows `bipe_cvm_source` under a CVM line. A `cvm` value that is not well formed, or an unknown `st`, shows no CVM line and does not change the badge verdict. The field is signed with the rest of the payload, so the apps never call CVM or bipe-api for it.

Institution fields (`lvl: "institution"`, a verified institution: a level 5 public body or the Instituição tier, ADR 0083; bipe-chat/bipe#245):

| Field | Type | Meaning |
|---|---|---|
| `cnpj` | string | The normalised CNPJ, as for `cnpj` |
| `domains` | list of strings, optional | The institution's verified domains (ADR 0036): lower-case host names with at least one dot, no scheme, no port. Absent or empty: no link in its notices is clickable |

Messages from an account with a valid `institution` badge show as official notice cards (`product/screens/chat-timeline.json`, `notice`). A link in a notice is clickable only when `test-vectors/notice-links.json` says so (reference `tools/lib/notice.mjs`): `https`, no user info, no port, and the host is a domain of `domains` or a subdomain of one. Every other link shows as plain text. Who may write first (institutions.md decision 10.1) is a server rule, not an app rule. No issuer signs `institution` badges yet.

Brand mark fields (`lvl: "brand-mark"`, ADR 0162, bipe-chat/bipe#483). A verified brand vouches for a reseller's work account. `sub` is the reseller; `msk` is the reseller account's master key. One envelope per mark:

| Field | Type | Meaning |
|---|---|---|
| `mark` | string | The mark ID (UUID). The apps use it to notice a mark that went away (ADR 0162 point 5) |
| `brand` | string | The brand's Matrix user ID. The apps check the brand's own `cnpj` badge before they show its seal in the detail |
| `cnpj` | string | The brand's normalised CNPJ, as in `cnpj` badges |
| `label` | string | One id of `labels` in `registries/brand-marks.json`. The line is the string `bipe_brand_mark_label_<label>` with `name` as its argument. An id the app does not know is `malformed` |

A brand mark never carries `legal_name`, `method` or `cvm`: those belong to the brand's own seal, and no seal moves to the reseller (ADR 0108 point 3).

Scheme fields (`lvl: "person"` and `lvl: "org"`, ADR 0272). A scheme is one proof rail or registry in one country (`registries/schemes.json`). These two levels work in every country. A Brazilian badge keeps its older level: `pix`, `govbr` and `cnpj` are aliases of `br.pix`, `br.govbr` and `br.cnpj`, and no signed badge changes.

| Field | Levels | Type | Meaning |
|---|---|---|---|
| `country` | both | string, `^[A-Z]{2}$` | ISO 3166-1 alpha-2 country of the scheme |
| `scheme` | both | string, `^[a-z]{2}\.[a-z0-9-]{1,30}$` | The scheme ID |
| `assurance` | both | string | The assurance of the scheme: `bank` or `state` for a person, `registry+control` for a company |
| `org_id` | `org` | string, 1 to 128 characters | The company's number in its registry. Verifiers treat it as opaque. Only the issuer checks its format |
| `legal_name` | `org`, optional | string, not empty | The registered legal name |
| `ext` | both, optional | object | National facts, with keys in the form `<country>.<fact>`, for example `br.cvm`. A verifier shows only a fact that it knows. A missing or badly formed value changes nothing in the verdict. A national fact is never a portable claim |

```json
{ "sub": "@bakkerij:bipe.exemplo.nl", "lvl": "org", "country": "NL", "scheme": "nl.kvk", "assurance": "registry+control",
  "org_id": "12345678", "name": "Bakkerij Exemplo", "legal_name": "Bakkerij Exemplo B.V.", "msk": "…", "iss": "bipe-nl-exemplo", "iat": 0, "exp": 0 }
```

A `person` badge carries no national number. The dedupe key of a scheme stays with its issuer and never crosses a border (ADR 0272).

Feature gates read the class, not the level name: `person` or `org`, with its assurance and country (`badgeClass` in `tools/lib/registries.mjs`, cases `classes` in `test-vectors/badge-issuers.json`). `institution` and `brand-mark` have no class. A gate tied to Brazilian law stays on the Brazilian scheme. A verifier from before ADR 0272 shows no seal for these levels: an unknown `kid` for a foreign issuer, `malformed` for issuer `bipe` (cases `verifierWithoutSchemes`). So `v` stays 1.

Life: `exp - iat` is `lifeDays` in `registries/badge-keys.json` (7 days). A revoked claim or a leaked key stops working within that time without a revocation list (ADR 0123).

## Issuer

ADR 0170 lets several accredited issuers sign badges (bipe-chat/bipe#637). The issuer registry (`docs/signed-lists.md`) lists each issuer with its ID, name, keys and the levels it may sign.

- The **trusted issuers** of a device are the `valid` entries of its current issuer registry. Before the device has a valid registry, the trusted issuers are only `bipe`, with the keys of `registries/badge-keys.json` and every level. After that, the registry alone counts.
- Backward compatibility: a badge without `iss` is a badge from `bipe`, exactly as before. Every badge signed before this change stays valid. An app that does not know `iss` looks up `kid` in `badge-keys.json` only, so it rejects a badge from another issuer as `unknown_kid` (fail closed). bipe-api does not write `iss` for issuer `bipe` until every supported app version knows the field. The bipe-app verifiers ignore unknown envelope and payload fields (read 7 November 2026; `test-vectors/badges.json` case "unknown fields are ignored").
- Region: an issuer belongs to one region, and it seals only accounts of that region (ADR 0197 decision 8). A device of any region trusts the issuers of every region, so a Brazilian app shows a Dutch seal on a Dutch account, with the issuer and country named (ADR 0272). It never implies that the seal equals a Brazilian one.
- Before the device has a valid registry, issuer `bipe` has region `br`, and the schemes and servers come from `registries/schemes.json` and `registries/regions.json`.
- The app shows the issuer `name` from the registry in the profile and in the seal sheet (#637 step 4, per platform).
- Life: for an issuer other than `bipe`, `exp - iat` must not be more than `lifeDays` days. Without this, an issuer could sign a badge that no revocation reaches.
- Test vectors: `test-vectors/badge-issuers.json`. All badges in `test-vectors/badges.json` have no `iss`. No bipe-app consumer reads `badge-issuers.json` yet (7 November 2026); bipe-chat/bipe#637 adds it.

## Verification order

Inputs: the envelope, the sender's user ID, the sender's cross-signing master key from the Matrix SDK (or none when the app does not know it), and the trusted issuers, with the schemes and regions of the same registry.

1. `v` equals 1, else `unsupported_version`.
2. The issuer (envelope `iss`, absent means `bipe`) is a trusted issuer, else `unknown_issuer`.
3. `kid` is a key of that issuer, else `unknown_kid`.
4. Ed25519 signature over the decoded payload bytes is valid, else `invalid_signature`.
5. Payload parses and all required fields for its `lvl` are present and well formed, else `malformed`. An unknown `lvl` is `malformed`. Every level needs a non-empty `msk`. `iat` and `exp` are in the time range of "Parser rules". For `cnpj`: `cnpj` matches `^[0-9A-Z]{12}[0-9]{2}$`, `legal_name` and `msk` are not empty, `method` is one of the three values, `checked_month` matches `^[0-9]{4}-(0[1-9]|1[0-2])$`. For `institution`: `cnpj` matches the same pattern, `msk` is not empty, and `domains`, when present, is a list of strings that each match `^[a-z0-9-]+(\.[a-z0-9-]+)+$`. For `brand-mark`: `mark`, `brand`, `name` and `msk` are not empty, `cnpj` matches the `cnpj` pattern, and `label` is in `registries/brand-marks.json`. For `person` and `org`: `name`, `msk` and `assurance` are not empty, `country` and `scheme` match their patterns. For `org`: `org_id` has 1 to 128 characters, and `legal_name`, when present, is not empty.
6. Payload `iss` (absent means `bipe`) equals the envelope issuer, else `issuer_mismatch`.
7. `lvl` is in the issuer's `levels`, else `level_not_allowed`. Issuer `bipe` before a registry exists: every level.
8. For `person` and `org`: `scheme` is in the registry's schemes, else `unknown_scheme`. `scheme` is in the issuer's `schemes`, else `scheme_not_allowed`. `lvl`, `country` and `assurance` equal the `class`, `country` and `assurance` of the scheme, else `scheme_mismatch`.
9. For an issuer other than `bipe`: `exp - iat <= lifeDays * 86400`, else `life_too_long`.
10. `iat <= now < exp`, else `expired` (or `not_yet_valid`).
11. `sub` equals the sender's user ID, else `subject_mismatch`.
12. The region that holds the server of `sub` equals the issuer's `region`, else `region_mismatch`. A server in no region is also `region_mismatch`.
13. Binding: `msk` equals the sender's master key, else `master_key_mismatch`. No known master key is also `master_key_mismatch`. A mismatch means the account reset its cryptographic identity: the badge is suspended until the server signs a new one (security rule 4).

Fail closed: any other error means no badge.

The apps read the sender's master key from the Matrix SDK user identity (`UserIdentity.masterKey()` in matrix-rust-sdk). Showing the seal (bipe#252) and what to do on a pinning violation are not part of this format.

## Verification contexts

A consumer states which of these two results it produces. The two results are not interchangeable.

| Context | Inputs | What success proves | Consumer |
|---|---|---|---|
| Bound sender badge | The inputs of "Verification order" | The issuer attests to this sender, and the badge binds to the sender's current cross-signing master key | bipe-app iOS, macOS and Android |
| Public issuer statement | The envelope, trusted keys, the time and the page's subject rule | The issuer signed the displayed statement. It proves no binding to a conversation sender or a master key | bipe-web `src/badge.ts` |

A public issuer statement never becomes a bound sender badge. The missing inputs must come from an authenticated Matrix session.

## Parser rules

- **Time range:** `iat` and `exp` are integers from 0 to 253402300799 (31 December 9999, UTC), else `malformed`. All these values fit a JavaScript number, a double and a 64-bit count of milliseconds. Verifiers check the range before any arithmetic on the value.
- **Integer form:** signers write plain integers, with no fraction and no exponent. Verifiers can differ on `1.0` or `1e3`, and no vector covers these forms.
- **UTF-8:** payload bytes that are not valid UTF-8 are `malformed`.
- **base64url:** the URL alphabet with no padding. Any other character is `malformed`. Unused trailing bits have no rule: two strings that decode to the same bytes are the same statement.
- **Signature length:** a signature that is not 64 bytes is `invalid_signature`.
- **Signature encodings:** no rule across crypto providers. A second valid signature over the same bytes proves the same statement.
- **Unknown fields:** verifiers ignore them in the envelope and the payload. An unknown `v` or `lvl` follows the verification order.
- **Duplicate JSON keys:** signers must not write them. Verifiers do not detect them, and platforms can read them differently (`JSON.parse` keeps the last value and cannot report a duplicate). The signature check comes before the payload parse, so only the holder of a trusted key can make such a payload. The response to that is removal of the key or the issuer.
- **Size limits:** v1 has no verifier limit, because apps get envelopes only from the core API. bipe-chat/bipe#637 sets a limit if an issuer's own endpoint delivers attestations.

Decided 7 November 2026 as defaults (bipe-chat/bipe#1168). MZ can overrule.

## Serving

`GET /v1/badges/{userId}` (`api/openapi.yaml`): 200 with the envelope, 404 when there is no badge, 410 with `reason` when the claim was revoked. `GET /v1/profiles/{handle}` carries the same envelope in `badge`. bipe-api signs on read and caches the envelope until `renewDaysBeforeExpiry` before `exp`. It reads the master key from the Synapse table `e2e_cross_signing_keys` (the newest `keytype = 'master'` row by `stream_id`). No master key: 404.

Brand marks: `GET /v1/brand-marks/{userId}` answers 200 with `{marks: [envelope, ...]}`, at most `maxPerAccount` of them, oldest grant first, and an empty list when the account holds none. The server signs a mark only while it is active, the brand still has a verified claim with an active registry record, and the reseller has a master key. Revocation takes effect at once on the server; the apps keep an answer for at most `recheckMinutes` (`registries/brand-marks.json`).

## Keys

- Target: production signing keys live in an HSM or a managed KMS. They never touch a developer machine.
- Now (ADR 0123): one Ed25519 key in the Kubernetes secret `bipe-badge-key` on the Magalu cluster, made there by bipe-infra `scripts/setup-badge-key.sh`. Only the bipe-api pod mounts it. Only its public key leaves the cluster. `kid` is `prod-YYYY-MM`. The move to an HSM or KMS (before the M3 store launch) makes a new `kid`; the apps then trust both until the old badges expire.
- Apps ship the trusted `kid` to public-key list from `registries/badge-keys.json` (generated into `BipeRegistries.badgeKeys`). These are the keys of issuer `bipe`. Keys of other issuers come only from the signed issuer registry (`docs/signed-lists.md`). A release build never trusts a `test-only-*` kid; the registry validation refuses one.
- `test-vectors/badges.json` uses a **TEST-ONLY** key derived from a fixed seed. Never trust it in a release build.
