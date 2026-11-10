// The sources of the signed lists (docs/signed-lists.md "Signing"): registries/operators.json, registries/issuers.json
// and registries/list-signers.json. Issuer schemes, regions and the keys of issuer bipe come from their own registries,
// so each fact has one source (ADR 0031).
import { createPublicKey } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { verifySignedList } from "./signed-lists.mjs";

const read = (root, path) => JSON.parse(readFileSync(join(root, path), "utf8"));
const LIST_TYPES = ["operators", "issuers"];

export const rawPublic = (privateKey) => createPublicKey(privateKey).export({ format: "jwk" }).x;
export const readSigners = (root) => {
  const { threshold, keys } = read(root, "registries/list-signers.json");
  return { threshold, keys };
};

export function buildListPayload(root, typ, common) {
  const head = { typ, version: common.version, issued: common.issued, expires: common.expires, prev: common.prev };
  if (typ === "operators") {
    const { region, regions, appeal_keys, operators } = read(root, "registries/operators.json");
    return { ...head, region, regions, appeal_keys, operators };
  }
  const { issuers } = read(root, "registries/issuers.json");
  const badgeKeys = read(root, "registries/badge-keys.json").keys;
  const payload = {
    ...head,
    schemes: read(root, "registries/schemes.json").schemes,
    regions: read(root, "registries/regions.json").regions.map((r) => ({ id: r.id, servers: r.servers, schemes: r.schemes })),
    issuers: issuers.map((i) => (i.id === "bipe" ? { ...i, keys: badgeKeys } : i)),
  };
  refuseTestOnly(payload);
  return payload;
}

/**
 * A signed list is what release builds trust, so nothing test-only may enter it (bipe-chat/bipe#1195): no `test-only-*`
 * kid and no scheme or region of the test-only region zz. Fails closed when a source has one.
 */
export function refuseTestOnly(payload) {
  for (const s of payload.schemes ?? []) if (s.id.startsWith("zz.") || s.country === "ZZ") throw new Error(`issuers: test-only scheme ${s.id}`);
  for (const r of payload.regions ?? []) if (r.id === "zz") throw new Error("issuers: test-only region zz");
  for (const i of payload.issuers ?? []) {
    for (const kid of Object.keys(i.keys ?? {})) if (kid.startsWith("test-only-")) throw new Error(`issuers: ${i.id} has test-only key ${kid}`);
    for (const id of i.schemes ?? []) if (id.startsWith("zz.")) throw new Error(`issuers: ${i.id} has test-only scheme ${id}`);
  }
}

const versions = (root, typ) => {
  const dir = join(root, "signed", typ);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => /^[1-9][0-9]*\.json$/.test(f)).map((f) => Number(f.slice(0, -5))).sort((a, b) => a - b);
};
export const signedEnvelope = (root, typ, version) => read(root, `signed/${typ}/${version}.json`);
export function newestSigned(root, typ) {
  const version = versions(root, typ).at(-1);
  return version ? { version, envelope: signedEnvelope(root, typ, version) } : null;
}
export function writeSigned(root, typ, version, envelope) {
  mkdirSync(join(root, "signed", typ), { recursive: true });
  const path = join("signed", typ, `${version}.json`);
  writeFileSync(join(root, path), JSON.stringify(envelope, null, 2) + "\n");
  return path;
}

/** Fails closed: every committed version passes the verification order and the chain, and the newest matches its sources. */
export function checkSignedLists(root) {
  const signers = readSigners(root);
  // Before tools/sign-list.mjs init: no signer key and no signed list. A signer key with no list fails below.
  if (Object.keys(signers.keys).length === 0 && LIST_TYPES.every((typ) => versions(root, typ).length === 0)) return;
  if (Object.keys(signers.keys).some((kid) => !kid.startsWith("list-"))) throw new Error("list-signers: a kid must start with list-");
  for (const typ of LIST_TYPES) {
    let stored = null;
    const all = versions(root, typ);
    if (all.length === 0) throw new Error(`signed/${typ}: no signed list`);
    for (const version of all) {
      const envelope = signedEnvelope(root, typ, version);
      const now = JSON.parse(Buffer.from(envelope.payload, "base64url").toString("utf8")).issued;
      const checked = verifySignedList(envelope, { typ, signerSet: signers, now, stored });
      if (checked.error) throw new Error(`signed/${typ}/${version}.json: ${checked.error}`);
      if (checked.payload.version !== version) throw new Error(`signed/${typ}/${version}.json: payload has version ${checked.payload.version}`);
      if (version === all.at(-1)) {
        const { version: v, issued, expires, prev } = checked.payload;
        const want = JSON.stringify(buildListPayload(root, typ, { version: v, issued, expires, prev }));
        if (want !== Buffer.from(checked.bytes).toString("utf8")) throw new Error(`signed/${typ}/${version}.json does not match its sources: sign a new version`);
      }
      stored = { version, payload: envelope.payload };
    }
  }
}
