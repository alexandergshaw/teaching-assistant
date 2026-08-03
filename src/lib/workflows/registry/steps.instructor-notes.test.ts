// Per-module instructor notes: exercises resolveModuleTools/
// coreToolMentionedInWeek (the pure "which tools does this module ACTUALLY
// use" resolver - never LLM-decided) and renderInstructorNotesDocument
// directly, then the full step.run() through mocked actions for the
// grounding-or-skip, opt-in LMS posting (ALWAYS unpublished), and
// quota-short-circuit behaviors.

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ScheduleWeekPlan } from "@/app/actions";
import type { StepRunHelpers } from "@/lib/workflows/registry-helpers";
import type { GeneratedCourseFile } from "@/lib/workflows/types";
import { emptyCourseProject } from "@/lib/course-project";
import type { Course } from "@/lib/supabase/courses";

vi.mock("@/app/actions", () => ({
  listCourseHubAction: vi.fn(),
  generateInstructorNotesAction: vi.fn(),
  createPageAction: vi.fn(),
  createModuleItemAction: vi.fn(),
}));

import {
  listCourseHubAction,
  generateInstructorNotesAction,
  createPageAction,
  createModuleItemAction,
} from "@/app/actions";
import {
  instructorNotesSteps,
  resolveModuleTools,
  coreToolMentionedInWeek,
  renderInstructorNotesDocument,
} from "./steps.instructor-notes";
import { PARTIAL_FAILURE_OUTPUT_KEY } from "@/lib/workflows/run-logging";

const SPEND_CAP_429 =
  'Instructor notes generation failed: HTTP 429 — {"error":{"code":429,"message":"Your project has exceeded its monthly spending cap.","status":"RESOURCE_EXHAUSTED"}}';

const step = instructorNotesSteps.find((s) => s.type === "generate-instructor-notes")!;

function testHelpers(overrides: Partial<StepRunHelpers> = {}): StepRunHelpers {
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

function baseCourse(overrides: Partial<Course> = {}): Course {
  return {
    id: "course-1",
    name: "MGT 422",
    courseCode: "MGT422",
    term: null,
    canvasUrl: "https://canvas.example.edu/courses/123",
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
    startDate: "2026-01-05",
    description: null,
    weeks: 3,
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
  } as Course;
}

function courseWithTools(tools: string[]): Course {
  return baseCourse({ courseProject: { ...emptyCourseProject(), tools } });
}

function objectivesFile(week: number, text: string): GeneratedCourseFile {
  return {
    name: `Week ${week} Objectives.docx`,
    blob: new Blob(["x"]),
    mimeType: "application/octet-stream",
    weekNumber: week,
    sortOrder: 0.5,
    role: "objectives",
    pageText: text,
  };
}

function schedule(): ScheduleWeekPlan[] {
  return [
    { week: 1, topic: "Sprint Planning", summary: "", assignmentTitle: null, assignmentSlug: null, testName: null },
    { week: 2, topic: "Retrospectives", summary: "", assignmentTitle: null, assignmentSlug: null, testName: null },
  ];
}

describe("coreToolMentionedInWeek", () => {
  it("matches a curated committed-tool name via its own TOOL_TUTORIAL_MAP key", () => {
    const mentioned = new Set(["trello"]);
    expect(coreToolMentionedInWeek("Trello (free plan)", "Track tasks in Trello this week.", mentioned)).toBe(true);
  });

  it("does not match a curated committed tool the week's text never names", () => {
    const mentioned = new Set<string>();
    expect(coreToolMentionedInWeek("Trello (free plan)", "Nothing tool-related here.", mentioned)).toBe(false);
  });

  it("falls back to a plain substring check for a tool not in the curated map at all", () => {
    const mentioned = new Set<string>();
    expect(
      coreToolMentionedInWeek("Bespoke Internal Simulator", "Run the scenario in the Bespoke Internal Simulator.", mentioned)
    ).toBe(true);
    expect(coreToolMentionedInWeek("Bespoke Internal Simulator", "No mention of it here.", mentioned)).toBe(false);
  });
});

describe("resolveModuleTools", () => {
  it("excludes a CORE tool the week's own text never mentions (anti-noise: never lists a tool the module never used)", () => {
    expect(resolveModuleTools(["Trello (free plan)"], "This week covers estimation techniques.")).toEqual([]);
  });

  it("includes a CORE tool the week's own text actually names", () => {
    expect(resolveModuleTools(["Trello (free plan)"], "Update your Trello board with this week's tasks.")).toEqual([
      "Trello (free plan)",
    ]);
  });

  it("includes a SPECIALIST tool (not in CORE) the week's text names, alongside a used CORE tool", () => {
    const result = resolveModuleTools(
      ["Trello (free plan)"],
      "Update your Trello board, then log hours in Asana for this week only."
    );
    expect(result).toEqual(["Trello (free plan)", "Asana"]);
  });

  it("returns [] when the week's text names no tool at all - core or specialist", () => {
    expect(resolveModuleTools(["Trello (free plan)"], "A purely conceptual discussion week.")).toEqual([]);
  });

  it("returns [] for an empty core toolset and no specialist mention", () => {
    expect(resolveModuleTools([], "A purely conceptual discussion week.")).toEqual([]);
  });

  it("never double-counts a specialist tool that is really the same tool as a used core one", () => {
    // "sheets" only counts via its qualified form "google sheets" - both the
    // core name and the week text use the qualified form, so this must
    // collapse to ONE entry, not a core "Google Sheets (free)" plus a
    // duplicate specialist "Sheets".
    const result = resolveModuleTools(["Google Sheets (free)"], "Calculate totals in Google Sheets this week.");
    expect(result).toEqual(["Google Sheets (free)"]);
  });
});

describe("renderInstructorNotesDocument", () => {
  it("renders the title, the free-alternatives section, and the debugging section with numbered problems", () => {
    const doc = renderInstructorNotesDocument(
      "Week 1 Instructor Notes",
      [{ tool: "Asana", freeAlternative: "Trello (free plan)", why: "Both offer kanban boards." }],
      [{ tool: "Asana", problems: [{ issue: "Notifications missing", solution: "Check settings." }] }]
    );
    expect(doc).toContain("# Week 1 Instructor Notes");
    expect(doc).toContain("Instructor-only notes. Not visible to students by default.");
    expect(doc).toContain("## Free Software Alternatives");
    expect(doc).toContain("### Asana");
    expect(doc).toContain("Free alternative: Trello (free plan)");
    expect(doc).toContain("Both offer kanban boards.");
    expect(doc).toContain("## Common Debugging Problems and Solutions");
    expect(doc).toContain("1. Problem: Notifications missing");
    expect(doc).toContain("   Solution: Check settings.");
  });

  it("omits a section entirely when it has nothing, rather than an empty heading", () => {
    const doc = renderInstructorNotesDocument("Week 1 Instructor Notes", [], []);
    expect(doc).not.toContain("## Free Software Alternatives");
    expect(doc).not.toContain("## Common Debugging Problems and Solutions");
  });
});

describe("generate-instructor-notes step", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [courseWithTools(["Asana (free tier)"])] });
    vi.mocked(generateInstructorNotesAction).mockResolvedValue({
      alternatives: [{ tool: "Asana (free tier)", freeAlternative: "Trello (free plan)", why: "Comparable." }],
      debugging: [
        { tool: "Asana (free tier)", problems: [{ issue: "x", solution: "y" }] },
        { tool: "Trello (free plan)", problems: [{ issue: "x", solution: "y" }] },
      ],
    });
    vi.mocked(createPageAction).mockResolvedValue({
      page: { pageId: 1, url: "week-1-instructor-notes", title: "t", body: "b", published: false, updatedAt: null },
    });
    vi.mocked(createModuleItemAction).mockResolvedValue({ ok: true });
  });

  it("returns the incoming files unchanged when the schedule is empty", async () => {
    const incoming: GeneratedCourseFile[] = [objectivesFile(1, "Use Asana to plan this week's sprint.")];
    const result = await step.run({ schedule: [], files: incoming }, testHelpers(), () => {});
    expect(result.outputs.files).toBe(incoming);
    expect(result.outputs.count).toBe(0);
  });

  it("selected explicitly off: does no work and passes incoming files through unchanged", async () => {
    const files: GeneratedCourseFile[] = [objectivesFile(1, "Use Asana to plan this week's sprint.")];
    const result = await step.run(
      { schedule: schedule(), files, hubCourse: "course-1", selected: "" },
      testHelpers(),
      () => {}
    );
    expect(generateInstructorNotesAction).not.toHaveBeenCalled();
    expect(result.outputs.files).toBe(files);
    expect(result.outputs.count).toBe(0);
  });

  it("selected left unbound (undefined): generates normally, matching every preset that does not wire the output selector", async () => {
    const files: GeneratedCourseFile[] = [objectivesFile(1, "Use Asana to plan this week's sprint.")];
    const result = await step.run(
      { schedule: [schedule()[0]], files, hubCourse: "course-1" },
      testHelpers(),
      () => {}
    );
    expect(generateInstructorNotesAction).toHaveBeenCalledTimes(1);
    expect(result.outputs.count).toBe(1);
  });

  it("skips a week with no generated module materials, rather than falling back to the course-wide toolset", async () => {
    const files: GeneratedCourseFile[] = [objectivesFile(1, "Use Asana to plan this week's sprint.")];
    const result = await step.run(
      { schedule: schedule(), files, hubCourse: "course-1" },
      testHelpers(),
      () => {}
    );
    expect(generateInstructorNotesAction).toHaveBeenCalledTimes(1); // only week 1 has materials
    const report = result.outputs.report as string;
    expect(report).toContain("Week 2: skipped - no generated module materials found for this week.");
  });

  it("skips a week whose real materials name no committed or specialist tool, rather than discussing unused software", async () => {
    const files: GeneratedCourseFile[] = [objectivesFile(1, "A purely conceptual discussion with no tool involved.")];
    const result = await step.run(
      { schedule: [schedule()[0]], files, hubCourse: "course-1" },
      testHelpers(),
      () => {}
    );
    expect(generateInstructorNotesAction).not.toHaveBeenCalled();
    const report = result.outputs.report as string;
    expect(report).toContain("Week 1: skipped - no committed or mentioned tools found for this week's activities.");
  });

  it("passes this week's resolved tool list (never the course's raw committed set) into the generator", async () => {
    const files: GeneratedCourseFile[] = [objectivesFile(1, "Use Asana to plan this week's sprint.")];
    await step.run({ schedule: [schedule()[0]], files, hubCourse: "course-1" }, testHelpers(), () => {});
    const call = vi.mocked(generateInstructorNotesAction).mock.calls[0];
    expect(call[0]).toBe("Sprint Planning");
    expect(call[1]).toEqual(["Asana (free tier)"]);
  });

  it("produces a supplement file per week, sortOrder 6.5, filed under that week's own weekNumber, with both sections", async () => {
    const files: GeneratedCourseFile[] = [objectivesFile(1, "Use Asana to plan this week's sprint.")];
    const result = await step.run(
      { schedule: [schedule()[0]], files, hubCourse: "course-1" },
      testHelpers(),
      () => {}
    );
    const outFiles = result.outputs.files as GeneratedCourseFile[];
    const doc = outFiles.find((f) => f.name.includes("Instructor Notes"));
    expect(doc).toBeDefined();
    expect(doc!.role).toBe("supplement");
    expect(doc!.weekNumber).toBe(1);
    expect(doc!.sortOrder).toBe(6.5);
    expect(doc!.pageText).toContain("Free Software Alternatives");
    expect(doc!.pageText).toContain("Common Debugging Problems and Solutions");
  });

  it("does not post to the LMS when postToLms is off (default), and says so", async () => {
    const files: GeneratedCourseFile[] = [objectivesFile(1, "Use Asana to plan this week's sprint.")];
    const result = await step.run(
      { schedule: [schedule()[0]], files, hubCourse: "course-1" },
      testHelpers(),
      () => {}
    );
    expect(createPageAction).not.toHaveBeenCalled();
    const report = result.outputs.report as string;
    expect(report).toContain("posting is turned off");
  });

  it("ALWAYS creates the LMS page unpublished, regardless of postToLms - visibility is never a toggle here", async () => {
    const modules = [{ week: 1, id: 555, name: "Module 01" }];
    const files: GeneratedCourseFile[] = [objectivesFile(1, "Use Asana to plan this week's sprint.")];
    const result = await step.run(
      { schedule: [schedule()[0]], files, hubCourse: "course-1", modules, postToLms: "1" },
      testHelpers(),
      () => {}
    );

    expect(createPageAction).toHaveBeenCalledTimes(1);
    const [, fields] = vi.mocked(createPageAction).mock.calls[0];
    expect(fields.published).toBe(false);
    expect(createModuleItemAction).toHaveBeenCalledWith(
      "https://canvas.example.edu/courses/123",
      555,
      { type: "Page", pageUrl: "week-1-instructor-notes" },
      undefined
    );
    const report = result.outputs.report as string;
    expect(report).toContain("unpublished page created");
  });

  it("notes the page was not placed in a module when no module matches that week", async () => {
    const files: GeneratedCourseFile[] = [objectivesFile(1, "Use Asana to plan this week's sprint.")];
    const result = await step.run(
      { schedule: [schedule()[0]], files, hubCourse: "course-1", modules: [], postToLms: "1" },
      testHelpers(),
      () => {}
    );
    expect(createModuleItemAction).not.toHaveBeenCalled();
    const report = result.outputs.report as string;
    expect(report).toContain("not placed in a module");
  });

  it("reports 'not posted' when postToLms is on but the tile has no LMS course", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [courseWithTools(["Asana (free tier)"])].map((c) => ({ ...c, canvasUrl: "" })),
    });
    const files: GeneratedCourseFile[] = [objectivesFile(1, "Use Asana to plan this week's sprint.")];
    const result = await step.run(
      { schedule: [schedule()[0]], files, hubCourse: "course-1", postToLms: "1" },
      testHelpers(),
      () => {}
    );
    expect(createPageAction).not.toHaveBeenCalled();
    const report = result.outputs.report as string;
    expect(report).toContain("no LMS course on the tile");
  });

  it("never throws when the LMS post itself fails - it is noted, not fatal", async () => {
    vi.mocked(createPageAction).mockResolvedValue({ error: "Canvas is down" });
    const files: GeneratedCourseFile[] = [objectivesFile(1, "Use Asana to plan this week's sprint.")];
    const result = await step.run(
      { schedule: [schedule()[0]], files, hubCourse: "course-1", postToLms: "1" },
      testHelpers(),
      () => {}
    );
    expect(result.outputs.count).toBe(1);
    const report = result.outputs.report as string;
    expect(report).toContain("LMS error - Canvas is down");
  });

  it("continues to the next week when one week's generation fails", async () => {
    vi.mocked(generateInstructorNotesAction)
      .mockResolvedValueOnce({ error: "model unavailable" })
      .mockResolvedValueOnce({
        alternatives: [{ tool: "Asana (free tier)", freeAlternative: "Trello (free plan)", why: "..." }],
        debugging: [{ tool: "Asana (free tier)", problems: [{ issue: "x", solution: "y" }] }],
      });
    const files: GeneratedCourseFile[] = [
      objectivesFile(1, "Use Asana to plan this week's sprint."),
      objectivesFile(2, "Use Asana to run this week's retro."),
    ];
    const result = await step.run({ schedule: schedule(), files, hubCourse: "course-1" }, testHelpers(), () => {});
    expect(result.outputs.count).toBe(1);
    const report = result.outputs.report as string;
    expect(report).toContain("Week 1: error");
  });

  describe("non-transient quota refusal (mirrors generate-weekly-announcements' U7-AC1)", () => {
    it("stops after the first non-transient quota refusal instead of attempting every remaining week", async () => {
      vi.mocked(generateInstructorNotesAction)
        .mockResolvedValueOnce({
          alternatives: [{ tool: "Asana (free tier)", freeAlternative: "Trello (free plan)", why: "..." }],
          debugging: [{ tool: "Asana (free tier)", problems: [{ issue: "x", solution: "y" }] }],
        })
        .mockResolvedValueOnce({ error: SPEND_CAP_429 });

      const fullSchedule: ScheduleWeekPlan[] = Array.from({ length: 5 }, (_, i) => ({
        week: i + 1,
        topic: `Topic ${i + 1}`,
        summary: "",
        assignmentTitle: null,
        assignmentSlug: null,
        testName: null,
      }));
      const files: GeneratedCourseFile[] = fullSchedule.map((w) =>
        objectivesFile(w.week, "Use Asana this week too.")
      );

      const result = await step.run({ schedule: fullSchedule, files, hubCourse: "course-1" }, testHelpers(), () => {});

      expect(generateInstructorNotesAction).toHaveBeenCalledTimes(2);
      expect(result.outputs.count).toBe(1);
      const report = result.outputs.report as string;
      expect(report).toContain("Stopped after week 2 - the LLM quota was exhausted; 3 week(s) not attempted.");
    });

    it("sets the partial-failure signal when the quota is exhausted mid-run", async () => {
      vi.mocked(generateInstructorNotesAction)
        .mockResolvedValueOnce({
          alternatives: [{ tool: "Asana (free tier)", freeAlternative: "Trello (free plan)", why: "..." }],
          debugging: [{ tool: "Asana (free tier)", problems: [{ issue: "x", solution: "y" }] }],
        })
        .mockResolvedValueOnce({ error: SPEND_CAP_429 });

      const files: GeneratedCourseFile[] = [
        objectivesFile(1, "Use Asana to plan this week's sprint."),
        objectivesFile(2, "Use Asana to run this week's retro."),
      ];
      const result = await step.run({ schedule: schedule(), files, hubCourse: "course-1" }, testHelpers(), () => {});

      const detail = result.outputs[PARTIAL_FAILURE_OUTPUT_KEY];
      expect(typeof detail).toBe("string");
      expect(detail as string).toContain("quota was exhausted after week 2");
    });

    it("does not set the partial-failure signal when every week succeeds", async () => {
      const files: GeneratedCourseFile[] = [
        objectivesFile(1, "Use Asana to plan this week's sprint."),
        objectivesFile(2, "Use Asana to run this week's retro."),
      ];
      const result = await step.run({ schedule: schedule(), files, hubCourse: "course-1" }, testHelpers(), () => {});
      expect(result.outputs[PARTIAL_FAILURE_OUTPUT_KEY]).toBeUndefined();
    });
  });
});
