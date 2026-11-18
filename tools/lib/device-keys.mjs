// Device key and one-time password (ADR 0283, bipe#1351). Reference for bipe-api src/device-keys.ts and the apps.
import { createPublicKey, verify } from "node:crypto";

export const PASSWORD_ONCE_TAG = "bipe-password-once:v1";

/** The bytes the device key signs: tag, user ID, device ID and challenge, joined by "\n", UTF-8, no final newline. */
export function passwordOnceMessage(userId, deviceId, challenge) {
  return Buffer.from(`${PASSWORD_ONCE_TAG}\n${userId}\n${deviceId}\n${challenge}`, "utf8");
}

/** The fixed DER header that turns a 65-byte uncompressed P-256 point (iOS SecKey x963) into SubjectPublicKeyInfo. */
export const P256_SPKI_PREFIX = Buffer.from("3059301306072a8648ce3d020106082a8648ce3d030107034200", "hex");

export function spkiFromX963(x963) {
  if (x963.length !== 65 || x963[0] !== 0x04) throw new Error("not an uncompressed P-256 point");
  return Buffer.concat([P256_SPKI_PREFIX, x963]);
}

/** ECDSA P-256 SHA-256 over the message; the signature is DER, base64. */
export function passwordOnceValid(publicKeySpkiBase64, userId, deviceId, challenge, signatureBase64) {
  try {
    const key = createPublicKey({ key: Buffer.from(publicKeySpkiBase64, "base64"), format: "der", type: "spki" });
    if (key.asymmetricKeyDetails?.namedCurve !== "prime256v1") return false;
    return verify("sha256", passwordOnceMessage(userId, deviceId, challenge), { key, dsaEncoding: "der" }, Buffer.from(signatureBase64, "base64"));
  } catch {
    return false;
  }
}
