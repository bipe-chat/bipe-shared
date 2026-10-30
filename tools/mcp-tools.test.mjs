// MCP tool registry (bipe ADR 0130, ADR 0210; bipe-chat/bipe#436) and drafts rule (bipe-chat/bipe#866).
import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { draftFromEvent, loadRegistries, validateDrafts, validateMcpTools } from "./lib/registries.mjs";

const reg = loadRegistries(join(dirname(fileURLToPath(import.meta.url)), ".."));
const withTool = (patch) => ({ ...reg.mcpTools, tools: [...reg.mcpTools.tools, { name: "extra_tool", surface: "bridge", class: "content", writes: "none", scope: "content:read", en: "x", pt: "x", ...patch }] });

test("the registry passes", () => validateMcpTools(reg.mcpTools));

test("a content tool without a scope fails", () => {
  assert.throws(() => validateMcpTools(withTool({ scope: undefined })), /needs a scope/);
});

test("a metadata tool without a scope fails", () => {
  assert.throws(() => validateMcpTools(withTool({ class: "metadata", scope: undefined })), /needs a scope/);
});

test("a personal tool that sends fails (ADR 0210)", () => {
  assert.throws(() => validateMcpTools(withTool({ surface: "personal", writes: "send" })), /never sends/);
});

test("a public tool with content fails", () => {
  assert.throws(() => validateMcpTools(withTool({ surface: "public", class: "content" })), /public tool/);
});

test("a duplicate name fails", () => {
  assert.throws(() => validateMcpTools(withTool({ name: "read_chat" })), /duplicate/);
});

test("a tool without pt fails", () => {
  assert.throws(() => validateMcpTools(withTool({ pt: undefined })), /pt must be/);
});

test("the personal surface has draft_message and no send", () => {
  const personal = reg.mcpTools.tools.filter((t) => t.surface === "personal");
  assert.ok(personal.some((t) => t.name === "draft_message" && t.writes === "draft"));
  assert.ok(personal.every((t) => t.writes !== "send"));
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
