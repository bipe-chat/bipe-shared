// Writes bipe/docs/product.md from product/product.json and product/distribution.json. Also validates
// product/compare.json, product/scams.json and product/data.json.
// Usage: node tools/gen-product-doc.mjs [--out <file>]
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const outIndex = args.indexOf("--out");
const out = resolve(outIndex >= 0 ? args[outIndex + 1] : join(root, "../bipe/docs/product.md"));

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
// Figure ids (tentpole demos, feature figures, bipe#176): the phone scenes and the SIMS list in
// bipe-web/src/sim/scenes.ts. Fails closed when the file or the list is missing.
function figureIds() {
  const src = readFileSync(join(root, "../bipe-web/src/sim/scenes.ts"), "utf8");
  const sims = /^export const SIMS = \[([^\]]*)\] as const;$/m.exec(src);
  const start = src.indexOf("export const scenes = {");
  const end = src.indexOf("} satisfies Record<string, Scene>;", start);
  if (!sims || start < 0 || end < 0) fail("figures: SIMS or scenes not found in bipe-web/src/sim/scenes.ts");
  const ids = [...src.slice(start, end).matchAll(/^ {2}"?([a-z0-9-]+)"?: \{/gm)].map((m) => m[1]);
  const simIds = [...sims[1].matchAll(/"([A-Za-z0-9-]+)"/g)].map((m) => m[1]);
  if (!ids.length || !simIds.length || simIds.some((id) => ids.includes(id))) fail("figures: scene and sim ids must be found and distinct");
  return new Set([...ids, ...simIds]);
}
const FIGURES = figureIds();
const featureIds = new Set(product.features.map((f) => f.id));
const areaIds = new Set(product.areas.map((a) => a.id));
// Every feature has its own page on the site (/recursos/<slug>/): a slug per language and points that say how it works.
const featureSlugs = new Set();
for (const f of product.features) {
  if (!areaIds.has(f.area)) fail(`feature ${f.id}: unknown area ${f.area}`);
  for (const p of ["ios", "android"]) if (!STATUSES.includes(f.status[p])) fail(`feature ${f.id}: status.${p}`);
  for (const l of ["pt", "en"]) {
    if (!f[l]?.name || !f[l]?.body) fail(`feature ${f.id}: ${l} copy`);
    if (!f[l].points?.length || f[l].points.some((x) => !x)) fail(`feature ${f.id}: ${l}.points`);
    const slug = f.slug?.[l];
    if (!/^[a-z0-9-]+$/.test(slug ?? "") || featureSlugs.has(`${l}/${slug}`)) fail(`feature ${f.id}: slug.${l}`);
    featureSlugs.add(`${l}/${slug}`);
  }
  if (f.pt.points.length !== f.en.points.length) fail(`feature ${f.id}: points pt and en differ`);
  if (f.figures !== undefined) {
    if (!Array.isArray(f.figures) || !f.figures.length || new Set(f.figures).size !== f.figures.length) fail(`feature ${f.id}: figures must be a list of distinct ids`);
    for (const id of f.figures) if (!FIGURES.has(id)) fail(`feature ${f.id}: unknown figure ${id}`);
  }
}
// ICP register (ADR 0060): every ICP cites an ADR file in ../bipe/docs/adr; exactly one step is current.
const adrDir = join(root, "../bipe/docs/adr");
const adrFiles = readdirSync(adrDir);
const icpIds = new Set();
for (const i of product.icps) {
  if (!/^[a-z]+$/.test(i.id) || icpIds.has(i.id) || !Number.isInteger(i.step) || !i.name || !i.who) fail(`icp ${i.id}`);
  if (!i.platforms?.length || i.platforms.some((x) => !["ios", "android"].includes(x))) fail(`icp ${i.id}: platforms`);
  if (!i.gate?.length || i.gate.some((id) => !featureIds.has(id))) fail(`icp ${i.id}: gate`);
  if (!adrFiles.some((f) => f.startsWith(`${i.adr}-`))) fail(`icp ${i.id}: ADR ${i.adr} not found in bipe/docs/adr`);
  icpIds.add(i.id);
}
if (product.icps.filter((i) => i.current).length !== 1) fail("icps: exactly one current step");
// Audience pages (/para/<slug>/): each names a registered ICP (ADR 0060) and is built from feature pages.
for (const l of ["pt", "en"]) for (const k of ["nav", "title", "lede"]) if (!product.audiencesHub?.[l]?.[k]) fail(`audiencesHub.${l}.${k}`);
const audienceSlugs = new Set();
for (const a of product.audiences) {
  if (!icpIds.has(a.icp)) fail(`audience ${a.id}: icp ${a.icp} is not in the register (ADR 0058)`);
  if (!a.sections.length) fail(`audience ${a.id}: no sections`);
  for (const s of a.sections) for (const id of s.features) if (!featureIds.has(id)) fail(`audience ${a.id}: unknown feature ${id}`);
  for (const s of a.sections) if (s.scene !== undefined && !FIGURES.has(s.scene)) fail(`audience ${a.id}: unknown scene ${s.scene}`);
  for (const l of ["pt", "en"]) {
    for (const k of ["name", "title", "headline", "lede", "note", "cta", "ctaSubject"]) if (!a[l]?.[k]) fail(`audience ${a.id}: ${l}.${k}`);
    if (a[l].sections.length !== a.sections.length || a[l].sections.some((s) => !s.heading || !s.body)) fail(`audience ${a.id}: ${l}.sections`);
    const slug = a.slug?.[l];
    if (!/^[a-z0-9-]+$/.test(slug ?? "") || audienceSlugs.has(`${l}/${slug}`)) fail(`audience ${a.id}: slug.${l}`);
    audienceSlugs.add(`${l}/${slug}`);
  }
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
  for (const id of t.demos) if (!FIGURES.has(id)) fail(`tentpole ${t.id}: unknown demo ${id}`);
}
if (!dist.source?.org?.startsWith("https://github.com/bipe-chat")) fail("source.org");
for (const r of dist.source.repos) {
  if (!r.url?.startsWith(dist.source.org + "/")) fail(`source ${r.id}: url must be in ${dist.source.org}`);
  if (typeof r.public !== "boolean") fail(`source ${r.id}: public must be true or false`);
  if (!r.pt || !r.en) fail(`source ${r.id}: pt and en labels`);
}
// Comparison register (product/compare.json, bipe/docs/vs-whatsapp.md): every Bipe claim names the
// features that carry its status; every competitor cell belongs to a known threat.
const cmp = JSON.parse(readFileSync(join(root, "product/compare.json"), "utf8"));
if (cmp.version !== 1 || !/^\d{4}-\d{2}-\d{2}$/.test(cmp.date)) fail("compare: version or date");
for (const l of ["pt", "en"]) for (const k of ["nav", "title", "description", "bipe", "appsTitle", "more", "aheadTitle", "limitTitle", "limit", "sourcesTitle", "sourcesNote", "tableTitle", "threatCol"]) if (!cmp[l]?.[k]) fail(`compare.${l}.${k}`);
const LEVELS = ["on", "setting", "limited", "none"];
for (const l of ["pt", "en"]) for (const k of LEVELS) if (!cmp[l]?.levels?.[k]) fail(`compare.${l}.levels.${k}`);
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
  for (const [id, cell] of Object.entries(a.cells)) if (!threatIds.has(id) || !cell.pt || !cell.en || !LEVELS.includes(cell.level)) fail(`compare app ${a.id}: cell ${id}`);
  if (!a.sources.length) fail(`compare app ${a.id}: no sources`);
  for (const s of a.sources) if (!s.name || !s.url?.startsWith("https://")) fail(`compare app ${a.id}: source`);
}
const cmpText = JSON.stringify(cmp, (k, v) => (k === "$comment" ? undefined : v));
if (/[–—]/.test(cmpText)) fail("compare: rendered copy must not contain em or en dashes");
if (/n[ãa]o ach(ou|amos)|found nothing/i.test(cmpText)) fail("compare: state what an app does, never what we did not find");
// Scams register (product/scams.json, bipe/docs/scams-brazil.md): /golpes-no-brasil/. Fails closed: every
// number has a source with an https URL and a date; pt copy follows language.md (golpe, not fraude; no fear words).
const scams = JSON.parse(readFileSync(join(root, "product/scams.json"), "utf8"));
if (scams.version !== 1 || !/^\d{4}-\d{2}-\d{2}$/.test(scams.date)) fail("scams: version or date");
const KINDS = ["primary", "secondary", "company", "press"];
const scamSources = new Set();
for (const s of scams.sources) {
  if (!/^[a-z0-9]+$/i.test(s.id) || scamSources.has(s.id)) fail(`scams source ${s.id}: id`);
  if (!s.name || !s.publisher || !s.url?.startsWith("https://")) fail(`scams source ${s.id}: name, publisher and https url`);
  if (!/^\d{4}-\d{2}(-\d{2})?$/.test(s.date ?? "")) fail(`scams source ${s.id}: date must be YYYY-MM or YYYY-MM-DD`);
  if (!KINDS.includes(s.kind)) fail(`scams source ${s.id}: kind`);
  scamSources.add(s.id);
}
const scamStats = new Set();
for (const s of scams.stats) {
  if (scamStats.has(s.id) || !scamSources.has(s.source)) fail(`scams stat ${s.id}: duplicate id or unknown source ${s.source}`);
  for (const l of ["pt", "en"]) for (const k of ["value", "label", "period"]) if (!s[l]?.[k]) fail(`scams stat ${s.id}: ${l}.${k}`);
  for (const id of s.also ?? []) if (!scamSources.has(id)) fail(`scams stat ${s.id}: unknown also source ${id}`);
  scamStats.add(s.id);
}
for (const id of [...scams.hero, ...scams.more, ...scams.types.flatMap((t) => t.stats ?? [])]) if (!scamStats.has(id)) fail(`scams: unknown stat ${id}`);
// Types: one page each under /golpes-no-brasil/<slug>/ (bipe#175, the library of golpes). The first stat, if any,
// also shows on the hub. A golpe with no measured figure has no stats: the doc says "no figure", the page shows none.
// describedBy: official pages with the script (never press). protect: feature ids in product.json. scene: a figure id.
const GROUPS = Object.keys(scams.pt?.groups ?? {});
const CHANNELS = Object.keys(scams.pt?.channels ?? {});
for (const l of ["en"]) for (const k of ["groups", "channels"]) if (JSON.stringify(Object.keys(scams[l]?.[k] ?? {})) !== JSON.stringify(Object.keys(scams.pt[k]))) fail(`scams.${l}.${k}: keys differ from pt`);
const scamSlugs = new Set();
const scamTypeIds = new Set();
for (const t of scams.types) {
  if (!/^[a-z][A-Za-z]+$/.test(t.id) || scamTypeIds.has(t.id)) fail(`scams type ${t.id}: id`);
  scamTypeIds.add(t.id);
  if (!Array.isArray(t.stats) || !t.protect?.length) fail(`scams type ${t.id}: stats list and protect`);
  for (const f of t.protect) if (!featureIds.has(f)) fail(`scams type ${t.id}: protect ${f} is not a feature in product.json`);
  if (!GROUPS.includes(t.group)) fail(`scams type ${t.id}: group ${t.group}`);
  if (!t.channels?.length || t.channels.some((c) => !CHANNELS.includes(c))) fail(`scams type ${t.id}: channels`);
  if (!FIGURES.has(t.scene)) fail(`scams type ${t.id}: unknown scene ${t.scene}`);
  if (t.realScene !== undefined && !FIGURES.has(t.realScene)) fail(`scams type ${t.id}: unknown realScene ${t.realScene}`);
  if (!t.describedBy?.length) fail(`scams type ${t.id}: describedBy needs an official source`);
  for (const id of t.describedBy) {
    const src = scams.sources.find((x) => x.id === id);
    if (!src || src.kind === "press") fail(`scams type ${t.id}: describedBy ${id} must be a known source that is not press`);
  }
  for (const l of ["pt", "en"]) {
    if (!/^[a-z0-9-]+$/.test(t.slug?.[l] ?? "") || scamSlugs.has(`${l}/${t.slug[l]}`)) fail(`scams type ${t.id}: ${l} slug`);
    scamSlugs.add(`${l}/${t.slug[l]}`);
    for (const k of ["heading", "body", "title", "headline", "lede", "limit"]) if (!t[l]?.[k]) fail(`scams type ${t.id}: ${l}.${k}`);
    for (const k of ["how", "signs", "todo"]) if (!t[l]?.[k]?.length) fail(`scams type ${t.id}: ${l}.${k}`);
    if (!t.aliases?.[l]?.length || t.aliases[l].some((a) => !a)) fail(`scams type ${t.id}: aliases.${l}`);
  }
  for (const k of ["how", "signs", "todo"]) if (t.pt[k].length !== t.en[k].length) fail(`scams type ${t.id}: ${k} pt and en differ`);
}
// Outside Bipe: golpes that start by phone or in person. Each links an official page and has no Bipe card.
const outsideIds = new Set();
for (const o of scams.outside ?? []) {
  if (outsideIds.has(o.id) || scamTypeIds.has(o.id) || !scamSources.has(o.source)) fail(`scams outside ${o.id}: id or source`);
  for (const l of ["pt", "en"]) if (!o[l]?.name || !o[l]?.body) fail(`scams outside ${o.id}: ${l} copy`);
  outsideIds.add(o.id);
}
if (!scams.outside?.length) fail("scams: outside list");
if (scams.hero.length < 3 || scams.hero.length > 5) fail("scams: 3 to 5 hero numbers");
const scamCharts = new Set();
for (const c of scams.charts) {
  if (scamCharts.has(c.id) || !["columns", "bars"].includes(c.form) || !c.rows.length) fail(`scams chart ${c.id}`);
  if (!c.sources.length || c.sources.some((id) => !scamSources.has(id))) fail(`scams chart ${c.id}: sources`);
  for (const l of ["pt", "en"]) if (!c[l]?.title || !c[l]?.note) fail(`scams chart ${c.id}: ${l} copy`);
  for (const r of c.rows) {
    if (typeof r.value !== "number" || !(r.value >= 0)) fail(`scams chart ${c.id} row ${r.id}: value`);
    for (const l of ["pt", "en"]) if (!r[l]?.label || !r[l]?.value) fail(`scams chart ${c.id} row ${r.id}: ${l}`);
  }
  scamCharts.add(c.id);
}
for (const id of scams.channelCharts) if (!scamCharts.has(id)) fail(`scams: unknown channel chart ${id}`);
for (const p of scams.protect) if (!featureIds.has(p.feature) || !p.pt || !p.en) fail(`scams protect ${p.feature}`);
for (const l of ["pt", "en"]) {
  const c = scams[l];
  for (const k of ["title", "headline", "lede", "numbersTitle", "channelsTitle", "channelsBody", "chartsTitle", "typesTitle", "moreTitle", "moreBody", "protectTitle", "protectLede", "bipeTitle", "bipeLede", "limit", "sourcesTitle", "sourcesNote", "source", "table", "typeNumbers", "typeHow", "typeSigns", "typeTodo", "typeOthers", "typeMore", "typeAliases", "typeChannels", "typeDescribedBy", "typeDescribedByNote", "typeLimitTitle", "typeScene", "outsideTitle", "outsideLede", "outsideMore"]) if (!c?.[k]) fail(`scams.${l}.${k}`);
  for (const k of KINDS) if (!c.kinds?.[k]) fail(`scams.${l}.kinds.${k}`);
  if (!c.advice.length) fail(`scams.${l}.advice`);
}
if (scams.pt.advice.length !== scams.en.advice.length) fail("scams: advice pt and en differ");
// Rendered copy: everything except $comment and the source titles, which quote the publisher.
const scamsCopy = JSON.stringify({ ...scams, $comment: undefined, sources: scams.sources.map((s) => ({ ...s, name: undefined })) });
if (/[–—]/.test(JSON.stringify({ ...scams, $comment: undefined }))) fail("scams: rendered copy must not contain em or en dashes");
if (/!/.test(scamsCopy.replace(/https:\/\/[^"]*/g, ""))) fail("scams: no exclamation marks");
const scamsPt = JSON.stringify([scams.pt, scams.stats.map((s) => s.pt), scams.charts.map((c) => [c.pt, c.rows.map((r) => r.pt)]), scams.protect.map((p) => p.pt), scams.types.map((t) => [t.pt, t.aliases.pt]), scams.outside.map((o) => o.pt)]);
if (/\b(fraudes?|fraudador\w*|perigo\w*|alerta\w*|aten[çc][ãa]o)\b/i.test(scamsPt)) fail("scams: pt copy says golpe, not fraude, and uses no fear words (language.md)");
// Data register (product/data.json): the LGPD record of processing (art. 37) and the /lgpd/ page.
// Fails closed: every item names a known legal basis, at least one known place (the Bipe server first),
// a retention period and copy in both languages. A place says brazil true, false or null (not yet confirmed).
const data = JSON.parse(readFileSync(join(root, "product/data.json"), "utf8"));
if (data.version !== 1 || !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) fail("data: version or date");
if (data.encarregado !== null && !(data.encarregado?.name && data.encarregado?.contact)) fail("data: encarregado is null or has name and contact");
for (const l of ["pt", "en"]) {
  const c = data[l];
  for (const k of ["nav", "title", "meta", "lede", "policy", "itemsTitle", "outsideTitle", "outsideLede", "deviceTitle", "deviceLede", "notPersonal", "rightsTitle", "rightsHow", "controllerTitle", "controller", "encarregadoMissing"]) if (!c?.[k]) fail(`data.${l}.${k}`);
  for (const k of ["what", "why", "basis", "retention", "where"]) if (!c.labels?.[k]) fail(`data.${l}.labels.${k}`);
  for (const k of ["yes", "no", "unknown"]) if (!c.brazil?.[k]) fail(`data.${l}.brazil.${k}`);
  if (!c.rights?.length || c.rights.some((x) => !x)) fail(`data.${l}.rights`);
}
if (data.pt.rights.length !== data.en.rights.length) fail("data: rights pt and en differ");
const basisIds = new Set();
for (const b of data.bases) {
  if (!/^[a-z-]+$/.test(b.id) || basisIds.has(b.id) || !/^art\. 7, [IVX]+$/.test(b.article) || !b.pt || !b.en) fail(`data basis ${b.id}`);
  basisIds.add(b.id);
}
const placeIds = new Set();
for (const p of data.places) {
  if (!/^[a-z-]+$/.test(p.id) || placeIds.has(p.id) || ![true, false, null].includes(p.brazil) || !p.pt || !p.en) fail(`data place ${p.id}`);
  placeIds.add(p.id);
}
if (data.places[0]?.id !== "server" || data.places[0].brazil !== true) fail("data: the first place is the Bipe server, in Brazil");
const dataIds = new Set();
for (const i of [...data.items, ...data.device]) {
  if (!/^[a-z-]+$/.test(i.id) || dataIds.has(i.id)) fail(`data item ${i.id}: id`);
  dataIds.add(i.id);
}
for (const i of data.items) {
  if (!basisIds.has(i.basis)) fail(`data item ${i.id}: unknown basis ${i.basis}`);
  if (!i.places?.length || i.places.some((p) => !placeIds.has(p))) fail(`data item ${i.id}: places`);
  for (const l of ["pt", "en"]) for (const k of ["name", "what", "why", "retention"]) if (!i[l]?.[k]) fail(`data item ${i.id}: ${l}.${k}`);
}
for (const d of data.device) if (!d.pt || !d.en) fail(`data device ${d.id}`);
const text = JSON.stringify(product) + JSON.stringify(dist) + JSON.stringify(data);
if (/[–—]/.test(text)) fail("rendered copy must not contain em or en dashes");

const label = { testing: "TestFlight", built: "Built", planned: "Planned", policy: "Policy" };
const lines = [
  "# Product: what Bipe is and does",
  "",
  "Generated by `bipe-shared/tools/gen-product-doc.mjs` from `bipe-shared/product/`. Do not edit here: change the JSON and run the generator. The website (bipe-web) renders the same files.",
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
  "## ICPs",
  "",
  "Order of audiences: [icps.md](icps.md) ([ADR 0060](adr/0060-icp-ladder-by-success-chance.md)). A step becomes current only by a new ADR. Gate: the features that must be in a tester build on the step's platforms.",
  "",
  "| Step | ICP | Who | Current | Platforms | Gate in tester build |",
  "|---|---|---|---|---|---|",
  ...product.icps.map((i) => {
    const ready = (id) => i.platforms.every((pl) => product.features.find((f) => f.id === id).status[pl] === "testing");
    const gate = i.gate.map((id) => (ready(id) ? id : `~~${id}~~`)).join(", ");
    return `| ${i.step} | ${i.name} (\`${i.id}\`) | ${i.who} | ${i.current ? "yes" : ""} | ${i.platforms.join(", ")} | ${i.gate.filter(ready).length} of ${i.gate.length}: ${gate} |`;
  }),
  "",
  "## Audiences",
  "",
  "Pages at `/para/<slug>/` and `/en/for/<slug>/`. Each names an ICP and is built from feature pages.",
  "",
  "| Audience | ICP | Page (pt) | Features |",
  "|---|---|---|---|",
  ...product.audiences.map((a) => `| ${a.en.name} | ${a.icp} | /para/${a.slug.pt}/ | ${a.sections.flatMap((s) => s.features).join(", ")} |`),
  "",
  "### Features by audience",
  "",
  "Which audience page uses which feature. A feature no page uses is a gap or a feature for everyone.",
  "",
  `| Feature | iOS | ${product.audiences.map((a) => a.en.name).join(" | ")} | Pages |`,
  `|---|---|${product.audiences.map(() => "---|").join("")}---|`,
  ...product.features.map((f) => {
    const used = product.audiences.map((a) => a.sections.some((s) => s.features.includes(f.id)));
    return `| ${f.en.name} | ${label[f.status.ios]} | ${used.map((u) => (u ? "x" : "")).join(" | ")} | ${used.filter(Boolean).length} |`;
  }),
  "",
  "## Comparison",
  "",
  `Register \`product/compare.json\`, researched ${cmp.date}. Hub \`/compare/\`, one page per app. Source: [vs-whatsapp.md](vs-whatsapp.md).`,
  "",
  `| Threat | Bipe features | ${cmp.apps.map((a) => a.name).join(" | ")} |`,
  `|---|---|${cmp.apps.map(() => "---|").join("")}`,
  ...cmp.threats.map((t) => `| ${t.en.threat} | ${t.features.join(", ")} | ${cmp.apps.map((a) => a.cells[t.id]?.level ?? "").join(" | ")} |`),
  "",
  "## Scams page",
  "",
  `Register \`product/scams.json\`, researched ${scams.date}. Page \`/golpes-no-brasil/\` and \`/en/scams-in-brazil/\`. Source: [scams-brazil.md](scams-brazil.md).`,
  "",
  "| Number | What it is | Period | Source |",
  "|---|---|---|---|",
  ...scams.hero.map((id) => scams.stats.find((s) => s.id === id)).map((s) => { const srcs = [s.source, ...(s.also ?? [])].map((id) => scams.sources.find((x) => x.id === id)); return `| ${s.en.value} | ${s.en.label} | ${s.en.period} | ${srcs.map((x) => `[${x.publisher}](${x.url})`).join("; ")} |`; }),
  "",
  `Charts: ${scams.charts.map((c) => `${c.en.title} (${c.sources.join(", ")})`).join("; ")}. Bipe features named: ${scams.protect.map((p) => p.feature).join(", ")}.`,
  "",
  "### Library of golpes",
  "",
  `${scams.types.length} golpes, one page each at \`/golpes-no-brasil/<slug>/\` (bipe#175). Figures: stat ids from the register, or "no figure" when no source measures the golpe. The page never shows a number without a source.`,
  "",
  "| Golpe | Group | Page (pt) | Figures | Described by | Bipe features | Scene |",
  "|---|---|---|---|---|---|---|",
  ...scams.types.map((t) => `| ${t.en.heading} (\`${t.id}\`) | ${t.group} | /golpes-no-brasil/${t.slug.pt}/ | ${t.stats.join(", ") || "no figure"} | ${t.describedBy.join(", ")} | ${t.protect.map((id) => `${id} (${label[product.features.find((f) => f.id === id).status.ios]})`).join(", ")} | ${t.scene} |`),
  "",
  `Outside Bipe (hub list, no Bipe card): ${scams.outside.map((o) => `${o.en.name} (${o.source})`).join("; ")}.`,
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
