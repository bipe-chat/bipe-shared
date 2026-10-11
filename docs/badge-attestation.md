# Badge attestation format (v1)

A verified badge is a statement signed by the Proseio verification service. Apps verify the signature locally against public keys that ship in the app. Apps never read a badge from a Matrix profile field, display name or room state (security rule 2).

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

| Field | Type | Meaning |
|---|---|---|
| `sub` | string | Matrix user ID, e.g. `@ana:proseio.com.br` |
| `lvl` | `"pix"` \| `"govbr"` \| `"institution"` | Verification level |
| `name` | string | Verified legal name (or institution name) |
| `cnpj` | string, institution only | Institution CNPJ, digits only |
| `dev` | string | Fingerprint of the device key the badge is bound to (Matrix device Ed25519 key, base64) |
| `iat` | integer | Issued at, Unix seconds |
| `exp` | integer | Expires at, Unix seconds |

## Verification order

1. `v` equals 1, else `unsupported_version`.
2. `kid` is known, else `unknown_kid`.
3. Ed25519 signature over the decoded payload bytes is valid, else `invalid_signature`.
4. Payload parses and all required fields are present, else `malformed`.
5. `iat <= now < exp`, else `expired` (or `not_yet_valid`).
6. `sub` equals the sender's user ID, else `subject_mismatch`.
7. `dev` equals the sending device's key fingerprint, else `device_mismatch`. A mismatch means the account moved to a new device: the badge is suspended (security rule 4).

Fail closed: any other error means no badge.

## Keys

- Production signing keys live in an HSM. They never touch a developer machine.
- Apps ship a list of trusted `kid` to public-key entries plus a revocation list.
- `test-vectors/badges.json` uses a **TEST-ONLY** key derived from a fixed seed. Never trust it in a release build.
