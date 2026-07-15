// Per-input SCOPE for collection-able workflow inputs (course tiles, live
// Canvas courses, GitHub orgs). A scopeable input is one of the list value
// types below; its runtime value is a newline-joined list of ids/urls, OR the
// ALL_SCOPE sentinel "*" meaning "every one of them".
//
// The action still runs ONCE over the whole list (no fan-out): the engine
// expands "*" into a concrete newline-joined list right before the action
// runs, so every list-aware action just splits on "\n" and loops, and never
// has to know whether the user picked one, several, or all.
//
// Server-safe (no "use client", no window): the expansion calls the same server
// actions the app uses, which resolve the owner in both the browser (signed-in
// session) and the unattended runner (runAsOwner), exactly like the rest of a
// step's run().

import { listCourseHubAction, listCoursesAction, listMyOrgsAction } from "@/app/actions";

/** The value types that carry a scopeable collection (one / several / all). */
export const SCOPEABLE_LIST_TYPES: ReadonlySet<string> = new Set([
  "hubCourseList",
  "lmsCourseList",
  "orgList",
]);

/** The sentinel a scopeable input stores for "all of them". */
export const ALL_SCOPE = "*";

export function isScopeableListType(type: string): boolean {
  return SCOPEABLE_LIST_TYPES.has(type);
}

/**
 * Expand a scopeable input's value to a concrete newline-joined list. A value
 * that is not the "*" sentinel is already concrete and returned unchanged (so
 * this is a cheap no-op for the common case and needs no network). "*" is
 * expanded via the matching enumerator; an enumerator error yields an empty
 * list (the action then does nothing, rather than mis-treating "*" as an id).
 */
export async function expandScopedValue(
  type: string,
  value: string,
  ctx: { activeInstitution: string | null; filterHubByInstitution?: boolean }
): Promise<string> {
  if (!isScopeableListType(type)) return value;
  if (value.trim() !== ALL_SCOPE) return value;

  if (type === "hubCourseList") {
    const r = await listCourseHubAction();
    if ("error" in r) return "";
    let courses = r.courses;
    if (ctx.filterHubByInstitution) {
      const inst = (ctx.activeInstitution || "").trim();
      courses = courses.filter((c) => (c.institution ?? "").trim().toUpperCase() === inst);
    }
    return courses.map((c) => c.id).join("\n");
  }
  if (type === "lmsCourseList") {
    const inst = (ctx.activeInstitution || "").trim();
    if (!inst) return "";
    const r = await listCoursesAction(inst);
    return "error" in r ? "" : r.courses.map((c) => `/courses/${c.id}`).join("\n");
  }
  if (type === "orgList") {
    const r = await listMyOrgsAction();
    return "error" in r ? "" : r.orgs.join("\n");
  }
  return value;
}
