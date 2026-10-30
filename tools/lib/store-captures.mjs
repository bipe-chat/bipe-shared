// Store captures (bipe-chat/bipe#457): reads product/store-captures.json, checks it against cast.json,
// appstore.md and the reference scam and Pix logic, and generates the Kotlin data of the bipe-app
// Android capture source (android/app/src/screenshotTest). The scam warning of each message and the
// BR Code come from the reference library here, so the captures show what the detector does.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadAppstore, LOCALES } from "./appstore.mjs";
import { buildBrCode, pixCheck } from "./pix.mjs";
import { scamWarningKind } from "./registries.mjs";

export const STORE_CAPTURES_PATH = "android/app/src/screenshotTest/kotlin/chat/bipe/app/store/generated/StoreCaptures.kt";
const TRUST = ["verified", "unverified", "external"];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

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
  const val = (key) => `StoreCast.${key.replace(/[^A-Za-z0-9]/g, "_")}`;
  const people = [...used].sort().map((key) => {
    const e = cast.get(key);
    const handle = e.handle ? kotlinString(e.handle) : "null";
    return `    val ${key.replace(/[^A-Za-z0-9]/g, "_")} = StorePerson(${kotlinString(e.id)}, ${kotlinString(e.name)}, ${kotlinString(e.short ?? e.name)}, ${handle}, isCompany = ${e.kind === "institution"})`;
  });
  const slugs = (listing.screenshots[LOCALES[0]] ?? []).map((p) => kotlinString(p.slug));
  const out = [];
  out.push(`${header}
@file:Suppress("all", "ktlint")

package chat.bipe.app.store.generated

/** A cast entry of bipe-shared product/cast.json. */
data class StorePerson(val id: String, val name: String, val short: String, val handle: String?, val isCompany: Boolean)

/** A sample message. from null: the viewer sent it. warning: the scam warning id of the reference detector, or null. */
data class StoreMessage(val from: StorePerson?, val time: String, val text: String, val warning: String?)

/** A chat request and its trust line: verified, unverified or external. */
data class StoreRequest(val from: StorePerson, val trust: String)

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
  out.push("}\n");
  return out.join("\n").replace(/\n\n\}\n$/, "\n}\n");
}
