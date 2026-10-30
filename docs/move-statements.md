# Move statement and moved statement (v1)

Two signed formats for the account move between operators (bipe `docs/federated-operators.md` "Account move between operators", bipe-chat/bipe#631, bipe-chat/bipe#693). The **move statement** proves that one person holds both accounts. The **moved statement** tells contacts that the handle now points to the new account. They sit next to the badge format (`docs/badge-attestation.md`).

Written 30 October 2026. Status: specified, not built. Reference code: `tools/lib/moves.mjs`. Test vectors: `test-vectors/moves.json`. bipe-api builds the core side in bipe-chat/bipe#694; bipe-app builds the mover in bipe-chat/bipe#695 and the contact side in bipe-chat/bipe#696.

## Move statement

The app builds it on a phone that holds the old account's private master key. It signs it with the **old master key** and with the **new master key**. The old operator never sees it.

```json
{
  "type": "chat.bipe.move",
  "v": 1,
  "old_user_id": "@k7m2q9x4:antigo.exemplo.br",
  "new_user_id": "@p3n8w1z6:bipe.net.br",
  "new_master_key": "<Matrix unpadded base64 Ed25519 public key>",
  "ts": 1791720000,
  "signatures": {
    "@k7m2q9x4:antigo.exemplo.br": { "ed25519:<old master key>": "<unpadded base64 signature>" },
    "@p3n8w1z6:bipe.net.br": { "ed25519:<new master key>": "<unpadded base64 signature>" }
  }
}
```

| Field | Meaning |
|---|---|
| `type` | `chat.bipe.move` |
| `v` | 1 |
| `old_user_id` | The old account's Matrix ID |
| `new_user_id` | The new account's Matrix ID |
| `new_master_key` | The new account's cross-signing master key, as the new account published it |
| `ts` | When the app built the statement, Unix seconds |
| `signatures` | Matrix signatures (below) |
| `unsigned` | Optional. Not signed; the core ignores it |

### Signing

Matrix signing JSON, as for cross-signing keys (Matrix spec, client-server API, "Signing JSON"):

1. Remove `signatures` and `unsigned`.
2. Encode the rest as Matrix **canonical JSON**: keys sorted by code point, no whitespace, UTF-8, integers only.
3. Sign those bytes with Ed25519.
4. Put the signature, unpadded base64, under `signatures.<user ID>."ed25519:<public key>"`. The key ID names the master public key, as Matrix does for cross-signing keys.

The old account signs under `old_user_id` with its master key; the new account signs under `new_user_id` with its master key. Both signatures cover the same bytes. `test-vectors/moves.json` `signedBytes` is the canonical JSON of the valid vector.

Why canonical JSON here, when badges sign exact bytes: the statement is a Matrix-style signed object, and matrix-rust-sdk and Synapse already have canonical JSON for cross-signing. The apps can also check the master key signature with the code that checks cross-signing signatures.

### Check (core, bipe-chat/bipe#694)

Inputs: the statement and the two master keys that the core **pinned** (`pinned.old`, `pinned.new`; federated-operators.md "Pinned master key"). The core never uses a key that the old operator reports now.

1. `type` is `chat.bipe.move`, else `malformed`. `v` is 1, else `unsupported_version`.
2. No field other than those above; both user IDs well formed; `new_master_key` is 32 bytes; `ts` a positive integer; `signatures` an object. Else `malformed`.
3. `old_user_id` differs from `new_user_id`, else `same_account`.
4. `new_master_key` equals `pinned.new`, else `new_key_not_pinned`.
5. A valid signature under `old_user_id` with key ID `ed25519:<pinned.old>`, else `invalid_old_signature`.
6. A valid signature under `new_user_id` with key ID `ed25519:<new_master_key>`, else `invalid_new_signature`.

A changed field breaks both signatures; the check reports the first, `invalid_old_signature`. The core checks the rest of "Move flow" step 4 (the new operator is on the list and vouched for the new account, no theft mark, no move in the last 30 days) from its own state.

## Moved statement

When the 72 hours are over, the core signs a moved statement with the **badge key**. It uses the badge envelope (`docs/badge-attestation.md` "Envelope"): `v`, `kid`, `payload`, `sig`, Ed25519 over the exact payload bytes.

```json
{ "typ": "moved", "sub": "@k7m2q9x4:antigo.exemplo.br", "new": "@p3n8w1z6:bipe.net.br", "moved": 1791979200, "iat": 1791979200 }
```

| Field | Meaning |
|---|---|
| `typ` | `moved`. A badge payload has no `typ`, so a badge can never pass as a moved statement, and the other way round (a moved payload has no `lvl`) |
| `sub` | The old Matrix ID |
| `new` | The new Matrix ID |
| `moved` | When the move finished, Unix seconds |
| `iat` | Signed at, Unix seconds, not before `moved` |

The badge route of the old Matrix ID returns it (bipe-chat/bipe#647, bipe-chat/bipe#694). It has no `exp`: a move does not expire.

### Check (apps, bipe-chat/bipe#696)

Inputs: the envelope, the old Matrix ID the app asked about (`subject`), and the badge keys that ship in the app.

1. `v` is 1, else `unsupported_version`.
2. `kid` is a known badge key, else `unknown_kid`.
3. The signature is valid over the payload bytes, else `invalid_signature`.
4. The payload parses; `typ` is `moved`; `sub` and `new` are well formed and differ; `moved` and `iat` are positive integers with `iat` not before `moved`. Else `malformed`.
5. `sub` equals `subject`, else `wrong_subject`.

### What the app does with it

- In every chat with the old account: the security-change notice (`bipe_moved_notice_title`, `bipe_moved_notice_body`, button `bipe_moved_notice_open`).
- A message from the old Matrix ID with `origin_server_ts` at or after `moved` × 1000 gets `bipe_moved_message_warning` (`test-vectors/moves.json` `afterMove`).
- The old Matrix ID shows as `bipe_moved_old_account`.
- A group admin sees `bipe_moved_invite_*`. The app never invites by itself.

## Strings

All in `strings/` (pt-BR and en), drafts until the humanizer pass:

- "Change server" screen: `bipe_move_title`, `bipe_move_intro`, `bipe_move_pick`, `bipe_move_keeps`, `bipe_move_loses`, `bipe_move_wait`, `bipe_move_start`, `bipe_move_pin`.
- Pending move with cancel: `bipe_move_pending_title`, `bipe_move_pending_body` (server name, date), `bipe_move_cancel`, `bipe_move_cancelled`, `bipe_move_blocked_theft`, `bipe_move_blocked_recent` (date), `bipe_move_done` (server name).
- Alert on the old account's devices: `bipe_move_alert_title`, `bipe_move_alert_body` (date), `bipe_move_alert_cancel`.
- Contacts: `bipe_moved_notice_*`, `bipe_moved_old_account`, `bipe_moved_message_warning`, `bipe_moved_invite_*`.
- Banner when the operator left the list: `bipe_operator_left_title`, `bipe_operator_left_body` (server name), `bipe_operator_left_action`.

The UI says "servidor" (server), as the other strings do (`bipe_report_message_body`). The operator's `name` from the operator list fills the placeholder, never the bare domain (`docs/signed-lists.md`, A-7).

## Vectors

`test-vectors/moves.json`:

- `move`: 12 statements against `pinned`: valid, valid with `unsigned`, old key not pinned, old signature missing, new signature by another key, new key not pinned, `ts` changed, `new_user_id` changed, same account, version 2, unknown field, wrong type.
- `moved`: 6 envelopes: valid, other key, unknown `kid`, changed payload, wrong subject, a badge-shaped payload.
- `afterMove`: the warning boundary.

TEST-ONLY keys: master keys from seeds `51..51`, `52..52`, `53..53`; the badge test key (seed `01..01`, kid `test-only-2026-10`).
