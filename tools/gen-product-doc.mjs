// Writes proseio/docs/product.md from product/product.json and product/distribution.json.
// Usage: node tools/gen-product-doc.mjs [--out <file>]
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const outIndex = args.indexOf("--out");
const out = resolve(outIndex >= 0 ? args[outIndex + 1] : join(root, "../proseio/docs/product.md"));

const product = JSON.parse(readFileSync(join(root, "product/product.json"), "utf8"));
const dist = JSON.parse(readFileSync(join(root, "product/distribution.json"), "utf8"));

const STATUSES = ["testing", "built", "planned", "policy"];
const fail = (m) => { throw new Error(`product validation failed: ${m}`); };
if (product.version !== 1 || dist.version !== 1) fail("version must be 1");
const ht = product.headlineTest;
if (!/^[a-z0-9-]{1,32}$/.test(ht.experiment)) fail("headlineTest.experiment");
// Arm ids are h1 to h9 (the API accepts /^h[0-9]$/, h0 is the control). A retired id is never reused.
const retired = new Set((ht.retired ?? []).map((a) => a.id));
const armIds = new Set();
for (const a of ht.arms) {
  if (!/^h[1-9]$/.test(a.id) || armIds.has(a.id) || retired.has(a.id) || !a.pt || !a.en) fail(`headlineTest arm ${a.id}`);
  armIds.add(a.id);
}
const featureIds = new Set(product.features.map((f) => f.id));
const areaIds = new Set(product.areas.map((a) => a.id));
for (const f of product.features) {
  if (!areaIds.has(f.area)) fail(`feature ${f.id}: unknown area ${f.area}`);
  for (const p of ["ios", "android"]) if (!STATUSES.includes(f.status[p])) fail(`feature ${f.id}: status.${p}`);
  for (const l of ["pt", "en"]) if (!f[l]?.name || !f[l]?.body) fail(`feature ${f.id}: ${l} copy`);
}
const tentpoleIds = new Set(product.tentpoles.map((t) => t.id));
const sided = new Set();
for (const s of product.sides) {
  for (const id of s.tentpoles) { if (!tentpoleIds.has(id) || sided.has(id)) fail(`side ${s.id}: tentpole ${id}`); sided.add(id); }
  for (const id of s.areas) if (!areaIds.has(id)) fail(`side ${s.id}: unknown area ${id}`);
  for (const l of ["pt", "en"]) if (!s[l]?.name || !s[l]?.line) fail(`side ${s.id}: ${l} copy`);
}
for (const t of product.tentpoles) {
  if (!STATUSES.includes(t.status)) fail(`tentpole ${t.id}: status`);
  for (const id of t.features) if (!featureIds.has(id)) fail(`tentpole ${t.id}: unknown feature ${id}`);
}
if (!dist.source?.org?.startsWith("https://github.com/proseio")) fail("source.org");
for (const r of dist.source.repos) {
  if (!r.url?.startsWith(dist.source.org + "/")) fail(`source ${r.id}: url must be in ${dist.source.org}`);
  if (typeof r.public !== "boolean") fail(`source ${r.id}: public must be true or false`);
  if (!r.pt || !r.en) fail(`source ${r.id}: pt and en labels`);
}
// Comparison register (product/compare.json, proseio/docs/vs-whatsapp.md): every Bipe claim names the
// features that carry its status; every competitor cell belongs to a known threat.
const cmp = JSON.parse(readFileSync(join(root, "product/compare.json"), "utf8"));
if (cmp.version !== 1 || !/^\d{4}-\d{2}-\d{2}$/.test(cmp.date)) fail("compare: version or date");
for (const l of ["pt", "en"]) for (const k of ["nav", "title", "lede", "bipe", "appsTitle", "more", "aheadTitle", "limitTitle", "limit", "sourcesTitle", "sourcesNote"]) if (!cmp[l]?.[k]) fail(`compare.${l}.${k}`);
const threatIds = new Set();
for (const t of cmp.threats) {
  if (threatIds.has(t.id) || !t.features.length) fail(`compare threat ${t.id}`);
  threatIds.add(t.id);
  for (const id of t.features) if (!featureIds.has(id)) fail(`compare threat ${t.id}: unknown feature ${id}`);
  for (const l of ["pt", "en"]) if (!t[l]?.threat || !t[l]?.bipe) fail(`compare threat ${t.id}: ${l} copy`);
}
const slugs = new Set();
for (const a of cmp.apps) {
  if (!/^[a-z0-9-]+$/.test(a.slug) || slugs.has(a.slug) || !a.name) fail(`compare app ${a.id}: slug or name`);
  slugs.add(a.slug);
  for (const l of ["pt", "en"]) for (const k of ["title", "lede", "line", "on"]) if (!a[l]?.[k]) fail(`compare app ${a.id}: ${l}.${k}`);
  if (a.pt.ahead.length !== a.en.ahead.length) fail(`compare app ${a.id}: ahead pt and en differ`);
  for (const [id, cell] of Object.entries(a.cells)) if (!threatIds.has(id) || !cell.pt || !cell.en) fail(`compare app ${a.id}: cell ${id}`);
  if (!a.sources.length) fail(`compare app ${a.id}: no sources`);
  for (const s of a.sources) if (!s.name || !s.url?.startsWith("https://")) fail(`compare app ${a.id}: source`);
}
const cmpText = JSON.stringify(cmp, (k, v) => (k === "$comment" ? undefined : v));
if (/[–—]/.test(cmpText)) fail("compare: rendered copy must not contain em or en dashes");
if (/n[ãa]o ach(ou|amos)|found nothing/i.test(cmpText)) fail("compare: state what an app does, never what we did not find");
const text = JSON.stringify(product) + JSON.stringify(dist);
if (/[–—]/.test(text)) fail("rendered copy must not contain em or en dashes");

const label = { testing: "TestFlight", built: "Built", planned: "Planned", policy: "Policy" };
const lines = [
  "# Product: what Bipe is and does",
  "",
  "Generated by `proseio-shared/tools/gen-product-doc.mjs` from `proseio-shared/product/`. Do not edit here: change the JSON and run the generator. The website (proseio-web) renders the same files.",
  "",
  "## Promise",
  "",
  `- **pt-BR:** ${product.promise.pt.title} ${product.promise.pt.lede}`,
  `- **en:** ${product.promise.en.title} ${product.promise.en.lede}`,
  "",
  `Headline test (issue #77, experiment \`${product.headlineTest.experiment}\`, ${product.headlineTest.active ? "active" : "off"}): h0 "${product.promise.pt.title}" (control), ` + product.headlineTest.arms.map((a) => `${a.id} "${a.pt}"`).join(", ") + "." + (ht.retired?.length ? " Retired: " + ht.retired.map((a) => `${a.id} "${a.pt}" (${a.date})`).join(", ") + "." : ""),
  "",
  "## Sides",
  "",
  "Positioning: [positioning.md](positioning.md) ([ADR 0047](adr/0047-security-means-identity.md)). The home page and the features page group tentpoles and areas by side.",
  "",
  "| Side | pt-BR | Tentpoles | Areas |",
  "|---|---|---|---|",
  ...product.sides.map((s) => `| ${s.en.name} | ${s.pt.name} | ${s.tentpoles.join(", ")} | ${s.areas.join(", ")} |`),
  "",
  "## Tentpoles",
  "",
  "| Tentpole | Promise (pt-BR) | Status | Demo | Features | Docs |",
  "|---|---|---|---|---|---|",
  ...product.tentpoles.map((t) => `| ${t.en.name} | ${t.pt.title} | ${label[t.status]} | ${t.demos.join(", ") || "static"} | ${t.features.join(", ")} | ${t.docs.join(", ")} |`),
  "",
  "## Features",
  "",
  "| Feature | Area | iOS | Android | What it does |",
  "|---|---|---|---|---|",
  ...product.features.map((f) => `| ${f.en.name} (\`${f.id}\`) | ${f.area} | ${label[f.status.ios]} | ${label[f.status.android]} | ${f.en.body} |`),
  "",
  "## Comparison",
  "",
  `Register \`product/compare.json\`, researched ${cmp.date}. Hub \`/comparar/\`, one page per app. Source: [vs-whatsapp.md](vs-whatsapp.md).`,
  "",
  `| Threat | Bipe features | ${cmp.apps.map((a) => a.name).join(" | ")} |`,
  `|---|---|${cmp.apps.map(() => "---|").join("")}`,
  ...cmp.threats.map((t) => `| ${t.en.threat} | ${t.features.join(", ")} | ${cmp.apps.map((a) => (a.cells[t.id] ? "yes" : "")).join(" | ")} |`),
  "",
  "## Distribution",
  "",
  `- iOS: ${dist.ios.status}, ${dist.ios.channel}, ${dist.ios.url ?? "no link"}, ${dist.ios.minOS}.`,
  `- Android: ${dist.android.status}. ${dist.android.en.note}`,
  `- Contact: ${dist.contact}.`,
  "",
  "## Source code",
  "",
  `Organisation: ${dist.source.org}. The site links a repo only when it is public.`,
  "",
  ...dist.source.repos.map((r) => `- ${r.en}: ${r.url} (${r.public ? "public" : "private"})`),
  "",
  "## Rules",
  "",
  "- A feature is `testing` only when it is in a TestFlight or beta build. `built`: the code is merged on that platform but is not in a tester build yet (ADR 0031). Designed work stays `planned`.",
  "- Copy is pt-BR first. Rendered copy has no em or en dashes and passes the humanizer.",
  "- Download links and source links come only from `distribution.json`.",
  "",
];
writeFileSync(out, lines.join("\n"));
console.log(`wrote ${out}`);
