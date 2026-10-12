// Checks the hand-written API clients against api/openapi.yaml (ADR 0031, rule 3).
// Usage: node tools/check-contract.mjs [--ios <ProseioKit sources>] [--android <libraries/proseio sources>]
// Fails (exit 1) when a schema field or enum value is missing in a client, or when the contract has a
// schema this file does not map. Node built-ins only; the YAML reader handles the style of openapi.yaml.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const argPath = (flag, fallback) => resolve(args.includes(flag) ? args[args.indexOf(flag) + 1] : join(root, fallback));
const iosDir = argPath("--ios", "../proseio-ios/Components/ProseioKit/Sources/ProseioKit");
const androidDir = argPath("--android", "../proseio-android/libraries/proseio/src/main/kotlin");

// Contract schema -> client type per platform. null: the platform has no such type (see gaps).
const MODELS = {
  SignupRequest: { ios: "ProseioSignupRequest", android: "ProseioSignupRequest" },
  Attestation: { ios: "ProseioAttestation", android: null },
  SignupResponse: { ios: "ProseioSignupResponse", android: "ProseioSignupResponse" },
  InvitePreview: { ios: "ProseioInvitePreview", android: "ProseioInvitePreview" },
  Invite: { ios: "ProseioInvite", android: "ProseioInvite" },
  MyInvites: { ios: "ProseioMyInvites", android: "ProseioMyInvites" },
  CreatedInvite: { ios: "ProseioCreatedInvite", android: "ProseioCreatedInvite" },
  HandleAvailability: { ios: "ProseioHandleAvailability", android: "ProseioHandleAvailability" },
  HandleRecord: { ios: "ProseioHandleRecord", android: "ProseioHandleRecord" },
  MyHandle: { ios: "ProseioMyHandle", android: "ProseioMyHandle" },
};

// Contract enum -> client enum per platform. "Error.error" is the enum on the error property of Error.
const ENUMS = {
  InviteStatus: { ios: "ProseioInviteStatus", android: "ProseioInviteStatus" },
  HandleProblem: { ios: "ProseioHandleProblem", android: "ProseioHandleProblem" },
  "Error.error": { ios: "ProseioAPIErrorCode", android: "ProseioApiErrorCode" },
};

// Schemas the apps do not model, with the reason.
const NOT_IN_APPS = {
  DiscoverySettings: "one boolean; iOS sends it from a private request type in ProseioAPIClient",
  MessagingSetting: "one enum field; iOS decodes it in a private MessagingSetting type in ProseioAPIClient, exposed as ProseioWhoCanMessage",
  ExperimentEvent: "web only (headline test)",
  WaitlistRequest: "web only",
  Error: "clients read error and reason into their error type; the enum is checked as Error.error",
  BadgeEnvelope: "verified on device by BadgeVerifier; covered by test-vectors/badges.json",
  PixChallenge: "Pix verification is not built in the apps yet",
  VerificationStatus: "Pix verification is not built in the apps yet",
};

// Known gaps: "<platform>:<Schema>" or "<platform>:<Schema>.<field>" -> issue. Remove the entry when the gap closes.
const GAPS = {
  "android:Attestation": "proseio/proseio#92 (Play Integrity)",
  "android:SignupRequest.attestation": "proseio/proseio#92 (Play Integrity)",
};

// --- openapi.yaml: schema names, property names, enums ----------------------

function readSchemas(text) {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => l === "  schemas:");
  if (start < 0) throw new Error("openapi.yaml: no components.schemas");
  const schemas = {};
  let current = null;
  let inProperties = false;
  let lastProperty = null;
  const list = (s) => s.split(",").map((x) => x.trim()).filter(Boolean);
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line) || /^ {2}\S/.test(line)) break; // left components.schemas
    let m;
    if ((m = /^ {4}([A-Za-z0-9]+):\s*$/.exec(line))) {
      current = schemas[m[1]] = { properties: [], enum: null, propertyEnums: {} };
      inProperties = false;
    } else if (current && /^ {6}properties:\s*$/.test(line)) {
      inProperties = true;
    } else if (current && (m = /^ {6}enum:\s*\[(.*)\]\s*$/.exec(line))) {
      current.enum = list(m[1]);
    } else if (current && /^ {6}\S/.test(line)) {
      inProperties = false;
    } else if (current && inProperties && (m = /^ {8}([a-z_][a-z0-9_]*):/.exec(line))) {
      current.properties.push(m[1]);
      lastProperty = m[1];
      const e = /enum:\s*\[([^\]]*)\]/.exec(line);
      if (e) current.propertyEnums[m[1]] = list(e[1]);
    } else if (current && inProperties && lastProperty && (m = /^ {10}enum:\s*\[(.*)\]\s*$/.exec(line))) {
      // A property written as a nested block (e.g. Error.error).
      current.propertyEnums[lastProperty] = list(m[1]);
    }
  }
  return schemas;
}

// --- Client sources ----------------------------------------------------------

function sources(dir, ext) {
  if (!existsSync(dir)) throw new Error(`missing ${dir}`);
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith(ext)) out.push(readFileSync(p, "utf8"));
    }
  };
  walk(dir);
  return out.join("\n");
}

/** The body of `struct|class|enum <name>` up to the first line that closes it at column 0. */
function block(text, keyword, name) {
  const m = new RegExp(`^[^\\n]*\\b${keyword} ${name}\\b[^\\n]*$`, "m").exec(text);
  if (!m) return null;
  const rest = text.slice(m.index);
  const end = rest.search(/\n[})]/);
  return end < 0 ? rest : rest.slice(0, end + 2);
}

const camel = (snake) => snake.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());

const PLATFORMS = {
  ios: {
    text: sources(iosDir, ".swift"),
    // Swift decodes with convertFromSnakeCase: user_id is the property userId.
    fields(text, type) {
      const body = block(text, "struct", type);
      return body && new Set([...body.matchAll(/^\s*(?:public |private |internal )?let (\w+)\s*:/gm)].map((x) => x[1]));
    },
    hasField: (set, field) => set.has(camel(field)),
    enumValues(text, type) {
      const body = block(text, "enum", type);
      if (!body) return null;
      // `case a = "x"`, `case b`, `case c, d, e`: the raw value, else the case name.
      const values = new Set();
      for (const [, list] of body.matchAll(/^\s*case\s+([^\n(]+)$/gm)) {
        for (const item of list.split(",")) {
          const m = /^\s*`?(\w+)`?(?:\s*=\s*"([^"]*)")?\s*$/.exec(item);
          if (m) values.add(m[2] ?? m[1]);
        }
      }
      return values;
    },
  },
  android: {
    text: sources(androidDir, ".kt"),
    // Kotlin names every wire field with @SerialName.
    fields(text, type) {
      const body = block(text, "class", type);
      return body && new Set([...body.matchAll(/@SerialName\("([^"]+)"\)/g)].map((x) => x[1]));
    },
    hasField: (set, field) => set.has(field),
    enumValues(text, type) {
      const body = block(text, "enum class", type);
      return body && new Set([...body.matchAll(/^\s*[A-Z_]+\("([^"]+)"\)/gm)].map((x) => x[1]));
    },
  },
};

// --- Check ---------------------------------------------------------------------

const schemas = readSchemas(readFileSync(join(root, "api/openapi.yaml"), "utf8"));
const problems = [];
const gapsUsed = new Set();
const gap = (key) => (GAPS[key] ? (gapsUsed.add(key), true) : false);

for (const name of Object.keys(schemas)) {
  const isEnumOnly = schemas[name].enum && schemas[name].properties.length === 0;
  if (!MODELS[name] && !NOT_IN_APPS[name] && !(isEnumOnly && ENUMS[name])) {
    problems.push(`contract schema ${name} is not mapped: add it to MODELS, ENUMS or NOT_IN_APPS in tools/check-contract.mjs`);
  }
}

for (const [schema, types] of Object.entries(MODELS)) {
  const spec = schemas[schema];
  if (!spec) { problems.push(`MODELS.${schema}: not in the contract any more`); continue; }
  for (const [platform, type] of Object.entries(types)) {
    const p = PLATFORMS[platform];
    if (type === null) { if (!gap(`${platform}:${schema}`)) problems.push(`${platform}: no type for ${schema}`); continue; }
    const fields = p.fields(p.text, type);
    if (!fields) { problems.push(`${platform}: type ${type} (for ${schema}) not found`); continue; }
    for (const field of spec.properties) {
      if (!p.hasField(fields, field) && !gap(`${platform}:${schema}.${field}`)) problems.push(`${platform}: ${type} has no field for ${schema}.${field}`);
    }
  }
}

for (const [ref, types] of Object.entries(ENUMS)) {
  const [schema, prop] = ref.split(".");
  const values = prop ? schemas[schema]?.propertyEnums[prop] : schemas[schema]?.enum;
  if (!values) { problems.push(`ENUMS.${ref}: no enum in the contract`); continue; }
  for (const [platform, type] of Object.entries(types)) {
    const p = PLATFORMS[platform];
    const have = p.enumValues(p.text, type);
    if (!have) { problems.push(`${platform}: enum ${type} (for ${ref}) not found`); continue; }
    for (const v of values) if (!have.has(v) && !gap(`${platform}:${ref}.${v}`)) problems.push(`${platform}: ${type} has no case for ${ref} "${v}"`);
  }
}

for (const key of Object.keys(GAPS)) if (!gapsUsed.has(key)) problems.push(`GAPS["${key}"] is closed: remove it`);

if (problems.length) {
  console.error(`contract check failed (${problems.length}):\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log(`contract check ok: ${Object.keys(MODELS).length} models, ${Object.keys(ENUMS).length} enums, ${Object.keys(GAPS).length} known gaps`);
