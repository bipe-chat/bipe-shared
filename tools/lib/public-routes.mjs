// The public routes of api/openapi.yaml: operations with `security: []` take no access token.
// bipe-web lists them on its docs page (/docs/links/), so the list follows the contract with no copy.
// Pure function on the YAML text, no node:fs: bipe-web runs it in its page build.
// Reads the style of openapi.yaml: a path at 2 spaces, a method at 4, its keys at 6.

const METHODS = new Set(["get", "post", "put", "patch", "delete"]);

const scalar = (value) => value.trim().replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
/** "Public profile by exact handle (ADR 0041)" -> "Public profile by exact handle". */
const plain = (text) => text.replace(/\s*\((?:ADR|bipe#|issue|docs\/|bipe-chat\/)[^)]*\)/g, "").trim();

/** Every operation: { method, path, summary, summaryPt, description, public }. */
export function operations(yaml) {
  const ops = [];
  let path = null;
  let op = null;
  let block = null; // the key of a folded or literal block at 6 spaces
  for (const line of yaml.split("\n")) {
    let m;
    if (/^\S/.test(line)) { path = null; op = null; block = null; if (line.startsWith("paths:")) path = ""; continue; }
    if (path === null) continue;
    if ((m = line.match(/^  (\/\S*):\s*$/))) { path = m[1]; op = null; block = null; continue; }
    if ((m = line.match(/^    (\w+):/))) {
      block = null;
      op = METHODS.has(m[1]) ? { method: m[1].toUpperCase(), path, summary: "", summaryPt: "", description: "", public: false } : null;
      if (op) ops.push(op);
      continue;
    }
    if (!op) continue;
    if ((m = line.match(/^      ([\w-]+):\s?(.*)$/))) {
      const [, key, value] = m;
      block = /^[>|][-+]?$/.test(value) ? key : null;
      if (key === "summary") op.summary = scalar(value);
      else if (key === "x-summary-pt") op.summaryPt = scalar(value);
      else if (key === "description" && !block) op.description = scalar(value);
      else if (key === "security" && value.trim() === "[]") op.public = true;
      continue;
    }
    if (block === "description" && /^ {8}/.test(line)) op.description += ` ${line.trim()}`;
  }
  return ops;
}

/** The public routes, in contract order: { method, path, en, pt }. Throws on a public route with no pt summary. */
export function publicRoutes(yaml) {
  return operations(yaml).filter((o) => o.public).map((o) => {
    if (!o.summaryPt) throw new Error(`openapi.yaml: ${o.method} ${o.path} has security: [] but no x-summary-pt`);
    return { method: o.method, path: o.path, en: plain(o.summary), pt: plain(o.summaryPt) };
  });
}
