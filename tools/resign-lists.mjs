// The re-sign job (docs/signed-lists.md "Signing", bipe-chat/bipe#1242). scripts/resign-lists.sh runs it every day on
// mini4p, in a clean clone at origin/main, in mz's GUI session: only there can tools/sign-list.mjs read the signer key
// from the login Keychain (ADR 0276).
//   1. Publish: send each version on main that the core does not serve yet to POST /v1/{typ}, oldest first.
//   2. Sign: when a list on main is 7 days old (3 hours early, so a daily run at a fixed time signs on day 7), sign the
//      next version of each such list, push lists/resign-<date> and open a pull request with auto-merge. While a
//      pull request of an earlier run is open, sign nothing: prev comes from the newest version, so two open versions
//      would race.
// Each step logs one line. The daily workflow list-age.yml alerts when this job stops working.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { newestSigned } from "./lib/list-sources.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const API = process.env.BIPE_LIST_API ?? "https://api.bipe.net.br";
const REPO = "bipe-chat/bipe-shared";
const TYPES = ["operators", "issuers"];
const RESIGN_AFTER = 7 * 86400 - 3 * 3600;
const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();
const log = (line) => console.log(`${new Date().toISOString()} ${line}`);
const issuedOf = (envelope) => JSON.parse(Buffer.from(envelope.payload, "base64url").toString("utf8")).issued;

async function servedVersion(typ) {
  const response = await fetch(`${API}/v1/${typ}`, { signal: AbortSignal.timeout(20_000) });
  if (response.status === 404) return 0;
  if (!response.ok) throw new Error(`GET /v1/${typ}: HTTP ${response.status}`);
  return JSON.parse(Buffer.from((await response.json()).payload, "base64url").toString("utf8")).version;
}

let failed = false;
for (const typ of TYPES) {
  try {
    const newest = newestSigned(root, typ);
    if (!newest) continue;
    for (let version = (await servedVersion(typ)) + 1; version <= newest.version; version++) {
      // The file text exactly as committed: the core stores and serves these bytes.
      const text = readFileSync(join(root, "signed", typ, `${version}.json`), "utf8");
      const response = await fetch(`${API}/v1/${typ}`, { method: "POST", headers: { "content-type": "application/json" }, body: text, signal: AbortSignal.timeout(20_000) });
      log(`publish ${typ} ${version}: HTTP ${response.status} ${(await response.text()).slice(0, 200)}`);
    }
  } catch (e) {
    failed = true;
    log(`publish ${typ}: ${e.message}`);
  }
}

const open = JSON.parse(run("gh", ["pr", "list", "--repo", REPO, "--state", "open", "--json", "number,headRefName"]))
  .filter((pr) => pr.headRefName.startsWith("lists/resign-"));
const now = Math.floor(Date.now() / 1000);
const due = TYPES.filter((typ) => {
  const newest = newestSigned(root, typ);
  return !newest || now - issuedOf(newest.envelope) >= RESIGN_AFTER;
});
if (open.length) {
  log(`sign: waiting for ${open.map((pr) => `#${pr.number}`).join(", ")}`);
} else if (!due.length) {
  log("sign: no list is due");
} else {
  const branch = `lists/resign-${new Date().toISOString().slice(0, 10)}`;
  run("git", ["checkout", "-q", "-B", branch]);
  const files = due.map((typ) => run("node", ["tools/sign-list.mjs", "sign", typ]));
  run("git", ["add", ...files]);
  const title = `Signed lists: ${files.map((f) => f.replace(/^signed\//, "").replace(/\.json$/, "")).join(", ")}`;
  run("git", ["commit", "-q", "-s", "-m", `${title}\n\nThe weekly re-sign job on mini4p (scripts/resign-lists.sh, bipe-chat/bipe#1242).`]);
  run("git", ["push", "-q", "-f", "origin", `HEAD:refs/heads/${branch}`]);
  const body = [
    `The weekly re-sign job on mini4p signed ${files.map((f) => `\`${f}\``).join(" and ")} (docs/signed-lists.md "Signing").`,
    "",
    "After the merge, the job's next run sends each new version to `POST /v1/{typ}` on the core.",
    "",
    "Provenance: tools/sign-list.mjs from the registries on main.",
    "Part of bipe-chat/bipe#645",
  ].join("\n");
  const url = run("gh", ["pr", "create", "--repo", REPO, "--base", "main", "--head", branch, "--title", title, "--body", body]);
  run("gh", ["pr", "merge", url, "--auto", "--squash"]);
  log(`sign: ${files.join(", ")} in ${url}`);
}
process.exit(failed ? 1 : 0);
