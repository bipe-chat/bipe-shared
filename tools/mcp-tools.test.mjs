// MCP tool registry (bipe ADR 0130, ADR 0210; bipe-chat/bipe#436) and drafts rule (bipe-chat/bipe#866).
import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assistantSendAllowed, assistantSender, draftFromEvent, loadRegistries, validateDrafts, validateMcpTools } from "./lib/registries.mjs";

const reg = loadRegistries(join(dirname(fileURLToPath(import.meta.url)), ".."));
const withTool = (patch) => ({ ...reg.mcpTools, tools: [...reg.mcpTools.tools, { name: "extra_tool", surface: "bridge", class: "content", writes: "none", scope: "content:read", en: "x", pt: "x", ...patch }] });

test("the registry passes", () => validateMcpTools(reg.mcpTools));

test("a content tool without a scope fails", () => {
  assert.throws(() => validateMcpTools(withTool({ scope: undefined })), /needs a scope/);
});

test("a metadata tool without a scope fails", () => {
  assert.throws(() => validateMcpTools(withTool({ class: "metadata", scope: undefined })), /needs a scope/);
});

test("a personal tool that sends needs the content-send scope (ADR 0210)", () => {
  assert.throws(() => validateMcpTools(withTool({ surface: "personal", writes: "send", scope: "content-own" })), /needs scope content-send/);
  validateMcpTools(withTool({ surface: "personal", writes: "send", scope: "content-send" }));
});

test("content-send is for personal tools only", () => {
  assert.throws(() => validateMcpTools(withTool({ scope: "content-send" })), /personal sends only/);
});

test("the send switch is off by default", () => {
  assert.throws(() => validateMcpTools({ ...reg.mcpTools, personalSend: { ...reg.mcpTools.personalSend, default: true } }), /off by default/);
  for (const off of [undefined, null, {}, { enabled: "true" }, { enabled: 1 }, [true]]) assert.equal(assistantSendAllowed(off), false);
  assert.equal(assistantSendAllowed({ enabled: true }), true);
});

test("a message an assistant sent names its client", () => {
  assert.equal(assistantSender({ body: "oi", "chat.bipe.assistant": { client: " Claude Desktop " } }, reg), "Claude Desktop");
  for (const c of [{ body: "oi" }, { "chat.bipe.assistant": "x" }, { "chat.bipe.assistant": { client: "" } }, { "chat.bipe.assistant": { client: "c".repeat(65) } }]) assert.equal(assistantSender(c, reg), null);
});

test("a public tool with content fails", () => {
  assert.throws(() => validateMcpTools(withTool({ surface: "public", class: "content" })), /public tool/);
});

test("a duplicate name fails", () => {
  assert.throws(() => validateMcpTools(withTool({ name: "read_conversation" })), /duplicate/);
  validateMcpTools(withTool({ name: "read_chat" }));
});

test("a tool without pt fails", () => {
  assert.throws(() => validateMcpTools(withTool({ pt: undefined })), /pt must be/);
});

test("the personal surface drafts, and sends only with content-send", () => {
  const personal = reg.mcpTools.tools.filter((t) => t.surface === "personal");
  assert.ok(personal.some((t) => t.name === "draft_message" && t.writes === "draft"));
  assert.ok(personal.filter((t) => t.writes === "send").every((t) => t.scope === "content-send"));
});

test("drafts names are fixed", () => {
  assert.throws(() => validateDrafts({ ...reg.drafts, field: "chat.bipe.other" }), /unsupported/);
});

test("a draft from another account is never shown", () => {
  const ctx = { ownUserId: "@a:s", joinedRoomIds: ["!r:s"] };
  const event = { type: "m.room.message", sender: "@b:s", content: { msgtype: "m.text", body: "oi", [reg.drafts.field]: { room_id: "!r:s", client: "X" } } };
  assert.deepEqual(draftFromEvent(event, ctx, reg), { show: false, reason: "sender" });
  assert.equal(draftFromEvent({ ...event, sender: "@a:s" }, ctx, reg).show, true);
});
