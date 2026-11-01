// The Salada de frutas chat background (ADR 0215): outlined Brazilian fruit and small fillers on a seamless tile.
// Draft artwork. Drawn artwork replaces the GLYPHS below; the apps only read the generated data.
//
// A glyph sits on a 48-unit box and has three kinds of path: bodies (filled with chat.fruitFill, then stroked in
// chat.fruit), lines (stroked in chat.fruit) and dots (filled with chat.fruit). Paths use four commands only, so
// Swift and Kotlin draw them with no SVG parser: [0, x, y] move, [1, x, y] line, [2, x1, y1, x2, y2, x, y] cubic,
// [3] close. fruitTile() packs the glyphs with a fixed seed, so every build makes the same tile.

const K = 0.5522847498; // cubic handle length for a quarter circle

/** A path builder. Every method takes absolute coordinates on the 48-unit box. */
class P {
  constructor() { this.c = []; this.x = 0; this.y = 0; }
  M(x, y) { this.c.push([0, x, y]); this.x = x; this.y = y; this.sx = x; this.sy = y; return this; }
  L(x, y) { this.c.push([1, x, y]); this.x = x; this.y = y; return this; }
  C(a, b, c, d, x, y) { this.c.push([2, a, b, c, d, x, y]); this.x = x; this.y = y; return this; }
  /** Quadratic as a cubic. */
  Q(a, b, x, y) { return this.C(this.x + (2 / 3) * (a - this.x), this.y + (2 / 3) * (b - this.y), x + (2 / 3) * (a - x), y + (2 / 3) * (b - y), x, y); }
  Z() { this.c.push([3]); this.x = this.sx; this.y = this.sy; return this; }
  /** A circular arc around (cx, cy) from angle a0 to a1 in degrees (screen axes: 90 is down), as cubics. Starts with a line to its start point unless the pen is there. */
  arc(cx, cy, r, a0, a1) {
    const pt = (a) => [cx + r * Math.cos((a * Math.PI) / 180), cy + r * Math.sin((a * Math.PI) / 180)];
    const [sx, sy] = pt(a0);
    if (!this.c.length) this.M(sx, sy); else if (Math.hypot(this.x - sx, this.y - sy) > 1e-6) this.L(sx, sy);
    const n = Math.ceil(Math.abs(a1 - a0) / 90);
    const step = (a1 - a0) / n;
    for (let i = 0; i < n; i++) {
      const s = a0 + i * step, e = s + step;
      const t = (4 / 3) * Math.tan(((e - s) * Math.PI) / 720) * r;
      const [x0, y0] = pt(s), [x3, y3] = pt(e);
      const rs = (s * Math.PI) / 180, re = (e * Math.PI) / 180;
      this.C(x0 - t * Math.sin(rs), y0 + t * Math.cos(rs), x3 + t * Math.sin(re), y3 - t * Math.cos(re), x3, y3);
    }
    return this;
  }
}

const p = () => new P();
/** Maps every point of the commands through f. */
const map = (cmds, f) => cmds.map((c) => {
  if (c[0] === 3) return c;
  const out = [c[0]];
  for (let i = 1; i < c.length; i += 2) out.push(...f(c[i], c[i + 1]));
  return out;
});
const rotate = (cmds, deg, cx, cy) => {
  const r = (deg * Math.PI) / 180, cos = Math.cos(r), sin = Math.sin(r);
  return map(cmds, (x, y) => [cx + (x - cx) * cos - (y - cy) * sin, cy + (x - cx) * sin + (y - cy) * cos]);
};
const circle = (cx, cy, r) => p().M(cx + r, cy).C(cx + r, cy + K * r, cx + K * r, cy + r, cx, cy + r)
  .C(cx - K * r, cy + r, cx - r, cy + K * r, cx - r, cy).C(cx - r, cy - K * r, cx - K * r, cy - r, cx, cy - r)
  .C(cx + K * r, cy - r, cx + r, cy - K * r, cx + r, cy).Z().c;
const ellipse = (cx, cy, rx, ry, rot = 0) => rotate(map(circle(0, 0, 1), (x, y) => [cx + x * rx, cy + y * ry]), rot, cx, cy);
/** A leaf from (x, y), `len` long and `w` wide, turned by `rot` degrees, with its vein. */
const leaf = (x, y, len, w, rot) => {
  const shape = p().M(0, 0).C(len * 0.3, -w, len * 0.7, -w, len, 0).C(len * 0.7, w, len * 0.3, w, 0, 0).Z().M(len * 0.2, 0).L(len * 0.75, 0).c;
  return map(rotate(shape, rot, 0, 0), (a, b) => [a + x, b + y]);
};
const star = (cx, cy, ro, ri, n = 5) => {
  const b = p();
  for (let i = 0; i < n * 2; i++) {
    const a = ((-90 + (i * 180) / n) * Math.PI) / 180, r = i % 2 ? ri : ro;
    const [x, y] = [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    if (i) b.L(x, y); else b.M(x, y);
  }
  return b.Z().c;
};
const polar = (cx, cy, r, deg) => [cx + r * Math.cos((deg * Math.PI) / 180), cy + r * Math.sin((deg * Math.PI) / 180)];

/** A glyph: bodies, lines and dots, each a list of paths. */
const g = ({ bodies = [], lines = [], dots = [] }) => ({ bodies, lines, dots });

const FRUITS = {
  acai: () => {
    const at = [[19, 18], [28, 18], [14.5, 26], [23.5, 26], [32.5, 26], [19, 34], [28, 34], [23.5, 42]];
    return g({
      lines: [p().M(24, 13).L(24, 6).M(24, 9).C(27, 3, 34, 3, 37, 5).C(34, 9, 28, 10, 24, 9).c],
      bodies: at.map(([x, y]) => circle(x, y, 4)),
      dots: [[19, 18], [28, 18], [23.5, 26], [28, 34]].map(([x, y]) => circle(x - 1.4, y - 1.4, 0.9)),
    });
  },
  goiaba: () => g({
    bodies: [p().M(24, 10).C(30, 10, 33, 14, 33, 18).C(39, 21, 42, 27, 41, 32).C(40, 40, 33, 44, 24, 44).C(15, 44, 8, 40, 7, 32).C(6, 27, 9, 21, 15, 18).C(15, 14, 18, 10, 24, 10).Z().c],
    lines: [p().M(24, 10).L(25, 5).c, leaf(25, 6, 12, 3.5, -20), p().M(13, 31).Q(13.5, 25, 17.5, 22).c, p().M(22, 44).L(24, 41.5).L(26, 44).c],
  }),
  pitanga: () => g({
    bodies: [ellipse(24, 28, 18, 13)],
    lines: [p().M(17, 16.5).Q(12.5, 28, 17, 39.5).M(31, 16.5).Q(35.5, 28, 31, 39.5).M(24, 15).L(24, 41).c, p().M(19, 15.5).L(24, 17.5).L(29, 15.5).M(24, 15).L(25.5, 8).c],
  }),
  maracuja: () => g({
    bodies: [circle(24, 24, 18)],
    lines: [circle(24, 24, 13.5)],
    dots: [...[0, 1, 2, 3, 4, 5, 6].map((i) => circle(...polar(24, 24, 7.5, i * (360 / 7)), 1.7)), circle(24, 24, 1.7)],
  }),
  jenipapo: () => g({
    bodies: [ellipse(23, 28, 12.5, 16, -15)],
    lines: [p().M(27, 12.5).L(30, 5).c, leaf(30, 6, 10, 3, -30), circle(18, 42, 1.8)],
    dots: [[19, 24], [25, 22], [27, 30], [20, 32], [24, 37]].map(([x, y]) => circle(x, y, 1.3)),
  }),
  jabuticaba: () => {
    const at = [[17, 24], [29, 32], [32, 15]];
    return g({
      lines: [p().M(5, 42).C(15, 33, 27, 22, 43, 7).c, ...at.map(([x, y]) => p().arc(x, y, 3.6, 180, 270).c)],
      bodies: at.map(([x, y]) => circle(x, y, 6)),
    });
  },
  caju: () => g({
    bodies: [p().M(15, 9).C(19, 6, 29, 6, 33, 9).C(35, 17, 35, 25, 31, 29).C(28, 32, 20, 32, 17, 29).C(13, 25, 13, 17, 15, 9).Z().c],
    lines: [p().M(19, 32).C(15, 37, 18, 44, 24, 44).C(30, 44, 32, 39, 29, 36).C(27, 34, 25, 37, 23.5, 35.5).C(22.5, 34, 21, 32, 19, 32).c, p().M(19, 14).Q(18, 20, 19.5, 24).c, p().M(24, 7).L(24, 3).c],
  }),
  banana: () => g({
    bodies: [p().M(8, 12).C(9, 30, 24, 42, 42, 36).C(40, 33, 37, 33, 35, 34).C(22, 36, 14, 27, 12, 12).C(11.5, 10, 8.5, 10, 8, 12).Z().c],
    lines: [p().M(8, 12).L(7.5, 8).c, p().M(13, 20).C(16, 28, 23, 32, 31, 33).c],
  }),
  abacaxi: () => g({
    bodies: [ellipse(24, 32, 11, 13.5)],
    lines: [
      p().M(17, 26).L(21, 30).L(25, 26).L(29, 30).M(15, 33).L(19, 37).L(23, 33).L(27, 37).L(31, 33).M(19, 40).L(23, 44).M(29, 40).L(25, 44).c,
      p().M(24, 18.5).L(24, 5).M(24, 18.5).L(17, 8).M(24, 18.5).L(31, 8).M(24, 18.5).L(13, 14).M(24, 18.5).L(35, 14).c,
    ],
  }),
  melancia: () => g({
    bodies: [p().arc(24, 16, 18, 180, 0).Z().c],
    lines: [p().arc(24, 16, 13.5, 180, 0).c],
    dots: [[18, 21], [24, 24], [30, 21], [21, 28], [27, 28]].map(([x, y]) => circle(x, y, 1.5)),
  }),
  coco: () => g({
    bodies: [circle(24, 26, 17)],
    lines: [p().M(12, 34).Q(16, 38, 22, 39).c],
    dots: [[20, 18], [28, 18], [24, 24]].map(([x, y]) => circle(x, y, 2)),
  }),
  limao: () => {
    const spokes = p();
    for (let i = 0; i < 8; i++) spokes.M(...polar(24, 24, 2.5, i * 45)).L(...polar(24, 24, 12, i * 45));
    return g({ bodies: [circle(24, 24, 18)], lines: [circle(24, 24, 14.5), spokes.c] });
  },
  manga: () => g({
    bodies: [p().M(14, 37).C(5, 29, 9, 13, 23, 11).C(35, 10, 42, 18, 39, 28).C(36, 37, 24, 43, 14, 37).Z().c],
    lines: [p().M(23, 11).L(24, 5).c, leaf(24, 6, 12, 3.5, -15), p().M(15, 30).Q(16, 22, 22, 19).c],
  }),
  carambola: () => g({ bodies: [star(24, 24, 19, 10)], lines: [star(24, 24, 9, 5)], dots: [circle(24, 24, 1.3)] }),
  cacau: () => g({
    bodies: [rotate(ellipse(24, 24, 10, 20), 32, 24, 24)],
    lines: [rotate(p().M(24, 4.5).L(24, 43.5).M(18, 7.5).Q(15, 24, 18, 40.5).M(30, 7.5).Q(33, 24, 30, 40.5).c, 32, 24, 24)],
  }),
  folha: () => g({ bodies: [leaf(7, 38, 40, 10, -40)], lines: [p().M(17, 31).L(19, 23).M(25, 26).L(28, 18).M(32, 20).L(35, 14).c] }),
};

const FILLERS = {
  ponto: () => g({ dots: [circle(24, 24, 5)] }),
  anel: () => g({ lines: [circle(24, 24, 8)] }),
  semente: () => g({ dots: [ellipse(24, 24, 4.5, 7, 30)] }),
  brilho: () => g({ lines: [p().M(24, 10).Q(26, 22, 38, 24).Q(26, 26, 24, 38).Q(22, 26, 10, 24).Q(22, 22, 24, 10).Z().c] }),
  folhinha: () => g({ lines: [leaf(8, 32, 32, 9, -35)] }),
  trio: () => g({ dots: [circle(12, 24, 3), circle(24, 24, 3), circle(36, 24, 3)] }),
  gota: () => g({ lines: [p().M(24, 8).C(30, 18, 34, 24, 34, 30).arc(24, 30, 10, 0, 180).C(14, 24, 18, 18, 24, 8).Z().c] }),
};

export const FRUIT_IDS = Object.keys(FRUITS);
export const FILLER_IDS = Object.keys(FILLERS);

/** Seeded PRNG (mulberry32). */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The tile: the glyphs (fruit first, then fillers) and their placements. Fruit go down in three sizes, largest
 * first, then fillers fill the holes, all on a torus so the tile repeats with no seam. A placement near an edge is
 * repeated on the other side, so a tile drawn with a clip to its square shows every glyph whole across the seam.
 */
export function fruitTile({ tile = 480, seed = 7, fruitSize = 46, fillerSize = 13, gap = 5, tilt = 45, stroke = 1.6, scale = 0.8 } = {}) {
  const ids = [...FRUIT_IDS, ...FILLER_IDS];
  const glyphs = ids.map((id) => ({ id, ...(FRUITS[id] ?? FILLERS[id])() }));
  const rand = rng(seed);
  const items = [];
  const wrap = (d) => { d = Math.abs(d); return Math.min(d, tile - d); };
  const fits = (x, y, r) => items.every((o) => Math.hypot(wrap(o.x - x), wrap(o.y - y)) >= o.r + r + gap);
  const place = (glyph, size, tries) => {
    const r = size * 0.46;
    for (let k = 0; k < tries; k++) {
      const x = rand() * tile, y = rand() * tile;
      if (fits(x, y, r)) { items.push({ glyph, x, y, r, size, rotation: (rand() * 2 - 1) * tilt, mirror: rand() < 0.5 }); return true; }
    }
    return false;
  };
  const shuffled = () => {
    const a = FRUIT_IDS.map((_, i) => i);
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };
  let queue = shuffled();
  for (const [k, cap] of [[1.5, 4], [1, Infinity], [0.62, Infinity]]) {
    let misses = 0, n = 0;
    while (misses < 3 && n < cap) {
      if (!queue.length) queue = shuffled();
      if (place(queue.pop(), fruitSize * k * (0.9 + rand() * 0.2), 400)) { misses = 0; n++; } else misses++;
    }
  }
  let miss = 0;
  while (miss < 300) {
    const glyph = FRUIT_IDS.length + Math.floor(rand() * FILLER_IDS.length);
    if (place(glyph, fillerSize * (0.7 + rand() * 0.6), 1)) miss = 0; else miss++;
  }
  const placements = [];
  for (const it of items) {
    const reach = it.size * 0.6;
    for (const ox of [-tile, 0, tile]) for (const oy of [-tile, 0, tile]) {
      const x = it.x + ox, y = it.y + oy;
      if (x < -reach || y < -reach || x > tile + reach || y > tile + reach) continue;
      placements.push({ glyph: it.glyph, x, y, size: it.size, rotation: it.rotation, mirror: it.mirror });
    }
  }
  return { tile, stroke, scale, glyphs, placements };
}

/** A path as one flat list of numbers, rounded to 0.01: the form the generated Swift and Kotlin hold. */
export const flatPath = (cmds) => cmds.flatMap((c) => c.map((v, i) => (i === 0 ? v : Math.round(v * 100) / 100)));

/** SVG path data of a path, for the web and for checks. */
export const svgPath = (cmds) => cmds.map((c) => {
  const r = (v) => Math.round(v * 100) / 100;
  if (c[0] === 0) return `M${r(c[1])} ${r(c[2])}`;
  if (c[0] === 1) return `L${r(c[1])} ${r(c[2])}`;
  if (c[0] === 2) return `C${c.slice(1).map(r).join(" ")}`;
  return "Z";
}).join("");
