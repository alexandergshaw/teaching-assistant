// generate-weekly-current-events: exercises the step's own honesty
// requirement directly - a week's current-events report is only ever built
// when this week's own real generated materials (objectives/slides/
// instructions/opener) are present in the accumulated "files" chain, never
// invented generically for a week the module selector left ungenerated this
// run. Mirrors the shape of steps.weekly-significance.test.ts / steps.
// course-build-qa.test.ts.

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ScheduleWeekPlan } from "@/app/actions";
import type { StepRunHelpers } from "@/lib/workflows/registry-helpers";
import type { GeneratedCourseFile } from "@/lib/workflows/types";
import { emptyCourseProject } from "@/lib/course-project";
import type { Course } from "@/lib/supabase/courses";

vi.mock("@/app/actions", () => ({
  listCourseHubAction: vi.fn(),
  researchCurrentEventsAction: vi.fn(),
  createPageAction: vi.fn(),
  createModuleItemAction: vi.fn(),
}));

import {
  listCourseHubAction,
  researchCurrentEventsAction,
  createPageAction,
  createModuleItemAction,
} from "@/app/actions";
import { courseBuildCurrentEventsSteps } from "./steps.course-build-current-events";
import { PARTIAL_FAILURE_OUTPUT_KEY } from "@/lib/workflows/run-logging";

const step = courseBuildCurrentEventsSteps.find((s) => s.type === "generate-weekly-current-events")!;

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

/** Real generated materials for `week` - the exact shape gatherWeekMaterials
 * (steps.weekly-announcements.ts) scans for. */
function materialsFile(week: number): GeneratedCourseFile {
  return {
    name: `Week ${week} Objectives.docx`,
    blob: new Blob(["x"]),
    mimeType: "application/octet-stream",
    weekNumber: week,
    sortOrder: 0.5,
    role: "objectives",
    pageText: "Objectives text.",
  };
}

function schedule(): ScheduleWeekPlan[] {
  return [
    { week: 1, topic: "Project Risk Management", summary: "", assignmentTitle: null, assignmentSlug: null, testName: null },
    { week: 2, topic: "Earned Value", summary: "", assignmentTitle: null, assignmentSlug: null, testName: null },
  ];
}

describe("generate-weekly-current-events step", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [baseCourse()] });
    vi.mocked(researchCurrentEventsAction).mockResolvedValue({
      report: "CURRENT EVENTS REPORT\n...",
      reportMarkdown: "# Current Events Report\n\n...",
      sourceCount: 3,
      topicsCovered: 2,
    });
    vi.mocked(createPageAction).mockResolvedValue({
      page: { pageId: 1, url: "week-1-current-events", title: "t", body: "b", published: true, updatedAt: null },
    });
    vi.mocked(createModuleItemAction).mockResolvedValue({ ok: true });
  });

  it("returns the incoming files unchanged when the schedule is empty", async () => {
    const incoming: GeneratedCourseFile[] = [materialsFile(1)];
    const result = await step.run({ schedule: [], files: incoming }, testHelpers(), () => {});
    expect(result.outputs.files).toBe(incoming);
    expect(result.outputs.count).toBe(0);
  });

  // AC1/AC2 (COURSE_BUILD's output selector): deselected means "do no work,
  // pass files through unchanged" - it never even calls researchCurrentEventsAction.
  it("selected explicitly off: does no work and passes incoming files through unchanged", async () => {
    const files: GeneratedCourseFile[] = [materialsFile(1)];
    const result = await step.run({ schedule: schedule(), files, selected: "" }, testHelpers(), () => {});
    expect(researchCurrentEventsAction).not.toHaveBeenCalled();
    expect(result.outputs.files).toBe(files);
    expect(result.outputs.count).toBe(0);
  });

  it("selected left unbound (undefined): generates normally, matching every preset that does not wire the output selector", async () => {
    const files: GeneratedCourseFile[] = [materialsFile(1)];
    const result = await step.run({ schedule: [schedule()[0]], files }, testHelpers(), () => {});
    expect(researchCurrentEventsAction).toHaveBeenCalledTimes(1);
    expect(result.outputs.count).toBe(1);
  });

  // The central honesty requirement: a week with no generated materials at
  // all this run is skipped, never given a generically-researched report.
  it("skips a week with no generated materials this run, rather than researching generically", async () => {
    const files: GeneratedCourseFile[] = [materialsFile(2)];
    const result = await step.run({ schedule: schedule(), files }, testHelpers(), () => {});

    expect(researchCurrentEventsAction).toHaveBeenCalledTimes(1); // only week 2 has materials
    expect(result.outputs.count).toBe(1);
    const report = result.outputs.report as string;
    expect(report).toContain("Week 1: skipped - no generated module materials found for this week");
  });

  it("passes this week's real materials text as the research grounding, and defaults the recency window to the past 30 days", async () => {
    const files: GeneratedCourseFile[] = [materialsFile(1)];
    await step.run({ schedule: [schedule()[0]], files }, testHelpers(), () => {});
    const call = vi.mocked(researchCurrentEventsAction).mock.calls[0];
    expect(call[0]).toContain("Objectives text.");
    expect(call[1]).toBe("the past 30 days");
  });

  it("passes a non-blank recentWindow through unchanged", async () => {
    const files: GeneratedCourseFile[] = [materialsFile(1)];
    await step.run({ schedule: [schedule()[0]], files, recentWindow: "the past 2 weeks" }, testHelpers(), () => {});
    const call = vi.mocked(researchCurrentEventsAction).mock.calls[0];
    expect(call[1]).toBe("the past 2 weeks");
  });

  it("produces a supplement file per week, sortOrder 6.7, filed under that week's own weekNumber", async () => {
    const files: GeneratedCourseFile[] = [materialsFile(1)];
    const result = await step.run({ schedule: [schedule()[0]], files }, testHelpers(), () => {});
    const outFiles = result.outputs.files as GeneratedCourseFile[];
    const doc = outFiles.find((f) => f.name.includes("Current Events"));
    expect(doc).toBeDefined();
    expect(doc!.role).toBe("supplement");
    expect(doc!.weekNumber).toBe(1);
    expect(doc!.sortOrder).toBe(6.7);
    // pageText is now a markdown-lite-compatible rendering built from
    // generated.reportMarkdown (buildCurrentEventsPageText,
    // current-events-report.ts) - NOT the flat ALL-CAPS generated.report
    // this used to check for. The docx itself is still built from
    // generated.reportMarkdown directly and is untouched by this change.
    expect(doc!.pageText).toContain("# Current Events Report");
  });

  it("reports the source and topic counts the action returned", async () => {
    const files: GeneratedCourseFile[] = [materialsFile(1)];
    const result = await step.run({ schedule: [schedule()[0]], files }, testHelpers(), () => {});
    const report = result.outputs.report as string;
    expect(report).toContain("3 source(s) across 2 topic(s)");
  });

  it("continues to the next week when one week's research fails", async () => {
    vi.mocked(researchCurrentEventsAction)
      .mockResolvedValueOnce({ error: "search unavailable" })
      .mockResolvedValueOnce({
        report: "CURRENT EVENTS REPORT\n...",
        reportMarkdown: "# Current Events Report\n\n...",
        sourceCount: 1,
        topicsCovered: 1,
      });
    const files: GeneratedCourseFile[] = [materialsFile(1), materialsFile(2)];
    const result = await step.run({ schedule: schedule(), files }, testHelpers(), () => {});
    expect(result.outputs.count).toBe(1);
    const report = result.outputs.report as string;
    expect(report).toContain("Week 1: error");
  });

  it("sets the partial-failure signal when at least one week fails", async () => {
    vi.mocked(researchCurrentEventsAction).mockResolvedValueOnce({ error: "search unavailable" });
    const files: GeneratedCourseFile[] = [materialsFile(1)];
    const result = await step.run({ schedule: [schedule()[0]], files }, testHelpers(), () => {});
    const detail = result.outputs[PARTIAL_FAILURE_OUTPUT_KEY];
    expect(typeof detail).toBe("string");
    expect(detail as string).toContain("1 of 1 week(s) failed");
  });

  it("does not set the partial-failure signal when every week succeeds", async () => {
    const files: GeneratedCourseFile[] = [materialsFile(1), materialsFile(2)];
    const result = await step.run({ schedule: schedule(), files }, testHelpers(), () => {});
    expect(result.outputs[PARTIAL_FAILURE_OUTPUT_KEY]).toBeUndefined();
  });

  describe("postToLms", () => {
    // AC1: unbound/absent must be byte-identical to today's behaviour - no
    // LMS call at all, and the report line unchanged from the pre-existing
    // "generated - N source(s) across M topic(s)." format (no appended post
    // note of any kind, unlike generate-weekly-significance's own default-on
    // "posting is turned off" note - this step's AC1 explicitly requires the
    // unbound case to stay byte-for-byte identical to before this feature
    // existed).
    it("AC1: unbound never calls the LMS and leaves the report line byte-identical to today", async () => {
      const files: GeneratedCourseFile[] = [materialsFile(1)];
      const result = await step.run({ schedule: [schedule()[0]], files, hubCourse: "course-1" }, testHelpers(), () => {});
      expect(createPageAction).not.toHaveBeenCalled();
      const report = result.outputs.report as string;
      expect(report).toBe("Week 1 (Project Risk Management): generated - 3 source(s) across 2 topic(s).");
    });

    it("explicitly off ('') behaves the same as unbound - no LMS call, unchanged report line", async () => {
      const files: GeneratedCourseFile[] = [materialsFile(1)];
      const result = await step.run(
        { schedule: [schedule()[0]], files, hubCourse: "course-1", postToLms: "" },
        testHelpers(),
        () => {}
      );
      expect(createPageAction).not.toHaveBeenCalled();
      const report = result.outputs.report as string;
      expect(report).toBe("Week 1 (Project Risk Management): generated - 3 source(s) across 2 topic(s).");
    });

    // AC2: a real Page gets created per week, with real heading structure and
    // readable bullets - asserted by parsing the produced HTML string
    // (never a live Canvas call). The bare source URL and the Sources
    // section's markdown link both become real <a href> (AC6), and the
    // indented "Why it matters"/"Source" sub-bullets survive as part of the
    // SAME bullet as their headline (buildCurrentEventsPageText) instead of
    // becoming confusing sibling bullets.
    it("AC2/AC6: creates a published LMS page per week with real heading structure, bullets, and links", async () => {
      vi.mocked(researchCurrentEventsAction).mockResolvedValue({
        report: "CURRENT EVENTS REPORT\n...",
        reportMarkdown:
          "# Current Events Report\n\n## Supply chain risk\n\n- Item headline - 2026-05-02 (operations)\n  - Why it matters: It matters a lot.\n  - Source: https://example.test/story\n\n## Sources\n\n- [Example](https://example.test/story)",
        sourceCount: 3,
        topicsCovered: 2,
      });
      const modules = [{ week: 1, id: 555, name: "Module 01" }];
      const files: GeneratedCourseFile[] = [materialsFile(1)];
      const result = await step.run(
        { schedule: [schedule()[0]], files, hubCourse: "course-1", modules, postToLms: "1" },
        testHelpers(),
        () => {}
      );

      expect(createPageAction).toHaveBeenCalledTimes(1);
      const [, fields] = vi.mocked(createPageAction).mock.calls[0];
      expect(fields.published).toBe(true);
      expect(fields.body).toContain("<h2>Current Events Report</h2>");
      expect(fields.body).toContain("<h3>Supply chain risk</h3>");
      expect(fields.body).toContain("<h3>Sources</h3>");
      // The bare URL folded out of the indented "Source:" sub-bullet became
      // a real link.
      expect(fields.body).toContain('<a href="https://example.test/story">https://example.test/story</a>');
      // The Sources section's own markdown link became a real link, with the
      // title as the visible text.
      expect(fields.body).toContain('<a href="https://example.test/story">Example</a>');
      expect(createModuleItemAction).toHaveBeenCalledWith(
        "https://canvas.example.edu/courses/123",
        555,
        { type: "Page", pageUrl: "week-1-current-events" },
        undefined
      );
      const report = result.outputs.report as string;
      expect(report).toContain("page created");
    });

    it("notes the page was not placed in a module when no module matches that week", async () => {
      const files: GeneratedCourseFile[] = [materialsFile(1)];
      const result = await step.run(
        { schedule: [schedule()[0]], files, hubCourse: "course-1", modules: [], postToLms: "1" },
        testHelpers(),
        () => {}
      );
      expect(createModuleItemAction).not.toHaveBeenCalled();
      const report = result.outputs.report as string;
      expect(report).toContain("not placed in a module");
    });

    // AC3: reports "not posted - no LMS course on the tile" (significance's
    // own wording, verbatim) and still ships the docx.
    it("AC3: reports 'not posted - no LMS course on the tile' and still ships the docx when the tile has no LMS course", async () => {
      vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [baseCourse({ canvasUrl: "" })] });
      const files: GeneratedCourseFile[] = [materialsFile(1)];
      const result = await step.run(
        { schedule: [schedule()[0]], files, hubCourse: "course-1", postToLms: "1" },
        testHelpers(),
        () => {}
      );
      expect(createPageAction).not.toHaveBeenCalled();
      expect(result.outputs.count).toBe(1);
      const outFiles = result.outputs.files as GeneratedCourseFile[];
      expect(outFiles.some((f) => f.name.includes("Current Events"))).toBe(true);
      const report = result.outputs.report as string;
      expect(report).toContain("not posted - no LMS course on the tile.");
    });

    // AC5: a per-week post failure is caught and noted, never thrown - this
    // step already declares passThroughOnFailure, but an LMS hiccup here
    // must not cost the rest of this week's own deliverables either.
    it("AC5: never throws when the LMS post itself fails - it is noted, not fatal", async () => {
      vi.mocked(createPageAction).mockResolvedValue({ error: "Canvas is down" });
      const files: GeneratedCourseFile[] = [materialsFile(1)];
      const result = await step.run(
        { schedule: [schedule()[0]], files, hubCourse: "course-1", postToLms: "1" },
        testHelpers(),
        () => {}
      );
      expect(result.outputs.count).toBe(1);
      const report = result.outputs.report as string;
      expect(report).toContain("LMS error - Canvas is down");
    });
  });
});
