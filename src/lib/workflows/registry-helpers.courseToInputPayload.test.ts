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

// A Course fixture where EVERY field holds a distinctive, non-empty value (no
// nulls, no empty strings, no empty arrays, no zeros). This is what makes the
// round-trip test below meaningful: if courseToInputPayload ever drops or
// blanks a field, the corresponding comparison fails instead of vacuously
// matching null-to-null or ""-to-"".
function fullCourseFixture(): Course {
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
    materialsFiles: [
      { name: "fixture-materials.zip", path: "fixture/materials.zip", size: 111, addedAt: "2026-01-01T00:00:00Z" },
    ],
    castletopFiles: [
      { name: "fixture-castletop.xlsx", path: "fixture/castletop.xlsx", size: 222, addedAt: "2026-01-02T00:00:00Z" },
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
