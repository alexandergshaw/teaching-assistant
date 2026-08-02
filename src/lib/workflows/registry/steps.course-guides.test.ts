// Group Q1: the course guide documents (Resources and Tutorials, Course
// Schedule, FAQ). The Course Schedule doc has the strictest, most explicit
// constraint in the whole feature - NO dates or deadlines of any kind - so
// its builder is unzipped and inspected as raw XML (mirroring docx.test.ts's
// own approach) rather than trusted from a mock.

import { describe, it, expect, vi, beforeEach } from "vitest";
import JSZip from "jszip";
import { emptyCourseProject, coerceCourseProject } from "@/lib/course-project";
import type { ScheduleWeekPlan } from "@/app/actions";
import type { Course } from "@/lib/supabase/courses";
import type { StepRunHelpers } from "@/lib/workflows/registry-helpers";
import type { GeneratedCourseFile } from "@/lib/workflows/types";

vi.mock("@/app/actions", () => ({
  listCourseHubAction: vi.fn(),
  listCourseContentAction: vi.fn(),
  createModuleAction: vi.fn(),
  createPageAction: vi.fn(),
  updatePageAction: vi.fn(),
  createModuleItemAction: vi.fn(),
  generateCourseFaqAction: vi.fn(),
}));

import {
  listCourseHubAction,
  listCourseContentAction,
  createModuleAction,
  createPageAction,
  updatePageAction,
  createModuleItemAction,
  generateCourseFaqAction,
} from "@/app/actions";
import {
  resolveContinuousWeeks,
  buildCourseScheduleDocx,
  renderScheduleMarkdown,
  courseGuideSteps,
} from "./steps.course-guides";

const step = courseGuideSteps.find((s) => s.type === "generate-course-guides")!;

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
    name: "CS 101",
    courseCode: "CS101",
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
    startDate: null,
    description: "An introductory course.",
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

async function unpackDocx(buffer: ArrayBuffer) {
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = await zip.file("word/document.xml")!.async("string");
  return { documentXml };
}

// The visible text only (every <w:t>...</w:t> run, joined) - excludes the
// docx library's own boilerplate XML (namespace URIs, schema revision dates
// like ".../2015/10/21/chartex", sizes, etc.), which is noise no reader ever
// sees and would otherwise produce false "date" matches unrelated to this
// document's actual content.
function visibleText(documentXml: string): string {
  return (documentXml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) ?? [])
    .map((m) => m.replace(/<w:t[^>]*>/, "").replace(/<\/w:t>/, ""))
    .join(" ");
}

describe("resolveContinuousWeeks", () => {
  it("fills a gap with 'To be announced' and keeps week numbering continuous", () => {
    const schedule: ScheduleWeekPlan[] = [
      { week: 1, topic: "Intro", summary: "Getting started", assignmentTitle: null, assignmentSlug: null, testName: null },
      { week: 3, topic: "Loops", summary: "Iteration", assignmentTitle: "Loops HW", assignmentSlug: null, testName: null },
    ];
    const rows = resolveContinuousWeeks(schedule, null);
    expect(rows.map((r) => r.week)).toEqual([1, 2, 3]);
    expect(rows[1].topic).toBe("To be announced");
    expect(rows[1].summary).toBe("");
    expect(rows[0].topic).toBe("Intro");
    expect(rows[2].assignment).toBe("Loops HW");
  });

  it("extends through the tile's declared week count even past the schedule's last entry", () => {
    const schedule: ScheduleWeekPlan[] = [
      { week: 1, topic: "Intro", summary: "", assignmentTitle: null, assignmentSlug: null, testName: null },
    ];
    const rows = resolveContinuousWeeks(schedule, 4);
    expect(rows.map((r) => r.week)).toEqual([1, 2, 3, 4]);
    expect(rows[3].topic).toBe("To be announced");
  });

  it("joins assignmentTitle and testName into one Assignment cell", () => {
    const schedule: ScheduleWeekPlan[] = [
      { week: 1, topic: "Review", summary: "", assignmentTitle: "Essay", assignmentSlug: null, testName: "Midterm" },
    ];
    const rows = resolveContinuousWeeks(schedule, null);
    expect(rows[0].assignment).toBe("Essay; Midterm");
  });
});

describe("buildCourseScheduleDocx (Q1-AC3: real table, NO dates)", () => {
  it("renders a real docx table (<w:tbl>), not a bulleted list", async () => {
    const rows = resolveContinuousWeeks(
      [{ week: 1, topic: "Intro", summary: "Overview", assignmentTitle: null, assignmentSlug: null, testName: null }],
      null
    );
    const buffer = await buildCourseScheduleDocx("CS 101", rows, "Test Author");
    const { documentXml } = await unpackDocx(buffer);
    expect(documentXml).toContain("<w:tbl>");
    expect(documentXml).not.toMatch(/<w:numPr>/); // no bullet numbering
  });

  it("never renders a date, day name, or 'Due'/'Deadline' anywhere in the document", async () => {
    const rows = resolveContinuousWeeks(
      [
        { week: 1, topic: "Intro to Project Management", summary: "Kickoff and scope", assignmentTitle: "Charter", assignmentSlug: null, testName: null },
        { week: 2, topic: "Risk", summary: "Identify and rate risks", assignmentTitle: null, assignmentSlug: null, testName: "Quiz 1" },
      ],
      3
    );
    const buffer = await buildCourseScheduleDocx("PM 200", rows, "Test Author");
    const { documentXml } = await unpackDocx(buffer);

    // The TABLE itself (the actual schedule content) must carry zero dates
    // or deadlines - the surrounding disclaimer paragraph is allowed to say
    // "no dates... see the LMS for due dates" in passing (that sentence is
    // explaining the absence, not itself a date), so it is excluded here.
    const tableXml = documentXml.match(/<w:tbl>[\s\S]*<\/w:tbl>/)?.[0] ?? "";
    expect(tableXml).not.toBe("");
    expect(tableXml).not.toMatch(/\bDue\b/i);
    expect(tableXml).not.toMatch(/\bDeadline\b/i);

    // No month names, no YYYY-MM-DD, no slash dates - checked against the
    // VISIBLE text only (docx's own boilerplate XML carries schema-revision
    // "dates" like ".../2015/10/21/chartex" that are not content).
    const text = visibleText(documentXml);
    expect(text).not.toMatch(/January|February|March|April|May|June|July|August|September|October|November|December/i);
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(text).not.toMatch(/\d{1,2}\/\d{1,2}\/\d{2,4}/);
    // Week 3 (no schedule entry) still appears, continuous, as "To be announced".
    expect(text).toContain("To be announced");
  });

  it("omits the Assignment column entirely when no week has an assignment or test", async () => {
    const rows = resolveContinuousWeeks(
      [{ week: 1, topic: "Intro", summary: "", assignmentTitle: null, assignmentSlug: null, testName: null }],
      null
    );
    const buffer = await buildCourseScheduleDocx("CS 101", rows, "Test Author");
    const { documentXml } = await unpackDocx(buffer);
    expect(documentXml).not.toContain(">Assignment<");
  });
});

describe("renderScheduleMarkdown", () => {
  it("renders one bullet per week and states there are no dates", () => {
    const rows = resolveContinuousWeeks(
      [{ week: 1, topic: "Intro", summary: "Overview", assignmentTitle: null, assignmentSlug: null, testName: null }],
      null
    );
    const md = renderScheduleMarkdown("CS 101", rows);
    expect(md).toContain("Week 1: Intro - Overview");
    expect(md).toContain("no dates or deadlines");
  });
});

describe("generate-course-guides step", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [baseCourse()] });
    vi.mocked(generateCourseFaqAction).mockResolvedValue({
      pairs: [{ question: "What tools do I need?", answer: "None required." }],
    });
  });

  function schedule(): ScheduleWeekPlan[] {
    return [
      { week: 1, topic: "Intro", summary: "Overview", assignmentTitle: null, assignmentSlug: null, testName: null },
      { week: 2, topic: "Loops", summary: "Iteration", assignmentTitle: "Loops HW", assignmentSlug: null, testName: null },
    ];
  }

  // RCA19 (RCA round 4): this step used to throw for "no course tile
  // chosen", "listCourseHubAction errored", and "tile not found" - and
  // server-runner.ts cascades ANY thrown step failure to every dependent
  // bound to its `files` output (save-zip-to-course, blackboard-export), so
  // a missing tile cost the instructor the ENTIRE terminal zip, not just
  // these four guide documents. All three now degrade: no throw, the
  // incoming `files` pass through UNCHANGED, and the summary says why.
  it("RCA19: degrades (does not throw) when no course tile is chosen, passing incoming files through unchanged", async () => {
    const incoming: GeneratedCourseFile[] = [
      { name: "existing.docx", blob: new Blob(["x"]), mimeType: "application/octet-stream", weekNumber: 1, sortOrder: 1, role: "instructions" },
    ];
    const result = await step.run({ files: incoming }, testHelpers(), () => {});
    expect(result.outputs.files).toBe(incoming);
    expect(result.outputs.guideFiles).toEqual([]);
    expect(result.summary.kind).toBe("list");
    if (result.summary.kind === "list") {
      expect(result.summary.items.some((i) => i.toLowerCase().includes("course tile"))).toBe(true);
    }
  });

  it("RCA19: degrades (does not throw) when listCourseHubAction errors, passing incoming files through unchanged", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({ error: "hub unavailable" });
    const incoming: GeneratedCourseFile[] = [
      { name: "existing.docx", blob: new Blob(["x"]), mimeType: "application/octet-stream", weekNumber: 1, sortOrder: 1, role: "instructions" },
    ];
    const result = await step.run({ hubCourse: "course-1", files: incoming }, testHelpers(), () => {});
    expect(result.outputs.files).toBe(incoming);
    expect(result.outputs.guideFiles).toEqual([]);
    expect(result.summary.kind).toBe("list");
    if (result.summary.kind === "list") {
      expect(result.summary.items.some((i) => i.includes("hub unavailable"))).toBe(true);
    }
  });

  it("RCA19: degrades (does not throw) when the course tile is not found, passing incoming files through unchanged", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [] });
    const incoming: GeneratedCourseFile[] = [
      { name: "existing.docx", blob: new Blob(["x"]), mimeType: "application/octet-stream", weekNumber: 1, sortOrder: 1, role: "instructions" },
    ];
    const result = await step.run({ hubCourse: "missing-course-id", files: incoming }, testHelpers(), () => {});
    expect(result.outputs.files).toBe(incoming);
    expect(result.outputs.guideFiles).toEqual([]);
    expect(result.summary.kind).toBe("list");
    if (result.summary.kind === "list") {
      expect(result.summary.items.some((i) => i.toLowerCase().includes("tile not found"))).toBe(true);
    }
  });

  // AC1 (COURSE_BUILD's output selector, steps.course-build-scope.ts):
  // "selected" is the boolean input that selector's "select-course-outputs"
  // step feeds into. Deselected means "do no work, pass files through
  // unchanged" - never a thrown error, never an empty `files` output - so
  // blackboard-export/save-zip-to-course downstream still see everything
  // ELSE the run generated.
  it("selected explicitly off: does no work and passes incoming files through unchanged, without even loading the course tile", async () => {
    const incoming: GeneratedCourseFile[] = [
      { name: "existing.docx", blob: new Blob(["x"]), mimeType: "application/octet-stream", weekNumber: 1, sortOrder: 1, role: "instructions" },
    ];
    const result = await step.run(
      { hubCourse: "course-1", schedule: schedule(), files: incoming, selected: "" },
      testHelpers(),
      () => {}
    );
    expect(result.outputs.files).toBe(incoming);
    expect(result.outputs.guideFiles).toEqual([]);
    expect(listCourseHubAction).not.toHaveBeenCalled();
    expect(result.summary.kind).toBe("list");
    if (result.summary.kind === "list") {
      expect(result.summary.items.some((i) => i.toLowerCase().includes("not selected"))).toBe(true);
    }
  });

  it("selected left unbound (undefined): generates normally, matching every preset that does not wire the output selector", async () => {
    vi.mocked(listCourseContentAction).mockResolvedValue({ courseName: "CS 101", modules: [], pages: [] });
    vi.mocked(createModuleAction).mockResolvedValue({ module: { id: 5, name: "Course Information", position: 1, published: true, itemsCount: 0, items: [] } });
    vi.mocked(createPageAction).mockResolvedValue({
      page: { pageId: 1, url: "resources-and-tutorials", title: "Resources and Tutorials", body: "", published: true, updatedAt: null },
    });
    vi.mocked(createModuleItemAction).mockResolvedValue({ ok: true });

    const result = await step.run({ hubCourse: "course-1", schedule: schedule() }, testHelpers(), () => {});
    expect((result.outputs.guideFiles as GeneratedCourseFile[]).length).toBeGreaterThan(0);
  });

  it("generates all three documents and appends them to the incoming files chain, defaulting postToLms ON", async () => {
    vi.mocked(listCourseContentAction).mockResolvedValue({ courseName: "CS 101", modules: [], pages: [] });
    vi.mocked(createModuleAction).mockResolvedValue({ module: { id: 5, name: "Course Information", position: 1, published: true, itemsCount: 0, items: [] } });
    vi.mocked(createPageAction).mockResolvedValue({
      page: { pageId: 1, url: "resources-and-tutorials", title: "Resources and Tutorials", body: "", published: true, updatedAt: null },
    });
    vi.mocked(createModuleItemAction).mockResolvedValue({ ok: true });

    const incoming: GeneratedCourseFile[] = [
      { name: "existing.docx", blob: new Blob(["x"]), mimeType: "application/octet-stream", weekNumber: 1, sortOrder: 1, role: "instructions" },
    ];

    const result = await step.run(
      { hubCourse: "course-1", schedule: schedule(), files: incoming },
      testHelpers(),
      () => {}
    );

    const guideFiles = result.outputs.guideFiles as GeneratedCourseFile[];
    expect(guideFiles).toHaveLength(3);
    expect(guideFiles.map((f) => f.role)).toEqual(["supplement", "supplement", "supplement"]);
    expect(guideFiles.every((f) => f.weekNumber === 0)).toBe(true);
    expect(new Set(guideFiles.map((f) => f.sortOrder)).size).toBe(3);

    const files = result.outputs.files as GeneratedCourseFile[];
    expect(files).toHaveLength(4); // 1 incoming + 3 guides
    expect(files[0]).toBe(incoming[0]);

    // Posting defaulted ON (postToLms left unbound): a module was ensured
    // and pages were created.
    expect(createModuleAction).toHaveBeenCalledWith(
      "https://canvas.example.edu/courses/123",
      "Course Information",
      1,
      undefined
    );
    expect(createPageAction).toHaveBeenCalledTimes(3);
  });

  it("reuses an existing Course Information module and updates an existing page instead of duplicating (re-run safety)", async () => {
    vi.mocked(listCourseContentAction).mockResolvedValue({
      courseName: "CS 101",
      modules: [
        {
          id: 42,
          name: "course information",
          position: 1,
          published: true,
          itemsCount: 1,
          items: [
            {
              id: 1,
              moduleId: 42,
              title: "Resources and Tutorials",
              type: "Page",
              position: 1,
              indent: 0,
              published: true,
              pageUrl: "resources-and-tutorials",
              contentId: null,
              dueAt: null,
              pointsPossible: null,
              htmlUrl: null,
              externalUrl: null,
            },
          ],
        },
      ],
      pages: [
        { pageId: 1, url: "resources-and-tutorials", title: "CS101 - Resources and Tutorials", published: true, frontPage: false, updatedAt: null },
      ],
    });
    vi.mocked(updatePageAction).mockResolvedValue({
      page: { pageId: 1, url: "resources-and-tutorials", title: "CS101 - Resources and Tutorials", body: "", published: true, updatedAt: null },
    });
    vi.mocked(createPageAction).mockResolvedValue({
      page: { pageId: 2, url: "course-schedule", title: "CS101 - Course Schedule", body: "", published: true, updatedAt: null },
    });
    vi.mocked(createModuleItemAction).mockResolvedValue({ ok: true });

    await step.run({ hubCourse: "course-1", schedule: schedule() }, testHelpers(), () => {});

    // No second module created - the existing one (matched case-insensitively) is reused.
    expect(createModuleAction).not.toHaveBeenCalled();
    // The Resources doc's page already exists (by title) -> updated, not duplicated.
    expect(updatePageAction).toHaveBeenCalledTimes(1);
    // Already linked into the module -> no duplicate module item for it.
    const linkedPageUrls = vi.mocked(createModuleItemAction).mock.calls.map((c) => (c[2] as { pageUrl: string }).pageUrl);
    expect(linkedPageUrls).not.toContain("resources-and-tutorials");
    // The Schedule/FAQ pages are new -> created and linked.
    expect(vi.mocked(createPageAction)).toHaveBeenCalled();
  });

  it("does not post to the LMS when postToLms is off, and says so in the summary", async () => {
    const result = await step.run(
      { hubCourse: "course-1", schedule: schedule(), postToLms: "" },
      testHelpers(),
      () => {}
    );
    expect(listCourseContentAction).not.toHaveBeenCalled();
    expect(result.summary.kind).toBe("list");
    if (result.summary.kind === "list") {
      expect(result.summary.items.some((i) => i.includes("posting is turned off"))).toBe(true);
    }
  });

  it("degrades gracefully when FAQ generation fails: still ships the other two documents", async () => {
    vi.mocked(generateCourseFaqAction).mockResolvedValue({ error: "model unavailable" });
    const result = await step.run({ hubCourse: "course-1", schedule: schedule(), postToLms: "" }, testHelpers(), () => {});
    const guideFiles = result.outputs.guideFiles as GeneratedCourseFile[];
    expect(guideFiles).toHaveLength(2);
    expect(result.summary.kind).toBe("list");
    if (result.summary.kind === "list") {
      expect(result.summary.items.some((i) => i.includes("FAQ: skipped"))).toBe(true);
    }
  });

  it("notes an LMS error per document rather than throwing, and still returns the files", async () => {
    vi.mocked(listCourseContentAction).mockResolvedValue({ error: "Canvas is down" });
    const result = await step.run({ hubCourse: "course-1", schedule: schedule() }, testHelpers(), () => {});
    const guideFiles = result.outputs.guideFiles as GeneratedCourseFile[];
    expect(guideFiles).toHaveLength(3);
    expect(result.summary.kind).toBe("list");
    if (result.summary.kind === "list") {
      expect(result.summary.items.some((i) => i.includes("Canvas is down"))).toBe(true);
    }
  });

  // Y8-AC6: the Resources and Tutorials doc's tools section now states the
  // core/specialist PLAN, not just a restated (and previously always-empty -
  // bodyText was "" before this fix, so committed.filter(...mentioned) was
  // always []) committed toolset.
  describe("Resources and Tutorials tools section (Y8-AC6)", () => {
    function resourcesPageText(files: GeneratedCourseFile[]): string {
      const doc = files.find((f) => f.name.toLowerCase().includes("resources"));
      return doc?.pageText ?? "";
    }

    it("states the committed CORE toolset even when no week's text mentions it", async () => {
      vi.mocked(listCourseHubAction).mockResolvedValue({
        courses: [
          baseCourse({
            courseProject: coerceCourseProject({
              mode: "course-long",
              name: "P",
              definition: "P",
              tools: ["Trello (free plan)", "Excel (free trial)"],
            }),
          }),
        ],
      });

      const result = await step.run(
        { hubCourse: "course-1", schedule: schedule(), postToLms: "" },
        testHelpers(),
        () => {}
      );
      const text = resourcesPageText(result.outputs.guideFiles as GeneratedCourseFile[]);
      expect(text).toContain("## Tools You Will Use");
      expect(text).toContain("Core tools");
      expect(text).toContain("Trello (free plan)");
      expect(text).toContain("Excel (free trial)");
      expect(text).not.toContain("Specialist tools");
    });

    it("labels a genuinely used, non-core tool from an earlier week's file as a SPECIALIST", async () => {
      vi.mocked(listCourseHubAction).mockResolvedValue({
        courses: [
          baseCourse({
            courseProject: coerceCourseProject({
              mode: "course-long",
              name: "P",
              definition: "P",
              tools: ["Trello (free plan)"],
            }),
          }),
        ],
      });

      const incoming: GeneratedCourseFile[] = [
        {
          name: "week-05-instructions.docx",
          blob: new Blob(["x"]),
          mimeType: "application/octet-stream",
          weekNumber: 5,
          sortOrder: 2,
          role: "instructions",
          pageText: "Build your schedule in GanttProject, then export a PNG for submission.",
        },
      ];

      const result = await step.run(
        { hubCourse: "course-1", schedule: schedule(), files: incoming, postToLms: "" },
        testHelpers(),
        () => {}
      );
      const text = resourcesPageText(result.outputs.guideFiles as GeneratedCourseFile[]);
      expect(text).toContain("Core tools");
      expect(text).toContain("Trello (free plan)");
      expect(text).toContain("Specialist tools");
      expect(text.toLowerCase()).toContain("ganttproject");
    });

    it("omits the tools section entirely when the course has no committed toolset (coding course, or nothing committed yet)", async () => {
      // baseCourse()'s default courseProject is emptyCourseProject() (tools: []).
      const result = await step.run(
        { hubCourse: "course-1", schedule: schedule(), postToLms: "" },
        testHelpers(),
        () => {}
      );
      const text = resourcesPageText(result.outputs.guideFiles as GeneratedCourseFile[]);
      expect(text).not.toContain("## Tools You Will Use");
    });
  });

  // Q4: the Instructor Contact document.
  describe("Instructor Contact (Q4)", () => {
    it("skips the document entirely and reports it prominently when the tile has no email (Q4-AC3)", async () => {
      vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [baseCourse({ email: null })] });
      const result = await step.run({ hubCourse: "course-1", schedule: schedule(), postToLms: "" }, testHelpers(), () => {});

      const guideFiles = result.outputs.guideFiles as GeneratedCourseFile[];
      expect(guideFiles.some((f) => f.name.includes("Instructor Contact"))).toBe(false);
      expect(result.summary.kind).toBe("list");
      if (result.summary.kind === "list") {
        // Prominent: the very first item in the summary.
        expect(result.summary.items[0]).toBe("No instructor contact page - the course tile has no email set.");
      }
    });

    it("generates the document when the tile has an email, writing the address out in full and never inventing a policy (Q4-AC4/AC5)", async () => {
      vi.mocked(listCourseHubAction).mockResolvedValue({
        courses: [baseCourse({ email: "prof@school.edu" })],
      });
      const result = await step.run(
        { hubCourse: "course-1", schedule: schedule(), postToLms: "", instructor: "Dr. Rivera" },
        testHelpers(),
        () => {}
      );

      const guideFiles = result.outputs.guideFiles as GeneratedCourseFile[];
      const contact = guideFiles.find((f) => f.name.includes("Instructor Contact"));
      expect(contact).toBeDefined();
      expect(contact!.role).toBe("supplement");
      expect(contact!.weekNumber).toBe(0);
      expect(contact!.pageText).toContain("Dr. Rivera");
      expect(contact!.pageText).toContain("prof@school.edu");
      expect(contact!.pageText).toContain("Setting Up a Meeting");
      // Points to the syllabus instead of inventing a response-time or office-hours policy.
      expect(contact!.pageText!.toLowerCase()).toContain("syllabus");
      expect(contact!.pageText!.toLowerCase()).not.toMatch(/24 hours|respond within|office hours are/);
    });

    it("omits the instructor's name entirely when left blank, rather than a literal placeholder", async () => {
      vi.mocked(listCourseHubAction).mockResolvedValue({
        courses: [baseCourse({ email: "prof@school.edu" })],
      });
      const result = await step.run({ hubCourse: "course-1", schedule: schedule(), postToLms: "" }, testHelpers(), () => {});
      const guideFiles = result.outputs.guideFiles as GeneratedCourseFile[];
      const contact = guideFiles.find((f) => f.name.includes("Instructor Contact"));
      expect(contact!.pageText).toContain("Contact your instructor at prof@school.edu");
      expect(contact!.pageText).not.toContain("[name]");
      expect(contact!.pageText).not.toContain("Instructor:");
    });

    it("posts a real mailto: link on the LMS page (not escaped/plain text)", async () => {
      vi.mocked(listCourseHubAction).mockResolvedValue({
        courses: [baseCourse({ email: "prof@school.edu" })],
      });
      vi.mocked(listCourseContentAction).mockResolvedValue({ courseName: "CS 101", modules: [], pages: [] });
      vi.mocked(createModuleAction).mockResolvedValue({
        module: { id: 5, name: "Course Information", position: 1, published: true, itemsCount: 0, items: [] },
      });
      vi.mocked(createPageAction).mockResolvedValue({
        page: { pageId: 1, url: "x", title: "x", body: "", published: true, updatedAt: null },
      });
      vi.mocked(createModuleItemAction).mockResolvedValue({ ok: true });

      await step.run({ hubCourse: "course-1", schedule: schedule() }, testHelpers(), () => {});

      const contactPageCall = vi
        .mocked(createPageAction)
        .mock.calls.find((c) => (c[1] as { title: string }).title.includes("Instructor Contact"));
      expect(contactPageCall).toBeDefined();
      const body = (contactPageCall![1] as { body: string }).body;
      expect(body).toContain('<a href="mailto:prof@school.edu">');
    });
  });
});
