// Shared test fixtures for gatherModuleMaterials's coverage, which now spans
// two test files (registry-helpers.sources.test.ts and
// export-module-materials.test.ts - see that split's own notes for why).
// courseExport/testHelpers/baseCourse/noProgress used to be private to
// registry-helpers.sources.test.ts; both files need identical copies of them,
// so they live here once instead of as copy-pasted (and driftable) literals
// in each file. Deliberately NOT named `*.test.ts` - vitest would otherwise
// try to run it as a test file and fail on having no tests.

import { emptyCourseProject } from "@/lib/course-project";
import type { StepRunHelpers } from "./registry-helpers";
import type { Course } from "@/lib/supabase/courses";
import type { CartridgeCourseData } from "@/lib/cartridge-import";

export function courseExport(overrides: Partial<CartridgeCourseData> = {}): CartridgeCourseData {
  return {
    title: null,
    courseCode: null,
    startAt: null,
    syllabusHtml: null,
    modules: [],
    rubrics: [],
    hasCourseSettings: true,
    ...overrides,
  };
}

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

export function baseCourse(overrides: Partial<Course> = {}): Course {
  return {
    id: "course-1",
    name: "CS 101",
    courseCode: null,
    term: null,
    canvasUrl: null,
    repos: [],
    githubOrg: null,
    textbook: null,
    syllabusId: null,
    institution: null,
    integrations: [],
    roster: null,
    notes: null,
    topics: "Topic list",
    csvName: null,
    csvData: null,
    rubricName: null,
    rubricData: null,
    startDate: null,
    description: "A course description",
    weeks: null,
    tests: null,
    lms: null,
    dayTime: null,
    modality: null,
    topicOutline: null,
    syllabusTemplateId: null,
    endDate: null,
    breaks: null,
    assignmentDueRule: null,
    email: null,
    emailClient: null,
    classLengthMinutes: null,
    courseProject: emptyCourseProject(),
    materialsFiles: [],
    castletopFiles: [],
    miscFiles: [],
    exportFiles: [],
    materialsZipName: null,
    materialsZipPath: null,
    materialsZipSize: null,
    customTiles: [],
    hiddenTiles: [],
    studentRepos: [],
    updatedAt: "2024-09-01T00:00:00Z",
    ...overrides,
  };
}

export const noProgress = () => {};
