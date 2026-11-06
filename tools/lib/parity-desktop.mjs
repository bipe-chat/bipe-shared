// Desktop parity (ADR 0266). Shared library code alone is not evidence of a working desktop feature.
export const DESKTOP = { macos: "bipe-app/macos/", windows: "bipe-app/windows/" };
const statuses = new Set(["planned", "built", "testing", "policy", "n/a"]);
const shipped = new Set(["built", "testing"]);

export function checkDesktop(items, exists) {
  const problems = [];
  const unchecked = new Set();
  const issueRefs = [];
  for (const item of items ?? []) {
    for (const [surface, prefix] of Object.entries(DESKTOP)) {
      const entry = typeof item[surface] === "string" ? { status: item[surface] } : item[surface];
      const where = `item ${item.id} (${surface})`;
      if (!entry || !statuses.has(entry.status)) { problems.push(`${where}: valid status required`); continue; }
      if (entry.status === "planned") {
        if (!Number.isInteger(entry.issue)) problems.push(`${where}: planned capability needs its open issue`);
        else issueRefs.push({ what: where, issue: entry.issue });
      }
      if (["n/a", "policy"].includes(entry.status) && (!entry.reason || !Number.isInteger(entry.adr))) {
        problems.push(`${where}: ${entry.status} needs a reason and the accepted ADR`);
      }
      if (shipped.has(entry.status)) {
        if (!entry.evidence?.some(path => path.startsWith(prefix))) problems.push(`${where}: desktop integration evidence under ${prefix} required`);
        for (const path of entry.evidence ?? []) {
          if (!path.startsWith(prefix) && !path.startsWith("bipe-app/ios/BipeKit/")) {
            problems.push(`${where}: evidence ${path} must be desktop code or BipeKit`);
            continue;
          }
          const found = exists("bipe-app", path.slice("bipe-app/".length));
          if (found === null) unchecked.add("bipe-app");
          else if (!found) problems.push(`${where}: evidence ${path} does not exist`);
        }
      } else if (entry.evidence) problems.push(`${where}: only built/testing capabilities have evidence`);
    }
  }
  return { problems, unchecked: [...unchecked], issueRefs };
}

export function checkDesktopPlan(plan, items) {
  const problems = [];
  if (plan?.version !== 1 || plan?.sequence !== "mac-first" || !Number.isInteger(plan?.adr)
      || !Number.isInteger(plan?.macosTracker) || !Number.isInteger(plan?.windowsTracker)) {
    return ["desktop-plan.json: version, accepted ADR, trackers and mac-first sequence required"];
  }
  const capabilities = new Map(items.map(item => [item.id, item]));
  const seen = new Set();
  const waves = new Set();
  for (const wave of plan.waves ?? []) {
    if (!wave.id || waves.has(wave.id) || !wave.title || !Number.isInteger(wave.issue) || !wave.capabilities?.length) {
      problems.push(`desktop wave ${wave.id}: unique id, title, issue and capabilities required`);
    }
    waves.add(wave.id);
    for (const id of wave.capabilities ?? []) {
      if (!capabilities.has(id) || seen.has(id)) problems.push(`desktop plan: unknown or duplicate capability ${id}`);
      seen.add(id);
      const item = capabilities.get(id);
      if (item?.macos?.status === "planned" && item.macos.issue !== wave.issue) problems.push(`${id}: Mac gap must name wave issue #${wave.issue}`);
    }
  }
  for (const id of capabilities.keys()) if (!seen.has(id)) problems.push(`desktop plan: capability ${id} has no wave`);
  return problems;
}
