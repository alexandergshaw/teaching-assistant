// Shared fixture for courses-table-helpers.test.ts and
// courses-table-helpers.exports.test.ts. Split out of
// courses-table-helpers.test.ts (which had grown past this repo's
// 1000-line-per-file cap) so both files build a Course from the exact same
// defaults instead of drifting, copy-pasted literals.
//
// This file is intentionally NOT named *.test.ts: vitest's config runs every
// src/**/*.test.ts file expecting at least one test in it, and a
// fixtures-only module with no test() / it() would fail that expectation.

import { emptyCourseProject } from "@/lib/course-project";
import type { Course } from "./supabase/courses";

export function makeCourse(overrides: Partial<Course>): Course {
  return {
    id: "c1",
    name: "Course",
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
    topics: null,
    csvName: null,
    csvData: null,
    rubricName: null,
    rubricData: null,
    startDate: null,
    description: null,
    weeks: null,
    tests: null,
    lms: null,
    dayTime: null,
    modality: null,
    topicOutline: null,
    syllabusTemplateId: null,
    courseKind: null,
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
    weeklyChecklist: [],
    gradesDueDate: null,
    gradesDueTime: null,
    instructorBio: null,
    instructorTitle: null,
    instructorCredentials: null,
    instructorDepartment: null,
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}
