# Theft mark statement (v1)

ADR 0044, ADR 0051, bipe-chat/bipe#600. The API signs one statement per marked account. Contacts' apps get it from `POST /v1/theft-marks` and verify it locally, as they verify a badge (`docs/badge-attestation.md`).

## Envelope

The badge envelope: `v` 1, `kid`, `payload` (base64url, no padding, UTF-8 JSON bytes), `sig` (base64url Ed25519 over the payload bytes). The keys are the badge keys in `registries/badge-keys.json`.

## Payload

| Field | Type | Meaning |
|---|---|---|
| `typ` | `"theft"` | Always `theft`. A badge payload has no `typ`, so a badge is never a mark and a mark is never a badge |
| `sub` | string | Matrix user ID of the marked account |
| `stolen_at` | integer | When a guardian set the mark, Unix seconds |
| `iat` | integer | Issued at, Unix seconds |
| `exp` | integer | `iat` + `statementLifeHours` (`registries/theft-protection.json`) |

## Verification order

1. `v` equals 1, else `unsupported_version`.
2. `kid` is known, else `unknown_kid`.
3. The signature is valid, else `invalid_signature`.
4. The payload parses, `typ` is `theft`, `sub` is a string, `stolen_at`, `iat` and `exp` are integers, else `malformed`.
5. `iat <= now < exp`, else `expired` (or `not_yet_valid`).
6. `sub` equals the account the app asked about, else `subject_mismatch`.

A valid statement: the app shows `bipe_theft_banner_title` and `bipe_theft_banner_body` in chats with the account, and `bipe_theft_message_marker` on its messages sent from `stolen_at - markedMessageMinutes` on. Any error: no mark. Cases: `test-vectors/theft-marks.json`.

No statement means no mark. A cleared mark stops being served at once; a statement already on a phone ends at `exp`.
