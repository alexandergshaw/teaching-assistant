// The attended (in-browser) run loop's fan-out entity resolution, pulled out
// of useWorkflowRun.ts's handleRun (kept under this project's 1000-line cap)
// - a pure, mechanical relocation of the isComposedRun/isCourseRun/
// fanoutEntities block that used to live inline, no behavior change. Async
// (it calls the same server-safe fanout.ts resolvers handleRun always did)
// but otherwise a plain function with no React state - the caller decides
// what to do with an `{ error }` result (setValidationError + setRunning(false)
// in useWorkflowRun.ts), this module just resolves the plan.
import {
  isInstitutionFanout,
  isCourseFanout,
  isComposedFanout,
  resolveFanoutInstitutions,
  resolveFanoutCourses,
} from "@/lib/workflows/fanout";
import { buildComposedFanoutEntities } from "./attended-fanout";
import type { WorkflowScope } from "@/lib/workflows/types";

export interface RunFanoutEntity {
  institution: string | null;
  courseId?: string;
  courseName?: string;
}

export interface RunFanoutPlan {
  /** A composed (institution "*" AND multiple course tiles) fan-out is NOT a
   * nested (institution x course) product - a course tile belongs to exactly
   * one institution, so this collapses to a single course-dimension fan-out
   * with each entity's institution derived from the tile itself (see
   * fanout.ts's design note). `isCourseRun` is true for a composed run too,
   * so the existing course-fanout UI machinery (course progress numerator,
   * "Stop after this course", course outcomes write-back) applies unchanged. */
  isComposedRun: boolean;
  isCourseRun: boolean;
  entities: RunFanoutEntity[];
}

/**
 * Resolves handleRun's fan-out entity list from the workflow's scope: a
 * composed run's course tiles (each carrying its own institution), an
 * institution fan-out's configured institutions, a course fan-out's matched
 * tiles, or - when the scope has no fan-out at all - the single implicit
 * entity `{ institution: null }`. Returns an explicit `{ error }` (never
 * throws) so an enumeration failure surfaces as the same validation message
 * handleRun always showed for it.
 */
export async function resolveRunFanoutPlan(
  scope: WorkflowScope | undefined,
  activeInstitution: string | null
): Promise<RunFanoutPlan | { error: string }> {
  const isComposedRun = isComposedFanout(scope);
  const isCourseRun = isCourseFanout(scope) || isComposedRun;

  let entities: RunFanoutEntity[];
  if (isComposedRun) {
    const resolved = await resolveFanoutCourses(scope, null);
    if ("error" in resolved) return { error: `Could not list course tiles: ${resolved.error}` };
    if (resolved.list.length === 0) return { error: "The scope matched no course tiles." };
    entities = buildComposedFanoutEntities(resolved.list);
  } else if (isInstitutionFanout(scope)) {
    const resolved = await resolveFanoutInstitutions();
    if ("error" in resolved) return { error: `Could not list institutions: ${resolved.error}` };
    if (resolved.list.length === 0) return { error: "No institutions are configured on the server." };
    entities = resolved.list.map((acronym) => ({ institution: acronym }));
  } else if (isCourseFanout(scope)) {
    const resolved = await resolveFanoutCourses(scope, activeInstitution);
    if ("error" in resolved) return { error: `Could not list course tiles: ${resolved.error}` };
    if (resolved.list.length === 0) return { error: "The scope matched no course tiles." };
    entities = resolved.list.map((course) => ({ institution: null, courseId: course.id, courseName: course.name }));
  } else {
    entities = [{ institution: null }];
  }
  return { isComposedRun, isCourseRun, entities };
}
