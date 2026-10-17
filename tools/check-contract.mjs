// Checks the hand-written API clients against api/openapi.yaml (ADR 0031, rule 3).
// Usage: node tools/check-contract.mjs [--ios <BipeKit sources>] [--android <libraries/bipe sources>]
// Fails (exit 1) when a schema field or enum value is missing in a client, or when the contract has a
// schema this file does not map. Node built-ins only; the YAML reader handles the style of openapi.yaml.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadBusinessSchemas, generateApiTypes } from "./lib/api-types.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const argPath = (flag, fallback) => resolve(args.includes(flag) ? args[args.indexOf(flag) + 1] : join(root, fallback));
const iosDir = argPath("--ios", "../bipe-ios/Components/BipeKit/Sources/BipeKit");
const androidDir = argPath("--android", "../bipe-android/libraries/bipe/src/main/kotlin");

// Contract schema -> client type per platform. null: the platform has no such type (see gaps).
const MODELS = {
  SignupRequest: { ios: "BipeSignupRequest", android: "BipeSignupRequest" },
  Attestation: { ios: "BipeAttestation", android: null },
  SignupResponse: { ios: "BipeSignupResponse", android: "BipeSignupResponse" },
  SignupConfig: { ios: "BipeSignupConfig", android: "BipeSignupConfig" },
  InvitePreview: { ios: "BipeInvitePreview", android: "BipeInvitePreview" },
  Invite: { ios: "BipeInvite", android: "BipeInvite" },
  MyInvites: { ios: "BipeMyInvites", android: "BipeMyInvites" },
  CreatedInvite: { ios: "BipeCreatedInvite", android: "BipeCreatedInvite" },
  HandleAvailability: { ios: "BipeHandleAvailability", android: "BipeHandleAvailability" },
  HandleRecord: { ios: "BipeHandleRecord", android: "BipeHandleRecord" },
  MyHandle: { ios: "BipeMyHandle", android: "BipeMyHandle" },
  PublicProfile: { ios: "BipePublicProfile", android: "BipePublicProfile" },
  MyProfile: { ios: "BipeMyProfile", android: "BipeMyProfile" },
  ProfileUpdate: { ios: "BipeProfileUpdate", android: "BipeProfileUpdate" },
  // Device-first accounts (ADR 0057): iOS done in bipe-chat/bipe#153, Android in #154.
  AccountStatus: { ios: "BipeAccountStatus", android: "BipeAccountStatus" },
  Recovery: { ios: "BipeRecovery", android: "BipeRecovery" },
  Credentials: { ios: "BipeCredentials", android: "BipeCredentials" },
  RecoveryStarted: { ios: "BipeRecoveryStarted", android: "BipeRecoveryStarted" },
  RecoveryClaim: { ios: "BipeRecoveryClaim", android: "BipeRecoveryClaim" },
  // Handle change history (ADR 0066): the timeline line is bipe-chat/bipe#166, built with #153 (iOS) and #154 (Android).
  HandleChange: { ios: "BipeHandleChange", android: "BipeHandleChange" },
};

// Contract enum -> client enum per platform. "Error.error" is the enum on the error property of Error.
// null: the platform has no such enum yet (see gaps).
const ENUMS = {
  InviteStatus: { ios: "BipeInviteStatus", android: "BipeInviteStatus" },
  HandleProblem: { ios: "BipeHandleProblem", android: "BipeHandleProblem" },
  ProfileProblem: { ios: "BipeProfileProblem", android: "BipeProfileProblem" },
  "Error.error": { ios: "BipeAPIErrorCode", android: "BipeApiErrorCode" },
  PinProblem: { ios: "BipePinProblem", android: "BipePinProblem" },
};

// Schemas the apps do not model, with the reason.
const NOT_IN_APPS = {
  ...Object.fromEntries([
    "BusinessToolError", "EmptyBusinessRequest", "PixChargeLink",
    "Queue", "QueueJoin", "QueuePlace", "QueuePlaceStatus", "QueuePolicy", "QueuePosition", "QueueWaitRange", "OwnerQueuePlace",
    "Quote", "QuoteAccept", "QuoteDecline", "QuoteLine", "QuoteLineInput", "QuoteRequest", "QuoteVersion", "QuoteVersionInput",
    "Order", "OrderInput", "OrderLine", "OrderLineInput", "OrderPolicy", "OrderRefusal", "OrderRefuseReason", "OrderStatus", "OwnerOrderInput",
  ].map((name) => [name, "contract first (bipe#332/#336/#340); app clients follow in bipe#334/#335, #338/#339 and #342/#343"])),
  ...Object.fromEntries([
    "CatalogPrice", "CatalogItemInput", "CatalogItem", "Catalog", "CatalogOrder",
  ].map((name) => [name, "contract first (bipe#327); app clients follow in bipe#329 and bipe#330"])),
  ...Object.fromEntries([
    "Service", "ServiceInput", "AgendaInput", "Agenda", "Availability", "AvailabilityRules", "TimeRange",
    "OverrideInput", "Override", "AgendaBlock", "AgendaCloseDay", "Policy", "AgendaSettings", "AgendaActivation", "AgendaState",
    "BookingStatus", "BookingCustomer", "Booking", "BookingHold", "OwnerBooking", "BookingMove", "Slot", "SlotDay", "SlotDays",
    "AgendaFeedOptions", "AgendaFeed", "BusyImportInput", "BusyImport", "AgendaError",
  ].map((name) => [name, "contract first (bipe#315); app clients follow in bipe#321 to bipe#324"])),
  DiscoverySettings: "one boolean; iOS sends it from a private request type in BipeAPIClient",
  MessagingSetting: "one enum field; iOS decodes it in a private MessagingSetting type in BipeAPIClient, exposed as BipeWhoCanMessage",
  TermsAcceptance: "one string; the apps send it from a private request type in their API client (ADR 0113)",
  ExperimentEvent: "web only (headline test)",
  WaitlistRequest: "web only",
  PartnerRequest: "web only",
  InviterStats: "staff page on the site only (ADR 0056)",
  GrowthReport: "staff page on the site only (ADR 0098)",
  StaffSummary: "staff page on the site only (bipe#394)",
  ExperimentsReport: "staff page on the site only (bipe#368)",
  WaitlistReport: "staff page on the site only (bipe#368)",
  BusinessReport: "staff page on the site only (bipe#368)",
  UserReports: "staff page on the site only (bipe#368)",
  RetentionReport: "staff page on the site only (bipe#368)",
  VisitCount: "staff page on the site only (ADR 0098)",
  VisitReport: "staff page on the site only (ADR 0098)",
  Error: "clients read error and reason into their error type; the enum is checked as Error.error",
  BadgeEnvelope: "verified on device by BadgeVerifier; covered by test-vectors/badges.json",
  BadgeGone: "a 410 means no seal; the apps fetch badges in the seal work (bipe-chat/bipe#252)",
  PixChallenge: "Pix verification is not built in the apps yet",
  BusinessClaim: "CNPJ verification runs on the web console first; app UI is bipe-chat/bipe#115",
  CnpjRegistryRecord: "CNPJ verification runs on the web console first; app UI is bipe-chat/bipe#115",
  BusinessDomain: "CNPJ verification runs on the web console first; app UI is bipe-chat/bipe#115",
  VerificationStatus: "Pix verification is not built in the apps yet",
};

// Known gaps: "<platform>:<Schema>" or "<platform>:<Schema>.<field>" -> issue. Remove the entry when the gap closes.
const GAPS = {
  "android:Attestation": "bipe-chat/bipe#92 (Play Integrity)",
  "android:SignupRequest.attestation": "bipe-chat/bipe#92 (Play Integrity)",
  "ios:Error.error.cnpj_invalid": "bipe-chat/bipe#115 (business UI in the apps)",
  "ios:Error.error.cnpj_not_active": "bipe-chat/bipe#115 (business UI in the apps)",
  "ios:Error.error.cnpj_taken": "bipe-chat/bipe#115 (business UI in the apps)",
  "ios:Error.error.signature_invalid": "bipe-chat/bipe#115 (business UI in the apps)",
  "android:Error.error.cnpj_invalid": "bipe-chat/bipe#115 (business UI in the apps)",
  "android:Error.error.cnpj_not_active": "bipe-chat/bipe#115 (business UI in the apps)",
  "android:Error.error.cnpj_taken": "bipe-chat/bipe#115 (business UI in the apps)",
  "android:Error.error.signature_invalid": "bipe-chat/bipe#115 (business UI in the apps)",
};

// Device-first accounts (ADR 0057, ADR 0059): contract first, apps in bipe-chat/bipe#153 (iOS) and #154 (Android).
// iOS closed these gaps (bipe-chat/bipe#153), Android too (#154). The list stays for a platform that adds the feature later.
const DEVICE_FIRST_ISSUE = {};
const DEVICE_FIRST_GAPS = [
  "AccountStatus", "Recovery", "Credentials", "RecoveryStarted", "RecoveryClaim", "PinProblem",
  "SignupRequest.pin", "SignupRequest.lang", "SignupResponse.password", "SignupResponse.recovery_token",
  ...["pin_weak", "pin_wrong", "pin_blocked", "pin_not_set", "recovery_invalid", "email_unavailable"].map((e) => `Error.error.${e}`),
];
for (const [platform, issue] of Object.entries(DEVICE_FIRST_ISSUE)) for (const g of DEVICE_FIRST_GAPS) GAPS[`${platform}:${g}`] = issue;

// Handle changes in chats (ADR 0066): contract first, the timeline line in the apps follows.
// iOS closed this gap (bipe-chat/bipe#166, with #153), Android too (with #154). The list stays for a platform that adds the feature later.
const HANDLE_CHANGE_ISSUE = {};
const HANDLE_CHANGE_GAPS = ["HandleChange"];
for (const [platform, issue] of Object.entries(HANDLE_CHANGE_ISSUE)) for (const g of HANDLE_CHANGE_GAPS) GAPS[`${platform}:${g}`] = issue;

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

const contract = readFileSync(join(root, "api/openapi.yaml"), "utf8");
const schemas = readSchemas(contract);
const problems = [];
const businessSchemas = loadBusinessSchemas(root);
generateApiTypes(businessSchemas);
for (const name of Object.keys(businessSchemas)) {
  if (!contract.includes(`    ${name}:\n      $ref: "./business-schemas.json#/$defs/${name}"`)) {
    problems.push(`business schema ${name} is not referenced by openapi.yaml`);
  }
}
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
    if (type === null) { if (!gap(`${platform}:${ref}`)) problems.push(`${platform}: no enum for ${ref}`); continue; }
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
