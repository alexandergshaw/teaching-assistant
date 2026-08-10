// Pure "which module" resolution shared by both LMS-tab syllabus buttons
// (docs/lms-tab-syllabus-buttons-acceptance-criteria.md). Both buttons look
// for a "Start Here" module by the SAME case/whitespace-insensitive rule
// steps.course-setup.materials.ts already uses inline
// (`m.name.trim().toLowerCase() === "start here"`, docs/REGRESSION.md #248
// check 3) - extracted here so the two buttons and any future caller cannot
// drift onto different matching rules. Pure - no I/O.
import { normalizedTitleEquals } from "./normalized-title-match";

export const START_HERE_MODULE_NAME = "Start Here";

/** Minimal shape either button needs from a Canvas module - just enough to
 * find it by name, never the full CanvasModule item list. */
export interface ModuleLike {
  id: number;
  name: string;
}

/**
 * Find the course's "Start Here" module, case/whitespace-insensitively.
 * Undefined when the course has no such module - callers must NOT create one
 * as a side effect (AC B1-7 says the quiz button never creates a module; it
 * is a bigger action than the instructor asked for).
 */
export function findStartHereModule<T extends ModuleLike>(modules: T[]): T | undefined {
  return modules.find((m) => normalizedTitleEquals(m.name, START_HERE_MODULE_NAME));
}

/**
 * Which module the generated syllabus should be placed into (AC B2-7):
 * "Start Here" when one exists, else the course's first module (Canvas's own
 * list order), else null when the course has no modules at all - the caller
 * reports that the syllabus could not be attached rather than skipping the
 * whole generate-and-save step.
 */
export function resolveModuleForSyllabusPlacement<T extends ModuleLike>(modules: T[]): T | null {
  return findStartHereModule(modules) ?? modules[0] ?? null;
}
