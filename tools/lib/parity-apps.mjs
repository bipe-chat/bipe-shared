// The app surfaces of the parity ledger: ios and android are Bipe's app in bipe-app (ADR 0143). The Element X
// forks are archived (ADR 0155). An item with fork: true is one the fork app ships.
//
// Fork scope (docs/client-switch-plan.md): until bipe-app replaces the fork in the stores, a fork item must be
// covered on both apps. Covered means:
// - built or testing, with evidence in bipe-app under ios/ or android/, that is, merged code.
//   A screen spec, a draft PR or a branch is not evidence;
// - or planned with the open issue that builds it;
// - or n/a with a reason and the accepted ADR that excludes it.

export const APPS = {
  ios: { repo: "bipe-app", prefix: "bipe-app/ios/", label: "iOS", other: "android" },
  android: { repo: "bipe-app", prefix: "bipe-app/android/", label: "Android", other: "ios" },
};
export const STATUSES = ["planned", "built", "testing", "policy", "n/a"];
export const SHIPPED = new Set(["built", "testing"]);

// A surface entry is a status string (planned, policy) or { status, evidence?, reason?, issue?, adr?, note? }.
export const entry = (item, s) => (typeof item[s] === "string" ? { status: item[s] } : item[s]);

export const inForkScope = (item) => item.fork === true;

// Checks the app surfaces of every item. exists(repo, path) tells whether a file exists in a repo
// checkout; it returns null when the repo is not checked out (the path is then not checked).
// Returns { problems, unchecked, issueRefs } where issueRefs lists the issues that close a gap.
export function checkApps(items, exists) {
  const problems = [];
  const unchecked = new Set();
  const issueRefs = [];
  for (const item of items ?? []) {
    const where = `item ${item.id}`;
    if (item.fork !== undefined && item.fork !== true) problems.push(`${where}: fork is true or absent`);
    const scope = inForkScope(item);
    for (const [s, app] of Object.entries(APPS)) {
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
          if (!path.startsWith(app.prefix)) {
            problems.push(`${where}: ${s} evidence ${path} must start with ${app.prefix} (merged app code; a spec is not evidence)`);
            continue;
          }
          const found = exists(app.repo, path.slice(app.repo.length + 1));
          if (found === null) unchecked.add(app.repo);
          else if (!found) problems.push(`${where}: ${s} evidence ${path} does not exist`);
        }
      } else if (e.evidence) {
        problems.push(`${where}: ${s} is ${e.status}, evidence only goes with built or testing`);
      }
      if (!scope) continue;
      // Fork scope: covered on this app, or an open issue or an ADR says why not.
      if (e.status === "planned") {
        if (!Number.isInteger(e.issue)) problems.push(`${where}: the fork app ships it, ${s} is planned without the issue that builds it`);
        else issueRefs.push({ what: `${where} (${s})`, issue: e.issue });
      } else if (e.status === "n/a" && !Number.isInteger(e.adr)) {
        problems.push(`${where}: the fork app ships it, ${s} is n/a without the ADR that excludes it`);
      } else if (e.status === "policy") {
        problems.push(`${where}: the fork app ships it, ${s} cannot be policy`);
      }
    }
    // The apps differ: the one that lags names its issue (ADR 0031).
    const ios = entry(item, "ios")?.status;
    const android = entry(item, "android")?.status;
    if (ios && android && SHIPPED.has(ios) !== SHIPPED.has(android)) {
      const lagging = SHIPPED.has(ios) ? "android" : "ios";
      const issue = entry(item, lagging)?.issue ?? item.issue;
      if (!Number.isInteger(issue)) problems.push(`${where}: ios is ${ios}, android is ${android}, and no issue closes the gap`);
      else if (!scope) issueRefs.push({ what: `${where} (${lagging})`, issue });
    }
  }
  return { problems, unchecked: [...unchecked], issueRefs };
}

// The fork gaps: fork items that an app does not ship yet.
export function forkGaps(items) {
  return (items ?? [])
    .filter(inForkScope)
    .map((item) => ({
      item,
      missing: Object.keys(APPS).filter((s) => !SHIPPED.has(entry(item, s)?.status) && entry(item, s)?.status !== "n/a"),
    }))
    .filter((g) => g.missing.length);
}
