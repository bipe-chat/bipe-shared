# Screen specs

One JSON file per screen of Bipe's own client (`bipe-chat/bipe-app`, [ADR 0143](https://github.com/bipe-chat/bipe/blob/main/docs/adr/0143-own-client-on-matrix-rust-sdk.md), [ADR 0145](https://github.com/bipe-chat/bipe/blob/main/docs/adr/0145-own-client-setup.md)). iOS (SwiftUI) and Android (Compose) implement the same id, state, actions and strings ([plan](https://github.com/bipe-chat/bipe/blob/main/docs/client-rewrite-plan.md) section 3). `node tools/screens.mjs` checks every file; `node --test tools/*.test.mjs` runs the same check in CI.

## Format

| Key | Required | What it holds |
|---|---|---|
| `id` | yes | kebab-case, stable, equal to the file name. Never rename an id that code uses. |
| `title` | yes | Name of the screen for people who read the spec. Not UI text. |
| `flow` | yes | The flow the screen belongs to, for example `launch`, `home`, `chat`. |
| `summary` | yes | What the screen does, in one or two sentences. |
| `types` | no | Named record types (PascalCase) that this or another spec uses. Each is an object of fields. |
| `state` | yes | The screen state: an object of named fields (camelCase). |
| `actions` | yes | What the user or the system can do: name (camelCase) → `effect` (one sentence) and optional `params` (fields). |
| `strings` | yes | Keys of the UI strings the screen shows. Each key must be in `strings/en.json` and `strings/pt-BR.json`. |
| `sdk` | yes | The matrix-sdk-ffi API the screen uses, as `Type.method` in camelCase (the binding names). |
| `parity` | yes | Ids of the `product/parity.json` items the screen serves. Can be empty. |
| `notes` | no | Rules that do not fit above: limits, what is out of scope, links to ADRs. |

A field has `type`, `description` and optional `optional: true`. Types:

- `string`, `int`, `bool`, `date`, `url`;
- `enum` with `values` (two or more camelCase names);
- `list` with `of` (a field without a name);
- the name of a record type from `types` in any spec.

## People names

MZ decided on 2 November 2026: the Matrix user ID and its localpart are internal. The UI never shows them. Debug and about panels are the only exception, and the localpart stays where it is a login username (link-computer, linked-devices).

Every screen that names a person uses this order:

1. The saved contact name, when the user allowed contacts.
2. The profile display name, when it is not empty, not the full Matrix ID and not its localpart. Synapse sets a new account's display name to its localpart, so that value is no name.
3. The Bipe `@handle` from `POST /v1/handles/resolve`.
4. `bipe_person_no_name`.

A label that tells two people apart adds the `@handle`, never the Matrix ID. iOS: `BipeChatRowName.person` (BipeKit). Android: `BipeChatRowName.person` (`libraries/bipe`).

## Rules for spec writers

- A spec says what the screen does. It says nothing about how Element X does it.
- Sources: the Matrix spec, the matrix-rust-sdk API and docs (Apache-2.0), Bipe's ADRs and docs, Bipe's own code (BipeKit, `libraries/bipe`), and the running fork used as an app.
- Never paste or paraphrase Element X code, comments, strings or file structure into a spec.
- New UI text goes into `strings/` with an English and a pt-BR value. pt-BR follows `../bipe/docs/design/linguagem.md` and stays draft until it passes the humanizer.
