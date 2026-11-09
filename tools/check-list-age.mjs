// Fails when a signed list is overdue (docs/signed-lists.md "Signing", bipe-chat/bipe#1242): main has no version signed
// in the last 8 days, or the core serves a list that expires within 5 days, or the core is behind main. The daily
// workflow .github/workflows/list-age.yml runs it from GitHub, so it also reports a mini4p that is off.
//   node tools/check-list-age.mjs [--api https://api.bipe.net.br]
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { listAgeProblems } from "./lib/list-age.mjs";
import { newestSigned } from "./lib/list-sources.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const api = args.includes("--api") ? args[args.indexOf("--api") + 1] : "https://api.bipe.net.br";
const payloadOf = (envelope) => JSON.parse(Buffer.from(envelope.payload, "base64url").toString("utf8"));

const newest = {};
const served = {};
for (const typ of ["operators", "issuers"]) {
  const signed = newestSigned(root, typ);
  if (signed) newest[typ] = { version: signed.version, issued: payloadOf(signed.envelope).issued };
  try {
    const response = await fetch(`${api}/v1/${typ}`, { signal: AbortSignal.timeout(20_000) });
    served[typ] = response.ok ? (({ version, expires }) => ({ version, expires }))(payloadOf(await response.json())) : null;
  } catch (e) {
    console.log(`::warning::${api}/v1/${typ}: ${e.message}`);
    served[typ] = null;
  }
}
const problems = listAgeProblems({ newest, served, now: Math.floor(Date.now() / 1000) });
for (const p of problems) console.log(`::error::${p}`);
console.log(problems.length ? `${problems.length} problem(s)` : `signed lists ok: ${JSON.stringify({ newest, served })}`);
process.exit(problems.length ? 1 : 0);
