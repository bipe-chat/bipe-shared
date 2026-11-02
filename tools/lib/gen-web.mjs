// The web client target (bipe-chat/bipe#901, ADR 0216): bipe-app web/src/bipe/generated. The browser gets the same
// registries, strings, screen ids, colour tokens and reference rules as iOS, Android and bipe-api.
//   registries.json  the validated registries (loadRegistries), as data
//   strings.ts       pt-BR (default) and en, with t() for %1$s placeholders
//   screens.ts       the screen ids of product/screens
//   tokens.css       the colour tokens as CSS custom properties
//   lib/*.mjs        the reference rules, copied; registries.mjs without its Node loader
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Reference rules that run in a browser as they are. registries.mjs is handled apart. */
const PURE_LIBS = ["trust.mjs", "agenda-templates.mjs", "gen-settings.mjs", "gen-onboarding.mjs", "gen-haptics.mjs", "pix.mjs", "cvm.mjs", "notice.mjs", "govbr.mjs"];

/** registries.mjs without `loadRegistries` and its node:fs and node:path imports. Fails when the file moved. */
export function browserRegistries(source) {
  const nodeImport = /^import \{[^}]*\} from "node:[a-z/]+";\n/gm;
  if (!nodeImport.test(source)) throw new Error("gen-web: registries.mjs no longer imports from node:");
  let out = source.replace(nodeImport, "");
  const start = out.indexOf("export function loadRegistries(root) {");
  const end = start < 0 ? -1 : out.indexOf("\n}\n", start);
  if (start < 0 || end < 0) throw new Error("gen-web: registries.mjs no longer has loadRegistries(root)");
  out = out.slice(0, start) + out.slice(end + 3).replace(/^\n+/, "");
  if (/node:|readFileSync|existsSync|loadRegistries/.test(out)) throw new Error("gen-web: registries.mjs still needs Node after the loader is removed");
  return out;
}

const tsString = (s) => JSON.stringify(s);

function stringsModule(header, ptBR, en) {
  const keys = Object.keys(ptBR);
  const missing = keys.filter((k) => !(k in en));
  if (missing.length) throw new Error(`gen-web: en has no ${missing.slice(0, 3).join(", ")}`);
  const table = (strings) => `{\n${keys.map((k) => `  ${k}: ${tsString(strings[k])},`).join("\n")}\n}`;
  return `${header}
// pt-BR is the default language; en is the alternative.

export const ptBR = ${table(ptBR)} as const;

export type StringKey = keyof typeof ptBR;

export const en: Record<StringKey, string> = ${table(en)};

export type Locale = "pt-BR" | "en";

/** The string of key in locale, with %1$s, %2$s, ... replaced by args in order. */
export function t(key: StringKey, args: string[] = [], locale: Locale = "pt-BR"): string {
  const text: string = locale === "en" ? en[key] : ptBR[key];
  return text.replace(/%(\\d+)\\$s/g, (whole: string, n: string) => args[Number(n) - 1] ?? whole);
}
`;
}

function screensModule(header, screens) {
  return `${header}
/** Screen ids of Bipe's own client. iOS, Android and the web use the same ids. */
export const BipeScreen = {
${screens.map((s) => `  /** ${s.title} (flow ${s.flow}). Spec: bipe-shared/product/screens/${s.id}.json */\n  ${s.id.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase())}: ${tsString(s.id)},`).join("\n")}
} as const;

export type BipeScreenId = (typeof BipeScreen)[keyof typeof BipeScreen];
`;
}

/**
 * Writes the web target. `license` is the app licence text (no comment marks), `header` the "Generated" lines as
 * // comments, `check` throws when an Element name would reach bipe-app.
 */
export function writeWeb(dir, { root, reg, screens, css, businessApi, license, header, check }) {
  const js = `${license.replace(/^(?=.)/gm, "// ")}${header}`;
  const block = `/*\n${license.replace(/^(?=.)/gm, " * ")}${header.replace(/^\/\/ /gm, " * ")} */\n`;
  const write = (file, text) => {
    check(text);
    writeFileSync(join(dir, file), text);
  };
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, "lib"), { recursive: true });
  write("registries.json", `${JSON.stringify(reg, null, 1)}\n`);
  write("strings.ts", stringsModule(js, reg.strings.strings, reg.stringsEn.strings));
  write("screens.ts", screensModule(js.replace("bipe-shared/registries and bipe-shared/strings", "bipe-shared/product/screens"), screens));
  write("business-api.ts", `${license.replace(/^(?=.)/gm, "// ")}${businessApi}`);
  write("tokens.css", `${block.replace("bipe-shared/registries and bipe-shared/strings", "bipe-shared/design/tokens.json")}\n${css}`);
  const libHeader = js.replace("bipe-shared/registries and bipe-shared/strings", "bipe-shared/tools/lib (reference rules)");
  write("lib/registries.mjs", `${libHeader}\n${browserRegistries(readFileSync(join(root, "tools/lib/registries.mjs"), "utf8"))}`);
  for (const file of PURE_LIBS) write(`lib/${file}`, `${libHeader}\n${readFileSync(join(root, "tools/lib", file), "utf8")}`);
}
