import assert from "node:assert/strict";
import { test } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadRegistries } from "./lib/registries.mjs";
import { validateAgendaTemplates } from "./lib/agenda-templates.mjs";

const reg = loadRegistries(join(dirname(fileURLToPath(import.meta.url)), ".."));
test("agenda setup rejects overlaps, invalid durations and missing translations", () => {
  const overlap = structuredClone(reg);
  overlap.agendaTemplates.templates[0].availability.push({ weekday: 1, start: "10:00", end: "11:00" });
  assert.throws(() => validateAgendaTemplates(overlap), /overlapping/);
  const duration = structuredClone(reg);
  duration.agendaTemplates.templates[0].services[0].duration_minutes = 0;
  assert.throws(() => validateAgendaTemplates(duration), /duration_minutes/);
  const translation = structuredClone(reg);
  delete translation.stringsEn.strings[translation.agendaTemplates.templates[0].title_key];
  assert.throws(() => validateAgendaTemplates(translation), /missing translation/);
});

test("push templates only interpolate the permitted business, service and time fields", () => {
  for (const [key, value] of Object.entries(reg.strings.strings)) {
    if (key.startsWith("bipe_agenda_push_")) {
      assert.doesNotMatch(value, /%[4-9]\$s/);
      assert.doesNotMatch(value, /[–—]|\bpra\b|\bpro\b/);
    }
  }
});
