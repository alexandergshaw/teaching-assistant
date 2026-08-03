import { describe, it, expect, vi, beforeEach } from "vitest";

// steps.course-schedule-from-source.ts imports exactly these action names -
// mocking the module lets the step's run() execute for real without hitting
// an LLM, Canvas, or Supabase.
vi.mock("@/app/actions", () => ({
  generateSchedulePlanAction: vi.fn(),
  generateSchedulePlanFromRepoAction: vi.fn(),
  listCourseContentAction: vi.fn(),
  listCourseHubAction: vi.fn(),
  extractSyllabusTextAction: vi.fn(),
}));

vi.mock("@/lib/cartridge-import", () => ({
  parseCartridgeBlob: vi.fn(),
}));

import {
  generateSchedulePlanAction,
  generateSchedulePlanFromRepoAction,
  listCourseContentAction,
  listCourseHubAction,
  extractSyllabusTextAction,
} from "@/app/actions";
import { parseCartridgeBlob } from "@/lib/cartridge-import";
import { courseScheduleFromSourceSteps } from "./steps.course-schedule-from-source";
import type { StepRunHelpers, StepRunSummary } from "../registry-helpers";
// Real (unmocked) import: the tile-export tests below cross-check the
// step's own output against this SAME pure function, called directly with
// the identical {title,items} shape the step's branch narrows the parsed
// export down to - proof this source genuinely routes through the shared
// normalizer rather than a fourth parallel implementation that merely
// LOOKS the same.
import { courseStructureToSchedule } from "@/lib/course-structure-schedule";

const step = courseScheduleFromSourceSteps.find((s) => s.type === "course-schedule-from-source")!;

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

function scheduleSummary(result: { summary: StepRunSummary }) {
  if (result.summary.kind !== "schedule") {
    throw new Error(`Expected a schedule summary, got "${result.summary.kind}".`);
  }
  return result.summary;
}

describe("course-schedule-from-source step", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("is registered with a source select and every per-source input optional", () => {
    expect(step, "course-schedule-from-source is registered").toBeTruthy();
    const inputByKey = new Map(step.inputs.map((i) => [i.key, i]));

    expect(inputByKey.get("source")).toMatchObject({
      type: "text",
      required: true,
      options: [
        "codebase",
        "course-description",
        "course-cartridge",
        "syllabus-document",
        "existing-lms-course",
        "tile-export",
        "tile-repo",
      ],
    });
    // AC5: the seventh source (the tile's own linked repository) needs no
    // input of its own - it reuses the existing "hubCourse" input every
    // other source can already fall back to. Pinning the exact key set here
    // means an accidental new input (e.g. a stray "tileRepo" field) fails
    // this test immediately rather than silently growing the run form.
    expect(step.inputs.map((i) => i.key)).toEqual([
      "source",
      "repo",
      "description",
      "cartridge",
      "syllabus",
      "lmsCourse",
      "weeks",
      "tests",
      "context",
      "sourceMaterial",
      "hubCourse",
    ]);
    expect(inputByKey.get("repo")).toMatchObject({ type: "repo", required: false });
    expect(inputByKey.get("description")).toMatchObject({ type: "longtext", required: false });
    expect(inputByKey.get("cartridge")).toMatchObject({
      type: "uploads",
      required: false,
      accept: ".imscc",
    });
    expect(inputByKey.get("syllabus")).toMatchObject({ type: "uploads", required: false });
    expect(inputByKey.get("lmsCourse")).toMatchObject({ type: "lmsCourse", required: false });
    expect(inputByKey.get("weeks")).toMatchObject({ type: "number", required: false });
    expect(inputByKey.get("tests")).toMatchObject({ type: "number", required: false });
    expect(inputByKey.get("context")).toMatchObject({ type: "longtext", required: false });
    expect(inputByKey.get("sourceMaterial")).toMatchObject({ type: "longtext", required: false });
    expect(inputByKey.get("hubCourse")).toMatchObject({ type: "hubCourse", required: false });
  });

  it("declares the three schedule-from-repo outputs, plus resolvedSourceMaterial and courseKind", () => {
    expect(step.outputs.map((o) => [o.key, o.type])).toEqual([
      ["schedule", "schedule"],
      ["courseTitle", "text"],
      ["weeks", "number"],
      ["resolvedSourceMaterial", "longtext"],
      ["courseKind", "text"],
    ]);
  });

  describe("source: codebase", () => {
    it("delegates to generateSchedulePlanFromRepoAction and returns its schedule", async () => {
      vi.mocked(generateSchedulePlanFromRepoAction).mockResolvedValue({
        courseTitle: "CS 101",
        schedule: [
          { week: 1, topic: "Intro", summary: "s", assignmentTitle: "A1", assignmentSlug: "a1", testName: null },
          { week: 2, topic: "More", summary: "s2", assignmentTitle: "A2", assignmentSlug: "a2", testName: null },
        ],
      });

      const result = await step.run(
        { source: "codebase", repo: "org/repo", weeks: "2", tests: "0", context: "focus on basics" },
        testHelpers(),
        () => {}
      );

      expect(generateSchedulePlanFromRepoAction).toHaveBeenCalledWith(
        "org/repo",
        2,
        0,
        "gemini",
        "focus on basics"
      );
      expect(result.outputs.courseTitle).toBe("CS 101");
      expect(result.outputs.weeks).toBe(2);
      expect(scheduleSummary(result).schedule).toHaveLength(2);
    });

    it("fails with a message naming the missing field when repo is blank", async () => {
      await expect(
        step.run({ source: "codebase", repo: "" }, testHelpers(), () => {})
      ).rejects.toThrow(/Provide a repository/);
      expect(generateSchedulePlanFromRepoAction).not.toHaveBeenCalled();
    });

    it("propagates an error returned by generateSchedulePlanFromRepoAction", async () => {
      vi.mocked(generateSchedulePlanFromRepoAction).mockResolvedValue({ error: "no assignment folders" });
      await expect(
        step.run({ source: "codebase", repo: "org/repo" }, testHelpers(), () => {})
      ).rejects.toThrow("no assignment folders");
    });

    // Defect 2 (course-setup.ts's COURSE_BUILD): "codebase" (and, since AC4,
    // "tile-repo" - see that describe block below) implies a programming
    // course - this is the ONE place that mapping is allowed to live (see
    // this step's own header comment), so it must resolve here.
    it("resolves courseKind to 'coding'", async () => {
      vi.mocked(generateSchedulePlanFromRepoAction).mockResolvedValue({
        courseTitle: "CS 101",
        schedule: [
          { week: 1, topic: "Intro", summary: "s", assignmentTitle: "A1", assignmentSlug: "a1", testName: null },
        ],
      });

      const result = await step.run(
        { source: "codebase", repo: "org/repo" },
        testHelpers(),
        () => {}
      );

      expect(result.outputs.courseKind).toBe("coding");
    });

    // Defect 1: generateSchedulePlanFromRepoAction has no sourceMaterial
    // parameter at all, so this branch never runs TOC derivation - but the
    // shared "Source material" field must still pass through unchanged
    // rather than come out blank, so a hand-pasted TOC is not silently
    // dropped just because the schedule itself came from a different source.
    it("forwards the shared sourceMaterial field unchanged as resolvedSourceMaterial (no TOC derivation on this source)", async () => {
      vi.mocked(generateSchedulePlanFromRepoAction).mockResolvedValue({
        courseTitle: "CS 101",
        schedule: [
          { week: 1, topic: "Intro", summary: "s", assignmentTitle: "A1", assignmentSlug: "a1", testName: null },
        ],
      });

      const result = await step.run(
        { source: "codebase", repo: "org/repo", sourceMaterial: "Hand-pasted TOC the instructor typed" },
        testHelpers(),
        () => {}
      );

      expect(result.outputs.resolvedSourceMaterial).toBe("Hand-pasted TOC the instructor typed");
    });

    it("resolvedSourceMaterial is blank (not undefined/dropped) when no sourceMaterial was given", async () => {
      vi.mocked(generateSchedulePlanFromRepoAction).mockResolvedValue({
        courseTitle: "CS 101",
        schedule: [
          { week: 1, topic: "Intro", summary: "s", assignmentTitle: "A1", assignmentSlug: "a1", testName: null },
        ],
      });

      const result = await step.run({ source: "codebase", repo: "org/repo" }, testHelpers(), () => {});

      expect(result.outputs.resolvedSourceMaterial).toBe("");
    });
  });

  describe("source: course-description", () => {
    it("delegates to generateSchedulePlanAction with weeks/tests/context/sourceMaterial", async () => {
      vi.mocked(generateSchedulePlanAction).mockResolvedValue({
        courseTitle: "Intro to Testing",
        schedule: [
          { week: 1, topic: "Intro", summary: "s", assignmentTitle: "A1", assignmentSlug: "a1", testName: null },
        ],
      });

      const result = await step.run(
        {
          source: "course-description",
          description: "A course about testing",
          weeks: "1",
          tests: "0",
          context: "steer it",
          sourceMaterial: "Chapter 1: Basics",
        },
        testHelpers(),
        () => {}
      );

      expect(generateSchedulePlanAction).toHaveBeenCalledWith(
        "A course about testing",
        1,
        0,
        "gemini",
        "steer it",
        "Chapter 1: Basics"
      );
      expect(result.outputs.courseTitle).toBe("Intro to Testing");
      expect(result.outputs.weeks).toBe(1);
    });

    it("fails with a message naming the missing field when description is blank", async () => {
      await expect(
        step.run({ source: "course-description", description: "  " }, testHelpers(), () => {})
      ).rejects.toThrow(/Provide a course description/);
      expect(generateSchedulePlanAction).not.toHaveBeenCalled();
    });

    it("propagates an error returned by generateSchedulePlanAction", async () => {
      vi.mocked(generateSchedulePlanAction).mockResolvedValue({ error: "Enter a number of weeks between 1 and 52." });
      await expect(
        step.run({ source: "course-description", description: "A course" }, testHelpers(), () => {})
      ).rejects.toThrow("Enter a number of weeks between 1 and 52.");
    });

    it("resolves courseKind to 'applied' (not a code-implying source)", async () => {
      vi.mocked(generateSchedulePlanAction).mockResolvedValue({
        courseTitle: "Intro to Testing",
        schedule: [
          { week: 1, topic: "Intro", summary: "s", assignmentTitle: "A1", assignmentSlug: "a1", testName: null },
        ],
      });

      const result = await step.run(
        { source: "course-description", description: "A course about testing" },
        testHelpers(),
        () => {}
      );

      expect(result.outputs.courseKind).toBe("applied");
    });

    // Defect 1: the SAME contract generate-schedule's own resolvedSourceMaterial
    // output uses (registry.generate-schedule.test.ts) - forwards the
    // sourceMaterial actually used when generateSchedulePlanAction found no
    // derived TOC (a pasted TOC, or a name-only citation with no derivation).
    it("resolvedSourceMaterial is the pasted sourceMaterial unchanged when no derivation occurred", async () => {
      vi.mocked(generateSchedulePlanAction).mockResolvedValue({
        courseTitle: "Intro to Testing",
        schedule: [
          { week: 1, topic: "Intro", summary: "s", assignmentTitle: "A1", assignmentSlug: "a1", testName: null },
        ],
      });

      const result = await step.run(
        {
          source: "course-description",
          description: "A course about testing",
          sourceMaterial: "Chapter 1: Basics\nChapter 2: Advanced",
        },
        testHelpers(),
        () => {}
      );

      expect(result.outputs.resolvedSourceMaterial).toBe("Chapter 1: Basics\nChapter 2: Advanced");
    });

    it("resolvedSourceMaterial is the derived TOC when generateSchedulePlanAction found one", async () => {
      const derivedToc = "Module 1: Introduction\nModule 2: Footprinting";
      vi.mocked(generateSchedulePlanAction).mockResolvedValue({
        courseTitle: "CEH v12",
        schedule: [
          { week: 1, topic: "Intro", summary: "s", assignmentTitle: "A1", assignmentSlug: "a1", testName: null },
        ],
        derivedToc,
        derivedSources: [{ title: "uCertify CEH v12 course outline", uri: "https://example.com/toc" }],
      });

      const result = await step.run(
        {
          source: "course-description",
          description: "A CEH prep course",
          sourceMaterial: "https://www.ucertify.com/app/?func=load_course&course=CEH-v12.AE1",
        },
        testHelpers(),
        () => {}
      );

      expect(result.outputs.resolvedSourceMaterial).toBe(derivedToc);
    });

    it("resolvedSourceMaterial is blank when no sourceMaterial was given", async () => {
      vi.mocked(generateSchedulePlanAction).mockResolvedValue({
        courseTitle: "Intro to Testing",
        schedule: [
          { week: 1, topic: "Intro", summary: "s", assignmentTitle: "A1", assignmentSlug: "a1", testName: null },
        ],
      });

      const result = await step.run(
        { source: "course-description", description: "A course about testing" },
        testHelpers(),
        () => {}
      );

      expect(result.outputs.resolvedSourceMaterial).toBe("");
    });
  });

  describe("source: course-cartridge", () => {
    function cartridgeFile(): File {
      return new File(["zip-bytes"], "export.imscc", { type: "application/octet-stream" });
    }

    it("maps the parsed cartridge's modules through the shared normalizer", async () => {
      vi.mocked(parseCartridgeBlob).mockResolvedValue({
        title: "Biology 101",
        courseCode: null,
        startAt: null,
        syllabusHtml: null,
        modules: [
          { name: "Module 1", position: 1, items: [{ title: "Syllabus", type: "" }, { title: "  ", type: "" }] },
          { name: "Module 2", position: 2, items: [{ title: "Reading", type: "" }] },
        ],
        rubrics: [],
        hasCourseSettings: true,
      });

      const result = await step.run(
        { source: "course-cartridge", cartridge: [cartridgeFile()] },
        testHelpers(),
        () => {}
      );

      expect(parseCartridgeBlob).toHaveBeenCalledTimes(1);
      expect(result.outputs.courseTitle).toBe("Biology 101");
      expect(result.outputs.weeks).toBe(2);
      const summary = scheduleSummary(result);
      expect(summary.schedule[0]).toMatchObject({ week: 1, topic: "Module 1", summary: "Covers: Syllabus" });
      expect(summary.schedule[1]).toMatchObject({ week: 2, topic: "Module 2", summary: "Covers: Reading" });
      // Defect 2: a cartridge carries no coding signal, so it keeps today's
      // "applied" default - only "codebase" implies a programming course.
      expect(result.outputs.courseKind).toBe("applied");
    });

    it("forwards the shared sourceMaterial field unchanged as resolvedSourceMaterial (no TOC derivation on this source)", async () => {
      vi.mocked(parseCartridgeBlob).mockResolvedValue({
        title: "Biology 101",
        courseCode: null,
        startAt: null,
        syllabusHtml: null,
        modules: [{ name: "Module 1", position: 1, items: [{ title: "Syllabus", type: "" }] }],
        rubrics: [],
        hasCourseSettings: true,
      });

      const result = await step.run(
        {
          source: "course-cartridge",
          cartridge: [cartridgeFile()],
          sourceMaterial: "Hand-pasted TOC the instructor typed",
        },
        testHelpers(),
        () => {}
      );

      expect(result.outputs.resolvedSourceMaterial).toBe("Hand-pasted TOC the instructor typed");
    });

    it("falls back to the hubCourse tile's name when the cartridge has no title", async () => {
      vi.mocked(parseCartridgeBlob).mockResolvedValue({
        title: null,
        courseCode: null,
        startAt: null,
        syllabusHtml: null,
        modules: [{ name: "Module 1", position: 1, items: [] }],
        rubrics: [],
        hasCourseSettings: true,
      });
      vi.mocked(listCourseHubAction).mockResolvedValue({
        courses: [{ id: "tile-1", name: "Fallback Course Name" } as never],
      });

      const result = await step.run(
        { source: "course-cartridge", cartridge: [cartridgeFile()], hubCourse: "tile-1" },
        testHelpers(),
        () => {}
      );

      expect(result.outputs.courseTitle).toBe("Fallback Course Name");
    });

    it("falls back to a generic title when the cartridge has no title and no hubCourse is bound", async () => {
      vi.mocked(parseCartridgeBlob).mockResolvedValue({
        title: null,
        courseCode: null,
        startAt: null,
        syllabusHtml: null,
        modules: [{ name: "Module 1", position: 1, items: [] }],
        rubrics: [],
        hasCourseSettings: true,
      });

      const result = await step.run(
        { source: "course-cartridge", cartridge: [cartridgeFile()] },
        testHelpers(),
        () => {}
      );

      expect(result.outputs.courseTitle).toBe("Course");
      expect(listCourseHubAction).not.toHaveBeenCalled();
    });

    it("fails with a message naming the missing field when no cartridge is uploaded", async () => {
      await expect(
        step.run({ source: "course-cartridge", cartridge: [] }, testHelpers(), () => {})
      ).rejects.toThrow(/Upload a course cartridge/);
      expect(parseCartridgeBlob).not.toHaveBeenCalled();
    });

    it("fails rather than reporting success when the cartridge has no modules", async () => {
      vi.mocked(parseCartridgeBlob).mockResolvedValue({
        title: "Empty Course",
        courseCode: null,
        startAt: null,
        syllabusHtml: null,
        modules: [],
        rubrics: [],
        hasCourseSettings: true,
      });

      await expect(
        step.run({ source: "course-cartridge", cartridge: [cartridgeFile()] }, testHelpers(), () => {})
      ).rejects.toThrow(/no weeks were produced/);
    });
  });

  describe("source: syllabus-document", () => {
    function syllabusFile(): File {
      return new File(["syllabus text"], "syllabus.docx", {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
    }

    it("extracts text from the upload and delegates to generateSchedulePlanAction, using the text as sourceMaterial by default", async () => {
      vi.mocked(extractSyllabusTextAction).mockResolvedValue({ text: "Week 1: Intro\nWeek 2: More" });
      vi.mocked(generateSchedulePlanAction).mockResolvedValue({
        courseTitle: "From Syllabus",
        schedule: [
          { week: 1, topic: "Intro", summary: "s", assignmentTitle: null, assignmentSlug: null, testName: null },
        ],
      });

      const result = await step.run(
        { source: "syllabus-document", syllabus: [syllabusFile()], weeks: "1", tests: "0" },
        testHelpers(),
        () => {}
      );

      expect(extractSyllabusTextAction).toHaveBeenCalledTimes(1);
      const [fileArg] = vi.mocked(extractSyllabusTextAction).mock.calls[0];
      expect(fileArg.name).toBe("syllabus.docx");
      expect(typeof fileArg.base64).toBe("string");

      expect(generateSchedulePlanAction).toHaveBeenCalledWith(
        "Week 1: Intro\nWeek 2: More",
        1,
        0,
        "gemini",
        undefined,
        "Week 1: Intro\nWeek 2: More"
      );
      expect(result.outputs.courseTitle).toBe("From Syllabus");
    });

    it("prefers an explicit sourceMaterial over the extracted syllabus text", async () => {
      vi.mocked(extractSyllabusTextAction).mockResolvedValue({ text: "extracted text" });
      vi.mocked(generateSchedulePlanAction).mockResolvedValue({
        courseTitle: "T",
        schedule: [{ week: 1, topic: "t", summary: "s", assignmentTitle: null, assignmentSlug: null, testName: null }],
      });

      await step.run(
        {
          source: "syllabus-document",
          syllabus: [syllabusFile()],
          sourceMaterial: "Explicit Textbook, 3rd Ed.",
        },
        testHelpers(),
        () => {}
      );

      expect(generateSchedulePlanAction).toHaveBeenCalledWith(
        "extracted text",
        0,
        0,
        "gemini",
        undefined,
        "Explicit Textbook, 3rd Ed."
      );
    });

    it("resolves courseKind to 'applied' (not a code-implying source)", async () => {
      vi.mocked(extractSyllabusTextAction).mockResolvedValue({ text: "Week 1: Intro\nWeek 2: More" });
      vi.mocked(generateSchedulePlanAction).mockResolvedValue({
        courseTitle: "From Syllabus",
        schedule: [
          { week: 1, topic: "Intro", summary: "s", assignmentTitle: null, assignmentSlug: null, testName: null },
        ],
      });

      const result = await step.run(
        { source: "syllabus-document", syllabus: [syllabusFile()] },
        testHelpers(),
        () => {}
      );

      expect(result.outputs.courseKind).toBe("applied");
    });

    // Defect 1: this branch calls the EXACT SAME generateSchedulePlanAction
    // course-description does (just with the extracted syllabus text as the
    // course description) - it is NOT true that this source "never runs TOC
    // derivation." In the default case (no explicit sourceMaterial), the
    // material fed to generation is the syllabus's own extracted text -
    // normally long, parseable prose - so resolvedSourceMaterial is just that
    // text unchanged when generateSchedulePlanAction found no derived TOC.
    it("resolvedSourceMaterial is the syllabus's own extracted text when no explicit sourceMaterial and no derivation occurred", async () => {
      vi.mocked(extractSyllabusTextAction).mockResolvedValue({ text: "Week 1: Intro\nWeek 2: More" });
      vi.mocked(generateSchedulePlanAction).mockResolvedValue({
        courseTitle: "From Syllabus",
        schedule: [
          { week: 1, topic: "Intro", summary: "s", assignmentTitle: null, assignmentSlug: null, testName: null },
        ],
      });

      const result = await step.run(
        { source: "syllabus-document", syllabus: [syllabusFile()] },
        testHelpers(),
        () => {}
      );

      expect(result.outputs.resolvedSourceMaterial).toBe("Week 1: Intro\nWeek 2: More");
    });

    // The instructor-typed case: an explicit sourceMaterial value (rather
    // than the extracted text) is what generateSchedulePlanAction actually
    // receives (see the "prefers an explicit sourceMaterial" test above), so
    // when no derivation occurs, resolvedSourceMaterial echoes THAT value,
    // not the extracted text.
    it("resolvedSourceMaterial is the explicit sourceMaterial unchanged when one was given and no derivation occurred", async () => {
      vi.mocked(extractSyllabusTextAction).mockResolvedValue({ text: "extracted text" });
      vi.mocked(generateSchedulePlanAction).mockResolvedValue({
        courseTitle: "T",
        schedule: [{ week: 1, topic: "t", summary: "s", assignmentTitle: null, assignmentSlug: null, testName: null }],
      });

      const result = await step.run(
        {
          source: "syllabus-document",
          syllabus: [syllabusFile()],
          sourceMaterial: "Explicit Textbook, 3rd Ed.",
        },
        testHelpers(),
        () => {}
      );

      expect(result.outputs.resolvedSourceMaterial).toBe("Explicit Textbook, 3rd Ed.");
    });

    // Proves derivation genuinely CAN fire on this source (contrary to
    // treating it as a source that "never" derives): when the instructor
    // types an explicit sourceMaterial that looks like a bare citation/URL,
    // generateSchedulePlanAction's own shouldDeriveToc gate can trigger the
    // web-search derivation exactly as it would for course-description, and
    // this branch must forward that derived TOC, not the citation.
    it("resolvedSourceMaterial is the derived TOC when generateSchedulePlanAction found one for an explicit citation-like sourceMaterial", async () => {
      const derivedToc = "Module 1: Introduction\nModule 2: Footprinting";
      vi.mocked(extractSyllabusTextAction).mockResolvedValue({ text: "extracted text" });
      vi.mocked(generateSchedulePlanAction).mockResolvedValue({
        courseTitle: "CEH v12",
        schedule: [
          { week: 1, topic: "Intro", summary: "s", assignmentTitle: null, assignmentSlug: null, testName: null },
        ],
        derivedToc,
        derivedSources: [{ title: "uCertify CEH v12 course outline", uri: "https://example.com/toc" }],
      });

      const result = await step.run(
        {
          source: "syllabus-document",
          syllabus: [syllabusFile()],
          sourceMaterial: "https://www.ucertify.com/app/?func=load_course&course=CEH-v12.AE1",
        },
        testHelpers(),
        () => {}
      );

      expect(result.outputs.resolvedSourceMaterial).toBe(derivedToc);
    });

    it("fails with a message naming the missing field when no syllabus is uploaded", async () => {
      await expect(
        step.run({ source: "syllabus-document", syllabus: [] }, testHelpers(), () => {})
      ).rejects.toThrow(/Upload a syllabus document/);
      expect(extractSyllabusTextAction).not.toHaveBeenCalled();
    });

    it("propagates an error returned by extractSyllabusTextAction", async () => {
      vi.mocked(extractSyllabusTextAction).mockResolvedValue({ error: "No text found in that file." });
      await expect(
        step.run({ source: "syllabus-document", syllabus: [syllabusFile()] }, testHelpers(), () => {})
      ).rejects.toThrow("No text found in that file.");
      expect(generateSchedulePlanAction).not.toHaveBeenCalled();
    });
  });

  describe("source: existing-lms-course", () => {
    it("maps the live course's modules through the shared normalizer", async () => {
      vi.mocked(listCourseContentAction).mockResolvedValue({
        courseName: "History 201",
        modules: [
          {
            id: 1,
            name: "Week 1",
            position: 1,
            published: true,
            itemsCount: 1,
            items: [
              { id: 1, moduleId: 1, title: "Overview", type: "Page", position: 1, indent: 0, published: true, pageUrl: "overview", contentId: null, dueAt: null, pointsPossible: null, htmlUrl: null, externalUrl: null },
            ],
          },
        ],
        pages: [],
      });

      const result = await step.run(
        { source: "existing-lms-course", lmsCourse: "https://canvas.example.edu/courses/1" },
        testHelpers({ activeInstitution: "UT" }),
        () => {}
      );

      expect(listCourseContentAction).toHaveBeenCalledWith("https://canvas.example.edu/courses/1", "UT");
      expect(result.outputs.courseTitle).toBe("History 201");
      const summary = scheduleSummary(result);
      expect(summary.schedule[0]).toMatchObject({ topic: "Week 1", summary: "Covers: Overview" });
      // Defect 2: an existing LMS course carries no coding signal, so it
      // keeps today's "applied" default - only "codebase" implies coding.
      expect(result.outputs.courseKind).toBe("applied");
    });

    it("forwards the shared sourceMaterial field unchanged as resolvedSourceMaterial (no TOC derivation on this source)", async () => {
      vi.mocked(listCourseContentAction).mockResolvedValue({
        courseName: "History 201",
        modules: [
          {
            id: 1,
            name: "Week 1",
            position: 1,
            published: true,
            itemsCount: 1,
            items: [
              { id: 1, moduleId: 1, title: "Overview", type: "Page", position: 1, indent: 0, published: true, pageUrl: "overview", contentId: null, dueAt: null, pointsPossible: null, htmlUrl: null, externalUrl: null },
            ],
          },
        ],
        pages: [],
      });

      const result = await step.run(
        {
          source: "existing-lms-course",
          lmsCourse: "https://canvas.example.edu/courses/1",
          sourceMaterial: "Hand-pasted TOC the instructor typed",
        },
        testHelpers({ activeInstitution: "UT" }),
        () => {}
      );

      expect(result.outputs.resolvedSourceMaterial).toBe("Hand-pasted TOC the instructor typed");
    });

    it("fails with a message naming the missing field when no LMS course is selected", async () => {
      await expect(
        step.run({ source: "existing-lms-course", lmsCourse: "" }, testHelpers(), () => {})
      ).rejects.toThrow(/Select an existing LMS course/);
      expect(listCourseContentAction).not.toHaveBeenCalled();
    });

    it("propagates an error returned by listCourseContentAction", async () => {
      vi.mocked(listCourseContentAction).mockResolvedValue({ error: "Canvas is down" });
      await expect(
        step.run(
          { source: "existing-lms-course", lmsCourse: "https://canvas.example.edu/courses/1" },
          testHelpers(),
          () => {}
        )
      ).rejects.toThrow("Canvas is down");
    });
  });

  describe("source: tile-export", () => {
    // The shape helpers.loadCourseExport (step-helpers-server.ts /
    // useWorkflowRun.ts) already resolves to - CartridgeCourseData, the SAME
    // type parseCartridgeBlob returns for the course-cartridge source above.
    function exportData(
      overrides: Partial<{
        title: string | null;
        modules: { name: string; position: number; items: { title: string; type: string }[] }[];
      }> = {}
    ) {
      return {
        title: overrides.title === undefined ? "Biology 101" : overrides.title,
        courseCode: null,
        startAt: null,
        syllabusHtml: null,
        modules:
          overrides.modules ??
          [
            { name: "Module 1", position: 1, items: [{ title: "Syllabus", type: "" }, { title: "  ", type: "" }] },
            { name: "Module 2", position: 2, items: [{ title: "Reading", type: "" }] },
          ],
        rubrics: [],
        hasCourseSettings: true,
      };
    }

    it("maps the tile's saved export through the SAME shared normalizer the course-cartridge source uses (cross-checked directly against courseStructureToSchedule)", async () => {
      const loadCourseExport = vi.fn(async () => exportData());

      const result = await step.run(
        { source: "tile-export", hubCourse: "tile-1" },
        testHelpers({ loadCourseExport }),
        () => {}
      );

      expect(loadCourseExport).toHaveBeenCalledWith("tile-1");
      expect(result.outputs.courseTitle).toBe("Biology 101");
      expect(result.outputs.weeks).toBe(2);

      // Cross-check: call the REAL shared normalizer directly with the exact
      // {title,items} shape this branch narrows the export's modules down to
      // (steps.course-schedule-from-source.ts's own mapping, identical to
      // the course-cartridge branch's own mapping just above) - proves this
      // is not a fourth parallel implementation that merely produces a
      // similarly-shaped schedule.
      const expectedSchedule = courseStructureToSchedule(
        [
          { title: "Module 1", items: [{ title: "Syllabus" }, { title: "  " }] },
          { title: "Module 2", items: [{ title: "Reading" }] },
        ],
        null
      );
      const summary = scheduleSummary(result);
      expect(summary.schedule).toEqual(expectedSchedule);
      // Defect 2: a saved LMS export carries no coding signal, same as the
      // course-cartridge and existing-LMS-course sources - only "codebase"
      // implies a programming course.
      expect(result.outputs.courseKind).toBe("applied");
    });

    it("forwards the shared sourceMaterial field unchanged as resolvedSourceMaterial (no TOC derivation on this source)", async () => {
      const loadCourseExport = vi.fn(async () => exportData());

      const result = await step.run(
        {
          source: "tile-export",
          hubCourse: "tile-1",
          sourceMaterial: "Hand-pasted TOC the instructor typed",
        },
        testHelpers({ loadCourseExport }),
        () => {}
      );

      expect(result.outputs.resolvedSourceMaterial).toBe("Hand-pasted TOC the instructor typed");
    });

    it("falls back to the hubCourse tile's name when the export has no title", async () => {
      const loadCourseExport = vi.fn(async () => exportData({ title: null }));
      vi.mocked(listCourseHubAction).mockResolvedValue({
        courses: [{ id: "tile-1", name: "Fallback Course Name" } as never],
      });

      const result = await step.run(
        { source: "tile-export", hubCourse: "tile-1" },
        testHelpers({ loadCourseExport }),
        () => {}
      );

      expect(result.outputs.courseTitle).toBe("Fallback Course Name");
    });

    it("fails with a message naming the missing field when no course tile is chosen", async () => {
      await expect(
        step.run({ source: "tile-export", hubCourse: "" }, testHelpers(), () => {})
      ).rejects.toThrow(/Choose a course tile/);
    });

    // helpers.loadCourseExport is null in a run context that cannot supply it
    // (see StepRunHelpers.loadCourseExport, registry-helpers.ts - null when,
    // for instance, no signed-in user/Supabase client is available) - the
    // default testHelpers() below already sets it null, matching every other
    // step test file's baseline.
    it("fails with a clear message when loadCourseExport is not wired for this run context", async () => {
      await expect(
        step.run({ source: "tile-export", hubCourse: "tile-1" }, testHelpers(), () => {})
      ).rejects.toThrow(/not available in this run context/);
    });

    it("fails with a message naming the tile - never a silent empty schedule - when the tile has no export on file", async () => {
      const loadCourseExport = vi.fn(async () => null);
      vi.mocked(listCourseHubAction).mockResolvedValue({
        courses: [{ id: "tile-1", name: "Biology 101 (Fall)" } as never],
      });

      await expect(
        step.run({ source: "tile-export", hubCourse: "tile-1" }, testHelpers({ loadCourseExport }), () => {})
      ).rejects.toThrow(/Biology 101 \(Fall\)/);
    });

    it("falls back to naming the raw tile id when the tile's own name cannot be resolved either", async () => {
      const loadCourseExport = vi.fn(async () => null);
      vi.mocked(listCourseHubAction).mockResolvedValue({ error: "network down" });

      await expect(
        step.run({ source: "tile-export", hubCourse: "tile-404" }, testHelpers({ loadCourseExport }), () => {})
      ).rejects.toThrow(/tile-404/);
    });

    it("fails rather than reporting success when the export has no modules", async () => {
      const loadCourseExport = vi.fn(async () => exportData({ modules: [] }));

      await expect(
        step.run({ source: "tile-export", hubCourse: "tile-1" }, testHelpers({ loadCourseExport }), () => {})
      ).rejects.toThrow(/no weeks were produced/);
    });

    // AC2 (defect-1 write-up, real run 556b49f0): a bare "Failed to fetch"
    // told the user nothing. helpers.loadCourseExport (step-helpers-server.ts
    // / WorkflowsTab.tsx) now wraps that failure with the tile and export
    // file name before it ever reaches this step - this proves the step
    // itself does not re-swallow or re-generalize that message on the way
    // out (no try/catch wraps this call in the step's own source), so
    // whatever diagnosable message loadCourseExport produced reaches the run
    // log verbatim.
    it("propagates loadCourseExport's own error message unchanged, rather than a generic failure", async () => {
      const loadCourseExport = vi.fn(async () => {
        throw new Error('Could not read "Biology 101"\'s LMS export "export.imscc": Failed to fetch');
      });

      await expect(
        step.run({ source: "tile-export", hubCourse: "tile-1" }, testHelpers({ loadCourseExport }), () => {})
      ).rejects.toThrow('Could not read "Biology 101"\'s LMS export "export.imscc": Failed to fetch');
    });
  });

  describe("source: tile-repo", () => {
    // The seventh source - the repository already linked on the selected
    // course tile's own row (src/lib/supabase/courses.ts's `repos` column,
    // CourseRepo[]). Unlike tile-export (which needs helpers.loadCourseExport
    // to reach Supabase Storage), resolving a tile's own repo needs nothing
    // but the course row listCourseHubAction already returns, so these tests
    // mock only listCourseHubAction and generateSchedulePlanFromRepoAction -
    // no loadCourseExport helper is involved at all.
    function hubTileWithRepos(
      repos: { repo: string; branch: string | null }[],
      overrides: Partial<{ id: string; name: string }> = {}
    ) {
      return {
        id: overrides.id ?? "tile-1",
        name: overrides.name ?? "Biology 101",
        repos,
      } as never;
    }

    it("delegates to generateSchedulePlanFromRepoAction with the tile's own repo, via the SAME positional call shape the codebase source uses", async () => {
      vi.mocked(listCourseHubAction).mockResolvedValue({
        courses: [hubTileWithRepos([{ repo: "org/bio-repo", branch: "main" }])],
      });
      vi.mocked(generateSchedulePlanFromRepoAction).mockResolvedValue({
        courseTitle: "Biology 101",
        schedule: [
          { week: 1, topic: "Intro", summary: "s", assignmentTitle: "A1", assignmentSlug: "a1", testName: null },
          { week: 2, topic: "More", summary: "s2", assignmentTitle: "A2", assignmentSlug: "a2", testName: null },
        ],
      });

      const result = await step.run(
        { source: "tile-repo", hubCourse: "tile-1", weeks: "2", tests: "0", context: "focus on basics" },
        testHelpers(),
        () => {}
      );

      // Same positional args the "source: codebase" test above pins -
      // (repo, weeks, tests, provider, context) - proof this source funnels
      // through the identical generateSchedulePlanFromRepoAction call.
      expect(generateSchedulePlanFromRepoAction).toHaveBeenCalledWith(
        "org/bio-repo",
        2,
        0,
        "gemini",
        "focus on basics"
      );
      expect(result.outputs.courseTitle).toBe("Biology 101");
      expect(result.outputs.weeks).toBe(2);
      expect(scheduleSummary(result).schedule).toHaveLength(2);
    });

    // AC1's direct cross-check: given the SAME repo string (one typed/picked,
    // one read off the tile's row) and the same weeks/tests, the codebase
    // and tile-repo sources must produce byte-identical outputs - proof they
    // share the SAME underlying path (the step's own `scheduleFromRepo`
    // closure), not two implementations that merely look alike.
    it("agrees with the codebase source given an equivalent repo (both route through the same scheduleFromRepo path)", async () => {
      const schedule = [
        { week: 1, topic: "Intro", summary: "s", assignmentTitle: "A1", assignmentSlug: "a1", testName: null },
      ];
      vi.mocked(generateSchedulePlanFromRepoAction).mockResolvedValue({
        courseTitle: "CS 101",
        schedule,
      });

      const codebaseResult = await step.run(
        { source: "codebase", repo: "org/repo", weeks: "1", tests: "0" },
        testHelpers(),
        () => {}
      );

      vi.mocked(listCourseHubAction).mockResolvedValue({
        courses: [hubTileWithRepos([{ repo: "org/repo", branch: null }])],
      });
      const tileRepoResult = await step.run(
        { source: "tile-repo", hubCourse: "tile-1", weeks: "1", tests: "0" },
        testHelpers(),
        () => {}
      );

      expect(tileRepoResult.outputs).toEqual(codebaseResult.outputs);
      expect(scheduleSummary(tileRepoResult).schedule).toEqual(scheduleSummary(codebaseResult).schedule);
    });

    // AC2's multi-repo rule: repos[0], the FIRST linked repository - never
    // "newest" (CourseRepo carries no timestamp to rank by) and never a
    // choice forced onto the instructor (this source asks for nothing beyond
    // the tile already selected).
    it("uses the FIRST repo when the tile has several linked", async () => {
      vi.mocked(listCourseHubAction).mockResolvedValue({
        courses: [
          hubTileWithRepos([
            { repo: "org/first-repo", branch: null },
            { repo: "org/second-repo", branch: null },
          ]),
        ],
      });
      vi.mocked(generateSchedulePlanFromRepoAction).mockResolvedValue({
        courseTitle: "Biology 101",
        schedule: [
          { week: 1, topic: "Intro", summary: "s", assignmentTitle: "A1", assignmentSlug: "a1", testName: null },
        ],
      });

      await step.run({ source: "tile-repo", hubCourse: "tile-1" }, testHelpers(), () => {});

      expect(generateSchedulePlanFromRepoAction).toHaveBeenCalledWith(
        "org/first-repo",
        null,
        null,
        "gemini",
        undefined
      );
    });

    // AC4: the same kind of input as "codebase" (a repository), so it must
    // resolve to the same course kind.
    it("resolves courseKind to 'coding'", async () => {
      vi.mocked(listCourseHubAction).mockResolvedValue({
        courses: [hubTileWithRepos([{ repo: "org/bio-repo", branch: null }])],
      });
      vi.mocked(generateSchedulePlanFromRepoAction).mockResolvedValue({
        courseTitle: "Biology 101",
        schedule: [
          { week: 1, topic: "Intro", summary: "s", assignmentTitle: "A1", assignmentSlug: "a1", testName: null },
        ],
      });

      const result = await step.run({ source: "tile-repo", hubCourse: "tile-1" }, testHelpers(), () => {});

      expect(result.outputs.courseKind).toBe("coding");
    });

    it("fails with a message naming the missing field when no course tile is chosen", async () => {
      await expect(
        step.run({ source: "tile-repo", hubCourse: "" }, testHelpers(), () => {})
      ).rejects.toThrow(/Choose a course tile/);
      expect(generateSchedulePlanFromRepoAction).not.toHaveBeenCalled();
    });

    // AC3: never a silent empty schedule - the error names the TILE, exactly
    // as the tile-export source's own missing-export test above does.
    it("fails with a message naming the tile - never a silent empty schedule - when the tile has no repository linked", async () => {
      vi.mocked(listCourseHubAction).mockResolvedValue({
        courses: [hubTileWithRepos([], { name: "Biology 101 (Fall)" })],
      });

      await expect(
        step.run({ source: "tile-repo", hubCourse: "tile-1" }, testHelpers(), () => {})
      ).rejects.toThrow(/Biology 101 \(Fall\)/);
      expect(generateSchedulePlanFromRepoAction).not.toHaveBeenCalled();
    });

    it("falls back to naming the raw tile id when the tile's own name cannot be resolved either", async () => {
      vi.mocked(listCourseHubAction).mockResolvedValue({ error: "network down" });

      await expect(
        step.run({ source: "tile-repo", hubCourse: "tile-404" }, testHelpers(), () => {})
      ).rejects.toThrow(/tile-404/);
    });

    it("forwards the shared sourceMaterial field unchanged as resolvedSourceMaterial (no TOC derivation on this source, same as codebase)", async () => {
      vi.mocked(listCourseHubAction).mockResolvedValue({
        courses: [hubTileWithRepos([{ repo: "org/bio-repo", branch: null }])],
      });
      vi.mocked(generateSchedulePlanFromRepoAction).mockResolvedValue({
        courseTitle: "Biology 101",
        schedule: [
          { week: 1, topic: "Intro", summary: "s", assignmentTitle: "A1", assignmentSlug: "a1", testName: null },
        ],
      });

      const result = await step.run(
        { source: "tile-repo", hubCourse: "tile-1", sourceMaterial: "Hand-pasted TOC the instructor typed" },
        testHelpers(),
        () => {}
      );

      expect(result.outputs.resolvedSourceMaterial).toBe("Hand-pasted TOC the instructor typed");
    });
  });

  it("fails with a clear message when no (or an unrecognized) source is chosen", async () => {
    await expect(step.run({ source: "" }, testHelpers(), () => {})).rejects.toThrow(
      /Choose a course structure source/
    );
    await expect(step.run({ source: "smoke-signal" }, testHelpers(), () => {})).rejects.toThrow(
      /Choose a course structure source/
    );
  });
});
