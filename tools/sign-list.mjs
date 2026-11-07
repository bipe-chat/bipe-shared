// Makes the signer and report keys and signs a list (docs/signed-lists.md "Signing"). Runs on mini4p: the private keys
// stay in its Keychain and never reach a repo, a log or another machine.
//   node tools/sign-list.mjs init               makes any missing key, writes the public keys into registries/
//   node tools/sign-list.mjs sign <typ> [days]  writes signed/<typ>/<next version>.json (default 14 days)
import { execFileSync, spawnSync } from "node:child_process";
import { createPrivateKey, randomBytes, sign } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deriveKeyPair } from "./lib/reports.mjs";
import { buildListPayload, newestSigned, rawPublic, readSigners, writeSigned } from "./lib/list-sources.mjs";
import { listHash, verifySignedList } from "./lib/signed-lists.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ACCOUNT = "bipe";
const KEYS = { signer: "bipe-list-signer", report: "bipe-report-operator", appeal: "bipe-report-appeal" };

const seedOf = (service) => {
  try {
    return Buffer.from(execFileSync("security", ["find-generic-password", "-s", service, "-a", ACCOUNT, "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(), "base64url");
  } catch {
    return null;
  }
};
const ed25519 = (seed) => createPrivateKey({ key: Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), seed]), format: "der", type: "pkcs8" });

const [command, typ, days = "14"] = process.argv.slice(2);
if (command === "init") {
  for (const service of Object.values(KEYS)) {
    if (seedOf(service)) continue;
    // security -i reads the value on stdin, so the key is never in a process list or in the text of an error.
    const added = spawnSync("security", ["-i"], { input: `add-generic-password -a ${ACCOUNT} -s ${service} -w "${randomBytes(32).toString("base64url")}"\n`, stdio: ["pipe", "ignore", "ignore"] });
    if (added.status !== 0) throw new Error(`security could not add ${service}: is the Keychain locked?`);
    if (!seedOf(service)) throw new Error(`could not read ${service} back from the Keychain`);
  }
  const x25519 = (service) => Buffer.from(deriveKeyPair(seedOf(service)).pk).toString("base64url");
  const month = new Date().toISOString().slice(0, 7);
  const edit = (name, change) => {
    const path = join(root, "registries", name);
    const data = JSON.parse(readFileSync(path, "utf8"));
    change(data);
    writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
  };
  edit("list-signers.json", (d) => { if (!Object.keys(d.keys).length) d.keys = { [`list-${month}`]: rawPublic(ed25519(seedOf(KEYS.signer))) }; });
  edit("operators.json", (d) => {
    if (!Object.keys(d.appeal_keys).length) d.appeal_keys = { [`appeal-${month}`]: x25519(KEYS.appeal) };
    const own = d.operators.find((o) => o.server_name === "bipe.net.br");
    if (!Object.keys(own.report_keys).length) own.report_keys = { [`report-bipe-${month}`]: x25519(KEYS.report) };
  });
} else if (command === "sign" && (typ === "operators" || typ === "issuers")) {
  const seed = seedOf(KEYS.signer);
  if (!seed) throw new Error("no signer key: run init");
  const key = ed25519(seed);
  const signers = readSigners(root);
  const kid = Object.entries(signers.keys).find(([, pub]) => pub === rawPublic(key))?.[0];
  if (!kid) throw new Error("the Keychain key is not in registries/list-signers.json");
  const last = newestSigned(root, typ);
  const lastBytes = last ? Buffer.from(last.envelope.payload, "base64url") : null;
  const issued = Math.floor(Date.now() / 1000);
  const payload = buildListPayload(root, typ, { version: (last?.version ?? 0) + 1, issued, expires: issued + Number(days) * 86400, prev: lastBytes ? listHash(lastBytes) : null });
  const bytes = Buffer.from(JSON.stringify(payload), "utf8");
  const envelope = { v: 1, payload: bytes.toString("base64url"), sigs: [{ kid, sig: sign(null, bytes, key).toString("base64url") }] };
  const checked = verifySignedList(envelope, { typ, signerSet: signers, now: issued, stored: last ? { version: last.version, payload: last.envelope.payload } : null });
  if (checked.error) throw new Error(`the new list fails its own check: ${checked.error}`);
  console.log(writeSigned(root, typ, payload.version, envelope));
} else {
  throw new Error("usage: sign-list.mjs init | sign <operators|issuers> [days]");
}
