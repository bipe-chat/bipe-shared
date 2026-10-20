// Sample content for the App Store screens (product/store-fixtures.json, bipe#462). Validates it against the cast
// and generates BipeStoreFixtures.swift: the JSON embedded as a string and the Decodable types the iOS screenshot
// mode reads. Android (bipe#457) reads the same file later.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pixCheck } from "./pix.mjs";
import { loadRegistries } from "./registries.mjs";

const SLUGS = ["aviso-golpe", "pedidos", "seu-arroba", "conferir-pix", "conferir-pix-alterado", "grupos", "selo-cnpj", "stickers"];

function fail(msg) {
  throw new Error(`store fixtures validation failed: ${msg}`);
}

/** The file without `$comment` keys, validated. */
export function loadStoreFixtures(root, cast) {
  const data = JSON.parse(readFileSync(join(root, "product/store-fixtures.json"), "utf8"), (key, value) => (key === "$comment" ? undefined : value));
  validateStoreFixtures(data, new Set(cast.map((e) => e.id)));
  // The clean panel needs a code that checks valid; the altered one needs one that does not (20 Oct 2026: a swapped CRC).
  const reg = loadRegistries(root);
  const status = (slug) => pixCheck(data.screens[slug].code, reg).code?.status;
  if (status("conferir-pix") !== "valid") fail("conferir-pix.code must check valid");
  if (status("conferir-pix-alterado") === "valid") fail("conferir-pix-alterado.code must not check valid");
  return data;
}

export function validateStoreFixtures(data, castIDs) {
  const locales = data.locales;
  if (!Array.isArray(locales) || !locales.includes("pt-BR")) fail("locales must list pt-BR");
  if (!castIDs.has(data.me)) fail(`me "${data.me}" is not a cast id`);
  const who = (id, where) => {
    if (id !== "me" && !castIDs.has(id)) fail(`${where}: "${id}" is not a cast id or "me"`);
  };
  const text = (t, where) => {
    for (const l of locales) if (typeof t?.[l] !== "string" || !t[l]) fail(`${where}: text needs ${l}`);
  };
  const minute = (m, where) => {
    if (!Number.isInteger(m) || m < 0 || m > 59) fail(`${where}: minute must be 0 to 59`);
  };
  const screens = data.screens ?? {};
  for (const slug of SLUGS) if (!(slug in screens)) fail(`screen ${slug} missing`);
  for (const [slug, s] of Object.entries(screens)) {
    if (!SLUGS.includes(slug)) fail(`unknown screen ${slug}`);
    if (s.chat !== undefined) who(s.chat, `${slug}.chat`);
    (s.lines ?? []).forEach((line, i) => {
      const where = `${slug}.lines[${i}]`;
      who(line.from, where);
      if ((line.text === undefined) === (line.sticker === undefined)) fail(`${where}: needs text or sticker, not both`);
      if (line.text !== undefined) text(line.text, where);
      if (line.sticker !== undefined && !castIDs.has(line.sticker)) fail(`${where}: sticker "${line.sticker}" is not a cast id`);
    });
    (s.requests ?? []).forEach((r, i) => {
      who(r.from, `${slug}.requests[${i}]`);
      minute(r.minute, `${slug}.requests[${i}]`);
    });
    (s.groups ?? []).forEach((g, i) => {
      const where = `${slug}.groups[${i}]`;
      who(g.id, where);
      minute(g.minute, where);
      if ((g.preview === undefined) === (g.poll === undefined)) fail(`${where}: needs preview or poll, not both`);
      text(g.preview ?? g.poll, where);
    });
    if (s.code !== undefined && !/^000201/.test(s.code)) fail(`${slug}.code is not a BR Code`);
  }
}

export function generateStoreFixtures(data, header) {
  const json = JSON.stringify(data);
  if (json.includes('"#')) fail('the JSON must not contain "# (it ends the Swift raw string)');
  return `${header}
import Foundation

/// Sample content for the App Store screens (bipe-shared/product/store-fixtures.json, bipe#462).
public enum BipeStoreFixtures {
    public static let me = ${JSON.stringify(data.me)}
    public static let locales: [String] = ${JSON.stringify(data.locales)}

    /// Screens by capture slug.
    public static let screens: [String: BipeStoreScreen] = {
        do {
            return try JSONDecoder().decode(File.self, from: Data(json.utf8)).screens
        } catch {
            preconditionFailure("BipeStoreFixtures: \\(error)")
        }
    }()

    private struct File: Decodable {
        let screens: [String: BipeStoreScreen]
    }

    private static let json = #"${json}"#
}

/// Text per locale ("pt-BR", "en-US").
public typealias BipeStoreText = [String: String]

public struct BipeStoreScreen: Decodable, Sendable {
    /// Cast id of the other side of a chat.
    public let chat: String?
    public let lines: [BipeStoreLine]?
    public let requests: [BipeStoreRequest]?
    public let groups: [BipeStoreGroup]?
    /// A Pix BR Code.
    public let code: String?
}

public struct BipeStoreLine: Decodable, Sendable {
    /// Cast id, or "me".
    public let from: String
    public let text: BipeStoreText?
    /// Cast id whose photo becomes the sticker.
    public let sticker: String?
}

public struct BipeStoreRequest: Decodable, Sendable {
    public let from: String
    public let minute: Int
}

public struct BipeStoreGroup: Decodable, Sendable {
    public let id: String
    public let minute: Int
    public let unread: Int?
    public let mentions: Int?
    public let preview: BipeStoreText?
    /// An open poll's question, shown as the last message.
    public let poll: BipeStoreText?
}
`;
}
