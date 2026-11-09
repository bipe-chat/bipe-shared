// The alert of the re-sign job (docs/signed-lists.md "Signing", bipe-chat/bipe#1242). A pure rule, so the test feeds
// it times and versions. newest: { typ: { version, issued } } from signed/ on main. served: { typ: { version, expires } }
// from the core, or null when it serves none. now: Unix seconds. Returns one line per problem; empty means all is well.
const DAY = 86400;
export const SIGNED_MAX_AGE_DAYS = 8;
export const SERVED_MIN_LEFT_DAYS = 5;
export const PUBLISH_GRACE_DAYS = 2;

export function listAgeProblems({ newest, served, now }) {
  const problems = [];
  for (const typ of ["operators", "issuers"]) {
    const signed = newest[typ];
    if (!signed) {
      problems.push(`signed/${typ}: no version on main`);
      continue;
    }
    const age = (now - signed.issued) / DAY;
    if (age > SIGNED_MAX_AGE_DAYS) {
      problems.push(`signed/${typ}: version ${signed.version} on main was signed ${age.toFixed(1)} days ago (limit ${SIGNED_MAX_AGE_DAYS}). The re-sign job on mini4p (scripts/resign-lists.sh) did not land a new version.`);
    }
    const live = served[typ];
    if (!live) {
      problems.push(`/v1/${typ}: the core serves no list`);
      continue;
    }
    const left = (live.expires - now) / DAY;
    if (left < SERVED_MIN_LEFT_DAYS) {
      problems.push(`/v1/${typ}: the core serves version ${live.version}, which expires in ${left.toFixed(1)} days (limit ${SERVED_MIN_LEFT_DAYS}). Readers reject an expired list.`);
    }
    if (live.version < signed.version && age > PUBLISH_GRACE_DAYS) {
      problems.push(`/v1/${typ}: the core serves version ${live.version}, main has version ${signed.version} since ${age.toFixed(1)} days. The publish step of the re-sign job did not run.`);
    }
  }
  return problems;
}
