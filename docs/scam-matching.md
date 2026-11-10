# Scam matching, normalization and registry regexes in bipe-core

bipe-core (bipe-app `core/`, ADR 0267) runs `normalize`, `scamMatchIDs`, `linkHosts` and `scamWarningKind` for iOS and Android. The reference is `tools/lib/registries.mjs`. The core must pass `test-vectors/normalization.json`, `scam-detection.json` and `scam-warnings.json`. This page gives the rules a port must keep.

## normalize(input, map)

1. NFKD.
2. Remove every General_Category Mark character.
3. Lowercase with the full Unicode mapping, as JavaScript `toLowerCase()` does. This includes the final sigma rule and "İ" to "i" plus U+0307.
4. Replace each code point that is a key of `map` with its value. Keys are single code points.
5. Replace each run of JavaScript `\s` with one space. Then remove spaces at the start and the end.

JavaScript `\s` is TAB, LF, VT, FF, CR, U+0020, U+00A0, U+1680, U+2000 to U+200A, U+2028, U+2029, U+202F, U+205F, U+3000 and U+FEFF. It is not the Unicode White_Space property: U+0085 is not in it, and U+FEFF is.

There are three maps: `registries/homoglyphs.json` (names), the host map (`hostHomoglyphs`: the same map without the ASCII keys outside `[0-9a-z]`), and no map (phrases and keywords).

## Regex subset

The registry regexes are JavaScript regexes without flags. The Rust `regex` crate has no look-around. `tools/lib/rust-regex.mjs` translates each regex, and the generator fails on a regex outside this subset:

- Printable ASCII only.
- Look-around only as one leading `(?<![...])` and one trailing `(?![...])`, each with one non-negated class.
- No negated class in the body.
- `.` only before `*` or `+`. One astral character is two JavaScript units, so a bounded count would differ.
- Groups: `(...)`, `(?:...)` and `(?i:...)`. `(?i:...)` becomes `(?i-u:...)`, because Unicode case folding matches "ſ" for "s".
- Escapes: `\s`, `\d`, `\uXXXX` (no surrogate) and escaped punctuation.
- A capture group n of the JavaScript regex is group n + 1 in Rust, because group 1 holds the whole match.

The translation is `(?<![C])BODY(?![D])` to `(?:^|[^C])(BODY)(?:[^D]|$)`. Each guard consumes one character. Capture group 1 is the JavaScript match. The `regex` crate selects among alternatives in the order of a backtracking engine, so group 1 is the same text that JavaScript returns.

## Iteration

`linkHosts` takes every match, as JavaScript `matchAll` does. The next search starts at the end of group 1, not at the end of the whole match. When the pattern has a leading guard, start the next search one character earlier, so that the guard can consume the last character of the previous match.

## Indexes

`linkHosts` takes the plain host from the same UTF-16 range of the unfolded text. The two texts have the same UTF-16 length when host folding keeps every index. When the lengths differ, the plain host is "". Convert byte offsets to UTF-16 offsets before you take the range.

Phrase and keyword checks compare strings, so they do not depend on the unit.
