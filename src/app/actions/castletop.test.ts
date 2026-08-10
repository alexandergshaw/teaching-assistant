import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { emptyCourseProject } from "@/lib/course-project";

vi.mock("@/lib/supabase/auth", () => ({
  requireOwner: vi.fn().mockResolvedValue({ id: "user-1", email: "user@example.com" }),
}));

vi.mock("@/lib/supabase/courses", () => ({
  listCourses: vi.fn(),
}));

vi.mock("./canvas-inbox", () => ({
  listAssignmentBriefsByUrlAction: vi.fn(),
}));

import { requireOwner } from "@/lib/supabase/auth";
import { listCourses } from "@/lib/supabase/courses";
import { listAssignmentBriefsByUrlAction } from "./canvas-inbox";
import { generateCastletopWorkbookAction } from "./castletop";
import type { Course } from "@/lib/supabase/courses";

// Same one-time exceljs module-load cost as src/lib/castletop.test.ts - see
// the note on that file's beforeAll. Whichever test reaches weekLabels (or
// the action's own workbook build) first would otherwise pay ~9.6s and blow
// the default 5s testTimeout. Warmed here so it lands on setup instead.
beforeAll(async () => {
  await import("exceljs");
}, 60_000);

async function weekLabels(base64: string): Promise<string[]> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  const buffer = Buffer.from(base64, "base64");
  await wb.xlsx.load(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
  const ws = wb.getWorksheet(1);
  if (!ws) throw new Error("Worksheet not found");
  const labels: string[] = [];
  let lastLabel: string | null = null;
  ws.getColumn("A").eachCell({ includeEmpty: false }, (cell) => {
    const v = typeof cell.value === "string" ? cell.value : "";
    if (/^Week \d+$/.test(v) && v !== lastLabel) {
      labels.push(v);
      lastLabel = v;
    }
  });
  return labels;
}

function baseCourse(overrides: Partial<Course> = {}): Course {
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

describe("generateCastletopWorkbookAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOwner).mockResolvedValue({ id: "user-1", email: "user@example.com" });
    vi.mocked(listCourses).mockResolvedValue([]);
    vi.mocked(listAssignmentBriefsByUrlAction).mockResolvedValue({
      assignments: [],
      institution: "test",
    });
  });

  describe("Guards / error paths", () => {
    it("rejects blank courseId (empty string) without calling listCourses", async () => {
      const result = await generateCastletopWorkbookAction("");
      expect(result).toEqual({ error: "Choose a course." });
      expect(listCourses).not.toHaveBeenCalled();
    });

    it("rejects whitespace-only courseId without calling listCourses", async () => {
      const result = await generateCastletopWorkbookAction("   ");
      expect(result).toEqual({ error: "Choose a course." });
      expect(listCourses).not.toHaveBeenCalled();
    });

    it("rejects courseId not found in returned tiles", async () => {
      vi.mocked(listCourses).mockResolvedValue([baseCourse({ id: "other-course" })]);
      const result = await generateCastletopWorkbookAction("missing-course");
      expect(result).toEqual({ error: "Course not found." });
    });

    it("returns an error when requireOwner rejects", async () => {
      vi.mocked(requireOwner).mockRejectedValueOnce(new Error("Not authorized"));
      const result = await generateCastletopWorkbookAction("course-1");
      expect("error" in result).toBe(true);
      if ("error" in result) {
        expect(result.error).toContain("Not authorized");
      }
    });
  });

  describe("Weeks-resolution ladder", () => {
    it("produces a workbook when tile.weeks = 12", async () => {
      const course = baseCourse({ id: "course-1", weeks: 12, name: "Test Course" });
      vi.mocked(listCourses).mockResolvedValue([course]);

      const result = await generateCastletopWorkbookAction("course-1");
      expect("base64" in result).toBe(true);
      if ("base64" in result) {
        expect(result.base64.length).toBeGreaterThan(0);
        const buffer = Buffer.from(result.base64, "base64");
        expect(buffer[0]).toBe(0x50);
        expect(buffer[1]).toBe(0x4b);
        const labels = await weekLabels(result.base64);
        expect(labels).toHaveLength(12);
        expect(labels.at(-1)).toBe("Week 12");
        expect(result.weeks).toBe(labels.length);
      }
    });

    it("produces a workbook when tile.weeks is null and schedule has 5 topic-bearing weeks", async () => {
      const scheduleCSV = `week,topic
1,Week 1 Topic
2,Week 2 Topic
3,Week 3 Topic
4,Week 4 Topic
5,Week 5 Topic`;
      const course = baseCourse({
        id: "course-1",
        weeks: null,
        csvData: scheduleCSV,
        name: "Test Course",
      });
      vi.mocked(listCourses).mockResolvedValue([course]);

      const result = await generateCastletopWorkbookAction("course-1");
      expect("base64" in result).toBe(true);
      if ("base64" in result) {
        expect(result.base64.length).toBeGreaterThan(0);
        const labels = await weekLabels(result.base64);
        expect(labels).toHaveLength(5);
        expect(labels.at(-1)).toBe("Week 5");
        expect(result.weeks).toBe(labels.length);
      }
    });

    it("produces a workbook when tile.weeks is null and no schedule is provided (defaults to 16)", async () => {
      const course = baseCourse({
        id: "course-1",
        weeks: null,
        csvData: null,
        topics: null,
        name: "Test Course",
      });
      vi.mocked(listCourses).mockResolvedValue([course]);

      const result = await generateCastletopWorkbookAction("course-1");
      expect("base64" in result).toBe(true);
      if ("base64" in result) {
        expect(result.base64.length).toBeGreaterThan(0);
        const labels = await weekLabels(result.base64);
        expect(labels).toHaveLength(16);
        expect(labels.at(-1)).toBe("Week 16");
        expect(result.weeks).toBe(labels.length);
      }
    });

    it("treats weeks = 0 as unset and continues to next tier", async () => {
      const course = baseCourse({
        id: "course-1",
        weeks: 0,
        csvData: null,
        topics: null,
        name: "Test Course",
      });
      vi.mocked(listCourses).mockResolvedValue([course]);

      const result = await generateCastletopWorkbookAction("course-1");
      expect("base64" in result).toBe(true);
      if ("base64" in result) {
        expect(result.base64.length).toBeGreaterThan(0);
        const labels = await weekLabels(result.base64);
        expect(labels).toHaveLength(16);
        expect(labels.at(-1)).toBe("Week 16");
        expect(result.weeks).toBe(labels.length);
      }
    });

    it("treats negative weeks = -3 as unset and continues to next tier", async () => {
      const course = baseCourse({
        id: "course-1",
        weeks: -3,
        csvData: null,
        topics: null,
        name: "Test Course",
      });
      vi.mocked(listCourses).mockResolvedValue([course]);

      const result = await generateCastletopWorkbookAction("course-1");
      expect("base64" in result).toBe(true);
      if ("base64" in result) {
        expect(result.base64.length).toBeGreaterThan(0);
        const labels = await weekLabels(result.base64);
        expect(labels).toHaveLength(16);
        expect(labels.at(-1)).toBe("Week 16");
        expect(result.weeks).toBe(labels.length);
      }
    });
  });

  describe("LMS enrichment gating", () => {
    it("does not call listAssignmentBriefsByUrlAction when tile.lms is null", async () => {
      const course = baseCourse({
        id: "course-1",
        lms: null,
        canvasUrl: "https://canvas.example.com/courses/123",
        name: "Test Course",
      });
      vi.mocked(listCourses).mockResolvedValue([course]);

      await generateCastletopWorkbookAction("course-1");
      expect(listAssignmentBriefsByUrlAction).not.toHaveBeenCalled();
    });

    it("does not call listAssignmentBriefsByUrlAction when tile.canvasUrl is null", async () => {
      const course = baseCourse({
        id: "course-1",
        lms: "canvas",
        canvasUrl: null,
        name: "Test Course",
      });
      vi.mocked(listCourses).mockResolvedValue([course]);

      await generateCastletopWorkbookAction("course-1");
      expect(listAssignmentBriefsByUrlAction).not.toHaveBeenCalled();
    });

    it("calls listAssignmentBriefsByUrlAction exactly once when both lms and canvasUrl are set", async () => {
      const course = baseCourse({
        id: "course-1",
        lms: "canvas",
        canvasUrl: "https://canvas.example.com/courses/123",
        institution: "Test University",
        name: "Test Course",
      });
      vi.mocked(listCourses).mockResolvedValue([course]);

      await generateCastletopWorkbookAction("course-1");
      expect(listAssignmentBriefsByUrlAction).toHaveBeenCalledTimes(1);
      expect(listAssignmentBriefsByUrlAction).toHaveBeenCalledWith(
        "https://canvas.example.com/courses/123",
        "Test University"
      );
    });

    it("calls listAssignmentBriefsByUrlAction with undefined institution when institution is null", async () => {
      const course = baseCourse({
        id: "course-1",
        lms: "canvas",
        canvasUrl: "https://canvas.example.com/courses/123",
        institution: null,
        name: "Test Course",
      });
      vi.mocked(listCourses).mockResolvedValue([course]);

      await generateCastletopWorkbookAction("course-1");
      expect(listAssignmentBriefsByUrlAction).toHaveBeenCalledWith(
        "https://canvas.example.com/courses/123",
        undefined
      );
    });

    it("includes LMS enrichment error note when briefResult contains an error", async () => {
      vi.mocked(listAssignmentBriefsByUrlAction).mockResolvedValue({
        error: "Canvas API rate limited",
      });
      const course = baseCourse({
        id: "course-1",
        lms: "canvas",
        canvasUrl: "https://canvas.example.com/courses/123",
        name: "Test Course",
      });
      vi.mocked(listCourses).mockResolvedValue([course]);

      const result = await generateCastletopWorkbookAction("course-1");
      expect("base64" in result).toBe(true);
      if ("base64" in result) {
        expect(result.notes).toContain(
          "LMS enrichment note: Canvas API rate limited"
        );
      }
    });

    it("continues with success when listAssignmentBriefsByUrlAction throws", async () => {
      vi.mocked(listAssignmentBriefsByUrlAction).mockRejectedValueOnce(
        new Error("Network timeout")
      );
      const course = baseCourse({
        id: "course-1",
        lms: "canvas",
        canvasUrl: "https://canvas.example.com/courses/123",
        name: "Test Course",
      });
      vi.mocked(listCourses).mockResolvedValue([course]);

      const result = await generateCastletopWorkbookAction("course-1");
      expect("base64" in result).toBe(true);
      if ("base64" in result) {
        expect(result.notes).toContain(
          "LMS enrichment attempted but failed; continuing with schedule only."
        );
      }
    });
  });

  describe("Notes plumbing", () => {
    it("includes notes from resolveRepolessSchedule in the returned notes array", async () => {
      const scheduleCSV = `week,topic
1,Week 1 Topic`;
      const course = baseCourse({
        id: "course-1",
        csvData: scheduleCSV,
        name: "Test Course",
      });
      vi.mocked(listCourses).mockResolvedValue([course]);

      const result = await generateCastletopWorkbookAction("course-1");
      expect("base64" in result).toBe(true);
      if ("base64" in result) {
        expect(result.notes.some((n) => n.includes("schedule"))).toBe(true);
      }
    });

    it("includes notes from buildCastletopSources in the returned notes array", async () => {
      const course = baseCourse({
        id: "course-1",
        topics: "Week 1: Introduction\nWeek 2: Advanced",
        name: "Test Course",
      });
      vi.mocked(listCourses).mockResolvedValue([course]);

      const result = await generateCastletopWorkbookAction("course-1");
      expect("base64" in result).toBe(true);
      if ("base64" in result) {
        expect(Array.isArray(result.notes)).toBe(true);
      }
    });
  });

  describe("Filename", () => {
    it("returns a fileName ending with .xlsx", async () => {
      const course = baseCourse({ id: "course-1", name: "Test Course" });
      vi.mocked(listCourses).mockResolvedValue([course]);

      const result = await generateCastletopWorkbookAction("course-1");
      expect("fileName" in result).toBe(true);
      if ("fileName" in result) {
        expect(result.fileName).toMatch(/\.xlsx$/);
      }
    });

    it("uses the new underscore convention, ending in _Castletop.xlsx", async () => {
      const course = baseCourse({ id: "course-1", name: "Test Course" });
      vi.mocked(listCourses).mockResolvedValue([course]);

      const result = await generateCastletopWorkbookAction("course-1");
      expect("fileName" in result).toBe(true);
      if ("fileName" in result) {
        expect(result.fileName).toBe("Test Course_Castletop.xlsx");
      }
    });

    it("does not include a date in the fileName", async () => {
      const course = baseCourse({ id: "course-1", name: "Test Course" });
      vi.mocked(listCourses).mockResolvedValue([course]);

      const today = new Date().toISOString().split("T")[0];
      const result = await generateCastletopWorkbookAction("course-1");
      expect("fileName" in result).toBe(true);
      if ("fileName" in result) {
        expect(result.fileName).not.toContain(today);
      }
    });

    it("starts the fileName with courseCode when tile.courseCode is set", async () => {
      const course = baseCourse({
        id: "course-1",
        name: "Test Course",
        courseCode: "CS101",
      });
      vi.mocked(listCourses).mockResolvedValue([course]);

      const result = await generateCastletopWorkbookAction("course-1");
      expect("fileName" in result).toBe(true);
      if ("fileName" in result) {
        expect(result.fileName).toBe("CS101_Test Course_Castletop.xlsx");
      }
    });

    it("uses instructorFileAs in the fileName, taking precedence over instructor", async () => {
      const course = baseCourse({
        id: "course-1",
        name: "Intro to Computer Science",
        courseCode: "INFO-2350",
      });
      vi.mocked(listCourses).mockResolvedValue([course]);

      const result = await generateCastletopWorkbookAction("course-1", {
        instructor: "William A Loring",
        instructorFileAs: "Loring, William",
      });
      expect("fileName" in result).toBe(true);
      if ("fileName" in result) {
        expect(result.fileName).toBe(
          "Loring, William_INFO-2350_Intro to Computer Science_Castletop.xlsx"
        );
      }
    });

    it("falls back to instructor for the fileName when instructorFileAs is blank", async () => {
      const course = baseCourse({
        id: "course-1",
        name: "Intro to Computer Science",
        courseCode: "INFO-2350",
      });
      vi.mocked(listCourses).mockResolvedValue([course]);

      const result = await generateCastletopWorkbookAction("course-1", {
        instructor: "William A Loring",
        instructorFileAs: null,
      });
      expect("fileName" in result).toBe(true);
      if ("fileName" in result) {
        expect(result.fileName).toBe(
          "William A Loring_INFO-2350_Intro to Computer Science_Castletop.xlsx"
        );
      }
    });
  });

  describe("Return shape", () => {
    it("returns an object with exactly base64, fileName, notes, and weeks on success", async () => {
      const course = baseCourse({ id: "course-1", name: "Test Course" });
      vi.mocked(listCourses).mockResolvedValue([course]);

      const result = await generateCastletopWorkbookAction("course-1");
      expect("error" in result).toBe(false);
      if ("error" in result) return;

      expect(Object.keys(result).sort()).toEqual(
        ["base64", "fileName", "notes", "weeks"].sort()
      );
    });

    it("returns a non-empty base64 string", async () => {
      const course = baseCourse({ id: "course-1", name: "Test Course" });
      vi.mocked(listCourses).mockResolvedValue([course]);

      const result = await generateCastletopWorkbookAction("course-1");
      expect("base64" in result).toBe(true);
      if ("base64" in result) {
        expect(typeof result.base64).toBe("string");
        expect(result.base64.length).toBeGreaterThan(0);
      }
    });

    it("returns base64 that decodes to bytes starting with ZIP magic (PK)", async () => {
      const course = baseCourse({ id: "course-1", name: "Test Course" });
      vi.mocked(listCourses).mockResolvedValue([course]);

      const result = await generateCastletopWorkbookAction("course-1");
      expect("base64" in result).toBe(true);
      if ("base64" in result) {
        const buffer = Buffer.from(result.base64, "base64");
        expect(buffer[0]).toBe(0x50);
        expect(buffer[1]).toBe(0x4b);
      }
    });

    it("returns notes as an array", async () => {
      const course = baseCourse({ id: "course-1", name: "Test Course" });
      vi.mocked(listCourses).mockResolvedValue([course]);

      const result = await generateCastletopWorkbookAction("course-1");
      expect("base64" in result).toBe(true);
      if ("base64" in result) {
        expect(Array.isArray(result.notes)).toBe(true);
      }
    });

    it("returns fileName as a non-empty string", async () => {
      const course = baseCourse({ id: "course-1", name: "Test Course" });
      vi.mocked(listCourses).mockResolvedValue([course]);

      const result = await generateCastletopWorkbookAction("course-1");
      expect("fileName" in result).toBe(true);
      if ("fileName" in result) {
        expect(typeof result.fileName).toBe("string");
        expect(result.fileName.length).toBeGreaterThan(0);
      }
    });
  });

  describe("Config parameters", () => {
    it("passes config parameters through to buildCastletopPlan and produces a workbook", async () => {
      const course = baseCourse({
        id: "course-1",
        name: "Test Course",
        topics: "Topic 1\nTopic 2",
      });
      vi.mocked(listCourses).mockResolvedValue([course]);

      const result = await generateCastletopWorkbookAction("course-1", {
        instructor: "Dr. Smith",
        contactMinutes: 60,
      });
      expect("base64" in result).toBe(true);
      if ("base64" in result) {
        expect(result.base64.length).toBeGreaterThan(0);
        const buffer = Buffer.from(result.base64, "base64");
        expect(buffer[0]).toBe(0x50);
        expect(buffer[1]).toBe(0x4b);
      }
    });
  });
});
