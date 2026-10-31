// Sealed reports (docs/report-envelope.md, bipe-chat/bipe#697): the vectors open with the reference code.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { loadRegistries } from "./lib/registries.mjs";
import { deriveKeyPair, envelopeError, generateKeyPair, open, openReport, sealReport, verifyMedia } from "./lib/reports.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const reg = loadRegistries(root);
const vectors = JSON.parse(readFileSync(join(root, "test-vectors/reports.json"), "utf8"));
const H = (h) => Buffer.from(h, "hex");

test("HPKE matches the RFC 9180 vector", () => {
  const v = vectors.rfc9180;
  const r = deriveKeyPair(H(v.ikmR));
  assert.equal(r.pk.toString("hex"), v.pkR);
  assert.equal(open(r.sk, H(v.enc), H(v.info), H(v.aad), H(v.ct)).toString("hex"), v.pt);
});

test("sealed report vectors", () => {
  for (const c of vectors.sealed) {
    const got = openReport(c.sealed, H(vectors.keys[c.recipient].sk), reg.reportCategories);
    assert.equal(got.error ?? "valid", c.expect, c.name);
    if (c.expect === "valid") assert.deepEqual({ envelope: got.envelope, body: got.body }, { envelope: c.envelope, body: c.body }, c.name);
  }
});

test("envelope vectors", () => {
  for (const c of vectors.envelopes) assert.equal(envelopeError(c.envelope, reg.reportCategories) ?? "valid", c.expect, c.name);
});

test("media vectors", () => {
  for (const c of vectors.media) {
    const got = verifyMedia(c.media, Buffer.from(c.ciphertext, "base64"));
    assert.equal(got.error ?? "valid", c.expect, c.name);
    if (c.plaintext) assert.equal(got.plaintext.toString("base64"), c.plaintext);
  }
});

test("a fresh key seals and opens, and each report gets its own ephemeral key", () => {
  const recipient = generateKeyPair();
  const envelope = vectors.sealed[0].envelope;
  const body = { events: vectors.sealed[0].body.events.slice(0, 1) };
  const a = sealReport(envelope, body, recipient.pk);
  const b = sealReport(envelope, body, recipient.pk);
  assert.notEqual(a.enc, b.enc);
  assert.deepEqual(openReport(a, recipient.sk, reg.reportCategories).body, body);
});

test("the appeal info does not open an operator report", () => {
  const c = vectors.sealed[0];
  const sealed = { ...c.sealed, envelope: Buffer.from(JSON.stringify({ ...c.envelope, to: "associacao" })).toString("base64url") };
  assert.equal(openReport(sealed, H(vectors.keys[c.recipient].sk), reg.reportCategories).error, "cannot_open");
});

test("the operator list vectors carry the report and appeal keys", () => {
  const lists = JSON.parse(readFileSync(join(root, "test-vectors/signed-lists.json"), "utf8"));
  const valid = lists.vectors.find((c) => c.name === "operators: valid");
  const payload = JSON.parse(Buffer.from(valid.envelope.payload, "base64url").toString("utf8"));
  assert.equal(payload.appeal_keys["test-only-appeal"], vectors.keys["test-only-appeal"].pk);
  assert.equal(payload.operators[0].report_keys["test-only-report-bipe"], vectors.keys["test-only-report-bipe"].pk);
});
