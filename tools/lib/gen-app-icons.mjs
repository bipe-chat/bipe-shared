// App icons of the app theme (bipe-chat/bipe#811, design/tokens.json appThemes): a white Bipe mark on the
// icon background of each palette. iOS gets one 1024 px PNG per palette in an asset catalog; Android gets the
// colours and the mark as resources for its adaptive icons.
// The PNG writer is Bipe's own (Node built-ins only): indexed colour, one fixed-Huffman deflate stream with
// distance-1 runs. The output depends on nothing but the input, so the drift check is stable on every Node version.
import { loadTokens } from "../../design/ramps/ramp.mjs";
import { appIconColors, iosIconName } from "./gen-tokens.mjs";

export const IOS_ICON_SIZE = 1024;
const SUPERSAMPLE = 4;

// SVG path data with M, H, V, C, Z (absolute) and m, h, v, c, z (relative): the commands the mark uses.
// Curves become polylines of 32 segments each. Returns closed polygons in path units.
export function parsePath(d) {
  const tokens = d.match(/[MmHhVvCcLlZz]|-?(?:\d+\.?\d*|\.\d+)/g) ?? [];
  const polygons = [];
  let poly = [];
  let x = 0;
  let y = 0;
  let cmd = "";
  let i = 0;
  const num = () => {
    const n = Number(tokens[i++]);
    if (!Number.isFinite(n)) throw new Error(`gen-app-icons: bad number in path "${d}"`);
    return n;
  };
  while (i < tokens.length) {
    if (/[A-Za-z]/.test(tokens[i])) cmd = tokens[i++];
    const rel = cmd === cmd.toLowerCase();
    switch (cmd.toUpperCase()) {
      case "M": {
        if (poly.length) polygons.push(poly);
        const nx = num();
        const ny = num();
        x = rel ? x + nx : nx;
        y = rel ? y + ny : ny;
        poly = [[x, y]];
        cmd = rel ? "l" : "L";
        break;
      }
      case "L": {
        const nx = num();
        const ny = num();
        x = rel ? x + nx : nx;
        y = rel ? y + ny : ny;
        poly.push([x, y]);
        break;
      }
      case "H":
        x = rel ? x + num() : num();
        poly.push([x, y]);
        break;
      case "V":
        y = rel ? y + num() : num();
        poly.push([x, y]);
        break;
      case "C": {
        const p = [num(), num(), num(), num(), num(), num()];
        const [x1, y1, x2, y2, x3, y3] = rel ? p.map((v, k) => v + (k % 2 ? y : x)) : p;
        for (let s = 1; s <= 32; s++) {
          const t = s / 32;
          const u = 1 - t;
          poly.push([
            u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
            u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
          ]);
        }
        x = x3;
        y = y3;
        break;
      }
      case "Z":
        if (poly.length) polygons.push(poly);
        poly = [];
        break;
      default:
        throw new Error(`gen-app-icons: path command "${cmd}" is not supported`);
    }
  }
  if (poly.length) polygons.push(poly);
  return polygons;
}

// Coverage (0 to 1) of each pixel by the polygons, nonzero rule. Each pixel row takes SUPERSAMPLE scanlines;
// along a scanline, span ends count with their exact fraction.
export function rasterise(polygons, size) {
  const cover = new Float64Array(size * size);
  const edges = polygons.flatMap((poly) => poly.map((a, k) => [a, poly[(k + 1) % poly.length]]))
    .filter(([a, b]) => a[1] !== b[1]);
  for (let row = 0; row < size; row++) {
    for (let s = 0; s < SUPERSAMPLE; s++) {
      const sy = row + (s + 0.5) / SUPERSAMPLE;
      const hits = [];
      for (const [a, b] of edges) {
        const [lo, hi, dir] = a[1] < b[1] ? [a, b, 1] : [b, a, -1];
        if (sy < lo[1] || sy >= hi[1]) continue;
        hits.push([lo[0] + ((sy - lo[1]) / (hi[1] - lo[1])) * (hi[0] - lo[0]), dir]);
      }
      hits.sort((p, q) => p[0] - q[0]);
      let winding = 0;
      for (let k = 0; k < hits.length - 1; k++) {
        winding += hits[k][1];
        if (winding === 0) continue;
        const x0 = Math.max(0, hits[k][0]);
        const x1 = Math.min(size, hits[k + 1][0]);
        for (let px = Math.floor(x0); px < x1; px++) {
          const w = Math.min(px + 1, x1) - Math.max(px, x0);
          if (w > 0) cover[row * size + px] += w / SUPERSAMPLE;
        }
      }
    }
  }
  return cover;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// zlib stream of one fixed-Huffman deflate block (RFC 1950, RFC 1951). Repeats of the previous byte become
// length codes at distance 1; everything else is a literal.
const LENGTH_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LENGTH_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
export function zlibFixed(data) {
  const out = [0x78, 0x01];
  let bitBuf = 0;
  let bitLen = 0;
  const bits = (value, n) => {
    for (let k = 0; k < n; k++) {
      bitBuf |= ((value >>> k) & 1) << bitLen;
      if (++bitLen === 8) {
        out.push(bitBuf);
        bitBuf = 0;
        bitLen = 0;
      }
    }
  };
  // Huffman codes go most significant bit first.
  const code = (value, n) => {
    for (let k = n - 1; k >= 0; k--) bits((value >>> k) & 1, 1);
  };
  const symbol = (sym) => {
    if (sym < 144) code(0x30 + sym, 8);
    else if (sym < 256) code(0x190 + sym - 144, 9);
    else if (sym < 280) code(sym - 256, 7);
    else code(0xc0 + sym - 280, 8);
  };
  bits(1, 1); // last block
  bits(1, 2); // fixed Huffman
  let i = 0;
  while (i < data.length) {
    let run = 0;
    if (i > 0) while (run < 258 && i + run < data.length && data[i + run] === data[i - 1]) run++;
    if (run >= 3) {
      let k = LENGTH_BASE.length - 1;
      while (LENGTH_BASE[k] > run) k--;
      symbol(257 + k);
      bits(run - LENGTH_BASE[k], LENGTH_EXTRA[k]);
      code(0, 5); // distance code 0: distance 1
      i += run;
    } else {
      symbol(data[i]);
      i++;
    }
  }
  symbol(256);
  if (bitLen) out.push(bitBuf);
  let a = 1;
  let b = 0;
  for (const byte of data) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  out.push((b >>> 8) & 0xff, b & 0xff, (a >>> 8) & 0xff, a & 0xff);
  return Uint8Array.from(out);
}

function chunk(type, data) {
  const body = Uint8Array.from([...Buffer.from(type, "ascii"), ...data]);
  const len = data.length;
  const crc = crc32(body);
  return [(len >>> 24) & 0xff, (len >>> 16) & 0xff, (len >>> 8) & 0xff, len & 0xff, ...body,
    (crc >>> 24) & 0xff, (crc >>> 16) & 0xff, (crc >>> 8) & 0xff, crc & 0xff];
}

const rgb = (hex) => [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16));

// An opaque, full-bleed square PNG: the mark in white on the background. iOS rounds the corners itself.
export function iconPng(mark, background, size = IOS_ICON_SIZE) {
  const { path, viewBox, scale, offset } = mark;
  const unit = size / viewBox;
  const polygons = parsePath(path).map((poly) => poly.map(([x, y]) => [(offset + x * scale) * unit, (offset + y * scale) * unit]));
  const cover = rasterise(polygons, size);
  const bg = rgb(background);
  // Palette index = coverage in 256 levels; only the levels in use get an entry, in order.
  const levels = Uint8Array.from(cover, (c) => Math.round(Math.min(1, c) * 255));
  const used = [...new Set(levels)].sort((p, q) => p - q);
  const index = new Map(used.map((level, k) => [level, k]));
  const plte = used.flatMap((level) => bg.map((c) => Math.round(c + ((255 - c) * level) / 255)));
  const raw = new Uint8Array(size * (size + 1));
  for (let row = 0; row < size; row++) {
    raw[row * (size + 1)] = 0; // filter: none
    for (let px = 0; px < size; px++) raw[row * (size + 1) + 1 + px] = index.get(levels[row * size + px]);
  }
  const ihdr = [(size >>> 24) & 0xff, (size >>> 16) & 0xff, (size >>> 8) & 0xff, size & 0xff,
    (size >>> 24) & 0xff, (size >>> 16) & 0xff, (size >>> 8) & 0xff, size & 0xff, 8, 3, 0, 0, 0];
  return Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...chunk("IHDR", ihdr), ...chunk("PLTE", plte), ...chunk("IDAT", zlibFixed(raw)), ...chunk("IEND", [])]);
}

// Files for bipe-app. Paths are relative to ios/BipeKit/Sources/BipeKit/Generated and android/libraries/bipe/src/main.
export function generateAppIcons(tokens = loadTokens(), { xmlHeader }) {
  const mark = tokens.appThemes.icon;
  const icons = appIconColors(tokens);
  const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
  const ios = { "AppIcons.xcassets/Contents.json": json({ info: { author: "bipe-shared tools/gen.mjs", version: 1 } }) };
  for (const { palette, background } of icons) {
    const set = `AppIcons.xcassets/${iosIconName(palette)}.appiconset`;
    ios[`${set}/Contents.json`] = json({
      images: [{ filename: "icon.png", idiom: "universal", platform: "ios", size: `${IOS_ICON_SIZE}x${IOS_ICON_SIZE}` }],
      info: { author: "bipe-shared tools/gen.mjs", version: 1 },
    });
    ios[`${set}/icon.png`] = iconPng(mark, background);
  }
  // The adaptive icon canvas is 108 dp; the mark stays inside the 66 dp safe zone (androidScale of the 64-unit mark).
  const shift = (108 - mark.viewBox * mark.androidScale) / 2;
  const android = {
    "res/values/bipe_app_icons.xml": `<?xml version="1.0" encoding="utf-8"?>
${xmlHeader}
<resources>
${icons.map(({ palette, background }) => `    <color name="bipe_app_icon_${palette}">${background}</color>`).join("\n")}
</resources>
`,
    "res/drawable/bipe_app_icon_mark.xml": `<?xml version="1.0" encoding="utf-8"?>
${xmlHeader}
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <group
        android:scaleX="${mark.androidScale}"
        android:scaleY="${mark.androidScale}"
        android:translateX="${shift}"
        android:translateY="${shift}">
        <path
            android:fillColor="#FFFFFF"
            android:pathData="${mark.path}" />
    </group>
</vector>
`,
  };
  return { ios, android };
}
