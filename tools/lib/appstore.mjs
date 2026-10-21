// Store listing (bipe-chat/bipe#453): parses and checks product/appstore.md, the one source for the
// App Store and Google Play text, the screenshot panels, the App Review notes, the App Privacy
// answers and the age rating. The check, the image builder and the upload tools all read the file
// through parseAppstore(); no tool has its own parser.
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const LOCALES = ["pt-BR", "en-US"];
export const PLATFORMS = { iOS: "ios", Android: "android" };

// Fields per platform: `shared` once per platform, `locale` once per locale. `limit` is in
// characters as App Store Connect and Play Console count them (UTF-16 code units).
export const FIELDS = {
  ios: {
    shared: {
      support_url: { url: true },
      marketing_url: { url: true },
      privacy_url: { url: true },
      copyright: {},
      primary_category: {},
      secondary_category: { optional: true },
    },
    locale: {
      name: { limit: 30 },
      subtitle: { limit: 30 },
      promotional_text: { limit: 170 },
      description: { limit: 4000 },
      keywords: { limit: 100 },
      release_notes: { limit: 4000 },
    },
  },
  android: {
    shared: {},
    locale: {
      title: { limit: 30 },
      short_description: { limit: 80 },
      full_description: { limit: 4000, optional: true },
    },
  },
};

const LOCALE_RE = /^[a-z]{2}-[A-Z]{2}$/;
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DASH_RE = /[–—]/;
// Bipe voice writes "para" (ADR 0068). "pra" and its forms belong to people's voice only.
const PRA_RE = /(^|[^\p{L}])(pra|pras|pro|pros)(?=$|[^\p{L}])/iu;
const PLACEHOLDER_RE = /<[^<>\n]+>/;
const MAX_PANELS = 10;
// Panel layouts the image builder draws (bipe-web scripts/store-images.mjs, bipe-chat/bipe#463).
export const LAYOUTS = ["hero", "phone", "text"];

// Splits text on headings of exactly `level` hashes. Returns [{ title, body }] in order and the
// text before the first heading.
function sections(text, level) {
  const re = new RegExp(`^${"#".repeat(level)} (.+?)\\s*$`, "gm");
  const heads = [...text.matchAll(re)];
  const out = heads.map((h, i) => ({
    title: h[1],
    body: text.slice(h.index + h[0].length, heads[i + 1]?.index ?? text.length).trim(),
  }));
  return { lead: text.slice(0, heads[0]?.index ?? text.length).trim(), items: out };
}

function table(body) {
  const rows = body
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("|"))
    .map((l) => l.replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
  if (rows.length < 2) return [];
  const [head, , ...data] = rows;
  return data.map((cells) => Object.fromEntries(head.map((h, i) => [h, cells[i] ?? ""])));
}

export function parseAppstore(text) {
  const platforms = {};
  const screenshots = {};
  const other = {};
  for (const top of sections(text, 2).items) {
    const platform = top.title.match(/^Platform: (\S+) \((.+)\)$/);
    if (platform) {
      const key = PLATFORMS[platform[1]];
      if (!key) throw new Error(`appstore.md: unknown platform ${platform[1]}`);
      if (platforms[key]) throw new Error(`appstore.md: platform ${platform[1]} appears twice`);
      const block = { name: platform[1], id: platform[2], shared: {}, locales: {} };
      for (const sub of sections(top.body, 3).items) {
        if (LOCALE_RE.test(sub.title)) {
          block.locales[sub.title] = Object.fromEntries(sections(sub.body, 4).items.map((f) => [f.title, f.body]));
        } else {
          block.shared[sub.title] = sub.body;
        }
      }
      platforms[key] = block;
    } else if (top.title === "Screenshots") {
      for (const sub of sections(top.body, 3).items) screenshots[sub.title] = table(sub.body);
    } else {
      other[top.title] = Object.fromEntries(sections(top.body, 3).items.map((f) => [f.title, f.body]));
    }
  }
  return { platforms, screenshots, other };
}

export function loadAppstore(root) {
  return parseAppstore(readFileSync(join(root, "product/appstore.md"), "utf8"));
}

// Android full description: its own field, else the iOS description of the same locale.
export function playFullDescription(listing, locale) {
  return listing.platforms.android?.locales[locale]?.full_description || listing.platforms.ios?.locales[locale]?.description || "";
}

// Store fields that people see, as [where, text] pairs. Used for the dash, voice and placeholder rules.
function renderedFields(listing) {
  const out = [];
  for (const [key, block] of Object.entries(listing.platforms)) {
    for (const [field, text] of Object.entries(block.shared)) out.push([`${key}.${field}`, text, null]);
    for (const [locale, fields] of Object.entries(block.locales))
      for (const [field, text] of Object.entries(fields)) out.push([`${key}.${locale}.${field}`, text, locale]);
  }
  for (const [locale, panels] of Object.entries(listing.screenshots))
    for (const p of panels) for (const col of ["headline", "sub", "callout"]) out.push([`screenshots.${locale}.${p.slug}.${col}`, p[col] ?? "", locale]);
  return out;
}

// Placeholders such as <MZ> left in App Review. The upload tools refuse to send a section with one.
export function placeholders(listing, section) {
  return Object.entries(listing.other[section] ?? {}).flatMap(([field, text]) =>
    (text.match(new RegExp(PLACEHOLDER_RE, "g")) ?? []).map((p) => `${section}.${field}: ${p}`),
  );
}

// Returns a list of problems. An empty list means the listing is ready to upload as text.
// ledger: product/parity.json, the status per feature (bipe#300).
export function checkAppstore(listing, ledger) {
  const problems = [];
  const surface = (item, s) => (typeof item[s] === "string" ? item[s] : item[s]?.status);
  const features = new Map(ledger.items.map((i) => [i.id, { status: { ios: surface(i, "ios"), android: surface(i, "android") } }]));

  for (const [name, key] of Object.entries(PLATFORMS)) {
    const block = listing.platforms[key];
    if (!block) {
      problems.push(`missing "## Platform: ${name} (<id>)"`);
      continue;
    }
    const spec = FIELDS[key];
    for (const [field, rule] of Object.entries(spec.shared)) {
      const value = block.shared[field];
      if (!value) {
        if (!rule.optional) problems.push(`${key}.${field}: missing`);
      } else if (rule.url && !/^https:\/\/\S+$/.test(value)) problems.push(`${key}.${field}: not an https URL`);
    }
    for (const field of Object.keys(block.shared))
      if (!spec.shared[field]) problems.push(`${key}.${field}: unknown field`);
    for (const locale of LOCALES) {
      const fields = block.locales[locale];
      if (!fields) {
        problems.push(`${key}: missing locale ${locale}`);
        continue;
      }
      for (const field of Object.keys(fields))
        if (!spec.locale[field]) problems.push(`${key}.${locale}.${field}: unknown field`);
      for (const [field, rule] of Object.entries(spec.locale)) {
        const value = key === "android" && field === "full_description" ? playFullDescription(listing, locale) : fields[field];
        if (!value) {
          if (!rule.optional) problems.push(`${key}.${locale}.${field}: missing`);
          continue;
        }
        if (value.length > rule.limit) problems.push(`${key}.${locale}.${field}: ${value.length} characters, limit ${rule.limit}`);
      }
      const keywords = fields.keywords;
      if (keywords !== undefined) {
        if (/,\s/.test(keywords)) problems.push(`ios.${locale}.keywords: a space after a comma wastes characters`);
        const words = keywords.split(",").map((w) => w.trim().toLowerCase());
        const dupes = words.filter((w, i) => words.indexOf(w) !== i);
        if (dupes.length) problems.push(`ios.${locale}.keywords: repeated ${[...new Set(dupes)].join(", ")}`);
        if (words.some((w) => !w)) problems.push(`ios.${locale}.keywords: empty keyword`);
      }
    }
    for (const locale of Object.keys(block.locales))
      if (!LOCALES.includes(locale)) problems.push(`${key}: unknown locale ${locale}`);
  }

  for (const [where, text, locale] of renderedFields(listing)) {
    if (DASH_RE.test(text)) problems.push(`${where}: em or en dash in rendered copy`);
    if (PLACEHOLDER_RE.test(text)) problems.push(`${where}: placeholder ${text.match(PLACEHOLDER_RE)[0]}`);
    if (locale === "pt-BR" && PRA_RE.test(text)) problems.push(`${where}: Bipe voice writes "para", not "${text.match(PRA_RE)[2]}"`);
  }

  // Panels: the same slugs and features in the same order in every locale, only shipped features.
  const reference = listing.screenshots[LOCALES[0]];
  for (const locale of LOCALES) {
    const panels = listing.screenshots[locale];
    if (!panels?.length) {
      problems.push(`screenshots: missing table for ${locale}`);
      continue;
    }
    if (panels.length > MAX_PANELS) problems.push(`screenshots.${locale}: ${panels.length} panels, limit ${MAX_PANELS}`);
    const slugs = new Set();
    panels.forEach((p, i) => {
      const where = `screenshots.${locale}.${p.slug || i + 1}`;
      if (!SLUG_RE.test(p.slug ?? "")) problems.push(`${where}: slug must be lower case words joined by "-"`);
      if (slugs.has(p.slug)) problems.push(`${where}: slug appears twice`);
      slugs.add(p.slug);
      if (!p.headline) problems.push(`${where}: missing headline`);
      for (const col of ["headline", "sub"])
        if (((p[col] ?? "").match(/\*/g) ?? []).length % 2) problems.push(`${where}.${col}: unpaired *`);
      if ((p.callout ?? "").includes("*")) problems.push(`${where}.callout: no highlight in a callout`);
      // MZ, 20 October 2026: a headline is one sentence.
      if (/[.?!]\s+\S/.test(p.headline ?? "")) problems.push(`${where}.headline: one sentence only`);
      if (p.layout && !LAYOUTS.includes(p.layout)) problems.push(`${where}: unknown layout ${p.layout}, use one of ${LAYOUTS.join(", ")}`);
      if (p.layout === "text" && p.feature !== "-") problems.push(`${where}: layout text is for a panel with feature -`);
      if (p.layout && p.layout !== "text" && p.feature === "-") problems.push(`${where}: a panel with feature - has layout text`);
      if (reference && reference !== panels && (reference[i]?.layout ?? "") !== (p.layout ?? "")) problems.push(`${where}: layout differs from ${LOCALES[0]}`);
      if (reference && reference !== panels && (reference[i]?.slug !== p.slug || reference[i]?.feature !== p.feature))
        problems.push(`${where}: order or feature differs from ${LOCALES[0]}`);
      if (p.feature === "-") return;
      const feature = features.get(p.feature);
      if (!feature) {
        problems.push(`${where}: unknown feature ${p.feature}`);
        return;
      }
      for (const platform of Object.values(PLATFORMS))
        if (!["built", "testing", "policy"].includes(feature.status?.[platform]))
          problems.push(`${where}: feature ${p.feature} is ${feature.status?.[platform] ?? "missing"} on ${platform}; claim only what a build does`);
    });
  }

  return problems;
}
