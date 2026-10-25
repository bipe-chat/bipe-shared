# Badge attestation format (v1)

A verified badge is a statement signed by the Bipe verification service. Apps verify the signature locally against public keys that ship in the app. Apps never read a badge from a Matrix profile field, display name or room state (security rule 2).

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
- Algorithm: Ed25519 (Swift CryptoKit `Curve25519.Signing`, Android Ed25519 via the platform provider or Tink).

## Payload

Fields for every level:

| Field | Type | Meaning |
|---|---|---|
| `sub` | string | Matrix user ID, e.g. `@ana:bipe.net.br` |
| `lvl` | `"pix"` \| `"govbr"` \| `"institution"` \| `"cnpj"` \| `"brand-mark"` | Verification level |
| `name` | string | Verified name. For `cnpj`: the trade name when the registry has one, else the legal name. For `brand-mark`: the brand's name, as `name` of the brand's own `cnpj` badge |
| `iat` | integer | Issued at, Unix seconds |
| `exp` | integer | Expires at, Unix seconds |

Binding. A badge binds to one device or to the account:

| Field | Levels | Meaning |
|---|---|---|
| `dev` | `pix`, `govbr`, `institution` | Fingerprint of the device key the badge is bound to (Matrix device Ed25519 key, base64) |
| `msk` | `cnpj`, `brand-mark` | The account's cross-signing master key (Matrix unpadded base64), as the homeserver has it when the server signs. A company account has several devices (ADR 0087), so the badge binds to the account, not one device (bipe#270) |

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

Brand mark fields (`lvl: "brand-mark"`, ADR 0162, bipe-chat/bipe#483). A verified brand vouches for a reseller's work account. `sub` is the reseller; `msk` is the reseller account's master key. One envelope per mark:

| Field | Type | Meaning |
|---|---|---|
| `mark` | string | The mark ID (UUID). The apps use it to notice a mark that went away (ADR 0162 point 5) |
| `brand` | string | The brand's Matrix user ID. The apps check the brand's own `cnpj` badge before they show its seal in the detail |
| `cnpj` | string | The brand's normalised CNPJ, as in `cnpj` badges |
| `label` | string | One id of `labels` in `registries/brand-marks.json`. The line is the string `bipe_brand_mark_label_<label>` with `name` as its argument. An id the app does not know is `malformed` |

A brand mark never carries `legal_name`, `method` or `cvm`: those belong to the brand's own seal, and no seal moves to the reseller (ADR 0108 point 3).

Life: `exp - iat` is `lifeDays` in `registries/badge-keys.json` (7 days). A revoked claim or a leaked key stops working within that time without a revocation list (ADR 0123).

## Verification order

Inputs: the envelope, the sender's user ID, the sending device's key fingerprint, and the sender's cross-signing master key from the Matrix SDK (or none when the app does not know it).

1. `v` equals 1, else `unsupported_version`.
2. `kid` is known, else `unknown_kid`.
3. Ed25519 signature over the decoded payload bytes is valid, else `invalid_signature`.
4. Payload parses and all required fields for its `lvl` are present and well formed, else `malformed`. An unknown `lvl` is `malformed`. For `cnpj`: `cnpj` matches `^[0-9A-Z]{12}[0-9]{2}$`, `legal_name` and `msk` are not empty, `method` is one of the three values, `checked_month` matches `^[0-9]{4}-(0[1-9]|1[0-2])$`. A `cnpj` badge without `msk` is `malformed`, also when it has `dev`. For `brand-mark`: `mark`, `brand`, `name` and `msk` are not empty, `cnpj` matches the `cnpj` pattern, and `label` is in `registries/brand-marks.json`; no `dev`.
5. `iat <= now < exp`, else `expired` (or `not_yet_valid`).
6. `sub` equals the sender's user ID, else `subject_mismatch`.
7. Binding:
   - `cnpj` and `brand-mark`: `msk` equals the sender's master key, else `master_key_mismatch`. No known master key is also `master_key_mismatch`. A mismatch means the account reset its cryptographic identity: the badge is suspended until the server signs a new one.
   - Other levels: `dev` equals the sending device's key fingerprint, else `device_mismatch`. A mismatch means the account moved to a new device: the badge is suspended (security rule 4).

Fail closed: any other error means no badge.

The apps read the sender's master key from the Matrix SDK user identity (`UserIdentity.masterKey()` in matrix-rust-sdk). Showing the seal (bipe#252) and what to do on a pinning violation are not part of this format.

## Serving

`GET /v1/badges/{userId}` (`api/openapi.yaml`): 200 with the envelope, 404 when there is no badge, 410 with `reason` when the claim was revoked. `GET /v1/profiles/{handle}` carries the same envelope in `badge`. bipe-api signs on read and caches the envelope until `renewDaysBeforeExpiry` before `exp`. It reads the master key from the Synapse table `e2e_cross_signing_keys` (the newest `keytype = 'master'` row by `stream_id`). No master key: 404.

Brand marks: `GET /v1/brand-marks/{userId}` answers 200 with `{marks: [envelope, ...]}`, at most `maxPerAccount` of them, oldest grant first, and an empty list when the account holds none. The server signs a mark only while it is active, the brand still has a verified claim with an active registry record, and the reseller has a master key. Revocation takes effect at once on the server; the apps keep an answer for at most `recheckMinutes` (`registries/brand-marks.json`).

## Keys

- Target: production signing keys live in an HSM or a managed KMS. They never touch a developer machine.
- Now (ADR 0123): one Ed25519 key in the Kubernetes secret `bipe-badge-key` on the Magalu cluster, made there by bipe-infra `scripts/setup-badge-key.sh`. Only the bipe-api pod mounts it. Only its public key leaves the cluster. `kid` is `prod-YYYY-MM`. The move to an HSM or KMS (before the M3 store launch) makes a new `kid`; the apps then trust both until the old badges expire.
- Apps ship the trusted `kid` to public-key list from `registries/badge-keys.json` (generated into `BipeRegistries.badgeKeys`). A release build never trusts a `test-only-*` kid; the registry validation refuses one.
- `test-vectors/badges.json` uses a **TEST-ONLY** key derived from a fixed seed. Never trust it in a release build.
