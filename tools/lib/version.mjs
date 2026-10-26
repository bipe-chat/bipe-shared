// App version name and build number (ADR 0088): product/version.json, shared by iOS and Android.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Android versionCode = build * 10 + ABI code (Element's scheme) and must stay under Play's 2_100_000_000.
export const MAX_BUILD = 209_999_999;
const VERSION = /^(\d{2})\.(\d{2})\.(\d{1,2})$/;

export function validateVersion(v) {
  const m = VERSION.exec(v.version ?? "");
  if (!m) throw new Error(`version.json: version "${v.version}" is not YY.MM.N`);
  const month = Number(m[2]);
  if (month < 1 || month > 12) throw new Error(`version.json: month ${m[2]} is not 01 to 12`);
  if (!Number.isInteger(v.build) || v.build < 1 || v.build > MAX_BUILD) throw new Error(`version.json: build ${v.build} is not an integer from 1 to ${MAX_BUILD}`);
  return v;
}

export const versionPath = (root) => join(root, "product/version.json");
export const loadVersion = (root) => validateVersion(JSON.parse(readFileSync(versionPath(root), "utf8")));
export const saveVersion = (root, v) => writeFileSync(versionPath(root), JSON.stringify(validateVersion(v), null, 2) + "\n");

// Licence header of the generated Kotlin; gen.mjs swaps it for the bipe-app header.
export const KOTLIN_LICENSE = "/*\n * Copyright 2026 Bipe.\n *\n * SPDX-License-Identifier: AGPL-3.0-only\n */\n\n";
