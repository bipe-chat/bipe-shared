import assert from "node:assert/strict";
import { test } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { generateApiTypes, loadBusinessSchemas, schemaType } from "./lib/api-types.mjs";

const schemas = loadBusinessSchemas(join(dirname(fileURLToPath(import.meta.url)), ".."));

test("service types retain catalogue fields and require scheduling fields", () => {
  const service = schemaType(schemas.Service);
  assert.match(service, /^CatalogItem & Required<Pick<CatalogItem,/);
  for (const field of ["duration_minutes", "buffer_before_minutes", "buffer_after_minutes", "agenda_ids"]) assert.ok(service.includes(JSON.stringify(field)));
  assert.match(service, /"kind"\?: "service"/);
});

test("item requests exclude server-owned identifiers and photo URLs", () => {
  const input = schemaType(schemas.CatalogItemInput);
  assert.doesNotMatch(input, /"id"|"photo"/);
  assert.match(input, /"name": string/);
  assert.match(input, /"description"\?: string/);
});

test("customer identity remains a union of ID or name", () => {
  assert.equal(schemaType(schemas.BookingCustomer), '({ "user_id": string } | { "name": string })');
});

test("composition, nullable values and arrays retain their types", () => {
  assert.equal(schemaType({ type: ["string", "null"] }), "(string | null)");
  assert.equal(schemaType({ type: "array", items: { enum: ["held", "confirmed"] } }), 'Array<("held" | "confirmed")>');
  assert.equal(schemaType({ allOf: [{ $ref: "#/$defs/Agenda" }, { type: "object", properties: { active: { const: true } }, required: ["active"] }] }), 'Agenda & { "active": true }');
  assert.throws(() => schemaType({ type: "array" }), /needs items/);
  assert.throws(() => schemaType({ type: "date" }), /unsupported/);
  assert.throws(() => schemaType({ $ref: "https://example.com/schema" }), /unsupported/);
});

test("every business definition generates a named export", () => {
  const output = generateApiTypes(schemas);
  for (const name of Object.keys(schemas)) assert.ok(output.includes(`export type ${name} = `));
  assert.doesNotMatch(output.replace(/\/\*[\s\S]*?\*\//g, ""), /\bany\b/);
});
