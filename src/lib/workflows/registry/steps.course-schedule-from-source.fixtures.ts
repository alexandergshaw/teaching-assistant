// Shared fixtures for the steps.course-schedule-from-source.*.test.ts family.
// Split out of steps.course-schedule-from-source.test.ts (which had grown to
// 1304 lines, well over this repo's 1000-line-per-file cap) along that
// file's own describe-block seams: one file per schedule SOURCE (codebase,
// course-description, course-cartridge, syllabus-document,
// existing-lms-course, tile-export, tile-repo), one for the step's
// registration/output contract, and one for the cross-cutting
// placeholder-topic guard. Centralizing `step`, `testHelpers`,
// `scheduleSummary`, and `cartridgeFile` here means every split file
// exercises the IDENTICAL helpers rather than N independent copies that can
// silently drift apart from each other over time (course-cartridge and the
// placeholder-topic guard both built their fixture cartridge file the exact
// same way even before this split - that duplication is now a single
// source of truth instead of two).
//
// This file is intentionally NOT named *.test.ts: vitest's config runs every
// src/**/*.test.ts file expecting at least one test in it, and a fixtures-only
// module with no test() / it() would fail that expectation.

import { courseScheduleFromSourceSteps } from "./steps.course-schedule-from-source";
import type { StepRunHelpers, StepRunSummary } from "../registry-helpers";

export const step = courseScheduleFromSourceSteps.find((s) => s.type === "course-schedule-from-source")!;

export function testHelpers(overrides: Partial<StepRunHelpers> = {}): StepRunHelpers {
  return {
    activeInstitution: null,
    provider: "gemini",
    author: "Test Author",
    saveBundle: null,
    saveCourseMaterialFile: null,
    saveCourseCastletopFile: null,
    saveCourseExportFile: null,
    loadCommonResources: null,
    getLibraryFile: null,
    getInstitutionFields: null,
    loadCourseExport: null,
    loadCourseMaterials: null,
    ...overrides,
  };
}

export function scheduleSummary(result: { summary: StepRunSummary }) {
  if (result.summary.kind !== "schedule") {
    throw new Error(`Expected a schedule summary, got "${result.summary.kind}".`);
  }
  return result.summary;
}

// Shared by the course-cartridge and placeholder-topic-guard split files -
// both exercise source: course-cartridge, so both need an .imscc File to
// upload.
export function cartridgeFile(): File {
  return new File(["zip-bytes"], "export.imscc", { type: "application/octet-stream" });
}
