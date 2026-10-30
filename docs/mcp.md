# MCP surfaces and tool data classes

Status (30 October 2026): the tool registry is in `registries/mcp-tools.json` (bipe-chat/bipe#436). The public surface is in bipe-api (bipe-chat/bipe#438). The bridge surface (bipe-chat/bipe#437) and the personal surface (bipe-chat/bipe#439) are planned. Decisions: [ADR 0130](https://github.com/bipe-chat/bipe/blob/main/docs/adr/0130-mcp-local-by-default.md), [ADR 0210](https://github.com/bipe-chat/bipe/blob/main/docs/adr/0210-ai-open-to-any-assistant-drafts-not-sends.md).

## Surfaces

| Surface | Where it runs | Who connects | Data |
|---|---|---|---|
| `public` | bipe-api in São Paulo, `https://mcp.bipe.chat/mcp` | Anyone. No account. | Only what bipe.chat shows publicly. |
| `bridge` | The company's bipe-business bridge, on the company's server | The company, with its Bearer token and scopes | The company's customer conversations (ADR 0035). |
| `personal` | `bipe-mcp` on the user's own machine | The user | The user's chats, through a device the user approved. |

## Data classes

Every tool has one class. A tool that is not `public` needs a token scope that turns it on.

- `public`: data anyone can see on bipe.chat. No opt-in.
- `metadata`: lists, assignees, tags, status, times. No text. Opt-in per scope.
- `content`: message text, notes, attachments. Off by default. Opt-in per scope. The opt-in screen names the destination of the data: "fora do Brasil" when the client's model is outside Brazil or unknown.

## Writes

Every tool says what it changes:

- `none`: reads only.
- `draft`: puts a draft in the user's apps ([drafts-room.md](drafts-room.md)). Personal surface only.
- `send`: sends a message. Bridge surface only: a company may answer with a program, and the customer sees that a program answers. A personal tool never sends (ADR 0210).
- `state`: changes status, tags, assignment or room state.

## Rules the registry enforces

`validateMcpTools()` in `tools/lib/registries.mjs` fails closed when:

- a name is not snake_case or is used twice;
- a surface, class or writes value is unknown;
- a `metadata` or `content` tool has no scope;
- a `public` tool has another class, writes something or has a scope;
- a personal tool has writes `send`;
- a tool that is not personal has writes `draft`;
- the `en` or `pt` description is missing, longer than 200 characters or has an em dash.

`tools/mcp-tools.test.mjs` tests each rule.

## The public surface

The public surface is a stateless MCP server over Streamable HTTP (MCP 2025-06-18). The contract is `POST /v1/mcp` in `api/openapi.yaml`. The edge serves it as `https://mcp.bipe.chat/mcp`.

- JSON-RPC 2.0 over POST, one message per request, answered as `application/json`. No session, no server-sent events. A GET answers 405.
- Methods: `initialize`, `ping`, `tools/list`, `tools/call`. Notifications (such as `notifications/initialized`) get 202 with no body.
- Tools: the `public` tools of the registry. Each answer is what the public `/@handle` page shows, nothing more.
- No auth. Rate-limited per IP like the other public routes.

Connect a client:

```json
{ "mcpServers": { "bipe": { "type": "http", "url": "https://mcp.bipe.chat/mcp" } } }
```

## Registers

When a surface that hands content to a client ships, the same change adds the `mcp-client` party to `product/privacy.json` and a place with `brazil: null` to `product/data.json` (ADR 0130). The public surface hands out only public data, so it adds neither.
