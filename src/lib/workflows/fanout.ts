// Institution and course fan-out: when a workflow's scope targets every institution
// or multiple course tiles (via "*" or multi-line ids), the engine runs the workflow
// body once per entity, pinning the scope to a concrete value each iteration.
// Server-safe (no "use client", no window): the resolvers call the same owner-scoped
// server actions the app uses everywhere else.

import { listConfiguredInstitutionsAction, listCourseHubAction } from "@/app/actions";
import type { WorkflowScope } from "@/lib/workflows/types";

/** True when the workflow targets every institution (institution === "*"). */
export function isInstitutionFanout(scope: WorkflowScope | undefined): boolean {
  return (scope?.institution ?? "").trim() === "*";
}

/** True when the workflow targets multiple course tiles (hubCourse === "*" or
 * contains 2+ newline-separated non-empty ids), AND institution fan-out is false
 * (institution "*" wins; an institution fan-out takes precedence). A single
 * concrete id is NOT fan-out (existing covered-single behavior applies). */
export function isCourseFanout(scope: WorkflowScope | undefined): boolean {
  if (isInstitutionFanout(scope)) return false;
  const hubCourse = (scope?.hubCourse ?? "").trim();
  if (!hubCourse) return false;
  if (hubCourse === "*") return true;
  const ids = hubCourse.split("\n").map((s) => s.trim()).filter(Boolean);
  return ids.length >= 2;
}

/** Pin a fan-out scope to one concrete institution for a single iteration.
 * Every downstream resolver then behaves exactly as for a single-institution
 * scope. Other scope families (course tiles, Canvas courses, orgs) pass through. */
export function scopeForInstitution(scope: WorkflowScope, acronym: string): WorkflowScope {
  return { ...scope, institution: acronym };
}

/** Pin a course fan-out scope to one concrete tile id for a single iteration.
 * Every downstream resolver then behaves exactly as for a single-course scope. */
export function scopeForCourse(scope: WorkflowScope, tileId: string): WorkflowScope {
  return { ...scope, hubCourse: tileId };
}

/** The institutions a fan-out expands to, or an explicit error (so an
 * enumeration failure is surfaced, never silently treated as "none"). */
export async function resolveFanoutInstitutions(): Promise<{ list: string[] } | { error: string }> {
  const r = await listConfiguredInstitutionsAction();
  if ("error" in r) return { error: r.error };
  return { list: r.acronyms };
}

/** The course tiles a fan-out expands to, or an explicit error. "*" enumerates
 * via listCourseHubAction filtered case-insensitively by the effective institution
 * exactly like expandScopedValue's hubCourseList branch. A concrete multi-line list
 * resolves each id to its tile (unresolvable ids are skipped with a note). */
export async function resolveFanoutCourses(
  scope: WorkflowScope | undefined,
  activeInstitution: string | null
): Promise<{ list: Array<{ id: string; name: string }> } | { error: string }> {
  const hubCourse = (scope?.hubCourse ?? "").trim();
  if (!hubCourse) return { list: [] };

  if (hubCourse === "*") {
    const r = await listCourseHubAction();
    if ("error" in r) return { error: r.error };
    let courses = r.courses;
    const inst = (activeInstitution || "").trim().toUpperCase();
    if (inst) {
      courses = courses.filter((c) => (c.institution ?? "").trim().toUpperCase() === inst);
    }
    return { list: courses.map((c) => ({ id: c.id, name: c.name })) };
  }

  const r = await listCourseHubAction();
  if ("error" in r) return { error: r.error };
  const tiles = new Map(r.courses.map((c) => [c.id, c]));
  const list: Array<{ id: string; name: string }> = [];
  for (const id of hubCourse.split("\n").map((s) => s.trim()).filter(Boolean)) {
    const tile = tiles.get(id);
    if (tile) {
      list.push({ id, name: tile.name });
    }
  }
  return { list };
}
