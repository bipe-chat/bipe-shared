// SPDX-License-Identifier: AGPL-3.0-only
// Additional permission: APP-STORE-PERMISSION.md (AGPL section 7)
// Copyright 2026 Bipe contributors

import { fruitTile, svgPath } from '../../design/chat-fruits.mjs';

/** The same choice order/defaults/geometry as the generated Swift and Kotlin theme enums. */
export function appearanceModule(tokens, header) {
  const theme = tokens.appThemes;
  return header + `
export const PALETTES = ${JSON.stringify(Object.keys(theme.palettes))} as const;
export const DEFAULT_PALETTE = ${JSON.stringify(theme.default)};
export const BACKGROUNDS = ${JSON.stringify(theme.chatBackground.options)} as const;
export const DEFAULT_BACKGROUND = ${JSON.stringify(theme.chatBackground.default)};
export const CHAT_BACKGROUND = ${JSON.stringify(theme.chatBackground)} as const;
`;
}

/** Kept in a separate module so fruit artwork can load only when that background is selected. */
export function fruitModule(header) {
  const fruit = fruitTile();
  const r2 = value => Math.round(value * 100) / 100;
  const data = {
    tile: fruit.tile, scale: fruit.scale, stroke: fruit.stroke,
    glyphs: fruit.glyphs.map(glyph => ({
      id: glyph.id, bodies: glyph.bodies.map(svgPath), lines: glyph.lines.map(svgPath), dots: glyph.dots.map(svgPath),
    })),
    placements: fruit.placements.map(p => ({ ...p, x: r2(p.x), y: r2(p.y), size: r2(p.size), rotation: r2(p.rotation) })),
  };
  return header + `\nexport const CHAT_FRUITS = ${JSON.stringify(data)} as const;\n`;
}
