# Signed lists: the operator list and the issuer registry (v1)

The shared core publishes two lists that decide who counts as Bipe:

- The **operator list** names the chartered operators and their homeservers. It is the federation allowlist ([ADR 0168](https://github.com/bipe-chat/bipe/blob/main/docs/adr/0168-chartered-operators-federate.md), bipe-chat/bipe#645).
- The **issuer registry** names the accredited attestation issuers and their public keys ([ADR 0170](https://github.com/bipe-chat/bipe/blob/main/docs/adr/0170-shared-trust-issuers-keys-moderation.md), bipe-chat/bipe#637).

Both lists use one signature envelope, one verification order and one distribution path. The associação signs both, as part of the shared core ([ADR 0175](https://github.com/bipe-chat/bipe/blob/main/docs/adr/0175-shared-core-stays-central.md)). The threats are bipe `docs/security.md` "Attacks on the allowlist" (A-1 to A-7) and O1.

Written 26 October 2026. Status: specified, not built. Test vectors: `test-vectors/signed-lists.json` (lists) and `test-vectors/badge-issuers.json` (badges with an issuer ID). No app, server or bipe-api code reads them yet.

## Terms

- **Signed list:** an envelope that holds a list payload and one or more signatures. "List" in this doc means the operator list or the issuer registry.
- **List type:** `operators` or `issuers`. The payload field `typ` holds it.
- **Signer set:** the public keys that may sign a list type, and the threshold. It ships in the apps and in the server jobs.
- **Threshold:** the number of different signer keys that must sign a list.
- **Current list:** the list a device or server uses now. It is the accepted list with the highest version.
- **Bundled list:** the list that ships inside an app build.
- **Stale:** the current list is past its `expires`.

## Envelope

```json
{
  "v": 1,
  "payload": "<base64url, no padding: UTF-8 JSON payload bytes>",
  "sigs": [
    { "kid": "list-2026-10", "sig": "<base64url, no padding: Ed25519 signature over the decoded payload bytes>" }
  ]
}
```

- The signatures cover the **exact payload bytes**, as in the badge envelope (`docs/badge-attestation.md`). Verifiers never re-serialise JSON.
- `sigs` holds one item per signer key. `kid` selects the key in the signer set.
- Algorithm: Ed25519, as for badges.
- The list type is in the payload (`typ`), so it is under the signatures. An issuer registry cannot pass as an operator list.
- List signer keys are separate from badge signing keys and from issuer keys. A badge key never signs a list. The `kid` prefix is `list-`; test keys are `test-only-list-*`.

## Common payload fields

| Field | Type | Meaning |
|---|---|---|
| `typ` | `"operators"` \| `"issuers"` | List type |
| `version` | integer, 1 or more | Goes up by at least 1 for each new signed list of this type. Never reused |
| `issued` | integer | Signed at, Unix seconds. Information only; verifiers do not check it |
| `expires` | integer | Unix seconds. A list is not accepted at or after this time |

Dates of accreditation and removal are `YYYY-MM-DD` (Brasília calendar date). Machine times are Unix seconds, as in badges.

## Operator list payload

```json
{
  "typ": "operators",
  "version": 3,
  "issued": 1791716400,
  "expires": 1792926000,
  "operators": [
    {
      "server_name": "bipe.net.br",
      "name": "Bipe",
      "status": "valid",
      "joined": "2026-10-26",
      "signing_keys": { "ed25519:a_AbCd": "<unpadded base64 Ed25519 public key>" },
      "account_api": "https://api.bipe.net.br",
      "push_egress": ["203.0.113.10/32", "2001:db8:10::/64"],
      "signup": "open"
    },
    {
      "server_name": "antigo.exemplo.br",
      "name": "Cooperativa Antiga",
      "status": "removed",
      "joined": "2026-11-02",
      "removed": "2027-01-15"
    }
  ]
}
```

Entry fields:

| Field | Status | Type | Meaning |
|---|---|---|---|
| `server_name` | all | string | The Matrix server name, as in the user IDs of this operator, lower case. A port is part of the name. Unique in the list |
| `name` | all | string | Operator display name. The apps show this name, never the domain alone (A-7). Not empty |
| `status` | all | `"valid"` \| `"removed"` | `valid`: the server is a Bipe operator. `removed`: the server left or was removed and never counts as Bipe again under this entry (A-5) |
| `joined` | all | date | The day the operator joined the list |
| `removed` | `removed` | date | The day the operator left the list |
| `signing_keys` | `valid` | object, not empty | Server signing key ID (`ed25519:...`) to unpadded base64 public key, as in the Matrix key server response. The list holds the key, not only the key ID: a key ID alone does not pin a key after a domain takeover (A-4) |
| `account_api` | `valid` | string | `https` base URL of the operator's account service |
| `push_egress` | `valid` | list of strings, not empty | IPv4 and IPv6 CIDR blocks that the operator's homeserver sends push from. The core edge allows `/_matrix/push/v1/notify` only from these (federated-operators.md "Push") |
| `signup` | `valid` | `"open"` \| `"invite"` \| `"closed"` | Whether the operator takes new users |

A `removed` entry keeps only `server_name`, `name`, `status`, `joined` and `removed`. Its keys, URLs and egress addresses leave the list in the same version that removes it (A-5). A removed entry stays in every later version. If the same server name joins again, the entry goes back to `valid` with a new `joined` date and new keys.

### Rule: who is a Bipe user

A user ID is a Bipe user when its server part (the text after the first `:`) equals the `server_name` of a `valid` entry in the current list. Comparison is exact, after the host part is lower case. A `removed` name answers `removed`, a name not in the list answers `unknown`. Apps show a seal only for a Bipe user (federated-operators.md "Seal checks across operators").

## Issuer registry payload

```json
{
  "typ": "issuers",
  "version": 1,
  "issued": 1791716400,
  "expires": 1792926000,
  "issuers": [
    {
      "id": "bipe",
      "name": "Bipe",
      "status": "valid",
      "accredited": "2026-10-26",
      "levels": ["pix", "govbr", "institution", "cnpj", "brand-mark"],
      "keys": { "prod-2026-10": "9j3_slBroZbxa3B6Tdgcm_U-O_LIdrNFXzDgY8oLwxE" }
    }
  ]
}
```

Entry fields:

| Field | Status | Type | Meaning |
|---|---|---|---|
| `id` | all | string, `^[a-z0-9][a-z0-9-]{1,31}$` | Issuer ID. Stable; never reused for another organisation. Unique in the list |
| `name` | all | string | Issuer display name. The profile and the seal sheet show it (ADR 0170: "shows who issued it"). Not empty |
| `status` | all | `"valid"` \| `"removed"` | `removed`: every attestation from this issuer is invalid at once |
| `accredited` | all | date | The day the associação accredited the issuer |
| `removed` | `removed` | date | The day the accreditation ended |
| `levels` | `valid` | list of `lvl` values, not empty | The badge levels this issuer may sign (`docs/badge-attestation.md`). A bank that checks a person cannot sign a `cnpj` or `institution` badge |
| `keys` | `valid` | object, not empty | `kid` to raw Ed25519 public key, base64url without padding, as in `registries/badge-keys.json`. A `kid` is unique in the whole registry |

A `removed` entry keeps only `id`, `name`, `status`, `accredited` and `removed`. The issuer `bipe` is the associação's own verification service. Its keys are the keys of `registries/badge-keys.json`.

Why `levels` is in the format: the task list for #637 names ID, name, keys, dates and status. Without `levels`, any issuer could sign any level, and one weak issuer could mint company and institution seals. MZ can overrule this.

## Signer set and threshold (interface for #638)

The scheme for threshold signing is open (bipe-chat/bipe#638). This spec fixes only the interface that every scheme must fit.

A signer set for one list type:

```json
{ "threshold": 2, "keys": { "list-a-2026-10": "<base64url Ed25519 public key>", "list-b-2026-10": "...", "list-c-2026-10": "..." } }
```

The rule: a list is signed when at least `threshold` **different** `kid`s from `keys` each have a valid Ed25519 signature over the payload bytes.

- A `kid` not in the signer set is ignored. A new signer can sign before every app knows its key.
- A signature from a known `kid` that does not verify does not count. It does not reject the list by itself.
- The same `kid` twice counts once.

Both scheme families of #638 fit this interface without a format change:

- **Multi-signature over the file** (for example 2 of 3 member organisations): `keys` holds one key per member, `threshold` is 2, `sigs` holds 2 or more items.
- **Threshold signature with one group key** (for example FROST for Ed25519, RFC 9591): `keys` holds the group public key, `threshold` is 1, `sigs` holds 1 item. The output is a plain Ed25519 signature, so verifiers need no new code.

The two list types can have different signer sets. Until #638 decides, both use the same set.

**Interim (until #638):** one associação key signs both lists, threshold 1. The registry comment of the signer set must say so (#645 step 4). This interim key gives no protection against A-2: one person with the key can change the list. Where the interim key lives is an open question (see "Open questions").

**Signer set rotation:** the signer set ships in the app build and in the server jobs. A new signer set needs an app release. A signed rotation statement inside the list (the old set signs the new set) is a later step for #638.

## Verification order

Inputs: the envelope bytes, the expected list type, the signer set for that type, the current time, and the stored list (its `version` and payload bytes), or none.

1. The envelope parses, and `v` equals 1, else `unsupported_version`.
2. The threshold rule holds for the signer set, else `invalid_signature`.
3. The payload parses. `typ` equals the expected list type, else `wrong_type`.
4. All fields are present and well formed for their `status`. `server_name` (operators) or `id` and every `kid` (issuers) are unique. An unknown `status` is malformed. Else `malformed`.
5. `now < expires`, else `expired`.
6. Against the stored list:
   - `version` below the stored version: `rolled_back`.
   - `version` equal to the stored version and payload bytes not equal: `rolled_back`.
   - `version` equal and bytes equal: `valid`, no change.
   - `version` above: `valid`. The new list replaces the stored list.

Fail closed: any other error means the verifier keeps the stored list. A rejected list never changes the stored list.

The device stores the envelope bytes as received, not a parsed copy, so the bytes of step 6 are exact.

## Distribution

### The core serves

- `GET https://api.bipe.net.br/v1/operators` and `GET https://api.bipe.net.br/v1/issuers`: 200 with the newest envelope. No auth. `Cache-Control: public, max-age=300`. bipe-api in role `core` serves them (#645 step 2). The OpenAPI entry is part of that bipe-api step, not of this spec.
- `GET /v1/operators/versions/{version}` and `GET /v1/issuers/versions/{version}`: every version ever signed. This is the public log of A-2: anyone can check that each change was signed and when.
- The core serves the lists. The core does not sign them. The signers sign offline and upload the envelope.
- The signed envelopes are also committed to this repo (public), one file per version. Proposal for the #645 build step: `registries/operators.json` and `registries/issuers.json` hold the unsigned payload source, `registries/list-signers.json` holds the signer sets, and `signed/operators/<version>.json` and `signed/issuers/<version>.json` hold the envelopes. `tools/gen.mjs` puts the newest envelope and the signer sets into the generated Swift and Kotlin, as the bundled list.

### Apps (bipe-app iOS and Android, web chat)

- The apps fetch the lists **from the core only**, never from the user's operator (A-3). A hostile operator then cannot give its own users an old list.
- Fetch when the app comes to the foreground and the last successful fetch is more than 1 hour old, and every 6 hours while the app runs. Background fetch where the OS allows it; iOS does not promise a time for background refresh (unverified for bipe-app, 26 October 2026).
- Verify each fetched envelope with the order above. Keep the current list on disk with its bytes.
- A failed fetch or a rejected list keeps the current list. The app shows no error for this.

### Homeservers and the core edge

- A job on each homeserver fetches `/v1/operators` every 10 minutes, verifies it with the same order and the same vectors, and renders Synapse `federation_domain_whitelist` from the `server_name`s of `valid` entries (#645 step 3, bipe-infra). Whether Synapse reloads that option without a restart is unverified (26 October 2026).
- The core edge renders its allowlist for `/_matrix/push/v1/notify` from `push_egress` of `valid` entries, through the same verifier.
- The job keeps the stored version on disk and rejects a lower version, like the apps.
- Key pinning: the list holds `signing_keys`. Whether Synapse can pin a remote server's keys is unverified (security.md A-4, #633). Until then, the list carries the keys and nothing enforces them on the server side.

## Expiry and rollback protection

- **Rollback (A-3):** step 6 rejects a lower version, and a different list with the same version. The stored version only goes up. A fresh install starts at the bundled list's version.
- **Freeze:** an attacker who blocks fetches keeps a device on its current list. `expires` limits this. Proposal: the signers sign a new list at least every 7 days, with `expires` 14 days after `issued`.
- **Stale list on a device (A-3 proposal):** while the current operator list is stale, the app counts only the default homeserver `bipe.net.br` as Bipe; users of other operators show as unverified until a fresh list arrives. `removed` entries stay removed. While the current issuer registry is stale, the app accepts only issuer `bipe`, with the keys in the stale registry. This is the proposal in security.md A-3; MZ decides (see "Open questions").
- **Stale list on a server:** a homeserver keeps federating with the stale list and raises an alert. It never adds a server from an unsigned or lower source. Cutting federation for every operator because one fetch failed hurts more than a short freeze. MZ can overrule.

## Revocation and how fast it reaches devices

| What | How | Time to reach a device |
|---|---|---|
| Operator removal | New operator list version with `status: removed` | An online device: at the next foreground after 1 hour, or within 6 hours while open. A device that cannot fetch: until its current list is stale, at most 14 days after `issued`, then the stale rule. The core also stops signing badges for the removed server, so its badges end within `lifeDays` (7 days) |
| Operator suspension (A-6) | Not in v1. A-6 proposes that one signer can suspend for 72 hours; that needs a second signature rule and is #633's call | n/a |
| Issuer removal | New issuer registry version with `status: removed` | As for operator removal. Every attestation from the issuer fails at once on a device with the new registry |
| One issuer key leaked | New registry version without that `kid` | As for operator removal |
| One attestation | No revocation list. The badge life is at most `lifeDays` (ADR 0123), for every issuer (`docs/badge-attestation.md`). `GET /v1/badges/{userId}` answers 410 for a revoked claim | At most 7 days |

## Bundled fallback

- bipe-chat/bipe#680 (M3) adds `registries/bipe-servers.json` with one entry, `bipe.net.br`, and the helper `isBipeUserID`. It is not signed. It is a build-time constant.
- When the operator list exists (#645, #682), the bundled signed operator list replaces `bipe-servers.json`. `isBipeUserID` keeps its name and its call sites and reads the current list. `bipe-servers.json` is then deleted, or generated from the bundled list, so the repo keeps one source for the server names (ADR 0031).
- The bundled list is a signed envelope like a fetched one. The app checks its signature and type, not its expiry: an old app build must still start. A stale bundled list follows the stale rule, so before the first fetch only `bipe.net.br` counts.
- A fetched valid list always supersedes the bundled list, because its version is higher. After that, the device never goes back to the bundled list, also when the fetched list goes stale.
- `registries/badge-keys.json` is the bundled source of issuer `bipe`. Before a device has a valid issuer registry, its trusted issuers are only `bipe`, with those keys and every level. After a valid registry arrives, the device uses only the registry, so a `kid` that the registry dropped does not come back from the bundled file.

## Test vectors

`test-vectors/signed-lists.json` (generated by `tools/gen-test-vectors.mjs`, TEST-ONLY keys from fixed seeds):

- `signerSets`: named signer sets (one key, threshold 1; three keys, threshold 2).
- Each vector: `typ` (expected list type), `signerSet`, `envelope`, `stored` (`null` or `{version, payload}`), `expect` (`valid` or an error of the verification order), and for a valid operator list, `lookups` (server name to `valid`, `removed` or `unknown`).
- Cases: valid, expired, rolled back, same version with other bytes, bad signature, unknown signer, wrong type, removed server, duplicate server name, threshold met and not met, duplicate signer.

`test-vectors/badge-issuers.json` holds badges with an issuer ID (see `docs/badge-attestation.md` "Issuer").

## Open questions

- Interim key custody (until #638): an offline key held by an associação officer, or the cluster secret pattern of `bipe-badge-key`. A key in the core cluster lets a core compromise sign lists. Default in this spec: offline, the core only serves.
- Stale list on a device: count only `bipe.net.br` (the A-3 proposal, the default here), or keep the stale list.
- Re-sign cadence: every 7 days with 14-day expiry is the default here. With a threshold across member organisations, each re-sign needs signers from two organisations every week.
- Who delivers attestations of an issuer other than `bipe` to the apps: the issuer through the core (`GET /v1/badges`), or the issuer's own endpoint. Not decided; the format works for both.
- A-6 suspension by one signer: not in v1.

## Sources

- bipe `docs/adr/0168-chartered-operators-federate.md`, `0170-shared-trust-issuers-keys-moderation.md`, `0175-shared-core-stays-central.md`, `docs/federated-operators.md`, `docs/security.md` "Chartered operators" (read 26 October 2026, bipe `becbe3f`).
- bipe-chat/bipe#637, #645, #638, #680 (read 26 October 2026).
- This repo: `docs/badge-attestation.md`, `registries/badge-keys.json`, `tools/gen-test-vectors.mjs`.
- RFC 9591 (FROST). Not re-read for this doc.
