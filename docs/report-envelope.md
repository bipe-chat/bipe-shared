# Sealed reports across operators (v1)

A report about a user goes to the **operator of the reported user**, sealed so that only that operator can read it. The shared core relays it and reads only the plain envelope. An appeal, or abuse across operators, goes to the **associação** the same way ([ADR 0170](https://github.com/bipe-chat/bipe/blob/main/docs/adr/0170-shared-trust-issuers-keys-moderation.md), bipe-chat/bipe#639, bipe-chat/bipe#697).

Why: Matrix has no report over federation. A Matrix report (`POST /rooms/{roomId}/report/{eventId}`) goes to the reporter's own homeserver and carries an event ID and a reason, with no decrypted content. With chartered operators ([ADR 0168](https://github.com/bipe-chat/bipe/blob/main/docs/adr/0168-chartered-operators-federate.md)) the reporter's server is often not the server that can act.

Written 30 October 2026. Status: specified, not built. Machine-readable schema: `api/report-schemas.json`. Reference code: `tools/lib/reports.mjs`. Test vectors: `test-vectors/reports.json`. Categories: `registries/report-categories.json`. The relay is bipe-chat/bipe#698; the app report sheets are bipe-chat/bipe#707; the operator queue is bipe-chat/bipe#704.

## Terms

- **Envelope:** the plain part of a report. The core, the receiving operator and the logs can read it.
- **Body:** the sealed part. Only the holder of the recipient private key can read it.
- **Recipient key:** an X25519 public key in the operator list: `report_keys` of the target operator, or `appeal_keys` of the associação.
- **Sealed report:** the envelope bytes, the HPKE encapsulated key and the ciphertext, as one JSON object.

## Categories

`registries/report-categories.json` holds the ids, in the order of the report sheet: `csam`, `child_safety`, `ncii`, `threat`, `takeover`, `scam`, `impersonation`, `illegal_hate`, `spam`, `other`. Each has:

- `firstActionMinutes`: the charter target from the report's arrival to the operator's first action (hide, suspend, or a recorded decision to keep the content).
- `flaggerEligible`: an accredited trusted flagger may file this category.
- The strings `bipe_report_category_<id>` (name) and `bipe_report_category_<id>_hint` (one line).

There is no political or disinformation category ([ADR 0174](https://github.com/bipe-chat/bipe/blob/main/docs/adr/0174-political-accounts-tse-seal-followers-only.md)). The validator fails on a missing or extra id, and on a `csam` or `child_safety` target above 60 minutes.

## Sealing scheme

HPKE, [RFC 9180](https://www.rfc-editor.org/rfc/rfc9180), base mode, single shot:

| Part | Value | Id |
|---|---|---|
| KEM | DHKEM(X25519, HKDF-SHA256) | `0x0020` |
| KDF | HKDF-SHA256 | `0x0001` |
| AEAD | ChaCha20-Poly1305 | `0x0003` |

- `info`: `chat.bipe.report.v1` for a report to an operator (`to: "operator"`), `chat.bipe.appeal.v1` for the associação (`to: "associacao"`). A report sealed for one cannot open as the other.
- `aad`: the exact envelope bytes. A changed envelope (for example a new category) makes the body fail to open.
- The sender takes a fresh ephemeral key for every report. The vectors use a fixed one only to be repeatable.

Libraries, all with this suite and no new dependency:

- iOS: CryptoKit `HPKE.Sender` and `HPKE.Recipient` with `HPKE.Ciphersuite.Curve25519_SHA256_ChachaPoly` (iOS 17 and later; bipe-app targets iOS 18).
- Android: Tink `HpkeParameters` with `KemId.DHKEM_X25519_HKDF_SHA256`, `KdfId.HKDF_SHA256`, `AeadId.CHACHA20_POLY1305` (Apache-2.0). Checking Tink's licence row in bipe-app `tools/licences.json` belongs to bipe-chat/bipe#707.
- Server (bipe-api): `tools/lib/reports.mjs` on Node `crypto` built-ins. `tools/gen.mjs` copies it into bipe-api `src/generated/lib/`.

Why HPKE and not libsodium sealed boxes: CryptoKit and Tink ship HPKE, so the apps need no new native library. HPKE binds the envelope as AAD; a sealed box has no AAD. Default chosen; MZ can overrule.

## Wire format

```json
{
  "v": 1,
  "envelope": "<base64url, no padding: UTF-8 JSON envelope bytes>",
  "enc": "<base64url, no padding: 32-byte HPKE encapsulated key>",
  "ct": "<base64url, no padding: HPKE ciphertext of the body bytes, with the 16-byte tag>"
}
```

As in the signed lists (`docs/signed-lists.md`), the envelope travels as bytes. The receiver never re-serialises it.

## Envelope

```json
{
  "v": 1,
  "report_id": "3f2b8c1e-7a4d-4e9b-8c21-5d6f7a8b9c0d",
  "to": "operator",
  "kid": "report-2026-10",
  "category": "scam",
  "target_operator": "bipe.net.br",
  "target_user": "@golpista:bipe.net.br",
  "target_room": "!sala:bipe.net.br",
  "reporter": "user",
  "created": 1791720000
}
```

| Field | Required | Meaning |
|---|---|---|
| `v` | yes | 1 |
| `report_id` | yes | UUID v4, lower case. The reporter's client makes it. The operator answers with it |
| `to` | yes | `operator` or `associacao` |
| `kid` | yes | The recipient key in the operator list |
| `category` | yes | An id of `registries/report-categories.json` |
| `target_operator` | yes | The `server_name` of the receiving operator |
| `target_user` | one of the two | The reported Matrix user ID. Its server part equals `target_operator` |
| `target_room` | one of the two | The reported room ID |
| `reporter` | yes | `user` or `flagger` |
| `flagger_id` | with `flagger` only | The accredited trusted flagger's ID (bipe-chat/bipe#699) |
| `created` | yes | Unix seconds |

The envelope has no reporter Matrix ID. The relay knows who sent the request (its access token); the operator learns the reporter only from the body if the reporter's own messages are in it. Unknown fields are malformed, so a client cannot add data to the plain part by mistake.

### Envelope check (order)

1. `v` is 1, else `unsupported_version`.
2. No unknown field; `report_id`, `to`, `kid`, `target_operator` well formed, else `malformed`.
3. `category` is a known id, else `unknown_category`.
4. `target_user` or `target_room` is present, else `no_target`. Each present one is well formed, else `malformed`.
5. The server part of `target_user` equals `target_operator`, else `wrong_operator`.
6. `reporter` is `user` without `flagger_id`, or `flagger` with a well formed `flagger_id`, else `malformed`. A flagger report has a category with `flaggerEligible`, else `not_flagger_category`.
7. `created` is a positive integer, else `malformed`.

The relay (bipe-chat/bipe#698) also checks that `kid` names a current key of `target_operator` (or of `appeal_keys`) in the current operator list, and that the reporter may file as a flagger. Those checks need state, so they are not in the vectors.

## Body

```json
{
  "events": [
    {
      "event": { "event_id": "$...", "sender": "@golpista:bipe.net.br", "type": "m.room.encrypted", "content": { }, "signatures": { "bipe.net.br": { "ed25519:a_test": "..." } } },
      "decrypted": { "type": "m.room.message", "content": { "msgtype": "m.text", "body": "..." } },
      "media": [ { "url": "mxc://bipe.net.br/...", "key": "<JWK k>", "iv": "<base64>", "sha256": "<base64>" } ]
    }
  ],
  "context": [ ],
  "reason": "Diz que é minha filha e pede Pix.",
  "scores": { "scam": 0.92 }
}
```

| Field | Required | Meaning |
|---|---|---|
| `events` | yes, 1 to 20 | The reported messages |
| `context` | no, up to 20 | Messages around them, in time order, same shape |
| `reason` | no, up to 1000 characters | What the reporter wrote |
| `scores` | no | On-device scores from 0 to 1, by name (for example `scam`) |

Each item of `events` and `context`:

- `event`: the event **exactly as the reporter's homeserver served it**, with `signatures` when the client has them. The origin server's signature lets the operator see a forged event (security.md O10).
- `decrypted`: the decrypted `type` and `content` as the client shows them. This is an **unproved claim**: Matrix has no message franking, so the operator weighs it as the reporter's word (security.md O10, accepted A3).
- `media`: for each encrypted file in the message, the fields of its `EncryptedFile`: `url`, `key` (the JWK `k`), `iv`, `sha256` (`hashes.sha256`). The operator downloads the ciphertext from its own media repository.

The body is at most 1 MiB before sealing.

### Media proof

The operator checks a file before a moderator sees it:

1. SHA-256 of the downloaded ciphertext, unpadded standard base64, equals `sha256`. Else `hash_mismatch`: the reporter's key does not belong to that file.
2. Decrypt with AES-256-CTR, key from `key`, counter block from `iv` (Matrix attachments v2).

The hash proves the file is the one the reported event names. It does not prove that the decrypted file is what the sender meant to send; the decryption itself does.

## Keys in the operator list

`docs/signed-lists.md` adds two fields:

- Each `valid` operator entry has `report_keys`: `kid` to raw X25519 public key, base64url without padding, not empty. A `kid` is unique in the whole list.
- The payload has `appeal_keys`: the associação's keys, same form, not empty.

A new key is added before the old one leaves, so reports sealed in the meantime still open. An operator keeps the private key off the homeserver host. Where the associação keeps the appeal key is part of bipe-chat/bipe#638.

## Vectors

`test-vectors/reports.json`:

- `sealed`: open each with the private key of `recipient`. `valid` must give the listed envelope and body. Errors: `cannot_open` (wrong key, changed envelope, changed ciphertext), `unsupported_version`, `malformed_body`.
- `envelopes`: the check above.
- `media`: the media proof.
- `rfc9180`: the RFC's own vector for this suite, so a platform checks its HPKE library first.

## Open points

- The charter (bipe-chat/bipe#629) fixes the `firstActionMinutes` values; the registry holds defaults until then.
- Report rates per operator and the upheld rate (security.md O10) are relay state, bipe-chat/bipe#698.
