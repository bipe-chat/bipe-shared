// The new surfaces of the parity ledger (bipe-chat/bipe#579): Bipe's own client in bipe-app
// (ADR 0143), as "ios-new" and "android-new" next to the original apps "ios" and "android".
//
// Switch scope (docs/client-rewrite-plan.md section 4): every item that is built or testing on
// an original app must be covered on both new surfaces before the switch. Covered means:
// - built or testing, with evidence in bipe-app under ios/ (ios-new) or android/ (android-new),
//   that is, merged code. A screen spec, a draft PR or a branch is not evidence;
// - or planned with the open issue that builds it;
// - or n/a with a reason and the accepted ADR that excludes it.

export const NEW_SURFACES = {
  "ios-new": { repo: "bipe-app", prefix: "bipe-app/ios/", label: "iOS (new)", original: "ios" },
  "android-new": { repo: "bipe-app", prefix: "bipe-app/android/", label: "Android (new)", original: "android" },
};
export const STATUSES = ["planned", "built", "testing", "policy", "n/a"];
export const SHIPPED = new Set(["built", "testing"]);

// A surface entry is a status string (planned, policy) or { status, evidence?, reason?, issue?, adr?, note? }.
export const entry = (item, s) => (typeof item[s] === "string" ? { status: item[s] } : item[s]);

// In switch scope: built or testing on at least one original app.
export const inSwitchScope = (item) => ["ios", "android"].some((s) => SHIPPED.has(entry(item, s)?.status));

// Checks the new surfaces of every item. exists(repo, path) tells whether a file exists in a
// repo checkout; it returns null when the repo is not checked out (the path is then not checked).
// Returns { problems, unchecked, issueRefs } where issueRefs lists the issues that close a switch gap.
export function checkNewSurfaces(items, exists) {
  const problems = [];
  const unchecked = new Set();
  const issueRefs = [];
  for (const item of items ?? []) {
    const where = `item ${item.id}`;
    const scope = inSwitchScope(item);
    for (const [s, surface] of Object.entries(NEW_SURFACES)) {
      const e = entry(item, s);
      if (!e || !STATUSES.includes(e.status)) {
        problems.push(`${where}: ${s} status must be one of ${STATUSES.join(", ")}`);
        continue;
      }
      if (e.issue !== undefined && !Number.isInteger(e.issue)) problems.push(`${where}: ${s} issue must be an issue number`);
      if (e.adr !== undefined && !Number.isInteger(e.adr)) problems.push(`${where}: ${s} adr must be an ADR number`);
      if (e.status === "n/a" && !e.reason) problems.push(`${where}: ${s} is n/a without a reason`);
      if (SHIPPED.has(e.status)) {
        if (!e.evidence?.length) problems.push(`${where}: ${s} is ${e.status} without evidence`);
        for (const path of e.evidence ?? []) {
          if (!path.startsWith(surface.prefix)) {
            problems.push(`${where}: ${s} evidence ${path} must start with ${surface.prefix} (merged app code; a spec is not evidence)`);
            continue;
          }
          const found = exists(surface.repo, path.slice(surface.repo.length + 1));
          if (found === null) unchecked.add(surface.repo);
          else if (!found) problems.push(`${where}: ${s} evidence ${path} does not exist`);
        }
      } else if (e.evidence) {
        problems.push(`${where}: ${s} is ${e.status}, evidence only goes with built or testing`);
      }
      if (!scope) continue;
      // The switch scope: covered on this new surface, or an open issue or an ADR says why not.
      if (e.status === "planned") {
        if (!Number.isInteger(e.issue)) problems.push(`${where}: in switch scope, ${s} is planned without the issue that builds it`);
        else issueRefs.push({ what: `${where} (${s})`, issue: e.issue });
      } else if (e.status === "n/a" && !Number.isInteger(e.adr)) {
        problems.push(`${where}: in switch scope, ${s} is n/a without the ADR that excludes it`);
      } else if (e.status === "policy") {
        problems.push(`${where}: in switch scope, ${s} cannot be policy while an original app has it built`);
      }
    }
    // The new apps differ: the one that lags names its issue (ADR 0031).
    const ios = entry(item, "ios-new")?.status;
    const android = entry(item, "android-new")?.status;
    if (ios && android && SHIPPED.has(ios) !== SHIPPED.has(android)) {
      const lagging = SHIPPED.has(ios) ? "android-new" : "ios-new";
      const issue = entry(item, lagging)?.issue ?? item.issue;
      if (!Number.isInteger(issue)) problems.push(`${where}: ios-new is ${ios}, android-new is ${android}, and no issue closes the gap`);
      else if (!scope) issueRefs.push({ what: `${where} (${lagging})`, issue });
    }
  }
  return { problems, unchecked: [...unchecked], issueRefs };
}

// The switch gaps: items in switch scope that are not shipped on a new surface.
export function switchGaps(items) {
  return (items ?? [])
    .filter(inSwitchScope)
    .map((item) => ({
      item,
      missing: Object.keys(NEW_SURFACES).filter((s) => !SHIPPED.has(entry(item, s)?.status) && entry(item, s)?.status !== "n/a"),
    }))
    .filter((g) => g.missing.length);
}
