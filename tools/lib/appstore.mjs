// Store listing (bipe-chat/bipe#453): parses and checks product/appstore.md, the one source for the
// App Store and Google Play text, the screenshot panels, the App Privacy
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
      full_description: { limit: 4000 },
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
// Panel text limits in characters, as proxies for 2 lines at store size (bipe-chat/bipe#463).
const TITLE_MAX = 28;
const SUB_MAX = 90;

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
  let accessibility = [];
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
    } else if (top.title === "Accessibility") {
      accessibility = table(top.body);
    } else {
      other[top.title] = Object.fromEntries(sections(top.body, 3).items.map((f) => [f.title, f.body]));
    }
  }
  return { platforms, screenshots, accessibility, other };
}

export function loadAppstore(root) {
  return parseAppstore(readFileSync(join(root, "product/appstore.md"), "utf8"));
}

// Android full description of a locale (bipe-chat/bipe#457). Required: Play shows it in place of the iOS description.
export function playFullDescription(listing, locale) {
  return listing.platforms.android?.locales[locale]?.full_description ?? "";
}

// The Play listing of one locale, as edits.listings takes it (Google Play Developer API v3).
export function playListing(listing, locale) {
  const fields = listing.platforms.android?.locales[locale] ?? {};
  return { language: locale, title: fields.title ?? "", shortDescription: fields.short_description ?? "", fullDescription: playFullDescription(listing, locale) };
}

// --- Accessibility (bipe-chat/bipe#503) ---------------------------------------------------------------
// product/accessibility.json answers Apple's accessibility labels (`appStore.labels`): a label is yes on a
// platform only when every register item it names is yes there. appstore.md holds the result as the
// `## Accessibility` table, and the Play full description holds one paragraph made from the same rows.
// `node tools/check-appstore.mjs --write` writes both; the check fails when they differ from the register.

/** Column title of each App Store device family in the `## Accessibility` table. */
export const DEVICE_FAMILY_COLUMNS = { IPHONE: "iPhone", IPAD: "iPad" };
const PLAY_LOCALE = { "pt-BR": "pt", "en-US": "en" };

/** The answer of each Apple label on `platform` (ios or android), from the register. */
export function accessibilityAnswers(a11y, platform) {
  const items = new Map(a11y.items.map((it) => [it.id, it]));
  return a11y.appStore.labels.map((label) => ({
    ...label,
    supported: label.items.length > 0 && label.items.every((id) => items.get(id)?.status?.[platform] === "yes"),
  }));
}

/** Problems of the appStore block of the register. */
export function checkAccessibilityLabels(a11y) {
  const problems = [];
  const ids = new Set(a11y.items.map((it) => it.id));
  for (const label of a11y.appStore?.labels ?? []) {
    for (const id of label.items) if (!ids.has(id)) problems.push(`accessibility.json appStore ${label.id}: unknown item ${id}`);
    if (!/^supports[A-Z]\w+$/.test(label.attribute ?? "")) problems.push(`accessibility.json appStore ${label.id}: attribute`);
  }
  for (const f of a11y.appStore?.deviceFamilies ?? []) if (!DEVICE_FAMILY_COLUMNS[f]) problems.push(`accessibility.json appStore: unknown device family ${f}`);
  return problems;
}

/** The `## Accessibility` section of appstore.md, made from the register. */
export function accessibilitySection(a11y) {
  const families = a11y.appStore.deviceFamilies;
  const answers = accessibilityAnswers(a11y, "ios");
  const head = `| Label | Attribute | ${families.map((f) => DEVICE_FAMILY_COLUMNS[f]).join(" | ")} | Register items |`;
  const rule = `|---|---|${families.map(() => "---|").join("")}---|`;
  const rows = answers.map((a) => `| ${a.name} | ${a.attribute} | ${families.map(() => (a.supported ? "yes" : "no")).join(" | ")} | ${a.items.join(", ") || "-"} |`);
  return [
    "## Accessibility",
    "",
    `Apple's accessibility labels per device family (bipe-chat/bipe#503), from \`product/accessibility.json\` (register of ${a11y.date}). A label is yes only when every register item it names is yes on iOS. Written by \`node tools/check-appstore.mjs --write\`; do not edit the table. bipe-app \`node tools/asc.mjs accessibility\` sends it. Apple asks that a label is declared only when the common tasks pass with that feature on: the declaration goes out after MZ's hand test.`,
    "",
    head,
    rule,
    ...rows,
  ].join("\n");
}

/** The accessibility paragraph of the Play full description of a locale, made from the Android answers. */
export function playAccessibilityBlock(a11y, locale) {
  const l = PLAY_LOCALE[locale];
  const lines = accessibilityAnswers(a11y, "android").filter((a) => a.supported && a.play).map((a) => `• ${a.play[l]}`);
  const frame = a11y.appStore.play[l];
  return [frame.title, "", ...lines, "", frame.end].join("\n");
}

/** The declaration of each device family from the appstore.md table, as the App Store Connect API takes it. */
export function ascAccessibility(listing) {
  const rows = listing.accessibility ?? [];
  return Object.entries(DEVICE_FAMILY_COLUMNS)
    .filter(([, column]) => rows.length && column in rows[0])
    .map(([deviceFamily, column]) => ({
      deviceFamily,
      labels: rows.map((r) => ({ name: r.Label, attribute: r.Attribute, supported: r[column] === "yes" })),
      attributes: Object.fromEntries(rows.map((r) => [r.Attribute, r[column] === "yes"])),
    }));
}

/** Writes the register's answers into appstore.md text: the section and the Play paragraphs. */
export function writeAccessibility(text, a11y) {
  const section = accessibilitySection(a11y);
  let out = /^## Accessibility$/m.test(text)
    ? text.replace(/^## Accessibility\n[\s\S]*?(?=^## )/m, `${section}\n\n`)
    : text.replace(/^## App Privacy$/m, `${section}\n\n## App Privacy`);
  for (const locale of LOCALES) {
    const block = playAccessibilityBlock(a11y, locale);
    const frame = a11y.appStore.play[PLAY_LOCALE[locale]];
    const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const existing = new RegExp(`^${escape(frame.title)}\\n[\\s\\S]*?^${escape(frame.end)}$`, "m");
    const android = out.indexOf("## Platform: Android");
    const head = out.slice(0, android);
    let tail = out.slice(android);
    const start = tail.indexOf(`### ${locale}`);
    const end = tail.indexOf("\n### ", start + 1);
    let part = tail.slice(start, end < 0 ? undefined : end);
    if (existing.test(part)) part = part.replace(existing, block);
    else {
      const marker = locale === "pt-BR" ? "Por enquanto, o Bipe abre por convite." : "For now, Bipe opens by invite.";
      if (!part.includes(marker)) throw new Error(`appstore.md: no place for the accessibility paragraph in android.${locale}.full_description`);
      part = part.replace(marker, `${block}\n\n${marker}`);
    }
    tail = tail.slice(0, start) + part + (end < 0 ? "" : tail.slice(end));
    out = head + tail;
  }
  return out;
}

/** Problems when appstore.md differs from the register's answers. */
export function checkAccessibility(listing, a11y) {
  const problems = checkAccessibilityLabels(a11y);
  if (problems.length) return problems;
  const expected = ascAccessibility(parseAppstore(`${accessibilitySection(a11y)}\n`));
  const actual = ascAccessibility(listing);
  if (JSON.stringify(expected) !== JSON.stringify(actual)) problems.push("accessibility: the table differs from product/accessibility.json (run node tools/check-appstore.mjs --write)");
  for (const locale of LOCALES) {
    if (!playFullDescription(listing, locale).includes(playAccessibilityBlock(a11y, locale)))
      problems.push(`android.${locale}.full_description: the accessibility paragraph differs from product/accessibility.json (run node tools/check-appstore.mjs --write)`);
  }
  return problems;
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
    for (const p of panels) for (const col of ["title", "sub"]) out.push([`screenshots.${locale}.${p.slug}.${col}`, p[col] ?? "", locale]);
  return out;
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
        const value = fields[field];
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
      if (!p.title) problems.push(`${where}: missing title`);
      if (!p.sub) problems.push(`${where}: missing sub`);
      for (const col of ["title", "sub"]) if ((p[col] ?? "").includes("*")) problems.push(`${where}.${col}: no highlight markup`);
      if ((p.title ?? "").length > TITLE_MAX) problems.push(`${where}.title: ${p.title.length} characters, limit ${TITLE_MAX}`);
      if ((p.sub ?? "").length > SUB_MAX) problems.push(`${where}.sub: ${p.sub.length} characters, limit ${SUB_MAX}`);
      // MZ, 20 October 2026: the sub is one sentence.
      if (/[.?!]\s+\S/.test(p.sub ?? "")) problems.push(`${where}.sub: one sentence only`);
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
