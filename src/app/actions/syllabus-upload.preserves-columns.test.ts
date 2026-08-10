// Regression: uploading a syllabus must not wipe unrelated course columns.
//
// updateCourse takes a FULL CourseInput, and toRow maps every plain scalar
// column through clean(), where clean(undefined) is null. So a payload that
// fails to MENTION a column actively clears it. uploadSyllabusAction used to
// build that payload from a hand-written field list which had fallen 15
// columns behind the Course type, so uploading a syllabus silently cleared
// the course's assigned syllabus template and fourteen other fields.
//
// This asserts the payload that actually reaches updateCourse, rather than
// asserting the action's return value - the old code returned success while
// destroying data, so the return value was never the signal.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { emptyCourseProject } from "@/lib/course-project";
import type { Course, CourseInput } from "@/lib/supabase/courses";

vi.mock("@/lib/supabase/auth", () => ({
  requireOwner: vi.fn().mockResolvedValue({ id: "user-1", email: "user@example.com" }),
}));

vi.mock("@/lib/supabase/course-syllabi", () => ({
  createSyllabus: vi.fn().mockResolvedValue({ id: "syllabus-new", name: "Fall Syllabus" }),
}));

vi.mock("@/lib/supabase/courses", () => ({
  getCourse: vi.fn(),
  updateCourse: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/docx", () => ({
  buildDocxFromPlainText: vi.fn().mockReturnValue("ZG9jeA=="),
}));

import { getCourse, updateCourse } from "@/lib/supabase/courses";
import { uploadSyllabusAction } from "./syllabus-upload";

/** A course with every column the old hand-written list forgot set to a
 * distinctive, non-empty value, so a wipe is unmistakable. */
function fullCourse(): Course {
  return {
    id: "course-1",
    name: "CS 101",
    courseCode: "INFO-2350",
    term: "Fall 2026",
    canvasUrl: "https://canvas.mccneb.edu/courses/123",
    repos: [],
    githubOrg: "example-org",
    textbook: "Some Book",
    syllabusId: null,
    institution: "MCC",
    integrations: [],
    roster: "a roster",
    notes: "some notes",
    topics: "some topics",
    csvName: null,
    csvData: null,
    rubricName: null,
    rubricData: null,
    startDate: "2026-08-24",
    description: "a description",
    weeks: 16,
    tests: 2,
    lms: "canvas",
    dayTime: "MW 10:00",
    modality: "sync",
    topicOutline: "an outline",
    syllabusTemplateId: "template-abc",
    courseKind: "coding",
    endDate: "2026-12-11",
    breaks: "2026-11-25..2026-11-27 | Thanksgiving",
    assignmentDueRule: "sun|23:59",
    email: "prof@example.com",
    emailClient: "outlook",
    classLengthMinutes: 75,
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
    gradesDueDate: "2026-12-15",
    gradesDueTime: "17:00",
    instructorBio: "a bio",
    instructorTitle: "Instructor",
    instructorCredentials: "MS",
    instructorDepartment: "Information Technology",
    updatedAt: "2026-08-01T00:00:00.000Z",
  };
}

const TXT_FILE = {
  name: "syllabus.txt",
  // "hello" in base64 - the .txt branch of extractTextFromFile is plain
  // utf-8 decoding, so this needs no parser and no fixture binary.
  base64: "aGVsbG8=",
  mimeType: "text/plain",
};

/** The CourseInput actually handed to updateCourse. */
function capturedInput(): CourseInput {
  expect(updateCourse).toHaveBeenCalledTimes(1);
  return vi.mocked(updateCourse).mock.calls[0][2];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCourse).mockResolvedValue(fullCourse());
  vi.mocked(updateCourse).mockResolvedValue(fullCourse());
});

describe("uploadSyllabusAction preserves every column it does not intend to change", () => {
  it("keeps syllabusTemplateId - the column that made this bug visible", async () => {
    // The syllabus template assignment is what the Generate-syllabus buttons
    // read. Wiping it turned a one-click action back into an upload prompt.
    await uploadSyllabusAction("course-1", TXT_FILE);
    expect(capturedInput().syllabusTemplateId).toBe("template-abc");
  });

  it("keeps all fifteen columns the hand-written list had fallen behind on", async () => {
    await uploadSyllabusAction("course-1", TXT_FILE);
    const input = capturedInput();

    expect({
      modality: input.modality,
      topicOutline: input.topicOutline,
      syllabusTemplateId: input.syllabusTemplateId,
      courseKind: input.courseKind,
      endDate: input.endDate,
      breaks: input.breaks,
      assignmentDueRule: input.assignmentDueRule,
      email: input.email,
      emailClient: input.emailClient,
      classLengthMinutes: input.classLengthMinutes,
      instructorBio: input.instructorBio,
      instructorTitle: input.instructorTitle,
      instructorCredentials: input.instructorCredentials,
      instructorDepartment: input.instructorDepartment,
    }).toEqual({
      modality: "sync",
      topicOutline: "an outline",
      syllabusTemplateId: "template-abc",
      courseKind: "coding",
      endDate: "2026-12-11",
      breaks: "2026-11-25..2026-11-27 | Thanksgiving",
      assignmentDueRule: "sun|23:59",
      email: "prof@example.com",
      emailClient: "outlook",
      classLengthMinutes: 75,
      instructorBio: "a bio",
      instructorTitle: "Instructor",
      instructorCredentials: "MS",
      instructorDepartment: "Information Technology",
    });
  });

  it("still does the one thing it is FOR - pointing the course at the new syllabus", async () => {
    // Guards against "fixing" the wipe by simply not writing at all.
    const result = await uploadSyllabusAction("course-1", TXT_FILE);
    expect(capturedInput().syllabusId).toBe("syllabus-new");
    expect(result).toMatchObject({ syllabusId: "syllabus-new" });
  });

  it("carries the fields the old list DID remember, so the fix is not a regression either", async () => {
    await uploadSyllabusAction("course-1", TXT_FILE);
    const input = capturedInput();
    expect(input.name).toBe("CS 101");
    expect(input.startDate).toBe("2026-08-24");
    expect(input.weeks).toBe(16);
    expect(input.institution).toBe("MCC");
    expect(input.canvasUrl).toBe("https://canvas.mccneb.edu/courses/123");
  });

  it("does not touch the course at all when it does not exist", async () => {
    vi.mocked(getCourse).mockResolvedValue(null);
    const result = await uploadSyllabusAction("course-1", TXT_FILE);
    expect(updateCourse).not.toHaveBeenCalled();
    expect(result).toMatchObject({ error: expect.stringContaining("Course not found") });
  });
});
