import { describe, it, expect, vi, beforeEach } from "vitest";

// Tests for listGeneratedArtifactVersionsAction and postGeneratedArtifactAction
// (both src/app/actions/lms-generation.ts) - split out of
// lms-generation.test.ts to keep both files under this project's 1000-line
// ceiling, the same way lms-generation-refine.test.ts already split off
// refineGeneratedArtifactAction/saveEditedGeneratedArtifactAction. This is a
// MOVE of those two describe blocks verbatim, not a rewrite - no assertion
// here was added, dropped, or reworded by the move itself; only the
// mock/import header below is new, trimmed to what these moved tests
// actually reference. COURSE_URL/NOT_LINKED_ERROR/FAKE_EXPORT_ONLY_COURSE and
// the mockOwner/mockResolvedCourse/mockCourseContent helpers are shared with
// lms-generation.test.ts via lms-generation.fixtures.ts (kept byte-identical
// there) rather than copy-pasted, since both files build the same
// course/module doubles.
//
// requireOwner (auth) and createServiceClient (db handle) are mocked so
// neither action needs a real Supabase session. resolveLmsCourseRowAction/
// resolveLmsCourseRowByIdAction are these actions' own course-resolution
// path. listGeneratedArtifactVersions/saveGeneratedArtifactVersion
// (@/lib/supabase/generated-artifacts) are mocked so persistence/re-reads
// are asserted by call, not a real database. createPageAction/
// updatePageAction/createGradableAction/createQuizQuestionAction/
// bulkUpdateAction/createAnnouncementAction/createModuleAction/
// createModuleItemAction/createCourseAssignmentAction are the real Canvas
// writes postGeneratedArtifactAction's LIVE_CANVAS_WRITERS wraps (P1-P5) -
// every one mocked at its exact specifier so an inert mock fails loudly
// rather than silently falling through to the real implementation.
//
// Every OTHER generator mock below (generateLectureQaAction through
// generateModuleIntroScriptAction) and the materials.ts mock exist only
// because this file imports listGeneratedArtifactVersionsAction and
// postGeneratedArtifactAction from the REAL, unmocked "./lms-generation"
// module - that module's own top-level imports pull in every one of these,
// so an unmocked one would load the real implementation instead of an inert
// double. None of them is referenced by name in this file's own test
// bodies.
vi.mock("@/lib/supabase/auth", () => ({ requireOwner: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: vi.fn(() => ({ __fake: "supabase" })) }));
vi.mock("./lms-syllabus-buttons", () => ({ resolveLmsCourseRowAction: vi.fn(), resolveLmsCourseRowByIdAction: vi.fn() }));
vi.mock("./course-planning-lecture", () => ({ generateLectureQaAction: vi.fn() }));
vi.mock("./current-events", () => ({ researchCurrentEventsAction: vi.fn() }));
vi.mock("./module-objectives-generator", () => ({ generateModuleObjectivesForAssignment: vi.fn() }));
vi.mock("./llm-content", () => ({ generateAssignmentAction: vi.fn() }));
vi.mock("./knowledge-check", () => ({ generateKnowledgeCheckAction: vi.fn() }));
vi.mock("./messaging", () => ({ draftAnnouncementAction: vi.fn() }));
vi.mock("./media", () => ({ generateModuleIntroScriptAction: vi.fn() }));
vi.mock("./canvas-modules", () => ({
  listCourseContentAction: vi.fn(),
  createModuleAction: vi.fn(),
  createModuleItemAction: vi.fn(),
  createCourseAssignmentAction: vi.fn(),
}));
vi.mock("./canvas-files-bulk", () => ({
  getPageAction: vi.fn(),
  previewFileAction: vi.fn(),
  createPageAction: vi.fn(),
  updatePageAction: vi.fn(),
  createGradableAction: vi.fn(),
  createQuizQuestionAction: vi.fn(),
  bulkUpdateAction: vi.fn(),
}));
vi.mock("./canvas-inbox", () => ({ createAnnouncementAction: vi.fn() }));
vi.mock("@/lib/lms-generation/materials", () => ({
  gatherSelectionMaterials: vi.fn(),
  expandModuleSelection: vi.fn(),
}));
vi.mock("@/lib/supabase/generated-artifacts", () => ({
  saveGeneratedArtifactVersion: vi.fn(),
  listGeneratedArtifactVersions: vi.fn(),
}));

import { resolveLmsCourseRowAction, resolveLmsCourseRowByIdAction } from "./lms-syllabus-buttons";
import { listCourseContentAction, createModuleAction, createModuleItemAction, createCourseAssignmentAction } from "./canvas-modules";
import { createPageAction, updatePageAction, createGradableAction, createQuizQuestionAction, bulkUpdateAction } from "./canvas-files-bulk";
import { createAnnouncementAction } from "./canvas-inbox";
import { listGeneratedArtifactVersions } from "@/lib/supabase/generated-artifacts";
import { listGeneratedArtifactVersionsAction, postGeneratedArtifactAction } from "./lms-generation";
import {
  COURSE_URL,
  FAKE_EXPORT_ONLY_COURSE,
  NOT_LINKED_ERROR,
  mockCourseContent,
  mockOwner,
  mockResolvedCourse,
} from "./lms-generation.fixtures";

beforeEach(() => {
  vi.clearAllMocks();
  mockOwner();
});

describe("listGeneratedArtifactVersionsAction", () => {
  it("the course-not-linked path returns the named error and calls no listing query", async () => {
    vi.mocked(resolveLmsCourseRowAction).mockResolvedValue(NOT_LINKED_ERROR as never);

    const result = await listGeneratedArtifactVersionsAction({ courseUrl: COURSE_URL, kind: "qa" });

    expect(result).toEqual({ ...NOT_LINKED_ERROR, courseNotLinked: true });
    expect(listGeneratedArtifactVersions).not.toHaveBeenCalled();
  });

  it("lists every version for the resolved course + kind's artifactKind", async () => {
    mockResolvedCourse();
    vi.mocked(listGeneratedArtifactVersions).mockResolvedValue([
      { id: "a2", version: 2, isCurrent: true },
      { id: "a1", version: 1, isCurrent: false },
    ] as never);

    const result = await listGeneratedArtifactVersionsAction({ courseUrl: COURSE_URL, kind: "currentEvents" });

    expect(listGeneratedArtifactVersions).toHaveBeenCalledWith(expect.anything(), "user-1", "course-1", "current-events");
    expect(result).toEqual({
      versions: [
        { id: "a2", version: 2, isCurrent: true },
        { id: "a1", version: 1, isCurrent: false },
      ],
    });
  });
});

// ── postGeneratedArtifactAction (P1-P5) ─────────────────────────────────────
describe("postGeneratedArtifactAction", () => {
  const OBJECTIVES_ARTIFACT = {
    id: "art-obj-2",
    courseId: "course-1",
    kind: "module-objectives",
    version: 2,
    isCurrent: true,
    title: "Week 2 Objectives",
    text: "# Module Objectives: Week 2\n\n- Do X",
    structured: null,
    prompt: "p",
    createdAt: "2026-01-02T00:00:00Z",
    updatedAt: "2026-01-02T00:00:00Z",
  };
  const OBJECTIVES_ARTIFACT_OLD = {
    ...OBJECTIVES_ARTIFACT,
    id: "art-obj-1",
    version: 1,
    isCurrent: false,
    title: "Week 2 Objectives (draft)",
    text: "old text",
  };

  const ASSIGNMENT_ARTIFACT = {
    id: "art-asn-1",
    courseId: "course-1",
    kind: "assignment",
    version: 1,
    isCurrent: true,
    title: "Build a Widget Tracker",
    text: "# Build a Widget Tracker\n\n## Overview\no",
    structured: null,
    prompt: "p",
    createdAt: "2026-01-03T00:00:00Z",
    updatedAt: "2026-01-03T00:00:00Z",
  };

  const KNOWLEDGE_CHECK_QUESTIONS = [
    { prompt: "Q1", choices: [{ text: "A", correct: true, explanation: "" }, { text: "B", correct: false, explanation: "no" }] },
    { prompt: "Q2", choices: [{ text: "C", correct: true, explanation: "" }, { text: "D", correct: false, explanation: "no" }] },
  ];
  const KNOWLEDGE_CHECK_ARTIFACT = {
    id: "art-kc-1",
    courseId: "course-1",
    kind: "knowledge-check",
    version: 1,
    isCurrent: true,
    title: "Week 3 Knowledge Check",
    text: "Q1: Q1\n[x] A",
    structured: KNOWLEDGE_CHECK_QUESTIONS,
    prompt: "p",
    createdAt: "2026-01-04T00:00:00Z",
    updatedAt: "2026-01-04T00:00:00Z",
  };

  const ANNOUNCEMENT_ARTIFACT = {
    id: "art-ann-1",
    courseId: "course-1",
    kind: "announcement",
    version: 1,
    isCurrent: true,
    title: "Heads up!",
    text: "Body text",
    structured: null,
    prompt: "p",
    createdAt: "2026-01-05T00:00:00Z",
    updatedAt: "2026-01-05T00:00:00Z",
  };

  function mockVersions(versions: unknown[]) {
    vi.mocked(listGeneratedArtifactVersions).mockResolvedValue(versions as never);
  }

  it("refuses a save-version kind (qa) by name, without re-reading any version", async () => {
    const result = await postGeneratedArtifactAction({ courseUrl: COURSE_URL, kind: "qa", artifactId: "x" });

    expect(result).toEqual({
      error: '"Anticipated lecture Q&A" only saves a generated version - it has nothing to post to Canvas.',
    });
    expect(resolveLmsCourseRowAction).not.toHaveBeenCalled();
    expect(listGeneratedArtifactVersions).not.toHaveBeenCalled();
  });

  it("refuses a save-version kind (currentEvents) by name", async () => {
    const result = await postGeneratedArtifactAction({ courseUrl: COURSE_URL, kind: "currentEvents", artifactId: "x" });
    expect(result).toEqual({
      error: '"Current events" only saves a generated version - it has nothing to post to Canvas.',
    });
  });

  it("refuses a save-version kind (decks) by name", async () => {
    const result = await postGeneratedArtifactAction({ courseUrl: COURSE_URL, kind: "decks", artifactId: "x" });
    expect(result).toEqual({
      error: '"Lecture deck" only saves a generated version - it has nothing to post to Canvas.',
    });
  });

  it("S10/M19: refuses a save-version kind (scripts) by name, matching every other save-only kind", async () => {
    const result = await postGeneratedArtifactAction({ courseUrl: COURSE_URL, kind: "scripts", artifactId: "x" });
    expect(result).toEqual({
      error: '"Intro video script" only saves a generated version - it has nothing to post to Canvas.',
    });
    expect(resolveLmsCourseRowAction).not.toHaveBeenCalled();
    expect(listGeneratedArtifactVersions).not.toHaveBeenCalled();
  });

  it("the course-not-linked path returns the named error and re-reads nothing", async () => {
    vi.mocked(resolveLmsCourseRowAction).mockResolvedValue(NOT_LINKED_ERROR as never);

    const result = await postGeneratedArtifactAction({ courseUrl: COURSE_URL, kind: "objectives", artifactId: "art-obj-2" });

    expect(result).toEqual({ ...NOT_LINKED_ERROR, courseNotLinked: true });
    expect(listGeneratedArtifactVersions).not.toHaveBeenCalled();
  });

  it("reports a named error when the requested artifactId is not among this course+kind's saved versions", async () => {
    mockResolvedCourse();
    mockVersions([OBJECTIVES_ARTIFACT]);

    const result = await postGeneratedArtifactAction({
      courseUrl: COURSE_URL,
      kind: "objectives",
      artifactId: "does-not-exist",
      target: { kind: "existing", moduleId: 10 },
    });

    expect("error" in result).toBe(true);
    expect(createPageAction).not.toHaveBeenCalled();
  });

  it("RE-READS FROM THE DB: posts the exact version named by artifactId, not simply the newest/current one", async () => {
    mockResolvedCourse();
    // Two versions exist; artifactId names the OLDER, non-current one - the
    // action must post THAT row's own title/text, proving it looked the
    // version up by id rather than assuming "the current row".
    mockVersions([OBJECTIVES_ARTIFACT, OBJECTIVES_ARTIFACT_OLD]);
    mockCourseContent();
    vi.mocked(createPageAction).mockResolvedValue({ page: { url: "week-2-objectives-draft" } } as never);
    vi.mocked(createModuleItemAction).mockResolvedValue({ ok: true } as never);

    await postGeneratedArtifactAction({
      courseUrl: COURSE_URL,
      kind: "objectives",
      artifactId: "art-obj-1",
      target: { kind: "existing", moduleId: 10 },
    });

    expect(createPageAction).toHaveBeenCalledWith(
      COURSE_URL,
      { title: "Week 2 Objectives (draft)", body: expect.stringContaining("old text") },
      "MIT"
    );
  });

  it("objectives -> page: creates and links a page into an existing module, reporting success", async () => {
    mockResolvedCourse();
    mockVersions([OBJECTIVES_ARTIFACT]);
    mockCourseContent();
    vi.mocked(createPageAction).mockResolvedValue({ page: { url: "week-2-objectives" } } as never);
    vi.mocked(createModuleItemAction).mockResolvedValue({ ok: true } as never);

    const result = await postGeneratedArtifactAction({
      courseUrl: COURSE_URL,
      kind: "objectives",
      artifactId: "art-obj-2",
      target: { kind: "existing", moduleId: 10 },
    });

    expect(createPageAction).toHaveBeenCalledWith(
      COURSE_URL,
      { title: "Week 2 Objectives", body: expect.stringContaining("Do X") },
      "MIT"
    );
    expect(createModuleItemAction).toHaveBeenCalledWith(COURSE_URL, 10, { type: "Page", pageUrl: "week-2-objectives" }, "MIT");
    expect(result).toEqual({ summary: { status: "success", text: 'Page "Week 2 Objectives" posted successfully.' } });
  });

  it("P3 RE-RUN SAFETY: reuses an existing same-titled page (update, not create) and skips the link when already linked", async () => {
    mockResolvedCourse();
    mockVersions([OBJECTIVES_ARTIFACT]);
    vi.mocked(listCourseContentAction).mockResolvedValue({
      courseName: "Intro to Widgets",
      modules: [
        {
          id: 10,
          name: "Week 1",
          position: 1,
          published: true,
          itemsCount: 1,
          items: [
            {
              id: 1,
              moduleId: 10,
              title: "Week 2 Objectives",
              type: "Page",
              position: 1,
              indent: 0,
              published: false,
              pageUrl: "week-2-objectives",
              contentId: null,
              dueAt: null,
              pointsPossible: null,
              htmlUrl: null,
              externalUrl: null,
            },
          ],
        },
      ],
      pages: [{ pageId: 1, url: "week-2-objectives", title: "Week 2 Objectives", published: false, frontPage: false, updatedAt: null }],
    } as never);
    vi.mocked(updatePageAction).mockResolvedValue({ page: { url: "week-2-objectives" } } as never);

    const result = await postGeneratedArtifactAction({
      courseUrl: COURSE_URL,
      kind: "objectives",
      artifactId: "art-obj-2",
      target: { kind: "existing", moduleId: 10 },
    });

    expect(createPageAction).not.toHaveBeenCalled();
    expect(updatePageAction).toHaveBeenCalledWith(
      COURSE_URL,
      "week-2-objectives",
      { title: "Week 2 Objectives", body: expect.stringContaining("Do X") },
      "MIT"
    );
    // Already linked in this module - createModuleItemAction must not fire a
    // redundant second link.
    expect(createModuleItemAction).not.toHaveBeenCalled();
    expect(result).toEqual({ summary: { status: "success", text: 'Page "Week 2 Objectives" posted successfully.' } });
  });

  it("requires a module target for a module-item kind - refuses rather than posting into nothing", async () => {
    mockResolvedCourse();
    mockVersions([OBJECTIVES_ARTIFACT]);

    const result = await postGeneratedArtifactAction({ courseUrl: COURSE_URL, kind: "objectives", artifactId: "art-obj-2" });

    expect(result).toEqual({ error: "Choose a module to post this into." });
    expect(listCourseContentAction).not.toHaveBeenCalled();
  });

  it("P5 CREATES A NEW MODULE: target.kind 'new' with no name collision creates a module, then posts into it", async () => {
    mockResolvedCourse();
    mockVersions([ASSIGNMENT_ARTIFACT]);
    mockCourseContent(); // only "Week 1" (id 10) exists
    vi.mocked(createModuleAction).mockResolvedValue({
      module: { id: 99, name: "Week 5", position: 2, published: false, itemsCount: 0, items: [] },
    } as never);
    vi.mocked(createCourseAssignmentAction).mockResolvedValue({
      id: 501,
      name: "Build a Widget Tracker",
      htmlUrl: "x",
      addedToModule: true,
    } as never);

    const result = await postGeneratedArtifactAction({
      courseUrl: COURSE_URL,
      kind: "assignments",
      artifactId: "art-asn-1",
      target: { kind: "new", name: "Week 5" },
    });

    expect(createModuleAction).toHaveBeenCalledWith(COURSE_URL, "Week 5", undefined, "MIT");
    expect(createCourseAssignmentAction).toHaveBeenCalledWith(
      COURSE_URL,
      expect.objectContaining({ name: "Build a Widget Tracker", published: false }),
      99,
      "MIT"
    );
    expect(result).toEqual({ summary: { status: "success", text: 'Assignment "Build a Widget Tracker" posted successfully.' } });
  });

  it("P3/P5 REUSES AN EXISTING MODULE ON A CASE-INSENSITIVE NAME MATCH: never calls createModuleAction", async () => {
    mockResolvedCourse();
    mockVersions([ASSIGNMENT_ARTIFACT]);
    mockCourseContent(); // "Week 1" (id 10) already exists
    vi.mocked(createCourseAssignmentAction).mockResolvedValue({
      id: 501,
      name: "Build a Widget Tracker",
      htmlUrl: "x",
      addedToModule: true,
    } as never);

    await postGeneratedArtifactAction({
      courseUrl: COURSE_URL,
      kind: "assignments",
      artifactId: "art-asn-1",
      // Same name as the existing module, different case/whitespace.
      target: { kind: "new", name: "  week 1  " },
    });

    expect(createModuleAction).not.toHaveBeenCalled();
    expect(createCourseAssignmentAction).toHaveBeenCalledWith(COURSE_URL, expect.anything(), 10, "MIT");
  });

  it("P4 THE ORPHAN CASE: content created but the module link fails - reported partial, never a bare failure", async () => {
    mockResolvedCourse();
    mockVersions([OBJECTIVES_ARTIFACT]);
    mockCourseContent();
    vi.mocked(createPageAction).mockResolvedValue({ page: { url: "week-2-objectives" } } as never);
    vi.mocked(createModuleItemAction).mockResolvedValue({ error: "Canvas link error" } as never);

    const result = await postGeneratedArtifactAction({
      courseUrl: COURSE_URL,
      kind: "objectives",
      artifactId: "art-obj-2",
      target: { kind: "existing", moduleId: 10 },
    });

    if ("error" in result) throw new Error("expected a summary, not a top-level error");
    expect(result.summary.status).toBe("partial");
    expect(result.summary.text).toContain("not linked into the module");
  });

  it("P4 PARTIAL QUIZ QUESTIONS: a quiz whose questions partly fail is reported partial, naming how many landed", async () => {
    mockResolvedCourse();
    mockVersions([KNOWLEDGE_CHECK_ARTIFACT]);
    mockCourseContent();
    vi.mocked(createGradableAction).mockResolvedValue({ id: 77 } as never);
    vi.mocked(createQuizQuestionAction)
      .mockResolvedValueOnce({ question: {} } as never)
      .mockResolvedValueOnce({ error: "bad question" } as never);
    vi.mocked(bulkUpdateAction).mockResolvedValue({ updated: 1, failures: [] } as never);
    vi.mocked(createModuleItemAction).mockResolvedValue({ ok: true } as never);

    const result = await postGeneratedArtifactAction({
      courseUrl: COURSE_URL,
      kind: "knowledgeChecks",
      artifactId: "art-kc-1",
      target: { kind: "existing", moduleId: 10 },
    });

    expect(createGradableAction).toHaveBeenCalledWith(
      COURSE_URL,
      "Quiz",
      expect.objectContaining({ title: "Week 3 Knowledge Check" }),
      "MIT"
    );
    expect(createQuizQuestionAction).toHaveBeenCalledTimes(2);
    if ("error" in result) throw new Error("expected a summary, not a top-level error");
    expect(result.summary.status).toBe("partial");
    expect(result.summary.text).toContain("only 1 of 2 question(s) were added");
  });

  it("knowledgeChecks refuses to post a version with no saved quiz questions", async () => {
    mockResolvedCourse();
    mockVersions([{ ...KNOWLEDGE_CHECK_ARTIFACT, structured: null }]);
    mockCourseContent();

    const result = await postGeneratedArtifactAction({
      courseUrl: COURSE_URL,
      kind: "knowledgeChecks",
      artifactId: "art-kc-1",
      target: { kind: "existing", moduleId: 10 },
    });

    expect("error" in result).toBe(true);
    expect(createGradableAction).not.toHaveBeenCalled();
  });

  it("announcements (course-level): posts without ever touching listCourseContentAction or createModuleAction", async () => {
    mockResolvedCourse();
    mockVersions([ANNOUNCEMENT_ARTIFACT]);
    vi.mocked(createAnnouncementAction).mockResolvedValue({ announcement: { id: 1 } } as never);

    const result = await postGeneratedArtifactAction({
      courseUrl: COURSE_URL,
      kind: "announcements",
      artifactId: "art-ann-1",
      // No target at all - announcements need none (course-level placement).
    });

    expect(listCourseContentAction).not.toHaveBeenCalled();
    expect(createModuleAction).not.toHaveBeenCalled();
    expect(createAnnouncementAction).toHaveBeenCalledWith(COURSE_URL, "Heads up!", "Body text", "MIT");
    expect(result).toEqual({ summary: { status: "success", text: 'Announcement "Heads up!" posted successfully.' } });
  });

  // AC2 defect fix: postGeneratedArtifactAction is one of the call sites
  // that must accept `courseId` too (see lms-generation.test.ts's own
  // "resolveGenerationCourseRow" describe block) - AC3 is what actually
  // keeps posting unreachable for an export selection in the product
  // (useLmsGeneration.ts's own client-side courseWrite gate, verified
  // separately in useLmsGeneration.test.ts), but this action's own course
  // resolution must still be source-aware like every other one, rather than
  // being the one exception AC2 would otherwise leave behind.
  it("resolves an export selection by courseId, never by courseUrl, when reached directly", async () => {
    vi.mocked(resolveLmsCourseRowByIdAction).mockResolvedValue({ course: FAKE_EXPORT_ONLY_COURSE } as never);
    mockVersions([ANNOUNCEMENT_ARTIFACT]);
    vi.mocked(createAnnouncementAction).mockResolvedValue({ announcement: { id: 1 } } as never);

    const result = await postGeneratedArtifactAction({
      courseUrl: "",
      courseId: "export-course-1",
      kind: "announcements",
      artifactId: "art-ann-1",
    });

    expect(resolveLmsCourseRowByIdAction).toHaveBeenCalledWith("export-course-1");
    expect(resolveLmsCourseRowAction).not.toHaveBeenCalled();
    expect("error" in result).toBe(false);
  });
});
