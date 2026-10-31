// Account move between operators (bipe docs/federated-operators.md "Account move between operators", bipe-chat/bipe#631,
// bipe-chat/bipe#693). Reference code for the move statement (signed by the old and the new master key, Matrix
// canonical JSON) and the moved statement (signed by the badge key, badge envelope). docs/move-statements.md.
import { createPublicKey, sign, verify } from "node:crypto";

export const MOVE_TYPE = "chat.bipe.move";
export const MOVED_TYP = "moved";
const MOVE_KEYS = new Set(["type", "v", "old_user_id", "new_user_id", "new_master_key", "ts", "signatures", "unsigned"]);
const USER_ID = /^@[^:\s]+:[a-z0-9.-]+(:[0-9]{1,5})?$/;
const UNPADDED_B64 = /^[A-Za-z0-9+/]+$/;
const ED25519_SPKI = Buffer.from("302a300506032b6570032100", "hex");

/**
 * Matrix canonical JSON (client-server API, appendix "Canonical JSON"): keys sorted by code point, no
 * insignificant whitespace, UTF-8, integers only. Throws on a float or a number outside the safe range.
 */
export function canonicalJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new Error("canonical JSON allows integers in the safe range only");
    return String(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const keys = Object.keys(value).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(",")}}`;
  }
  throw new Error(`canonical JSON: unsupported ${typeof value}`);
}

const unpadded = (buf) => Buffer.from(buf).toString("base64").replace(/=+$/, "");
const fromUnpadded = (s) => Buffer.from(s, "base64");
/** Matrix unpadded base64 of a raw Ed25519 public key, from a Node private or public key. */
export const matrixKey = (key) => unpadded(createPublicKey(key).export({ format: "der", type: "spki" }).subarray(12));

/** The bytes a Matrix signature covers: canonical JSON without `signatures` and `unsigned`. */
export function signedBytes(object) {
  const { signatures, unsigned, ...rest } = object;
  return Buffer.from(canonicalJson(rest), "utf8");
}

/** Adds an Ed25519 signature by `userId` with `privateKey`, key ID `ed25519:<public key>` (cross-signing form). */
export function signAs(object, userId, privateKey) {
  const sig = unpadded(sign(null, signedBytes(object), privateKey));
  const keyId = `ed25519:${matrixKey(privateKey)}`;
  return { ...object, signatures: { ...object.signatures, [userId]: { ...object.signatures?.[userId], [keyId]: sig } } };
}

function signatureValid(object, userId, publicKeyB64) {
  const sig = object.signatures?.[userId]?.[`ed25519:${publicKeyB64}`];
  if (typeof sig !== "string" || !UNPADDED_B64.test(sig) || !UNPADDED_B64.test(publicKeyB64)) return false;
  const raw = fromUnpadded(publicKeyB64);
  if (raw.length !== 32) return false;
  try {
    const key = createPublicKey({ key: Buffer.concat([ED25519_SPKI, raw]), format: "der", type: "spki" });
    return verify(null, signedBytes(object), key, fromUnpadded(sig));
  } catch {
    return false;
  }
}

/**
 * Checks a move statement. `pinned` holds the master keys the core pinned: { old, new } (Matrix unpadded base64).
 * Returns null when it is valid, else the error id (docs/move-statements.md, "Check").
 */
export function moveError(statement, pinned) {
  const s = statement;
  if (!s || typeof s !== "object" || Array.isArray(s)) return "malformed";
  if (s.type !== MOVE_TYPE) return "malformed";
  if (s.v !== 1) return "unsupported_version";
  if (Object.keys(s).some((k) => !MOVE_KEYS.has(k))) return "malformed";
  if (!USER_ID.test(s.old_user_id ?? "") || !USER_ID.test(s.new_user_id ?? "")) return "malformed";
  if (s.old_user_id === s.new_user_id) return "same_account";
  if (typeof s.new_master_key !== "string" || !UNPADDED_B64.test(s.new_master_key) || fromUnpadded(s.new_master_key).length !== 32) return "malformed";
  if (!Number.isSafeInteger(s.ts) || s.ts <= 0) return "malformed";
  if (!s.signatures || typeof s.signatures !== "object") return "malformed";
  if (s.new_master_key !== pinned.new) return "new_key_not_pinned";
  if (!signatureValid(s, s.old_user_id, pinned.old)) return "invalid_old_signature";
  if (!signatureValid(s, s.new_user_id, s.new_master_key)) return "invalid_new_signature";
  return null;
}

const b64url = (buf) => Buffer.from(buf).toString("base64url");

/** Signs a moved statement as a badge envelope (docs/badge-attestation.md). */
export function movedEnvelope(payload, kid, privateKey) {
  const bytes = Buffer.from(JSON.stringify(payload), "utf8");
  return { v: 1, kid, payload: b64url(bytes), sig: b64url(sign(null, bytes, privateKey)) };
}

/**
 * Checks a moved statement for the old Matrix ID `subject`. `keys` is registries/badge-keys.json `keys` (kid to
 * base64url public key). Returns { payload } or { error }.
 */
export function checkMoved(envelope, subject, keys) {
  if (!envelope || envelope.v !== 1) return { error: "unsupported_version" };
  const pub = keys[envelope.kid];
  if (!pub) return { error: "unknown_kid" };
  let bytes;
  try {
    bytes = Buffer.from(envelope.payload, "base64url");
    const key = createPublicKey({ key: Buffer.concat([ED25519_SPKI, Buffer.from(pub, "base64url")]), format: "der", type: "spki" });
    if (!verify(null, bytes, key, Buffer.from(envelope.sig, "base64url"))) return { error: "invalid_signature" };
  } catch {
    return { error: "invalid_signature" };
  }
  let p;
  try {
    p = JSON.parse(bytes.toString("utf8"));
  } catch {
    return { error: "malformed" };
  }
  if (p.typ !== MOVED_TYP || !USER_ID.test(p.sub ?? "") || !USER_ID.test(p.new ?? "") || p.sub === p.new) return { error: "malformed" };
  if (!Number.isSafeInteger(p.moved) || !Number.isSafeInteger(p.iat) || p.moved <= 0 || p.iat < p.moved) return { error: "malformed" };
  if (p.sub !== subject) return { error: "wrong_subject" };
  return { payload: p };
}

/** Whether a message from the old Matrix ID came after the move (the app warns on it): origin_server_ts in ms. */
export const sentAfterMove = (originServerTs, moved) => originServerTs >= moved * 1000;
