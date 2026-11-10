// Translates a registry regex (JavaScript syntax, no flags) into a pattern for the Rust `regex` crate in bipe-core
// (docs/scam-matching.md). The Rust crate has no look-around, so the registry may use it only as one leading
// `(?<![...])` and one trailing `(?![...])` of ASCII characters. The translation consumes one guard character in
// their place and puts the JavaScript match in capture group 1:
//   (?<![C])BODY(?![D])  ->  (?:^|[^C])(BODY)(?:[^D]|$)
// The Rust crate prefers alternatives in the same order as a backtracking engine, so group 1 is the JavaScript
// match, so a capture group n of the JavaScript regex is group n + 1. Anything outside the supported subset throws, so
// the registry validation fails closed.

// JavaScript `\s`: WhiteSpace (with every Zs character) and LineTerminator (ECMA-262).
const JS_SPACE_ITEMS = String.raw`\t\n\x0B\x0C\r \xA0\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}`;
// JavaScript `.` without the s flag: anything except a LineTerminator.
const JS_DOT = String.raw`[^\n\r\x{2028}\x{2029}]`;
// Escapes that mean the same character in both engines.
const RUST_META = new Set([..."\\.+*?()|[]{}^$#&-~"]);

const GUARD_BEFORE = /^\(\?<!\[([^\]\\]*)\]\)/;
const GUARD_AFTER = /\(\?!\[([^\]\\]*)\]\)$/;

export function rustRegex(source) {
  if (!/^[\x20-\x7e]*$/.test(source)) throw new Error("regex must be printable ASCII");
  let body = source;
  let before = null;
  let after = null;
  const b = GUARD_BEFORE.exec(body);
  if (b) { before = b[1]; body = body.slice(b[0].length); }
  const a = GUARD_AFTER.exec(body);
  if (a) { after = a[1]; body = body.slice(0, -a[0].length); }
  for (const guard of [before, after]) if (guard !== null && (guard === "" || guard.startsWith("^"))) throw new Error("look-around must be one non-negated character class");
  const translated = translateBody(body);
  const regex = (before === null ? "" : `(?:^|[^${before}])`) + `(${translated})` + (after === null ? "" : `(?:[^${after}]|$)`);
  return { regex, guardBefore: before !== null };
}

function translateBody(body) {
  let out = "";
  let inClass = false;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === "\\") {
      const e = body[++i];
      if (e === undefined) throw new Error("trailing backslash");
      if (e === "s") out += inClass ? JS_SPACE_ITEMS : `[${JS_SPACE_ITEMS}]`;
      else if (e === "d") out += inClass ? "0-9" : "[0-9]";
      else if (RUST_META.has(e)) out += `\\${e}`;
      else if (e === "/") out += "/";
      else if (e === "u" && /^[0-9a-fA-F]{4}$/.test(body.slice(i + 1, i + 5))) {
        // One BMP character; a surrogate would be half of an astral character, which this subset does not allow.
        const hex = body.slice(i + 1, i + 5);
        if (/^d[89a-f]/i.test(hex)) throw new Error("surrogate escape");
        out += `\\x{${hex}}`;
        i += 4;
      }
      else throw new Error(`unsupported escape \\${e}`);
      continue;
    }
    if (inClass) {
      if (c === "[") throw new Error("nested character class");
      if (c === "]") inClass = false;
      out += c;
      continue;
    }
    if (c === "[") {
      // A negated class matches one UTF-16 unit in JavaScript and one scalar in Rust: not allowed in the body.
      if (body[i + 1] === "^") throw new Error("negated character class");
      inClass = true;
      out += c;
      continue;
    }
    if (c === ".") {
      // One astral character is two JavaScript units, so `.` is allowed only under an unbounded quantifier.
      if (body[i + 1] !== "*" && body[i + 1] !== "+") throw new Error("`.` needs * or +");
      out += JS_DOT;
      continue;
    }
    if (c === "(" && body[i + 1] === "?") {
      if (body.startsWith("(?:", i)) { out += "(?:"; i += 2; continue; }
      // Case-insensitive ASCII only: Unicode folding would also match "ſ" for "s" and "K" (Kelvin) for "k".
      if (body.startsWith("(?i:", i)) { out += "(?i-u:"; i += 3; continue; }
      throw new Error("look-around or group flag outside the guards");
    }
    out += c;
  }
  if (inClass) throw new Error("unclosed character class");
  return out;
}
