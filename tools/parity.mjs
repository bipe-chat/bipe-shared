// Parity ledger (ADR 0092): product/parity.json holds each capability's status on iOS, Android,
// the web (bipe-web) and the server (bipe-api, bipe-infra), and the deliberate differences between
// the apps. This tool checks the ledger, writes the "Differences" tables in both BIPE.md files and
// prints the gap report.
// The ledger is the one status per feature: bipe-web and gen-product-doc.mjs read it, product.json has none.
// The new surfaces ios-new and android-new (Bipe's own client in bipe-app, bipe#579) and the switch
// scope live in tools/lib/parity-new.mjs.
// Usage: node tools/parity.mjs [--against worktree|head] [--repos <dir>] [--write] [--issues] [--report]
//   (default) check: schema, evidence paths, gap issues, product.json features, BIPE.md tables. Exit 1 on a problem.
//   --issues: also fail when the issue a gap names is closed or does not exist (M2 exit test). Needs `gh`.
//   --write: write the "Differences" tables into bipe-ios/BIPE.md and bipe-android/BIPE.md, then check.
//   --report: print the gap report (Markdown) to stdout. Reads issue state with `gh` when it is installed.
//   --against, --repos: as in check-drift.mjs. head reads each repo's committed HEAD (CI).
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { NEW_SURFACES, checkNewSurfaces, inSwitchScope, switchGaps } from "./lib/parity-new.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const option = (flag, fallback) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : fallback);
const against = option("--against", "worktree");
if (!["worktree", "head"].includes(against)) throw new Error(`--against must be worktree or head, not ${against}`);
const reposDir = resolve(option("--repos", join(root, "..")));
const write = args.includes("--write");
const report = args.includes("--report");
const checkIssues = args.includes("--issues");
if (write && against === "head") throw new Error("--write needs --against worktree");

const SURFACES = { ios: ["bipe-ios"], android: ["bipe-android"], web: ["bipe-web"], server: ["bipe-api", "bipe-infra"] };
const LABEL = { ios: "iOS", android: "Android", web: "Web", server: "Server" };
const STATUSES = ["planned", "built", "testing", "policy", "n/a"];
const SHIPPED = new Set(["built", "testing"]);
const KINDS = ["idiom", "gap", "undecided"];
const APPS = { ios: { repo: "bipe-ios", other: "android" }, android: { repo: "bipe-android", other: "ios" } };
const START = "<!-- parity:differences (generated from bipe-shared/product/parity.json by tools/parity.mjs --write; do not edit) -->";
const END = "<!-- /parity:differences -->";

const repoPath = (repo) => (repo === "bipe-shared" ? root : join(reposDir, repo));
function readRepo(repo, path) {
  if (against === "worktree") {
    const p = join(repoPath(repo), path);
    return existsSync(p) ? readFileSync(p, "utf8") : null;
  }
  try {
    return execFileSync("git", ["-C", repoPath(repo), "show", `HEAD:${path}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}
function existsInRepo(repo, path) {
  if (against === "worktree") return existsSync(join(repoPath(repo), path));
  try {
    execFileSync("git", ["-C", repoPath(repo), "cat-file", "-e", `HEAD:${path.replace(/\/$/, "")}`], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const problems = [];
const warnings = [];
const ledger = JSON.parse(readRepo("bipe-shared", "product/parity.json") ?? "null");
if (!ledger) throw new Error("product/parity.json not found");
const product = JSON.parse(readRepo("bipe-shared", "product/product.json"));

// A surface entry is a status string (planned, policy) or { status, evidence?, reason?, note? }.
const entry = (item, s) => (typeof item[s] === "string" ? { status: item[s] } : item[s]);

// 1. Schema, evidence and gaps.
if (ledger.version !== 1) problems.push("parity.json: version must be 1");
const ids = new Set();
const missingRepos = new Set();
for (const item of ledger.items ?? []) {
  const where = `item ${item.id}`;
  if (!/^[a-z0-9-]+$/.test(item.id ?? "") || ids.has(item.id)) problems.push(`${where}: id must be unique kebab-case`);
  ids.add(item.id);
  if (!item.name) problems.push(`${where}: name`);
  if (item.issue !== undefined && !Number.isInteger(item.issue)) problems.push(`${where}: issue must be an issue number`);
  for (const s of Object.keys(SURFACES)) {
    const e = entry(item, s);
    if (!e || !STATUSES.includes(e.status)) { problems.push(`${where}: ${s} status must be one of ${STATUSES.join(", ")}`); continue; }
    if (e.status === "n/a" && !e.reason) problems.push(`${where}: ${s} is n/a without a reason`);
    if (SHIPPED.has(e.status)) {
      if (!e.evidence?.length) problems.push(`${where}: ${s} is ${e.status} without evidence`);
      for (const path of e.evidence ?? []) {
        const repo = SURFACES[s].find((r) => path.startsWith(`${r}/`));
        if (!repo) { problems.push(`${where}: ${s} evidence ${path} must start with ${SURFACES[s].join(" or ")}/`); continue; }
        if (!existsSync(repoPath(repo))) { missingRepos.add(repo); continue; }
        if (!existsInRepo(repo, path.slice(repo.length + 1))) problems.push(`${where}: ${s} evidence ${path} does not exist (against ${against})`);
      }
    } else if (e.evidence) problems.push(`${where}: ${s} is ${e.status}, evidence only goes with built or testing`);
  }
  // Rule 3: iOS and Android differ, so an open issue must close the gap.
  const ios = entry(item, "ios")?.status;
  const android = entry(item, "android")?.status;
  if (ios !== android && item.issue === undefined) problems.push(`${where}: iOS is ${ios}, Android is ${android}, and no issue closes the gap`);
}
// 1b. The new surfaces and the switch scope (bipe#579).
const newCheck = checkNewSurfaces(ledger.items, (repo, path) => (existsSync(repoPath(repo)) ? existsInRepo(repo, path) : null));
problems.push(...newCheck.problems);
for (const repo of newCheck.unchecked) missingRepos.add(repo);
for (const repo of missingRepos) warnings.push(`${repo}: not found in ${reposDir}, its evidence was not checked`);

const areas = new Set();
for (const d of ledger.differences ?? []) {
  const where = `difference "${d.area}"`;
  if (!d.area || areas.has(d.area)) problems.push(`${where}: area must be unique`);
  areas.add(d.area);
  if (typeof d.ios !== "string" || typeof d.android !== "string" || !d.reason) problems.push(`${where}: ios, android and reason`);
  if (!KINDS.includes(d.kind)) problems.push(`${where}: kind must be one of ${KINDS.join(", ")}`);
  if (d.kind !== "idiom" && !Number.isInteger(d.issue)) problems.push(`${where}: a ${d.kind} names the issue that ${d.kind === "gap" ? "closes" : "decides"} it`);
}

// 2. Every product.json feature has its status here, under the same id (bipe#300). product.json has no status.
for (const f of product.features) {
  if (!ids.has(f.id)) problems.push(`product.json feature ${f.id} has no item in parity.json`);
  if (f.status !== undefined) problems.push(`product.json feature ${f.id}: status lives in parity.json, remove it from product.json`);
}

// 2b. A gap row names an open issue (M2 exit test, docs/MILESTONES.md). A closed issue closes no gap.
// Only the own client's gaps count (ios-new / android-new). The forks are frozen (ADR 0155): their
// iOS/Android gaps and differences stay recorded, but their issues may be closed.
const gapRows = [...newCheck.issueRefs];
if (checkIssues) {
  const numbers = [...new Set(gapRows.map((r) => r.issue).filter(Number.isInteger))];
  const state = new Map();
  for (const n of numbers) {
    try {
      state.set(n, execFileSync("gh", ["issue", "view", String(n), "-R", "bipe-chat/bipe", "--json", "state", "--jq", ".state"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim());
    } catch (e) {
      // Fail closed: an issue that gh cannot read does not count as open.
      state.set(n, /Could not resolve|not found/i.test(String(e.stderr)) ? "MISSING" : "UNREADABLE");
    }
  }
  for (const r of gapRows) {
    const s = state.get(r.issue);
    if (s === "CLOSED") problems.push(`${r.what}: gap names #${r.issue}, which is closed (name the open issue that closes the gap, or close the gap)`);
    else if (s === "MISSING") problems.push(`${r.what}: gap names #${r.issue}, which does not exist on bipe-chat/bipe`);
    else if (s === "UNREADABLE") problems.push(`${r.what}: gh cannot read #${r.issue} (is gh installed and signed in, with issue read access on bipe-chat/bipe?)`);
  }
}

// 3. The "Differences" tables in both BIPE.md files.
const cell = (t) => t.replaceAll("|", "\\|");
function differencesTable(app) {
  const other = APPS[app].other;
  const mark = { idiom: "", gap: " **Gap**", undecided: " **Undecided**" };
  const rows = ledger.differences.map((d) => `| ${cell(d.area)} | ${cell(d[app])} | ${cell(d[other])} | ${cell(d.reason)}${mark[d.kind]} |`);
  return [START, "", `| Area | ${LABEL[app]} | ${LABEL[other]} | Reason |`, "|---|---|---|---|", ...rows, "", END].join("\n");
}
for (const app of Object.keys(APPS)) {
  const repo = APPS[app].repo;
  if (!existsSync(repoPath(repo))) { warnings.push(`${repo}: not found, BIPE.md not checked`); continue; }
  const text = readRepo(repo, "BIPE.md");
  const start = text?.indexOf(START) ?? -1;
  const end = text?.indexOf(END) ?? -1;
  if (start < 0 || end < start) { problems.push(`${repo}/BIPE.md: no ${START.slice(0, 26)} markers`); continue; }
  const next = text.slice(0, start) + differencesTable(app) + text.slice(end + END.length);
  if (next === text) continue;
  if (write) { writeFileSync(join(repoPath(repo), "BIPE.md"), next); console.log(`wrote ${repo}/BIPE.md`); }
  else problems.push(`${repo}/BIPE.md: Differences table is out of date (run node tools/parity.mjs --write)`);
}

for (const w of warnings) console.warn(`warning: ${w}`);
if (problems.length) {
  console.error(`parity check failed (${problems.length}, against ${against}):\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
if (!report) {
  console.log(`parity check ok (${ledger.items.length} items, ${ledger.differences.length} differences, ${gapRows.length} gap rows${checkIssues ? " with open issues" : ""}, against ${against})`);
  process.exit(0);
}

// 4. Report.
// Since when each item has had its current status on every surface: walk the ledger's git history.
function sinceDates() {
  const since = {};
  let log = "";
  try { log = execFileSync("git", ["-C", root, "log", "--format=%H %cs", "--", "product/parity.json"], { encoding: "utf8" }); } catch { return since; }
  const key = (item) => Object.keys(SURFACES).map((s) => entry(item, s)?.status).join("/");
  const open = new Map(ledger.items.map((i) => [i.id, key(i)]));
  for (const line of log.split("\n").filter(Boolean)) {
    const [hash, date] = line.split(" ");
    let old;
    try { old = JSON.parse(execFileSync("git", ["-C", root, "show", `${hash}:product/parity.json`], { encoding: "utf8" })); } catch { break; }
    for (const [id, k] of open) {
      const item = old.items?.find((i) => i.id === id);
      if (item && key(item) === k) since[id] = date;
      else open.delete(id);
    }
    if (!open.size) break;
  }
  return since;
}

// Issue state and platform boxes (ADR 0092 rule 7), through the gh CLI. Skipped without gh.
function issues(numbers) {
  const out = new Map();
  for (const n of numbers) {
    try {
      const json = execFileSync("gh", ["issue", "view", String(n), "-R", "bipe-chat/bipe", "--json", "number,title,state,body"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      const issue = JSON.parse(json);
      issue.boxes = {};
      // A surface box that says "not for this platform" is n/a and is not compared.
      for (const m of issue.body.matchAll(/^\s*- \[([ xX])\] \**(iOS|Android|Web|Server)\b(.*)$/gm)) {
        const s = m[2].toLowerCase();
        if (/not for this platform/i.test(m[3])) { issue.boxes[s] ??= null; continue; }
        issue.boxes[s] = (issue.boxes[s] ?? true) && m[1] !== " ";
      }
      out.set(n, issue);
    } catch {
      return null;
    }
  }
  return out;
}

const since = sinceDates();
const today = new Date().toISOString().slice(0, 10);
const days = (date) => (date ? Math.round((Date.parse(today) - Date.parse(date)) / 86400000) : null);
const status = (item, s) => entry(item, s).status;
const shipped = (item, s) => SHIPPED.has(status(item, s));
const ref = (n) => (n ? `#${n}` : "");
const age = (item) => (since[item.id] ? `${since[item.id]} (${days(since[item.id])} d)` : "");
const row = (item) => `| ${item.name} | ${Object.keys(SURFACES).map((s) => status(item, s)).join(" | ")} | ${ref(item.issue)} | ${age(item)} |`;
const head = ["| Item | iOS | Android | Web | Server | Issue | Since |", "|---|---|---|---|---|---|---|"];

const codeGaps = ledger.items.filter((i) => shipped(i, "ios") !== shipped(i, "android"));
const releaseGaps = ledger.items.filter((i) => shipped(i, "ios") && shipped(i, "android") && status(i, "ios") !== status(i, "android"));
const incomplete = ledger.items.filter((i) => !codeGaps.includes(i) && (shipped(i, "ios") || shipped(i, "android")) && ["web", "server"].some((s) => status(i, s) === "planned"));
const openDiffs = ledger.differences.filter((d) => d.kind !== "idiom");
const issueNumbers = [...new Set([...ledger.items.map((i) => i.issue), ...openDiffs.map((d) => d.issue)].filter(Boolean))].sort((a, b) => a - b);
const fetched = issues(issueNumbers);

const lines = [`# Platform parity report (${today})`, ""];
lines.push(`Generated by \`node tools/parity.mjs --report\` in bipe-shared from \`product/parity.json\` (ADR 0092). Do not edit this issue by hand: change the ledger.`, "");
const count = (s, st) => ledger.items.filter((i) => status(i, s) === st).length;
lines.push("| Surface | testing | built | planned | n/a | policy |", "|---|---|---|---|---|---|");
for (const s of Object.keys(SURFACES)) lines.push(`| ${LABEL[s]} | ${["testing", "built", "planned", "n/a", "policy"].map((st) => count(s, st)).join(" | ")} |`);
for (const [s, surface] of Object.entries(NEW_SURFACES)) lines.push(`| ${surface.label} | ${["testing", "built", "planned", "n/a", "policy"].map((st) => count(s, st)).join(" | ")} |`);
lines.push("");
lines.push(`## Code gaps: one app has it, the other does not (${codeGaps.length})`, "");
lines.push(...(codeGaps.length ? [...head, ...codeGaps.map(row)] : ["None."]), "");
lines.push(`## Release gaps: both apps have the code, only one is in a tester build (${releaseGaps.length})`, "");
lines.push(...(releaseGaps.length ? [...head, ...releaseGaps.map(row)] : ["None."]), "");
lines.push(`## Incomplete: an app has it, the web or server part is still planned (${incomplete.length})`, "");
lines.push(...(incomplete.length ? [...head, ...incomplete.map(row)] : ["None."]), "");
lines.push(`## Open differences between the apps (${openDiffs.length})`, "");
lines.push(...(openDiffs.length ? ["| Area | iOS | Android | Kind | Issue |", "|---|---|---|---|---|", ...openDiffs.map((d) => `| ${cell(d.area)} | ${cell(d.ios)} | ${cell(d.android)} | ${d.kind} | ${ref(d.issue)} |`)] : ["None."]), "");

// The switch (bipe#579): items built or testing on an original app that a new app does not ship yet.
// Only merged bipe-app code with evidence counts; specs, draft PRs and branches do not.
const scope = ledger.items.filter(inSwitchScope);
const gaps = switchGaps(ledger.items);
const newRef = (item, s) => {
  const e = entry(item, s);
  return SHIPPED.has(e.status) || e.status === "n/a" ? e.status : `${e.status}${e.issue ? ` (#${e.issue})` : ""}`;
};
lines.push(`## Switch to the own client: ${scope.length - gaps.length} of ${scope.length} shipped items covered on both new apps`, "");
lines.push("Items built or testing on an original app that iOS (new) or Android (new) does not ship yet. Only merged bipe-app code with evidence counts.", "");
lines.push(...(gaps.length ? ["| Item | iOS | Android | iOS (new) | Android (new) |", "|---|---|---|---|---|", ...gaps.map(({ item }) => `| ${item.name} | ${status(item, "ios")} | ${status(item, "android")} | ${newRef(item, "ios-new")} | ${newRef(item, "android-new")} |`)] : ["None."]), "");

lines.push("## Issues that disagree with the ledger", "");
if (!fetched) lines.push("Not checked: `gh` is not installed or not signed in.", "");
else {
  const notes = [];
  for (const item of ledger.items.filter((i) => i.issue)) {
    const issue = fetched.get(item.issue);
    const gap = codeGaps.includes(item) || releaseGaps.includes(item);
    if (issue.state === "CLOSED" && gap) notes.push(`- ${item.name}: #${item.issue} is closed, but the gap is still open`);
    for (const s of Object.keys(SURFACES)) {
      const box = issue.boxes[s];
      if (box === undefined || box === null) continue;
      if (box && !shipped(item, s) && status(item, s) !== "n/a") notes.push(`- ${item.name}: ${LABEL[s]} box is ticked on #${item.issue}, the ledger says ${status(item, s)}`);
      if (!box && shipped(item, s)) notes.push(`- ${item.name}: the ledger says ${LABEL[s]} ${status(item, s)}, the box on #${item.issue} is not ticked`);
    }
  }
  const noBoxes = [...fetched.values()].filter((i) => i.state === "OPEN" && !Object.keys(i.boxes).length).map((i) => `#${i.number}`);
  if (noBoxes.length) notes.push(`- No iOS, Android, Web or Server boxes (ADR 0092 rule 7): ${noBoxes.join(", ")}`);
  for (const d of openDiffs) if (fetched.get(d.issue)?.state === "CLOSED") notes.push(`- Difference "${d.area}": #${d.issue} is closed, but the ${d.kind} is still listed`);
  lines.push(...(notes.length ? notes : ["None."]), "");
}
console.log(lines.join("\n"));
