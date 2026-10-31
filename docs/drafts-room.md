# Drafts room: assistant drafts reach the user's apps

Status (30 October 2026): specified. Writer: `bipe-mcp` `draft_message` (bipe-chat/bipe#439). Reader: Bipe apps on iOS and Android (bipe-chat/bipe#866). Decision: [ADR 0210](https://github.com/bipe-chat/bipe/blob/main/docs/adr/0210-ai-open-to-any-assistant-drafts-not-sends.md) point 3.

## Why

An assistant that the user connects through MCP never sends a message. It writes a draft. The user sees the draft in Bipe, edits it, sends it or discards it. The draft must reach every device of the user, stay end-to-end encrypted, and survive a new device.

The composer draft of matrix-sdk-ffi (`Room.saveComposerDraft`) stays on one device. Room account data reaches every device but the server stores it unencrypted. Encrypted to-device messages give no shared list and are lost on a new device. So drafts travel in a private room.

## Names

All names are in `registries/drafts.json`. The generator writes them into `BipeRegistries` (Swift, `draftsRoomType`, `draftsAccountDataType`, `draftField`, `draftBodyMaxLength`, `draftClientMaxLength`) and `BipeRegistries` (Kotlin, `DRAFTS_ROOM_TYPE` and the others).

| Name | Value | What it is |
|---|---|---|
| `accountDataType` | `chat.bipe.drafts_room` | Global account data: `{"room_id": "!…"}`. The one source for which room is the drafts room. |
| `roomType` | `chat.bipe.drafts` | Creation type of the room, when the creating SDK can set it. Not used to find the room. |
| `field` | `chat.bipe.draft` | Field in the draft message content. |
| `bodyMaxLength` | 8000 | Longer drafts are ignored. |
| `clientMaxLength` | 64 | Longer client names are ignored. |

## The room

- One room per account. The writer creates it on its first draft: encrypted (`m.megolm.v1.aes-sha2`), join rule invite, no invites, history visibility joined, name "Rascunhos". Then it writes `chat.bipe.drafts_room`.
- Before it creates a room, the writer reads `chat.bipe.drafts_room`. When the account data names a room that the account is in, the writer uses it. A device never makes a second room.
- Only the user's account is a member. Every device of the user can read it, because they share the room keys through key backup and key sharing, like any other room.
- The apps hide the room by its ID: not in the chat list, search, share targets, forward targets or the unread count.

## A draft

A draft is an `m.room.message` in the drafts room:

```json
{
  "msgtype": "m.text",
  "body": "Posso passar aí às 15h?",
  "chat.bipe.draft": {
    "room_id": "!chat:bipe.net.br",
    "reply_to": "$event",
    "thread_root": "$root",
    "client": "Claude Desktop"
  }
}
```

- `body` is the text that the user will send. Plain text; Markdown is fine.
- `room_id` is the target chat. Required.
- `reply_to` and `thread_root` are optional event IDs.
- `client` is the name of the MCP client, from the MCP `initialize` request (`clientInfo.name`). Required. The banner shows it: "Rascunho do assistente (Claude Desktop)".
- Other Matrix apps show the draft as plain text in a room called "Rascunhos". That is the fallback.

## When an app shows a draft

`draftFromEvent(event, { ownUserId, joinedRoomIds })` in `tools/lib/registries.mjs` is the reference. `test-vectors/drafts.json` holds the cases. An app shows a draft only when all of these are true:

1. The event is an `m.room.message` with `msgtype` `m.text`, and it is not redacted.
2. The sender is the user's own account. A draft from anyone else is ignored, also when another account got into the room.
3. `chat.bipe.draft.room_id` is a room that the user has joined.
4. `body` is not blank and at most `bodyMaxLength` characters.
5. `client` is not blank and at most `clientMaxLength` characters.
6. `reply_to` and `thread_root`, when present, are event IDs.

## Send, edit, discard

- **Send**: the app sends `body` in the target chat as the user's own message, with the reply and the thread. It carries no AI marker (ADR 0210). After the send succeeds, the app redacts the draft. If the send fails, the draft stays.
- **Edit**: the app puts `body` in the composer of the target chat and redacts the draft. The text is now an ordinary composer draft.
- **Discard**: the app redacts the draft.

A redaction removes the draft on every device of the user.

## What the server sees

The homeserver sees that the account has a private room and when messages arrive in it. It never sees the text: the room is end-to-end encrypted. `chat.bipe.drafts_room` holds only the room ID.

## Limits

- The rules live in honest clients. A modified client can send without a draft. The draft rule keeps honest clients honest (ADR 0130, ADR 0210).
- The writer runs on the user's machine as an unattested device (ADR 0043). It gets the room keys like any device the user approved.
