// Screen specs for Bipe's own client (bipe-chat/bipe#546, ADR 0143, ADR 0145).
// One JSON file per screen in product/screens/. iOS (SwiftUI) and Android (Compose) in bipe-app
// implement the same id, state, actions and strings. product/screens/README.md describes the format.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const SCALARS = ["string", "int", "bool", "date", "url"];
const ID = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const NAME = /^[a-z][a-zA-Z0-9]*$/;
const KEYS = ["id", "title", "flow", "summary", "state", "actions", "strings", "sdk", "parity", "notes"];
const FIELD_KEYS = ["type", "description", "optional", "values", "of"];
const ACTION_KEYS = ["params", "effect"];

export function loadScreens(root) {
  const dir = join(root, "product/screens");
  return readdirSync(dir).filter((file) => file.endsWith(".json")).sort()
    .map((file) => ({ file, spec: JSON.parse(readFileSync(join(dir, file), "utf8")) }));
}

// A type is a scalar, "enum" with values, "list" with an element type in `of`, or the name of a shared type.
function checkType(where, field, types, problems) {
  const { type } = field;
  if (SCALARS.includes(type)) return;
  if (type === "enum") {
    if (!Array.isArray(field.values) || field.values.length < 2 || field.values.some((v) => !NAME.test(v))) problems.push(`${where}: enum needs two or more camelCase values`);
    return;
  }
  if (type === "list") {
    if (!field.of || typeof field.of !== "object") { problems.push(`${where}: list needs "of"`); return; }
    checkType(`${where}.of`, field.of, types, problems);
    return;
  }
  if (!types.has(type)) problems.push(`${where}: unknown type "${type}"`);
}

function checkFields(where, fields, types, problems) {
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) { problems.push(`${where}: must be an object of named fields`); return; }
  for (const [name, field] of Object.entries(fields)) {
    const at = `${where}.${name}`;
    if (!NAME.test(name)) problems.push(`${at}: name must be camelCase`);
    if (!field || typeof field !== "object") { problems.push(`${at}: must be an object`); continue; }
    for (const key of Object.keys(field)) if (!FIELD_KEYS.includes(key)) problems.push(`${at}: unknown key "${key}"`);
    if (typeof field.description !== "string" || !field.description) problems.push(`${at}: description required`);
    if (field.optional !== undefined && typeof field.optional !== "boolean") problems.push(`${at}: optional must be true or false`);
    checkType(at, field, types, problems);
  }
}

// specs: [{ file, spec }]. strings: the key → text map of strings/en.json. parityIds: Set of product/parity.json ids.
// Returns a list of problems; empty means valid.
export function validateScreens(specs, { strings, stringsPt, parityIds }) {
  const problems = [];
  const types = new Set();
  const ids = new Set();
  for (const { spec } of specs) {
    for (const name of Object.keys(spec.types ?? {})) types.add(name);
  }
  for (const { file, spec } of specs) {
    const where = file;
    for (const key of Object.keys(spec)) if (![...KEYS, "types"].includes(key)) problems.push(`${where}: unknown key "${key}"`);
    if (!ID.test(spec.id ?? "")) problems.push(`${where}: id must be kebab-case`);
    else if (`${spec.id}.json` !== file) problems.push(`${where}: file name must be ${spec.id}.json`);
    if (ids.has(spec.id)) problems.push(`${where}: duplicate id ${spec.id}`);
    ids.add(spec.id);
    for (const key of ["title", "flow", "summary"]) if (typeof spec[key] !== "string" || !spec[key]) problems.push(`${where}: ${key} required`);
    for (const [name, fields] of Object.entries(spec.types ?? {})) {
      if (!/^[A-Z][a-zA-Z0-9]*$/.test(name)) problems.push(`${where}: type ${name} must be PascalCase`);
      checkFields(`${where} types.${name}`, fields, types, problems);
    }
    checkFields(`${where} state`, spec.state, types, problems);
    if (!spec.actions || typeof spec.actions !== "object") problems.push(`${where}: actions required`);
    for (const [name, action] of Object.entries(spec.actions ?? {})) {
      const at = `${where} actions.${name}`;
      if (!NAME.test(name)) problems.push(`${at}: name must be camelCase`);
      for (const key of Object.keys(action ?? {})) if (!ACTION_KEYS.includes(key)) problems.push(`${at}: unknown key "${key}"`);
      if (typeof action?.effect !== "string" || !action.effect) problems.push(`${at}: effect required`);
      if (action?.params) checkFields(`${at}.params`, action.params, types, problems);
    }
    if (!Array.isArray(spec.strings)) problems.push(`${where}: strings must be a list of keys`);
    for (const key of spec.strings ?? []) {
      if (!(key in strings)) problems.push(`${where}: string ${key} is not in strings/en.json`);
      if (stringsPt && !(key in stringsPt)) problems.push(`${where}: string ${key} is not in strings/pt-BR.json`);
    }
    if (!Array.isArray(spec.sdk) || spec.sdk.some((s) => typeof s !== "string" || !s)) problems.push(`${where}: sdk must be a list of matrix-sdk-ffi API names`);
    if (!Array.isArray(spec.parity)) problems.push(`${where}: parity must be a list of product/parity.json ids`);
    for (const id of spec.parity ?? []) if (!parityIds.has(id)) problems.push(`${where}: parity id ${id} is not in product/parity.json`);
    if (spec.notes !== undefined && (!Array.isArray(spec.notes) || spec.notes.some((n) => typeof n !== "string"))) problems.push(`${where}: notes must be a list of strings`);
  }
  return problems;
}

export function checkScreens(root) {
  const strings = JSON.parse(readFileSync(join(root, "strings/en.json"), "utf8")).strings;
  const stringsPt = JSON.parse(readFileSync(join(root, "strings/pt-BR.json"), "utf8")).strings;
  const parity = JSON.parse(readFileSync(join(root, "product/parity.json"), "utf8"));
  const parityIds = new Set(parity.items.map((item) => item.id));
  return validateScreens(loadScreens(root), { strings, stringsPt, parityIds });
}
