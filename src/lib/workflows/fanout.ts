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

/** The raw course-multiplicity predicate, independent of institution: true when
 * hubCourse === "*" or contains 2+ newline-separated non-empty ids. Shared by
 * isCourseFanout (institution-blind fan-out) and isComposedFanout (institution
 * "*" combined with this), so both converge on one definition of "multiple
 * course tiles". */
export function hasCourseMultiplicity(scope: WorkflowScope | undefined): boolean {
  const hubCourse = (scope?.hubCourse ?? "").trim();
  if (!hubCourse) return false;
  if (hubCourse === "*") return true;
  const ids = hubCourse.split("\n").map((s) => s.trim()).filter(Boolean);
  return ids.length >= 2;
}

/** True when the workflow targets multiple course tiles (see hasCourseMultiplicity),
 * AND institution fan-out is false (institution "*" wins; an institution fan-out
 * takes precedence - see isComposedFanout for that combination). A single
 * concrete id is NOT fan-out (existing covered-single behavior applies). */
export function isCourseFanout(scope: WorkflowScope | undefined): boolean {
  if (isInstitutionFanout(scope)) return false;
  return hasCourseMultiplicity(scope);
}

/** True when the scope targets every institution AND multiple course tiles at
 * once. A course tile belongs to exactly one institution, so this is NOT a
 * nested (institution x course) product - it collapses to a single
 * course-dimension fan-out where each course's institution is derived from the
 * course tile itself (see resolveFanoutCourses' institution field and the
 * runners' composed branch). */
export function isComposedFanout(scope: WorkflowScope | undefined): boolean {
  return isInstitutionFanout(scope) && hasCourseMultiplicity(scope);
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
 * exactly like expandScopedValue's hubCourseList branch - passing a null
 * `activeInstitution` (as the composed branch does) leaves it unfiltered, so
 * "*" enumerates every tile across every institution. A concrete multi-line
 * list resolves each id to its tile (unresolvable ids are skipped with a
 * note). Every resolved tile carries its own institution (c.institution ??
 * null) so a composed (institution "*" + course multiplicity) fan-out can pin
 * each group's institution from the tile itself. */
export async function resolveFanoutCourses(
  scope: WorkflowScope | undefined,
  activeInstitution: string | null
): Promise<{ list: Array<{ id: string; name: string; institution: string | null }> } | { error: string }> {
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
    return { list: courses.map((c) => ({ id: c.id, name: c.name, institution: c.institution ?? null })) };
  }

  const r = await listCourseHubAction();
  if ("error" in r) return { error: r.error };
  const tiles = new Map(r.courses.map((c) => [c.id, c]));
  const list: Array<{ id: string; name: string; institution: string | null }> = [];
  for (const id of hubCourse.split("\n").map((s) => s.trim()).filter(Boolean)) {
    const tile = tiles.get(id);
    if (tile) {
      list.push({ id, name: tile.name, institution: tile.institution ?? null });
    }
  }
  return { list };
}

/** Display label for a composed fan-out group: "<institution>: <course name>",
 * falling back to the course name alone when the tile has no institution.
 * Shared by both runners' group headers/reports so composed output reads
 * unambiguously (see AC2/AC3 in the composed fan-out change). */
export function composedGroupLabel(courseName: string, institution: string | null | undefined): string {
  return institution ? `${institution}: ${courseName}` : courseName;
}
