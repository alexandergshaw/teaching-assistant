// Regression coverage for courseToInputPayload: a hand-maintained field list
// that must stay a faithful, non-lossy round-trip of Course. Course Kickoff
// and Course Refresh re-save every tile through this payload on every run, so
// a Course field this function forgets to carry is not merely "not updated" -
// toRow's clean() in src/lib/supabase/courses.ts maps a missing string field
// to an explicit `null`, silently wiping that column in the database.

import { describe, it, expect, vi } from "vitest";

vi.mock("@/app/actions", () => ({
  listCourseContentAction: vi.fn(),
  listCourseHubAction: vi.fn(),
  getDeckTemplateAction: vi.fn(),
}));

import { courseToInputPayload } from "./registry-helpers";
import type { Course } from "@/lib/supabase/courses";
import type { CourseProject } from "@/lib/course-project";

// A Course fixture where EVERY field holds a distinctive, non-empty value (no
// nulls, no empty strings, no empty arrays, no zeros). This is what makes the
// round-trip test below meaningful: if courseToInputPayload ever drops or
// blanks a field, the corresponding comparison fails instead of vacuously
// matching null-to-null or ""-to-"".
//
// Typed `Required<Course>`, NOT `Course`, and that is load-bearing. The
// round-trip test derives its checked keys from this object's own runtime
// keys, so a Course field absent HERE is invisible there - which is exactly
// how courseKind/weeklyChecklist/gradesDueDate/gradesDueTime drifted out of
// courseToInputPayload unnoticed: all four are declared optional on Course
// (each for the fixture-churn reason its own comment explains), so plain
// `Course` let this fixture omit them and the "drift-proof" test passed
// vacuously. Required<Course> turns that silent gap into a compile error -
// the next optional Course field cannot be added without appearing here.
function fullCourseFixture(): Required<Course> {
  return {
    id: "fixture-course-id",
    name: "Fixture Course Name",
    courseCode: "FIX-101",
    term: "Fixture Term 2026",
    canvasUrl: "https://canvas.example.edu/courses/fixture",
    repos: [{ repo: "fixture-org/fixture-repo", branch: "fixture-branch" }],
    githubOrg: "fixture-github-org",
    textbook: "Fixture Textbook Title",
    syllabusId: "fixture-syllabus-id",
    institution: "Fixture Institution",
    integrations: [{ name: "Fixture Integration", url: "https://integration.example.com/fixture" }],
    roster: "Fixture Roster Text",
    notes: "Fixture Notes Text",
    topics: "Fixture Topics Text",
    csvName: "fixture-schedule.csv",
    csvData: "week,topic\n1,Fixture Topic",
    rubricName: "fixture-rubric.csv",
    rubricData: "criterion,points\nFixture Criterion,10",
    startDate: "2026-01-05",
    description: "Fixture Description Text",
    weeks: 15,
    tests: 3,
    lms: "canvas",
    dayTime: "MW 10:00-11:15",
    modality: "async",
    topicOutline: "Fixture Ch 1: Intro; Ch 2: Loops",
    syllabusTemplateId: "fixture-tpl-1",
    courseKind: "coding",
    endDate: "2026-05-08",
    breaks: "Week 8 - Fixture Spring Break",
    assignmentDueRule: "wed|17:30",
    email: "fixture-instructor@example.edu",
    emailClient: "gmail",
    classLengthMinutes: 83,
    courseProject: {
      mode: "course-long",
      name: "Fixture Project",
      definition: "Fixture project definition.",
      brief: "Fixture project brief.",
      briefFileName: "fixture-project.docx",
      milestones: [{ week: 1, title: "Fixture milestone", deliverable: "Fixture deliverable" }],
      generatedAt: "2026-01-01T00:00:00Z",
    } as CourseProject,
    materialsFiles: [
      { name: "fixture-materials.zip", path: "fixture/materials.zip", size: 111, addedAt: "2026-01-01T00:00:00Z" },
    ],
    castletopFiles: [
      { name: "fixture-castletop.xlsx", path: "fixture/castletop.xlsx", size: 222, addedAt: "2026-01-02T00:00:00Z" },
    ],
    miscFiles: [
      { name: "fixture-misc.pdf", path: "fixture/misc.pdf", size: 555, addedAt: "2026-01-04T00:00:00Z" },
    ],
    exportFiles: [
      { name: "fixture-export.imscc", path: "fixture/export.imscc", size: 333, addedAt: "2026-01-03T00:00:00Z" },
    ],
    materialsZipName: "fixture-zip-name.zip",
    materialsZipPath: "fixture/zip/path.zip",
    materialsZipSize: 444,
    customTiles: [
      { id: "fixture-tile-1", label: "Fixture Tile Label", value: "Fixture Tile Value", groupId: "fixture-group-1" },
    ],
    hiddenTiles: ["fixture-hidden-tile-1"],
    studentRepos: [
      {
        student: "Fixture Student",
        canvasUserId: "fixture-canvas-user-1",
        repo: "fixture-student/repo",
        username: "fixture-username",
        email: "fixture-student@example.com",
      },
    ],
    weeklyChecklist: [
      {
        id: "fixture-checklist-1",
        label: "Fixture checklist item",
        checked: true,
        checkedAt: 1767225600000,
        deadline: { weekday: 3, time: "23:59" },
      },
    ],
    gradesDueDate: "2026-05-15",
    gradesDueTime: "17:00",
    instructorBio: "Fixture instructor bio text.",
    instructorTitle: "Fixture Instructor Title",
    instructorCredentials: "Fixture Instructor Credentials",
    instructorDepartment: "Fixture Instructor Department",
    updatedAt: "2026-01-10T00:00:00Z",
  };
}

// Course fields intentionally NOT part of courseToInputPayload's round-trip.
// Each is either server-managed or written by a dedicated, narrowly-scoped
// writer rather than the general course-update payload that
// courseToInputPayload feeds into updateCourseHubAction. A Course field that
// is NOT in this list must be carried through by courseToInputPayload, or the
// round-trip test below fails - that is the whole point of this file: the
// next person adding a Course field must either carry it or add it here with
// a reason, not leave it to silently drift.
const EXCLUDED_COURSE_KEYS: ReadonlyArray<keyof Course> = [
  "id", // primary key identifying the row; never itself an editable field
  "updatedAt", // stamped fresh by toRow() on every write, not client-supplied
  "materialsFiles", // dedicated writer only: append/removeCourseMaterialFile
  "exportFiles", // dedicated writer only: append/removeCourseExportFile
  "castletopFiles", // dedicated writer only: append/removeCourseCastletopFile
  "miscFiles", // dedicated writer only: append/removeCourseMiscFile
  "courseProject", // dedicated writer only: updateCourseProject
  "materialsZipName", // dedicated writer only: updateCourseMaterials
  "materialsZipPath", // dedicated writer only: updateCourseMaterials
  "materialsZipSize", // dedicated writer only: updateCourseMaterials
];
const EXCLUDED_COURSE_KEY_SET: ReadonlySet<string> = new Set(EXCLUDED_COURSE_KEYS);

describe("courseToInputPayload", () => {
  it("fixture covers every Course field with a distinctive non-empty value", () => {
    // Guards this file's own premise: if a future edit weakens the fixture
    // back toward a null/empty placeholder, the round-trip test below could
    // pass vacuously (e.g. null-to-null) without actually exercising that
    // field.
    const fixture = fullCourseFixture();
    for (const [key, value] of Object.entries(fixture)) {
      if (value === null || value === undefined) {
        throw new Error(`fixture field "${key}" must not be null/undefined`);
      }
      if (typeof value === "string") {
        expect(value.trim().length).toBeGreaterThan(0);
      } else if (Array.isArray(value)) {
        expect(value.length).toBeGreaterThan(0);
      } else if (typeof value === "number") {
        expect(value).not.toBe(0);
      }
    }
  });

  it("carries every Course field forward except the intentionally-excluded ones", () => {
    const fixture = fullCourseFixture();
    const payload = courseToInputPayload(fixture);
    const payloadRecord = payload as unknown as Record<string, unknown>;
    const fixtureRecord = fixture as unknown as Record<string, unknown>;

    // Derive the checked key set from the fixture itself (not a hardcoded
    // list of field names) so a newly-added Course field is automatically
    // covered here the moment it is added to the fixture above.
    const checkedKeys = Object.keys(fixtureRecord).filter((key) => !EXCLUDED_COURSE_KEY_SET.has(key));
    expect(checkedKeys.length).toBeGreaterThan(0);

    const actual: Record<string, unknown> = {};
    const expected: Record<string, unknown> = {};
    for (const key of checkedKeys) {
      actual[key] = payloadRecord[key];
      expected[key] = fixtureRecord[key];
    }
    expect(actual).toEqual(expected);
  });

  it("regression: carries modality, topicOutline, and syllabusTemplateId - the fields this bug wiped", () => {
    // Course Kickoff/Refresh round-trip every tile through this payload on
    // every run. Before the fix, these three fields were omitted here, and
    // toRow's clean(undefined) -> null wiped them in the database on every
    // such run.
    const fixture = fullCourseFixture();
    fixture.modality = "async";
    fixture.topicOutline = "Ch 1: Intro; Ch 2: Loops";
    fixture.syllabusTemplateId = "tpl-1";

    const payload = courseToInputPayload(fixture);

    expect(payload.modality).toBe("async");
    expect(payload.topicOutline).toBe("Ch 1: Intro; Ch 2: Loops");
    expect(payload.syllabusTemplateId).toBe("tpl-1");
  });

  it("regression: carries courseKind - the second field this bug wiped", () => {
    // course_kind is a plain scalar column, so toRow runs it through clean()
    // and an omitted value becomes an explicit null. Before the fix,
    // courseToInputPayload did not list courseKind at all, so every Course
    // Kickoff / Course Refresh run wiped it - and a wiped kind silently falls
    // back to guessing from the course name, changing the deck contract,
    // case-study selection, and the deck-template default.
    const fixture = fullCourseFixture();
    fixture.courseKind = "applied";

    expect(courseToInputPayload(fixture).courseKind).toBe("applied");
  });

  it("carries courseKind through as null (not undefined) when the course has none", () => {
    // Both reach the same DB value via clean(), but an explicit null keeps
    // the payload's shape self-describing rather than relying on toRow's
    // coercion to fill the gap.
    const fixture = fullCourseFixture();
    fixture.courseKind = null;

    expect(courseToInputPayload(fixture).courseKind).toBeNull();
  });

  it("carries the four instructor-profile fields (C): plain scalars, so omission would wipe them exactly like courseKind", () => {
    // instructor_bio/title/credentials/department are plain scalar columns
    // (src/lib/supabase/courses.ts's toRow), so an omitted value becomes an
    // explicit null via clean() - same hazard entry 223 documented for
    // courseKind, not the safe-by-omission shape weeklyChecklist/gradesDue*
    // have. Every Course Kickoff / Course Refresh run re-saves the tile
    // through this payload, so a dropped field here would silently erase the
    // instructor's bio and re-trigger the "About Your Instructor" document's
    // skip note (steps.course-guides.ts) on every such run.
    const fixture = fullCourseFixture();
    fixture.instructorBio = "Updated bio text.";
    fixture.instructorTitle = "Updated Title";
    fixture.instructorCredentials = "Updated Credentials";
    fixture.instructorDepartment = "Updated Department";

    const payload = courseToInputPayload(fixture);

    expect(payload.instructorBio).toBe("Updated bio text.");
    expect(payload.instructorTitle).toBe("Updated Title");
    expect(payload.instructorCredentials).toBe("Updated Credentials");
    expect(payload.instructorDepartment).toBe("Updated Department");
  });

  it("carries the four instructor-profile fields through as null (not undefined) when the course has none", () => {
    // Same reasoning as courseKind's own null-passthrough test above: both
    // reach the same DB value via clean(), but an explicit null keeps the
    // payload self-describing rather than relying on toRow's coercion.
    const fixture = fullCourseFixture();
    fixture.instructorBio = null;
    fixture.instructorTitle = null;
    fixture.instructorCredentials = null;
    fixture.instructorDepartment = null;

    const payload = courseToInputPayload(fixture);

    expect(payload.instructorBio).toBeNull();
    expect(payload.instructorTitle).toBeNull();
    expect(payload.instructorCredentials).toBeNull();
    expect(payload.instructorDepartment).toBeNull();
  });

  it("carries weeklyChecklist and both grades-due fields (safe-by-omission, but should still round-trip)", () => {
    // Unlike courseKind above, these three are guarded in toRow - weekly_checklist
    // by `Array.isArray(...) ? ... : undefined` and both grades_due_* by
    // `input.gradesDueDate !== undefined ? ... : undefined` - so omitting them
    // left the columns untouched rather than wiping them. They are carried for
    // the same reason hiddenTiles is below: a complete Course round-trip.
    const fixture = fullCourseFixture();
    const payload = courseToInputPayload(fixture);

    expect(payload.weeklyChecklist).toEqual(fixture.weeklyChecklist);
    expect(payload.gradesDueDate).toBe("2026-05-15");
    expect(payload.gradesDueTime).toBe("17:00");
  });

  it("leaves the grades-due pair undefined when the course omits it, so toRow cannot wipe the columns", () => {
    // The undefined-in/undefined-out path is the whole reason those two
    // fields are optional passthroughs instead of `?? null` like courseKind:
    // a null would clear the date AND, per toRow, the time along with it.
    const fixture = fullCourseFixture();
    delete (fixture as Partial<Course>).gradesDueDate;
    delete (fixture as Partial<Course>).gradesDueTime;

    const payload = courseToInputPayload(fixture);

    expect(payload.gradesDueDate).toBeUndefined();
    expect(payload.gradesDueTime).toBeUndefined();
  });

  it("carries hiddenTiles forward for correctness (safe-by-omission today, but should still round-trip)", () => {
    // toRow writes hidden_tiles via `Array.isArray(...) ? ... : undefined`,
    // and an undefined value is dropped by JSON.stringify before the request
    // reaches PostgREST, so omitting hiddenTiles does not null the column
    // today - unlike the string fields above. It is still carried through
    // for correctness so this payload is a complete Course round-trip.
    const fixture = fullCourseFixture();
    fixture.hiddenTiles = ["assignments", "syllabus"];

    const payload = courseToInputPayload(fixture);

    expect(payload.hiddenTiles).toEqual(["assignments", "syllabus"]);
  });
});
