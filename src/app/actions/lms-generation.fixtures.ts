// Shared fixtures for lms-generation.test.ts and
// lms-generation.post-and-list.test.ts. Split out of lms-generation.test.ts
// (which had grown past this repo's 1000-line-per-file cap) so both files
// build the same course/module doubles from the exact same defaults instead
// of drifting, copy-pasted literals.
//
// This file is intentionally NOT named *.test.ts: vitest's config runs every
// src/**/*.test.ts file expecting at least one test in it, and a
// fixtures-only module with no test()/it() would fail that expectation.
//
// Every mock-setup helper below (mockOwner, mockResolvedCourse,
// mockResolvedCourseById, mockCourseContent) assumes the IMPORTING test file
// has already called vi.mock() for the same module specifiers imported here
// (@/lib/supabase/auth, ./lms-syllabus-buttons, ./canvas-modules) - vi.mock()
// hoists to the top of that file, so by the time this module's own imports
// run, they resolve to the same mocked module instance the test file itself
// uses.

import { vi } from "vitest";
import { requireOwner } from "@/lib/supabase/auth";
import { resolveLmsCourseRowAction, resolveLmsCourseRowByIdAction } from "./lms-syllabus-buttons";
import { listCourseContentAction } from "./canvas-modules";
import { buildCourseNotLinkedMessage } from "@/lib/lms-generation/course-not-linked";

export const COURSE_URL = "https://canvas.example.edu/courses/100";

export const FAKE_COURSE = {
  id: "course-1",
  name: "Intro to Widgets",
  canvasUrl: COURSE_URL,
  institution: "MIT",
  courseKind: null,
};

// M15 (adversarial review, WAVE 11C, DEFECT 1): this used to hand-spell the
// full message text, a THIRD independently-typed copy alongside deck/route.test.ts's
// (course-not-linked.ts is the sole owner - see that file's own header
// comment). Now built from the real buildCourseNotLinkedMessage, so any
// future wording change updates this fixture for free instead of needing a
// fourth hand-edit.
export const NOT_LINKED_ERROR = {
  error: buildCourseNotLinkedMessage(COURSE_URL),
};

export function mockOwner() {
  vi.mocked(requireOwner).mockResolvedValue({ id: "user-1", email: "owner@example.com" } as never);
}

export function mockResolvedCourse() {
  vi.mocked(resolveLmsCourseRowAction).mockResolvedValue({ course: FAKE_COURSE } as never);
}

// AC1/AC2 defect fix (docs/REGRESSION.md - "generate from an export
// selection" defect): a saved course with no Canvas connection at all -
// `canvasUrl`/`institution` both absent, unlike FAKE_COURSE above. Only
// resolveLmsCourseRowByIdAction (the courseId path) can ever resolve one of
// these; resolveLmsCourseRowAction (the courseUrl path) would never see it.
export const FAKE_EXPORT_ONLY_COURSE = {
  id: "export-course-1",
  name: "WNCC Intro to Widgets",
  canvasUrl: null,
  institution: null,
  courseKind: null,
};

export function mockResolvedCourseById() {
  vi.mocked(resolveLmsCourseRowByIdAction).mockResolvedValue({ course: FAKE_EXPORT_ONLY_COURSE } as never);
}

export const FAKE_MODULES = [
  { id: 10, name: "Week 1", position: 1, published: true, itemsCount: 1, items: [] },
];

export function mockCourseContent(modules: unknown = FAKE_MODULES) {
  vi.mocked(listCourseContentAction).mockResolvedValue({
    courseName: "Intro to Widgets",
    modules,
    pages: [],
  } as never);
}
