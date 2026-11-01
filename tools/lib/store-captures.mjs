// Store captures (bipe-chat/bipe#457): reads product/store-captures.json, checks it against cast.json,
// appstore.md and the reference scam and Pix logic, and generates the Kotlin data of the bipe-app
// Android capture source (android/app/src/screenshotTest). The iOS capture source (bipe-app
// tools/store-captures-ios.mjs) reads the same file. The scam warning of each message and the
// BR Code come from the reference library here, so the captures show what the detector does.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadAppstore, LOCALES } from "./appstore.mjs";
import { buildBrCode, pixCheck } from "./pix.mjs";
import { scamWarningKind } from "./registries.mjs";

export const STORE_CAPTURES_PATH = "android/app/src/screenshotTest/kotlin/chat/bipe/app/store/generated/StoreCaptures.kt";
const TRUST = ["verified", "unverified", "external"];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** The cast id whose photo an entry shows (its own, or the entry it copies), or null when it has no photo. */
export function photoOf(cast, id) {
  const e = cast.get(id);
  if (!e?.photo) return null;
  return e.photo.copyOf ?? e.id;
}

export function loadStoreCaptures(root) {
  const data = JSON.parse(readFileSync(join(root, "product/store-captures.json"), "utf8"));
  const cast = new Map(JSON.parse(readFileSync(join(root, "product/cast.json"), "utf8")).cast.map((e) => [e.id, e]));
  return { data, cast, listing: loadAppstore(root) };
}

/** Problems of store-captures.json. An empty list means the generator can run. */
export function checkStoreCaptures({ data, cast, listing }, reg) {
  const problems = [];
  const slugs = (listing.screenshots[LOCALES[0]] ?? []).map((p) => p.slug);
  const person = (where, id) => {
    const key = id === "viewer" ? data.viewer : id;
    if (!cast.has(key)) problems.push(`${where}: unknown cast id ${key}`);
  };
  person("viewer", data.viewer);
  const photo = (where, id) => {
    if (!cast.has(id)) return problems.push(`${where}: unknown cast id ${id}`);
    if (!photoOf(cast, id)) problems.push(`${where}: ${id} has no photo`);
  };
  // A message has a time and one of text, image or sticker. chat: the only other sender, or null for a group.
  const messages = (where, list, chat) => {
    if (!list?.length) problems.push(`${where}: no messages`);
    for (const [i, m] of (list ?? []).entries()) {
      const at = `${where}.messages[${i}]`;
      if (!chat) person(`${at}.from`, m.from);
      else if (m.from !== "viewer" && m.from !== chat) problems.push(`${at}: from is the chat or "viewer"`);
      if (!TIME_RE.test(m.time ?? "")) problems.push(`${at}: time is HH:MM`);
      if ([m.text, m.image, m.sticker].filter(Boolean).length !== 1) problems.push(`${at}: one of text, image or sticker`);
      if (m.image) photo(`${at}.image`, m.image);
      if (m.sticker) photo(`${at}.sticker`, m.sticker);
    }
  };
  for (const [slug, capture] of Object.entries(data.captures ?? {})) {
    const where = `captures.${slug}`;
    if (!slugs.includes(slug)) problems.push(`${where}: not a slug of the appstore.md screenshot table`);
    if (slug === "aviso-golpe") {
      person(`${where}.chat`, capture.chat);
      if (!capture.messages?.length) problems.push(`${where}: no messages`);
      for (const [i, m] of (capture.messages ?? []).entries()) {
        if (m.from !== "viewer" && m.from !== capture.chat) problems.push(`${where}.messages[${i}]: from is the chat or "viewer"`);
        if (!TIME_RE.test(m.time ?? "")) problems.push(`${where}.messages[${i}]: time is HH:MM`);
        if (!m.text) problems.push(`${where}.messages[${i}]: no text`);
      }
      if (!(capture.messages ?? []).some((m) => m.text && scamWarningKind(m.text, reg))) problems.push(`${where}: no message gets a scam warning`);
    } else if (slug === "pedidos") {
      if (!capture.requests?.length) problems.push(`${where}: no requests`);
      for (const [i, r] of (capture.requests ?? []).entries()) {
        person(`${where}.requests[${i}]`, r.from);
        if (!TRUST.includes(r.trust)) problems.push(`${where}.requests[${i}]: trust is one of ${TRUST.join(", ")}`);
      }
    } else if (slug === "conferir-pix") {
      const code = capture.pix ? buildBrCode(capture.pix) : "";
      if (pixCheck(code, reg).code?.status !== "valid") problems.push(`${where}: the Pix fields do not make a valid BR Code`);
    } else if (slug === "seu-arroba") {
      person(`${where}.owner`, capture.owner);
      const owner = cast.get(capture.owner === "viewer" ? data.viewer : capture.owner);
      if (owner && !owner.handle) problems.push(`${where}.owner: has no handle`);
    } else if (slug === "selo-cnpj") {
      person(`${where}.company`, capture.company);
      const company = cast.get(capture.company);
      if (company && (company.kind !== "institution" || !company.cnpj)) problems.push(`${where}.company: not an institution with a cnpj`);
      if (!capture.legalName) problems.push(`${where}: no legalName`);
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(capture.checkedMonth ?? "")) problems.push(`${where}: checkedMonth is YYYY-MM`);
      messages(where, capture.messages, capture.company);
    } else if (slug === "grupos") {
      if (!capture.groups?.length) problems.push(`${where}: no groups`);
      for (const [i, g] of (capture.groups ?? []).entries()) {
        const at = `${where}.groups[${i}]`;
        person(`${at}.group`, g.group);
        if (cast.get(g.group) && cast.get(g.group).kind !== "group") problems.push(`${at}.group: not a group`);
        person(`${at}.from`, g.from);
        if (!TIME_RE.test(g.time ?? "")) problems.push(`${at}: time is HH:MM`);
        if (!g.text) problems.push(`${at}: no text`);
        if (!Number.isInteger(g.unread ?? 0) || !Number.isInteger(g.mentions ?? 0) || (g.mentions ?? 0) > (g.unread ?? 0)) problems.push(`${at}: unread and mentions are counts, mentions at most unread`);
      }
    } else if (slug === "stickers") {
      person(`${where}.chat`, capture.chat);
      messages(where, capture.messages, null);
      if (!(capture.messages ?? []).some((m) => m.sticker)) problems.push(`${where}: no sticker message`);
    } else {
      problems.push(`${where}: no generator for this slug (tools/lib/store-captures.mjs)`);
    }
  }
  return problems;
}

/** Slugs of the screenshot table with no capture source yet. */
export function missingCaptures({ data, listing }) {
  return (listing.screenshots[LOCALES[0]] ?? []).map((p) => p.slug).filter((s) => !data.captures?.[s]);
}

/** Kotlin source of StoreCaptures.kt (without the licence header, which gen.mjs adds). */
export function generateStoreCaptures(input, reg, kotlinString, header) {
  const problems = checkStoreCaptures(input, reg);
  if (problems.length) throw new Error(`store-captures.json:\n  ${problems.join("\n  ")}`);
  const { data, cast, listing } = input;
  const id = (key) => (key === "viewer" ? data.viewer : key);
  const used = new Set([data.viewer]);
  const c = data.captures;
  if (c["aviso-golpe"]) used.add(c["aviso-golpe"].chat);
  for (const r of c.pedidos?.requests ?? []) used.add(r.from);
  if (c["seu-arroba"]) used.add(id(c["seu-arroba"].owner));
  if (c["selo-cnpj"]) used.add(c["selo-cnpj"].company);
  for (const g of c.grupos?.groups ?? []) used.add(g.group).add(g.from);
  if (c.stickers) used.add(c.stickers.chat);
  for (const m of c.stickers?.messages ?? []) if (m.from !== "viewer") used.add(m.from);
  const val = (key) => `StoreCast.${key.replace(/[^A-Za-z0-9]/g, "_")}`;
  const people = [...used].sort().map((key) => {
    const e = cast.get(key);
    const handle = e.handle ? kotlinString(e.handle) : "null";
    const photo = photoOf(cast, key);
    return `    val ${key.replace(/[^A-Za-z0-9]/g, "_")} = StorePerson(${kotlinString(e.id)}, ${kotlinString(e.name)}, ${kotlinString(e.short ?? e.name)}, ${handle}, isCompany = ${e.kind === "institution"}, photo = ${photo ? kotlinString(photo) : "null"})`;
  });
  const slugs = (listing.screenshots[LOCALES[0]] ?? []).map((p) => kotlinString(p.slug));
  const out = [];
  out.push(`${header}
@file:Suppress("all", "ktlint")

package chat.bipe.app.store.generated

/** A cast entry of bipe-shared product/cast.json. photo: the cast photo id (bipe-web src/cast/photos), or null. */
data class StorePerson(val id: String, val name: String, val short: String, val handle: String?, val isCompany: Boolean, val photo: String?)

/**
 * A sample message. from null: the viewer sent it. warning: the scam warning id of the reference detector, or null.
 * image and sticker: the cast photo id that the message shows in place of text.
 */
data class StoreMessage(val from: StorePerson?, val time: String, val text: String, val warning: String?, val image: String? = null, val sticker: String? = null)

/** A chat request and its trust line: verified, unverified or external. */
data class StoreRequest(val from: StorePerson, val trust: String)

/** A group in the chat list with its last message. */
data class StoreGroup(val group: StorePerson, val from: StorePerson, val time: String, val text: String, val unread: Int, val mentions: Int, val muted: Boolean)

/** The cast people that the captures use. */
object StoreCast {
${people.join("\n")}
}

/** Sample data of the store captures (bipe-shared product/store-captures.json, bipe-chat/bipe#457). */
object StoreCaptures {
    /** The slugs of the appstore.md screenshot table, in store order. */
    val slugs: List<String> = listOf(${slugs.join(", ")})

    /** The slugs that have a capture source here. */
    val captured: List<String> = listOf(${Object.keys(c).map(kotlinString).join(", ")})

    val viewer: StorePerson = ${val(data.viewer)}
`);
  if (c["aviso-golpe"]) {
    const g = c["aviso-golpe"];
    const msgs = g.messages.map((m) => {
      const warning = scamWarningKind(m.text, reg);
      return `        StoreMessage(${m.from === "viewer" ? "null" : val(m.from)}, ${kotlinString(m.time)}, ${kotlinString(m.text)}, ${warning ? kotlinString(warning) : "null"}),`;
    });
    out.push(`    /** aviso-golpe: the chat and its messages. */
    val scamChat: StorePerson = ${val(g.chat)}
    val scamMessages: List<StoreMessage> = listOf(
${msgs.join("\n")}
    )
`);
  }
  if (c.pedidos) {
    out.push(`    /** pedidos: the chat requests in the box. */
    val requests: List<StoreRequest> = listOf(
${c.pedidos.requests.map((r) => `        StoreRequest(${val(r.from)}, ${kotlinString(r.trust)}),`).join("\n")}
    )
`);
  }
  if (c["conferir-pix"]) {
    out.push(`    /** conferir-pix: a valid static BR Code (bipe-shared tools/lib/pix.mjs buildBrCode). */
    val pixCode: String = ${kotlinString(buildBrCode(c["conferir-pix"].pix))}
`);
  }
  if (c["seu-arroba"]) {
    out.push(`    /** seu-arroba: whose link and QR code the capture shows. */
    val handleOwner: StorePerson = ${val(id(c["seu-arroba"].owner))}
`);
  }
  const message = (m) => {
    const warning = m.text ? scamWarningKind(m.text, reg) : null;
    const media = [m.image ? `image = ${kotlinString(photoOf(cast, m.image))}` : null, m.sticker ? `sticker = ${kotlinString(photoOf(cast, m.sticker))}` : null].filter(Boolean);
    return `        StoreMessage(${m.from === "viewer" ? "null" : val(m.from)}, ${kotlinString(m.time)}, ${kotlinString(m.text ?? "")}, ${warning ? kotlinString(warning) : "null"}${media.map((x) => `, ${x}`).join("")}),`;
  };
  if (c["selo-cnpj"]) {
    const g = c["selo-cnpj"];
    out.push(`    /** selo-cnpj: the company chat and its seal. cnpj: 14 digits. */
    val sealCompany: StorePerson = ${val(g.company)}
    val sealLegalName: String = ${kotlinString(g.legalName)}
    val sealCnpj: String = ${kotlinString(cast.get(g.company).cnpj.replace(/[^0-9A-Z]/g, ""))}
    val sealCheckedMonth: String = ${kotlinString(g.checkedMonth)}
    val sealMessages: List<StoreMessage> = listOf(
${g.messages.map(message).join("\n")}
    )
`);
  }
  if (c.grupos) {
    out.push(`    /** grupos: the groups in the list. */
    val groups: List<StoreGroup> = listOf(
${c.grupos.groups.map((g) => `        StoreGroup(${val(g.group)}, ${val(g.from)}, ${kotlinString(g.time)}, ${kotlinString(g.text)}, ${g.unread ?? 0}, ${g.mentions ?? 0}, ${g.muted === true}),`).join("\n")}
    )
`);
  }
  if (c.stickers) {
    out.push(`    /** stickers: the group chat and its messages. */
    val stickerChat: StorePerson = ${val(c.stickers.chat)}
    val stickerMessages: List<StoreMessage> = listOf(
${c.stickers.messages.map(message).join("\n")}
    )
`);
  }
  out.push("}\n");
  return out.join("\n").replace(/\n\n\}\n$/, "\n}\n");
}
