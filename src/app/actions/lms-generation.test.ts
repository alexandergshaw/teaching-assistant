import { describe, it, expect, vi, beforeEach } from "vitest";

// requireOwner (auth) and createServiceClient (db handle) are mocked so
// neither action needs a real Supabase session. resolveLmsCourseRowAction,
// generateLectureQaAction, researchCurrentEventsAction and
// listCourseContentAction are the exact EXISTING generators/lookups this
// file delegates to - mocked at their exact relative specifiers (as
// lms-generation.ts itself imports them) so an inert mock fails loudly
// rather than silently falling through to the real implementation.
// gatherSelectionMaterials and expandModuleSelection are mocked too, since
// their own behaviour is covered by materials.test.ts - these tests only
// need to prove lms-generation.ts wires listCourseContentAction's result
// into expandModuleSelection, and expandModuleSelection's result into
// gatherSelectionMaterials, not re-prove the pure expansion/gathering logic
// itself. saveGeneratedArtifactVersion is mocked so persistence is asserted
// by call, not by a real database. Neither callLlm (@/lib/llm) nor
// reviseLectureSlidesAction (the deck-specific refine, lecture-plans.ts) is
// mocked here: both are used only by refineGeneratedArtifactAction, which
// moved to src/app/actions/lms-generation-refine.ts and its own
// lms-generation-refine.test.ts, which mocks them there instead. Neither
// generateFromSelectionAction (calls no LLM directly - it delegates to
// generator actions, all mocked below) nor postGeneratedArtifactAction ever
// reaches @/lib/llm or lecture-plans.ts, and generateFromSelectionAction
// refuses "decks" outright before calling anything, so it never reaches
// lecture-plans.ts either way.
//
// CHUNK 3b adds: generateModuleObjectivesForAssignment/generateAssignmentAction/
// generateKnowledgeCheckAction/draftAnnouncementAction (the four new kinds'
// own generators, R2/R3) and createPageAction/updatePageAction/
// createGradableAction/createQuizQuestionAction/bulkUpdateAction/
// createModuleAction/createModuleItemAction/createCourseAssignmentAction/
// createAnnouncementAction (the real Canvas writes postGeneratedArtifactAction's
// LIVE_CANVAS_WRITERS wraps, P1-P5) - every one mocked at its exact
// specifier for the same "an inert mock fails loudly" reason as above.
vi.mock("@/lib/supabase/auth", () => ({ requireOwner: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: vi.fn(() => ({ __fake: "supabase" })) }));
vi.mock("./lms-syllabus-buttons", () => ({ resolveLmsCourseRowAction: vi.fn(), resolveLmsCourseRowByIdAction: vi.fn() }));
vi.mock("./course-planning-lecture", () => ({ generateLectureQaAction: vi.fn() }));
vi.mock("./current-events", () => ({ researchCurrentEventsAction: vi.fn() }));
vi.mock("./module-objectives-generator", () => ({ generateModuleObjectivesForAssignment: vi.fn() }));
vi.mock("./llm-content", () => ({ generateAssignmentAction: vi.fn() }));
vi.mock("./knowledge-check", () => ({ generateKnowledgeCheckAction: vi.fn() }));
vi.mock("./messaging", () => ({ draftAnnouncementAction: vi.fn() }));
// CHUNK 3d adds "scripts" - its own generator, generateLectureScriptAction
// (src/app/actions/media.ts). CHUNK 3g (docs/module-intro-video-script-
// acceptance-criteria.md) re-points the "scripts" branch to a NEW generator,
// generateModuleIntroScriptAction, without touching generateLectureScriptAction
// itself - that action keeps its other callers (Recording tab,
// generate-lecture-script workflow step, draft-upcoming-lectures) unchanged.
// This file's own mock therefore only needs generateModuleIntroScriptAction:
// lms-generation.ts no longer imports generateLectureScriptAction at all, and
// an inert mock for an unused import would prove nothing.
vi.mock("./media", () => ({ generateModuleIntroScriptAction: vi.fn() }));
// docs/learning-resources-page-acceptance-criteria.md (A11, A15) adds
// "resources" - its own generator, generateLearningResourcesForSelection,
// lives in its own file (learning-resources-generator.ts, a sibling chunk of
// this same feature - the AC doc's A6) and is mocked at its exact specifier
// for the same "an inert mock fails loudly" reason as every generator above.
vi.mock("./learning-resources-generator", () => ({ generateLearningResourcesForSelection: vi.fn() }));
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
import { generateLectureQaAction } from "./course-planning-lecture";
import { researchCurrentEventsAction } from "./current-events";
import { generateModuleObjectivesForAssignment } from "./module-objectives-generator";
import { generateAssignmentAction } from "./llm-content";
import { generateKnowledgeCheckAction } from "./knowledge-check";
import { draftAnnouncementAction } from "./messaging";
import { generateModuleIntroScriptAction } from "./media";
import { generateLearningResourcesForSelection } from "./learning-resources-generator";
import { listCourseContentAction, createModuleAction, createModuleItemAction, createCourseAssignmentAction } from "./canvas-modules";
import {
  getPageAction,
  previewFileAction,
  createPageAction,
  updatePageAction,
  createGradableAction,
  createQuizQuestionAction,
  bulkUpdateAction,
} from "./canvas-files-bulk";
import { createAnnouncementAction } from "./canvas-inbox";
import { gatherSelectionMaterials, expandModuleSelection } from "@/lib/lms-generation/materials";
import { saveGeneratedArtifactVersion, listGeneratedArtifactVersions } from "@/lib/supabase/generated-artifacts";
import {
  generateFromSelectionAction,
  listGeneratedArtifactVersionsAction,
} from "./lms-generation";
import type { GenerationKindId } from "@/lib/lms-generation/kinds";
import {
  COURSE_URL,
  FAKE_COURSE,
  FAKE_MODULES,
  NOT_LINKED_ERROR,
  mockCourseContent,
  mockOwner,
  mockResolvedCourse,
  mockResolvedCourseById,
} from "./lms-generation.fixtures";

const SOME_ITEM = {
  source: "live" as const,
  key: "live:10:1",
  moduleId: 10,
  item: {
    id: 1,
    moduleId: 10,
    title: "x",
    type: "Page",
    position: 1,
    indent: 0,
    published: true,
    pageUrl: null,
    contentId: null,
    dueAt: null,
    pointsPossible: null,
    htmlUrl: null,
    externalUrl: null,
  },
};

function mockMaterials(materialsText: string, notes: string[] = []) {
  vi.mocked(gatherSelectionMaterials).mockResolvedValue({ materialsText, notes } as never);
}

function mockSavedArtifact() {
  vi.mocked(saveGeneratedArtifactVersion).mockResolvedValue({ id: "artifact-1", version: 1 } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockOwner();
});

describe("generateFromSelectionAction", () => {
  it("THE DECKS GUARD: refuses a 'decks' kind without resolving the course, and calls neither generator", async () => {
    // Decks run through the Route Handler (src/app/api/lms-generation/deck/
    // route.ts), never this Server Action - see this action's own comment.
    // SABOTAGE: deleting the guard makes kind="decks" silently fall into the
    // researchCurrentEventsAction branch instead of refusing - this test
    // catches that by asserting researchCurrentEventsAction is never called.
    const result = await generateFromSelectionAction({ courseUrl: COURSE_URL, kind: "decks", items: [SOME_ITEM] });
    expect(result).toEqual({ error: "Deck generation runs through a separate endpoint - see the deck Route Handler." });
    expect(resolveLmsCourseRowAction).not.toHaveBeenCalled();
    expect(generateLectureQaAction).not.toHaveBeenCalled();
    expect(researchCurrentEventsAction).not.toHaveBeenCalled();
  });

  it("rejects an empty selection without resolving the course or gathering materials", async () => {
    const result = await generateFromSelectionAction({ courseUrl: COURSE_URL, kind: "qa", items: [] });
    expect(result).toEqual({ error: "Select at least one item to generate from." });
    expect(resolveLmsCourseRowAction).not.toHaveBeenCalled();
    expect(gatherSelectionMaterials).not.toHaveBeenCalled();
  });

  it("the course-not-linked path returns the named error and calls no generator", async () => {
    vi.mocked(resolveLmsCourseRowAction).mockResolvedValue(NOT_LINKED_ERROR as never);

    const result = await generateFromSelectionAction({ courseUrl: COURSE_URL, kind: "qa", items: [SOME_ITEM] });

    expect(result).toEqual({ ...NOT_LINKED_ERROR, courseNotLinked: true });
    expect(gatherSelectionMaterials).not.toHaveBeenCalled();
    expect(generateLectureQaAction).not.toHaveBeenCalled();
    expect(researchCurrentEventsAction).not.toHaveBeenCalled();
    expect(saveGeneratedArtifactVersion).not.toHaveBeenCalled();
  });

  it("a generic course-resolution error is NOT flagged as courseNotLinked", async () => {
    vi.mocked(resolveLmsCourseRowAction).mockResolvedValue({ error: "Could not resolve the course." } as never);
    const result = await generateFromSelectionAction({ courseUrl: COURSE_URL, kind: "qa", items: [SOME_ITEM] });
    expect(result).toEqual({ error: "Could not resolve the course." });
    expect("courseNotLinked" in (result as object)).toBe(false);
  });

  it("reports an error and calls no generator when materials gathering finds nothing usable", async () => {
    mockResolvedCourse();
    mockMaterials("   ", []);

    const result = await generateFromSelectionAction({ courseUrl: COURSE_URL, kind: "qa", items: [SOME_ITEM] });

    expect(result).toEqual({ error: "The selected item(s) had no usable material to ground generation on." });
    expect(generateLectureQaAction).not.toHaveBeenCalled();
  });

  it("a successful qa generation saves exactly one version and returns the materials notes", async () => {
    mockResolvedCourse();
    mockMaterials("grounded materials", ["a note"]);
    vi.mocked(generateLectureQaAction).mockResolvedValue({
      questions: [{ question: "What is X?", answer: "X is Y." }],
    } as never);
    mockSavedArtifact();

    const result = await generateFromSelectionAction({
      courseUrl: COURSE_URL,
      kind: "qa",
      items: [SOME_ITEM],
      moduleLabel: "Week 2",
    });

    expect(generateLectureQaAction).toHaveBeenCalledTimes(1);
    expect(generateLectureQaAction).toHaveBeenCalledWith(
      "Intro to Widgets",
      "Week 2",
      "grounded materials",
      [],
      "gemini",
      "coding"
    );
    expect(saveGeneratedArtifactVersion).toHaveBeenCalledTimes(1);
    const [, userId, input] = vi.mocked(saveGeneratedArtifactVersion).mock.calls[0];
    expect(userId).toBe("user-1");
    expect(input).toMatchObject({ courseId: "course-1", kind: "anticipated-qa" });
    expect(input.text).toContain("Q1: What is X?");
    expect(result).toEqual({ artifact: { id: "artifact-1", version: 1 }, notes: ["a note"] });
    // No moduleIds were sent, so the individually-selected-items path must
    // cost no extra Canvas call - see this file's own header comment.
    expect(listCourseContentAction).not.toHaveBeenCalled();
    expect(expandModuleSelection).not.toHaveBeenCalled();
  });

  it("a successful currentEvents generation calls researchCurrentEventsAction and saves one version", async () => {
    mockResolvedCourse();
    mockMaterials("grounded materials");
    vi.mocked(researchCurrentEventsAction).mockResolvedValue({
      report: "flat",
      reportMarkdown: "# Report",
      sourceCount: 2,
      topicsCovered: 1,
    } as never);
    mockSavedArtifact();

    const result = await generateFromSelectionAction({
      courseUrl: COURSE_URL,
      kind: "currentEvents",
      items: [SOME_ITEM],
      recentWindow: "the past week",
    });

    expect(researchCurrentEventsAction).toHaveBeenCalledWith("grounded materials", "the past week", "gemini");
    expect(saveGeneratedArtifactVersion).toHaveBeenCalledTimes(1);
    const [, , input] = vi.mocked(saveGeneratedArtifactVersion).mock.calls[0];
    expect(input).toMatchObject({ courseId: "course-1", kind: "current-events", text: "# Report" });
    expect(result).toEqual({ artifact: { id: "artifact-1", version: 1 }, notes: [] });
  });

  it("does not save a version when the generator succeeds but returns nothing usable", async () => {
    mockResolvedCourse();
    mockMaterials("grounded materials");
    vi.mocked(generateLectureQaAction).mockResolvedValue({ questions: [] } as never);

    const result = await generateFromSelectionAction({ courseUrl: COURSE_URL, kind: "qa", items: [SOME_ITEM] });

    expect(result).toEqual({ error: "The model returned no anticipated questions for this selection." });
    expect(saveGeneratedArtifactVersion).not.toHaveBeenCalled();
  });

  it("propagates a generator error without saving a version", async () => {
    mockResolvedCourse();
    mockMaterials("grounded materials");
    vi.mocked(generateLectureQaAction).mockResolvedValue({ error: "LLM quota exhausted" } as never);

    const result = await generateFromSelectionAction({ courseUrl: COURSE_URL, kind: "qa", items: [SOME_ITEM] });

    expect(result).toEqual({ error: "LLM quota exhausted" });
    expect(saveGeneratedArtifactVersion).not.toHaveBeenCalled();
  });

  describe("whole-module selections", () => {
    it("rejects a selection with neither items nor moduleIds", async () => {
      const result = await generateFromSelectionAction({ courseUrl: COURSE_URL, kind: "qa", items: [], moduleIds: [] });
      expect(result).toEqual({ error: "Select at least one item to generate from." });
      expect(resolveLmsCourseRowAction).not.toHaveBeenCalled();
      expect(listCourseContentAction).not.toHaveBeenCalled();
    });

    it("a module-only selection (no individually-selected items) fetches the live course content and expands it", async () => {
      mockResolvedCourse();
      mockCourseContent();
      vi.mocked(expandModuleSelection).mockReturnValue([SOME_ITEM] as never);
      mockMaterials("grounded materials from the whole module");
      vi.mocked(generateLectureQaAction).mockResolvedValue({
        questions: [{ question: "What is X?", answer: "X is Y." }],
      } as never);
      mockSavedArtifact();

      const result = await generateFromSelectionAction({
        courseUrl: COURSE_URL,
        kind: "qa",
        items: [],
        moduleIds: [10],
      });

      expect(listCourseContentAction).toHaveBeenCalledWith(COURSE_URL, "MIT");
      // moduleIds are translated to the discriminated "live:<id>" module-key
      // format before reaching expandModuleSelection (see this file's own
      // header comment and expandModuleSelection's, materials.ts, for why
      // the action stays live-only: an export-sourced module selection has
      // no server-side fetch path at all and is already expanded into
      // concrete `items` by the CLIENT before this action is ever called).
      expect(expandModuleSelection).toHaveBeenCalledWith([], ["live:10"], FAKE_MODULES);
      // gatherSelectionMaterials must receive expandModuleSelection's OUTPUT,
      // not the empty `items` input - otherwise a module-only selection would
      // silently generate from nothing.
      expect(gatherSelectionMaterials).toHaveBeenCalledWith([SOME_ITEM], expect.anything());
      expect(result).toEqual({ artifact: { id: "artifact-1", version: 1 }, notes: [] });
    });

    it("a mixed selection (some items AND some modules) passes both through to expandModuleSelection so it can dedupe", async () => {
      mockResolvedCourse();
      mockCourseContent();
      vi.mocked(expandModuleSelection).mockReturnValue([SOME_ITEM] as never);
      mockMaterials("grounded materials");
      vi.mocked(generateLectureQaAction).mockResolvedValue({
        questions: [{ question: "q", answer: "a" }],
      } as never);
      mockSavedArtifact();

      await generateFromSelectionAction({
        courseUrl: COURSE_URL,
        kind: "qa",
        items: [SOME_ITEM],
        moduleIds: [10],
      });

      // THE DOUBLE-COUNT GUARD: the raw individually-selected items AND the
      // raw module ids (translated to "live:<id>" keys) are handed to
      // expandModuleSelection UNMERGED - dedup is expandModuleSelection's
      // own job (see materials.test.ts), not duplicated here.
      expect(expandModuleSelection).toHaveBeenCalledWith([SOME_ITEM], ["live:10"], FAKE_MODULES);
    });

    it("propagates a listCourseContentAction failure without calling the generator", async () => {
      mockResolvedCourse();
      vi.mocked(listCourseContentAction).mockResolvedValue({ error: "Canvas is down" } as never);

      const result = await generateFromSelectionAction({
        courseUrl: COURSE_URL,
        kind: "qa",
        items: [],
        moduleIds: [10],
      });

      expect(result).toEqual({ error: "Canvas is down" });
      expect(expandModuleSelection).not.toHaveBeenCalled();
      expect(gatherSelectionMaterials).not.toHaveBeenCalled();
      expect(generateLectureQaAction).not.toHaveBeenCalled();
      expect(saveGeneratedArtifactVersion).not.toHaveBeenCalled();
    });

    it("reports the no-usable-material error when the expanded module has no gatherable content", async () => {
      mockResolvedCourse();
      mockCourseContent();
      vi.mocked(expandModuleSelection).mockReturnValue([] as never);
      mockMaterials("   ", []);

      const result = await generateFromSelectionAction({
        courseUrl: COURSE_URL,
        kind: "qa",
        items: [],
        moduleIds: [10],
      });

      expect(result).toEqual({ error: "The selected item(s) had no usable material to ground generation on." });
      expect(generateLectureQaAction).not.toHaveBeenCalled();
    });
  });
});

// refineGeneratedArtifactAction and saveEditedGeneratedArtifactAction (both
// src/app/actions/lms-generation-refine.ts) - and their own decks/
// knowledgeChecks/title-carry-forward/AC1-AC2 coverage - moved to
// src/app/actions/lms-generation-refine.test.ts, colocated with the source
// split that file's own header comment describes. This file had grown to
// roughly 2.26x this project's 1000-line test-file ceiling with those tests
// still inside it even after the source itself was split - see that file's
// own header comment, and this wave's report, for what moved and why.

// listGeneratedArtifactVersionsAction's and postGeneratedArtifactAction's own
// describe blocks moved to lms-generation.post-and-list.test.ts, same
// 1000-line-ceiling reason as the refine split above - see that file's own
// header comment. This file still calls listGeneratedArtifactVersionsAction
// directly below (the "resolveGenerationCourseRow" describe block), so its
// import stays.

// ── AC1/AC2 defect fix: resolving an export-sourced selection by courseId ──
//
// The live defect: viewing a course through its stored export blanks
// `courseUrl` to "" (ContentTab.tsx), so every one of these actions used to
// call resolveLmsCourseRowAction("") -> findCourseForCanvasUrl ->
// parseCanvasCourseId("") is null -> "No saved course is linked to ."
// Generation has no Canvas dependency of its own - it saves to
// generated_artifacts, keyed on a course_hub row id - so `courseId` (the
// export selection's own row id) is what actually identifies it. Each test
// below asserts BOTH halves: the courseId path resolves via
// resolveLmsCourseRowByIdAction and never touches resolveLmsCourseRowAction,
// proving the URL-matching path (which could never succeed against an empty
// string) is bypassed entirely, and the existing courseUrl-only path is
// untouched when courseId is omitted.
describe("resolveGenerationCourseRow (AC1/AC2 defect fix)", () => {
  it("generateFromSelectionAction resolves an export selection by courseId, never by courseUrl", async () => {
    mockResolvedCourseById();
    mockMaterials("some material", []);
    mockSavedArtifact();
    vi.mocked(generateLectureQaAction).mockResolvedValue({
      questions: [{ question: "Q1", answer: "A1" }],
    } as never);

    const result = await generateFromSelectionAction({
      courseUrl: "",
      courseId: "export-course-1",
      kind: "qa",
      items: [SOME_ITEM],
    });

    expect(resolveLmsCourseRowByIdAction).toHaveBeenCalledWith("export-course-1");
    expect(resolveLmsCourseRowAction).not.toHaveBeenCalled();
    expect("error" in result).toBe(false);
    const [, , input] = vi.mocked(saveGeneratedArtifactVersion).mock.calls[0];
    expect(input).toEqual(expect.objectContaining({ courseId: "export-course-1" }));
  });

  it("SABOTAGE CHECK'S CONTROL: still resolves a live selection by courseUrl when courseId is omitted - byte-identical to before this fix", async () => {
    mockResolvedCourse();
    mockMaterials("some material", []);
    mockSavedArtifact();
    vi.mocked(generateLectureQaAction).mockResolvedValue({
      questions: [{ question: "Q1", answer: "A1" }],
    } as never);

    await generateFromSelectionAction({ courseUrl: COURSE_URL, kind: "qa", items: [SOME_ITEM] });

    expect(resolveLmsCourseRowAction).toHaveBeenCalledWith(COURSE_URL);
    expect(resolveLmsCourseRowByIdAction).not.toHaveBeenCalled();
  });

  // M12b (docs/module-intro-video-script-acceptance-criteria.md, finding 13):
  // every other test in this file resolves the course through the full
  // `https://canvas.example.edu/...` fixture (COURSE_URL above) - the shape
  // that HID the host-less defect, since a full URL always carries a host and
  // never needed an acronym to match. This is the end-to-end case using the
  // `/courses/<id>` shape CoursePicker.tsx/LmsCell.tsx actually emit, proving
  // `acronym` genuinely reaches resolveLmsCourseRowAction from the top of
  // generateFromSelectionAction, not just from resolveGenerationCourseRow's
  // own unit-level signature.
  it("M12b: threads a host-less courseUrl's acronym all the way to resolveLmsCourseRowAction", async () => {
    mockResolvedCourse();
    mockMaterials("some material", []);
    mockSavedArtifact();
    vi.mocked(generateLectureQaAction).mockResolvedValue({
      questions: [{ question: "Q1", answer: "A1" }],
    } as never);

    await generateFromSelectionAction({
      courseUrl: "/courses/10287",
      acronym: "WNCC",
      kind: "qa",
      items: [SOME_ITEM],
    });

    expect(resolveLmsCourseRowAction).toHaveBeenCalledWith("/courses/10287", "WNCC");
    expect(resolveLmsCourseRowByIdAction).not.toHaveBeenCalled();
  });

  // refineGeneratedArtifactAction's and saveEditedGeneratedArtifactAction's
  // own AC1/AC2 (courseId) and M12 (acronym) coverage moved to
  // src/app/actions/lms-generation-refine.test.ts's own
  // "resolveGenerationCourseRow (AC1/AC2 defect fix)" describe block - see
  // that file's header comment for why.
  it("listGeneratedArtifactVersionsAction resolves an export selection by courseId, never by courseUrl", async () => {
    mockResolvedCourseById();
    vi.mocked(listGeneratedArtifactVersions).mockResolvedValue([] as never);

    const result = await listGeneratedArtifactVersionsAction({ courseUrl: "", courseId: "export-course-1", kind: "qa" });

    expect(resolveLmsCourseRowByIdAction).toHaveBeenCalledWith("export-course-1");
    expect(resolveLmsCourseRowAction).not.toHaveBeenCalled();
    expect(listGeneratedArtifactVersions).toHaveBeenCalledWith(expect.anything(), "user-1", "export-course-1", "anticipated-qa");
    expect(result).toEqual({ versions: [] });
  });

  it("a courseId that matches no saved course fails with a distinct, honest error - never the empty-URL 'not linked' message", async () => {
    vi.mocked(resolveLmsCourseRowByIdAction).mockResolvedValue({
      error: "Could not find that saved course - it may have been removed.",
    } as never);

    const result = await generateFromSelectionAction({
      courseUrl: "",
      courseId: "does-not-exist",
      kind: "qa",
      items: [SOME_ITEM],
    });

    expect(result).toEqual({ error: "Could not find that saved course - it may have been removed." });
    expect("courseNotLinked" in (result as object)).toBe(false);
  });
});

// ── R2/R3: the four new save-and-post kinds' own generators ────────────────
//
// Each test below asserts the kind's OWN generator was called AND that every
// OTHER generator (the three pre-existing ones plus the other three new
// ones) was NOT - proving the switch dispatches to exactly one collaborator,
// never a neighbour (the exact hazard R3 exists to kill).
describe("generateFromSelectionAction - new save-and-post kinds (R2/R3)", () => {
  function expectOnlyGeneratorCalled(called: unknown) {
    const all = [
      generateLectureQaAction,
      researchCurrentEventsAction,
      generateModuleObjectivesForAssignment,
      generateAssignmentAction,
      generateKnowledgeCheckAction,
      draftAnnouncementAction,
      generateModuleIntroScriptAction,
      generateLearningResourcesForSelection,
    ];
    for (const fn of all) {
      if (fn === called) {
        expect(fn).toHaveBeenCalledTimes(1);
      } else {
        expect(fn).not.toHaveBeenCalled();
      }
    }
  }

  it("objectives: calls generateModuleObjectivesForAssignment only, and saves a version with a derived title", async () => {
    mockResolvedCourse();
    mockMaterials("grounded materials", ["a note"]);
    vi.mocked(generateModuleObjectivesForAssignment).mockResolvedValue({
      text: "# Module Objectives: Week 2\n\n## Learning Objectives\n- Do X",
    } as never);
    mockSavedArtifact();

    const result = await generateFromSelectionAction({
      courseUrl: COURSE_URL,
      kind: "objectives",
      items: [SOME_ITEM],
      moduleLabel: "Week 2",
    });

    expectOnlyGeneratorCalled(generateModuleObjectivesForAssignment);
    expect(generateModuleObjectivesForAssignment).toHaveBeenCalledWith(
      "Week 2",
      "Week 2",
      "",
      "grounded materials",
      "gemini",
      "coding"
    );
    expect(saveGeneratedArtifactVersion).toHaveBeenCalledTimes(1);
    const [, , input] = vi.mocked(saveGeneratedArtifactVersion).mock.calls[0];
    expect(input).toMatchObject({ courseId: "course-1", kind: "module-objectives", title: "Week 2 Objectives" });
    expect(input.text).toContain("Module Objectives: Week 2");
    expect(result).toEqual({ artifact: { id: "artifact-1", version: 1 }, notes: ["a note"] });
  });

  it("objectives: does not save when the generator succeeds but returns empty text", async () => {
    mockResolvedCourse();
    mockMaterials("grounded materials");
    vi.mocked(generateModuleObjectivesForAssignment).mockResolvedValue({ text: "   " } as never);

    const result = await generateFromSelectionAction({ courseUrl: COURSE_URL, kind: "objectives", items: [SOME_ITEM] });

    expect(result).toEqual({ error: "The model returned no module objectives for this selection." });
    expect(saveGeneratedArtifactVersion).not.toHaveBeenCalled();
  });

  it("objectives: propagates a generator error without saving", async () => {
    mockResolvedCourse();
    mockMaterials("grounded materials");
    vi.mocked(generateModuleObjectivesForAssignment).mockResolvedValue({ error: "LLM down" } as never);

    const result = await generateFromSelectionAction({ courseUrl: COURSE_URL, kind: "objectives", items: [SOME_ITEM] });

    expect(result).toEqual({ error: "LLM down" });
    expect(saveGeneratedArtifactVersion).not.toHaveBeenCalled();
  });

  it("assignments: calls generateAssignmentAction only, and saves a version titled from the generated content", async () => {
    mockResolvedCourse();
    mockMaterials("grounded materials");
    vi.mocked(generateAssignmentAction).mockResolvedValue({
      title: "Build a Widget Tracker",
      overview: "o",
      steps: [{ stepTitle: "Step 1", description: "d" }],
      tools: ["Trello"],
      deliverables: ["A tracker"],
    } as never);
    mockSavedArtifact();

    const result = await generateFromSelectionAction({ courseUrl: COURSE_URL, kind: "assignments", items: [SOME_ITEM] });

    expectOnlyGeneratorCalled(generateAssignmentAction);
    expect(generateAssignmentAction).toHaveBeenCalledWith("grounded materials", "", [], "gemini", "coding");
    const [, , input] = vi.mocked(saveGeneratedArtifactVersion).mock.calls[0];
    expect(input).toMatchObject({ courseId: "course-1", kind: "assignment", title: "Build a Widget Tracker" });
    expect(input.text).toContain("Build a Widget Tracker");
    expect(result).toEqual({ artifact: { id: "artifact-1", version: 1 }, notes: [] });
  });

  it("assignments: does not save when the generator returns zero steps", async () => {
    mockResolvedCourse();
    mockMaterials("grounded materials");
    vi.mocked(generateAssignmentAction).mockResolvedValue({
      title: "T",
      overview: "o",
      steps: [],
      tools: [],
      deliverables: [],
    } as never);

    const result = await generateFromSelectionAction({ courseUrl: COURSE_URL, kind: "assignments", items: [SOME_ITEM] });

    expect(result).toEqual({ error: "The model returned no assignment steps for this selection." });
    expect(saveGeneratedArtifactVersion).not.toHaveBeenCalled();
  });

  it("knowledgeChecks: calls generateKnowledgeCheckAction only, and saves BOTH text and the lossless structured questions", async () => {
    mockResolvedCourse();
    mockMaterials("grounded materials");
    const questions = [
      { prompt: "Q1", choices: [{ text: "A", correct: true, explanation: "" }, { text: "B", correct: false, explanation: "wrong" }] },
    ];
    vi.mocked(generateKnowledgeCheckAction).mockResolvedValue({ questions } as never);
    mockSavedArtifact();

    const result = await generateFromSelectionAction({
      courseUrl: COURSE_URL,
      kind: "knowledgeChecks",
      items: [SOME_ITEM],
      moduleLabel: "Week 3",
    });

    expectOnlyGeneratorCalled(generateKnowledgeCheckAction);
    expect(generateKnowledgeCheckAction).toHaveBeenCalledWith("Week 3", "", "grounded materials", "gemini", "coding");
    const [, , input] = vi.mocked(saveGeneratedArtifactVersion).mock.calls[0];
    expect(input).toMatchObject({ courseId: "course-1", kind: "knowledge-check", title: "Week 3 Knowledge Check" });
    expect(input.text).toContain("Q1: Q1");
    expect(input.structured).toEqual(questions);
    expect(result).toEqual({ artifact: { id: "artifact-1", version: 1 }, notes: [] });
  });

  it("knowledgeChecks: does not save when the generator returns zero questions", async () => {
    mockResolvedCourse();
    mockMaterials("grounded materials");
    vi.mocked(generateKnowledgeCheckAction).mockResolvedValue({ questions: [] } as never);

    const result = await generateFromSelectionAction({ courseUrl: COURSE_URL, kind: "knowledgeChecks", items: [SOME_ITEM] });

    expect(result).toEqual({ error: "The model returned no knowledge check questions for this selection." });
    expect(saveGeneratedArtifactVersion).not.toHaveBeenCalled();
  });

  it("announcements: calls draftAnnouncementAction only, grounded in the selection's materials, saving the generator's own title", async () => {
    mockResolvedCourse();
    mockMaterials("grounded materials");
    vi.mocked(draftAnnouncementAction).mockResolvedValue({ title: "Heads up!", message: "Body text" } as never);
    mockSavedArtifact();

    const result = await generateFromSelectionAction({
      courseUrl: COURSE_URL,
      kind: "announcements",
      items: [SOME_ITEM],
      moduleLabel: "Week 4",
    });

    expectOnlyGeneratorCalled(draftAnnouncementAction);
    const [instruction, provider] = vi.mocked(draftAnnouncementAction).mock.calls[0];
    expect(instruction).toContain("Week 4");
    expect(instruction).toContain("grounded materials");
    expect(provider).toBe("gemini");
    const [, , input] = vi.mocked(saveGeneratedArtifactVersion).mock.calls[0];
    expect(input).toMatchObject({ courseId: "course-1", kind: "announcement", title: "Heads up!", text: "Body text" });
    expect(result).toEqual({ artifact: { id: "artifact-1", version: 1 }, notes: [] });
  });

  it("announcements: does not save when the generator returns an empty title or message", async () => {
    mockResolvedCourse();
    mockMaterials("grounded materials");
    vi.mocked(draftAnnouncementAction).mockResolvedValue({ title: "", message: "Body" } as never);

    const result = await generateFromSelectionAction({ courseUrl: COURSE_URL, kind: "announcements", items: [SOME_ITEM] });

    expect(result).toEqual({ error: "The model returned no usable announcement for this selection." });
    expect(saveGeneratedArtifactVersion).not.toHaveBeenCalled();
  });

  it("announcements: propagates a generator error without saving", async () => {
    mockResolvedCourse();
    mockMaterials("grounded materials");
    vi.mocked(draftAnnouncementAction).mockResolvedValue({ error: "quota" } as never);

    const result = await generateFromSelectionAction({ courseUrl: COURSE_URL, kind: "announcements", items: [SOME_ITEM] });

    expect(result).toEqual({ error: "quota" });
    expect(saveGeneratedArtifactVersion).not.toHaveBeenCalled();
  });

  // docs/learning-resources-page-acceptance-criteria.md, A11/A15: "resources"
  // is "save-and-post" like the four kinds above (its commitMeta is
  // byte-identical in shape to objectives' - kinds.ts's resourcesKindConfig
  // comment), so it joins this same describe block rather than the "scripts"
  // block below (that kind is "save-version", the one genuine behavioural
  // difference between the two NON_FAMILY_KIND_IDS members).
  it("resources: calls generateLearningResourcesForSelection only, and saves a version with a derived title", async () => {
    mockResolvedCourse();
    mockMaterials("grounded materials", ["a note"]);
    vi.mocked(generateLearningResourcesForSelection).mockResolvedValue({
      text: "# Learning Resources\n\n## Review before you start\n- Concept X",
    } as never);
    mockSavedArtifact();

    const result = await generateFromSelectionAction({
      courseUrl: COURSE_URL,
      kind: "resources",
      items: [SOME_ITEM],
      moduleLabel: "Week 2",
    });

    expectOnlyGeneratorCalled(generateLearningResourcesForSelection);
    // A6: (moduleLabel, materialsText, provider, courseKind) - the sibling
    // generator's exact fixed signature.
    expect(generateLearningResourcesForSelection).toHaveBeenCalledWith("Week 2", "grounded materials", "gemini", "coding");
    expect(saveGeneratedArtifactVersion).toHaveBeenCalledTimes(1);
    const [, , input] = vi.mocked(saveGeneratedArtifactVersion).mock.calls[0];
    // A2/A11: artifactKind "learning-resources", title "<moduleLabel> Learning
    // Resources" - the literal lives at this call site, mirroring objectives'
    // own "<moduleLabel> Objectives".
    expect(input).toMatchObject({ courseId: "course-1", kind: "learning-resources", title: "Week 2 Learning Resources" });
    expect(input.text).toContain("Concept X");
    expect(result).toEqual({ artifact: { id: "artifact-1", version: 1 }, notes: ["a note"] });
  });

  it("resources: does not save when the generator succeeds but returns empty text", async () => {
    mockResolvedCourse();
    mockMaterials("grounded materials");
    vi.mocked(generateLearningResourcesForSelection).mockResolvedValue({ text: "   " } as never);

    const result = await generateFromSelectionAction({ courseUrl: COURSE_URL, kind: "resources", items: [SOME_ITEM] });

    expect(result).toEqual({ error: "The model returned no learning resources for this selection." });
    expect(saveGeneratedArtifactVersion).not.toHaveBeenCalled();
  });

  it("resources: propagates a generator error without saving", async () => {
    mockResolvedCourse();
    mockMaterials("grounded materials");
    vi.mocked(generateLearningResourcesForSelection).mockResolvedValue({ error: "LLM down" } as never);

    const result = await generateFromSelectionAction({ courseUrl: COURSE_URL, kind: "resources", items: [SOME_ITEM] });

    expect(result).toEqual({ error: "LLM down" });
    expect(saveGeneratedArtifactVersion).not.toHaveBeenCalled();
  });
});

// ── CHUNK 3d: "scripts", the eighth kind (S5-S7) ────────────────────────────
// CHUNK 3g (docs/module-intro-video-script-acceptance-criteria.md, M1-M14)
// re-geared "scripts" from a full lecture script to a module intro video
// script - this whole block moved from generateLectureScriptAction's
// `(topic, objectives, targetMinutes, provider)` signature to
// generateModuleIntroScriptAction's `(courseName, moduleLabel, materialsText,
// targetMinutes, provider)` (M9), and the length defaults/options moved from
// the lecture-length era (default 15, options up to 30) to the intro-video
// era (default 2, options [1,2,3,5] - script-length.ts).
//
// Unlike the four kinds above, "scripts" is "save-version" (like qa/
// currentEvents/decks) - it never posts to Canvas, so it gets its own
// describe block rather than joining "new save-and-post kinds". Its own
// local expectOnlyGeneratorCalled mirrors the helper above (function-scoped
// to that describe, not reachable here) rather than reusing it.
describe("generateFromSelectionAction - scripts (S5-S7)", () => {
  function expectOnlyScriptGeneratorCalled(called: unknown) {
    const all = [
      generateLectureQaAction,
      researchCurrentEventsAction,
      generateModuleObjectivesForAssignment,
      generateAssignmentAction,
      generateKnowledgeCheckAction,
      draftAnnouncementAction,
      generateModuleIntroScriptAction,
      generateLearningResourcesForSelection,
    ];
    for (const fn of all) {
      if (fn === called) {
        expect(fn).toHaveBeenCalledTimes(1);
      } else {
        expect(fn).not.toHaveBeenCalled();
      }
    }
  }

  function mockScript(script: string) {
    vi.mocked(generateModuleIntroScriptAction).mockResolvedValue({ script } as never);
  }

  it("a successful scripts generation calls generateModuleIntroScriptAction only, and saves the script verbatim with a derived title and no structured payload", async () => {
    mockResolvedCourse();
    mockMaterials("grounded materials", ["a note"]);
    mockScript("Welcome, everyone. Here's what this module covers.");
    mockSavedArtifact();

    const result = await generateFromSelectionAction({
      courseUrl: COURSE_URL,
      kind: "scripts",
      items: [SOME_ITEM],
      moduleLabel: "Week 2",
    });

    expectOnlyScriptGeneratorCalled(generateModuleIntroScriptAction);
    expect(saveGeneratedArtifactVersion).toHaveBeenCalledTimes(1);
    const [, userId, input] = vi.mocked(saveGeneratedArtifactVersion).mock.calls[0];
    expect(userId).toBe("user-1");
    // M1: artifactKind stays "lecture-script" - the sole version-history
    // query key, unchanged by the re-gear (finding 2). M9: the derived title
    // becomes "<moduleLabel> Intro Video Script".
    expect(input).toMatchObject({ courseId: "course-1", kind: "lecture-script", title: "Week 2 Intro Video Script" });
    expect(input.text).toBe("Welcome, everyone. Here's what this module covers.");
    // S9/S4: a script has no structured payload - the generic text path must
    // never write one.
    expect("structured" in input).toBe(false);
    // toMatchObject, not toEqual: the "scripts" kind's success shape now also
    // carries an optional `diag` field (Job 4, the downloadable diagnostic
    // log - src/lib/lms-generation/generation-diag.ts) that this test does
    // not otherwise exercise; asserting the two fields this test IS about,
    // rather than the whole object, is what keeps this test from re-breaking
    // every time that separately-tested field's own shape evolves.
    expect(result).toMatchObject({ artifact: { id: "artifact-1", version: 1 }, notes: ["a note"] });
  });

  it("M9: the course name and module label reach the generator as SEPARATE arguments, and stay non-empty when the module label falls back to its default and the course name is blank", async () => {
    // Drives the REAL fallback path, not a hardcoded stand-in: courseName is
    // "" and moduleLabel is omitted, so both this function's own moduleLabel
    // fallback ("the selected material") and the "scripts" branch's own
    // pass-through of course.name are exercised together.
    vi.mocked(resolveLmsCourseRowAction).mockResolvedValue({
      course: { ...FAKE_COURSE, name: "" },
    } as never);
    mockMaterials("grounded materials");
    mockScript("Script text.");
    mockSavedArtifact();

    await generateFromSelectionAction({ courseUrl: COURSE_URL, kind: "scripts", items: [SOME_ITEM] });

    const [courseNameArg, moduleLabelArg] = vi.mocked(generateModuleIntroScriptAction).mock.calls[0];
    expect(courseNameArg).toBe("");
    expect(moduleLabelArg).toBe("the selected material");
  });

  it("M9: the course name and module label reach the generator as separate arguments when both are present, not composed into one string", async () => {
    mockResolvedCourse();
    mockMaterials("grounded materials");
    mockScript("Script text.");
    mockSavedArtifact();

    await generateFromSelectionAction({
      courseUrl: COURSE_URL,
      kind: "scripts",
      items: [SOME_ITEM],
      moduleLabel: "Week 2",
    });

    const [courseNameArg, moduleLabelArg] = vi.mocked(generateModuleIntroScriptAction).mock.calls[0];
    expect(courseNameArg).toBe(FAKE_COURSE.name);
    expect(moduleLabelArg).toBe("Week 2");
  });

  it("M9: materials.materialsText is passed as generateModuleIntroScriptAction's `materialsText` argument", async () => {
    mockResolvedCourse();
    mockMaterials("grounded materials from the selection");
    mockScript("Script text.");
    mockSavedArtifact();

    await generateFromSelectionAction({ courseUrl: COURSE_URL, kind: "scripts", items: [SOME_ITEM] });

    const [, , materialsArg] = vi.mocked(generateModuleIntroScriptAction).mock.calls[0];
    expect(materialsArg).toBe("grounded materials from the selection");
  });

  it("M15: an offered targetMinutes value reaches the generator unchanged", async () => {
    mockResolvedCourse();
    mockMaterials("grounded materials");
    mockScript("Script text.");
    mockSavedArtifact();

    await generateFromSelectionAction({
      courseUrl: COURSE_URL,
      kind: "scripts",
      items: [SOME_ITEM],
      targetMinutes: 3,
    });

    const [, , , minutesArg] = vi.mocked(generateModuleIntroScriptAction).mock.calls[0];
    expect(minutesArg).toBe(3);
  });

  it("M15: an absent targetMinutes resolves to 2 (DEFAULT_SCRIPT_MINUTES), not generateModuleIntroScriptAction's own silent out-of-range fallback", async () => {
    mockResolvedCourse();
    mockMaterials("grounded materials");
    mockScript("Script text.");
    mockSavedArtifact();

    await generateFromSelectionAction({ courseUrl: COURSE_URL, kind: "scripts", items: [SOME_ITEM] });

    const [, , , minutesArg] = vi.mocked(generateModuleIntroScriptAction).mock.calls[0];
    expect(minutesArg).toBe(2);
  });

  it("M15: an unrecognised targetMinutes (50 - in generateModuleIntroScriptAction's own 1-30 range but never one of SCRIPT_LENGTH_OPTIONS [1,2,3,5]) resolves to 2", async () => {
    mockResolvedCourse();
    mockMaterials("grounded materials");
    mockScript("Script text.");
    mockSavedArtifact();

    await generateFromSelectionAction({
      courseUrl: COURSE_URL,
      kind: "scripts",
      items: [SOME_ITEM],
      targetMinutes: 50,
    });

    const [, , , minutesArg] = vi.mocked(generateModuleIntroScriptAction).mock.calls[0];
    expect(minutesArg).toBe(2);
  });

  it("S7: the saved prompt records the minutes actually used, not the raw (possibly unrecognised) request", async () => {
    mockResolvedCourse();
    mockMaterials("grounded materials");
    mockScript("Script text.");
    mockSavedArtifact();

    await generateFromSelectionAction({
      courseUrl: COURSE_URL,
      kind: "scripts",
      items: [SOME_ITEM],
      targetMinutes: 50,
    });

    const [, , input] = vi.mocked(saveGeneratedArtifactVersion).mock.calls[0];
    // FROZEN LITERAL ORACLE (consistent with intro-script-prompt.test.ts's own
    // "states the target word count and minute length together" fix for the
    // identical class of defect): this used to be `expect(input.prompt).
    // toContain("2")`, which passes for ANY number that merely contains the
    // digit "2" - a bug that hardcoded "targeting 12 minutes" or "targeting
    // 20 minutes" regardless of the resolved value would still satisfy it,
    // and so would fixture text like "Week 2" elsewhere in this suite.
    // Pinning the exact "targeting 2 minutes" fragment (scriptsKindConfig.
    // buildPrompt, src/lib/lms-generation/kinds.ts) is what makes the
    // assertion actually depend on the RESOLVED minutes value, not merely
    // some digit "2" appearing anywhere in the saved prompt.
    expect(input.prompt).toContain("targeting 2 minutes");
    expect(input.prompt).not.toContain("50");
  });

  it("propagates a generator error without saving a version", async () => {
    mockResolvedCourse();
    mockMaterials("grounded materials");
    vi.mocked(generateModuleIntroScriptAction).mockResolvedValue({ error: "LLM quota exhausted" } as never);

    const result = await generateFromSelectionAction({ courseUrl: COURSE_URL, kind: "scripts", items: [SOME_ITEM] });

    // toMatchObject: see the "no structured payload" test's own comment
    // above for why - a `diag` field (Job 4) is now also present.
    expect(result).toMatchObject({ error: "LLM quota exhausted" });
    expect(saveGeneratedArtifactVersion).not.toHaveBeenCalled();
  });

  it("does not save a version when the generator succeeds but returns an empty/whitespace-only script", async () => {
    mockResolvedCourse();
    mockMaterials("grounded materials");
    mockScript("   ");

    const result = await generateFromSelectionAction({ courseUrl: COURSE_URL, kind: "scripts", items: [SOME_ITEM] });

    // M3: emptyMessage now names an intro video script, not a lecture script.
    // toMatchObject: see the "no structured payload" test's own comment
    // above for why - a `diag` field (Job 4) is now also present, and THIS
    // is precisely the case (a "successful" call with empty text) that field
    // exists to make diagnosable.
    expect(result).toMatchObject({ error: "The model returned no intro video script for this selection." });
    expect(saveGeneratedArtifactVersion).not.toHaveBeenCalled();
  });

  // M14: for an export-sourced selection (no moduleIds, resolved via
  // courseId - the by-id path that needs no Canvas identity at all), the
  // branch reaches saveGeneratedArtifactVersion with NO reachable Canvas
  // call: listCourseContentAction is only ever invoked to expand a
  // whole-module (moduleIds) selection, which an export selection never
  // sends (materials.ts's own expandModuleSelection pre-expands export
  // module picks client-side - see this file's header comment), and the
  // live-fetcher actions gatherSelectionMaterials wraps as LIVE_FETCHERS are
  // never called directly by this branch either. gatherSelectionMaterials
  // itself is mocked here (its offline/no-I/O behaviour for export items,
  // via gatherExportItem, is covered by materials.test.ts per this file's
  // own header comment), so this test's job is narrower and complementary:
  // prove lms-generation.ts's OWN code path never reaches for Canvas on this
  // selection, which is exactly what let the instructor's reported "No saved
  // course is linked" failure happen for an imported course with no Canvas
  // connection at all.
  //
  // STRENGTHENED (adversarial review, defect 6): the previous version of
  // this test asserted only that four enumerated mocks were not called,
  // while gatherSelectionMaterials - the function that would really make the
  // Canvas call for a live selection - is itself mocked, and nine other
  // mocked Canvas actions went unasserted (a stray call to any of them would
  // have passed silently). This version adds the POSITIVE half - proving
  // gatherSelectionMaterials was actually reached, and with the export item,
  // not a live one - and widens the negative half to every mocked Canvas
  // action this file knows about, built once as ALL_MOCKED_CANVAS_ACTIONS
  // rather than four hand-picked ones.
  it("M14: an export-sourced scripts generation (courseId, no moduleIds) hands gatherSelectionMaterials export-sourced items and never calls any mocked Canvas action", async () => {
    mockResolvedCourseById();
    mockMaterials("grounded materials from the cartridge", ["a note"]);
    mockScript("Welcome, everyone. Here's what this module covers.");
    mockSavedArtifact();

    const exportItem = {
      source: "export" as const,
      key: "export:m1:i1",
      moduleRef: "m1",
      item: { title: "Unit 2 Chapter: Threats", type: "WikiPage", body: "Chapter text." },
    };

    const result = await generateFromSelectionAction({
      courseUrl: "",
      courseId: "export-course-1",
      kind: "scripts",
      items: [exportItem],
      moduleLabel: "Unit 2",
    });

    expect(resolveLmsCourseRowByIdAction).toHaveBeenCalledWith("export-course-1");
    expect(resolveLmsCourseRowAction).not.toHaveBeenCalled();

    // THE POSITIVE HALF: gatherSelectionMaterials genuinely received the
    // export item, source-tagged "export" - not silently skipped, and not
    // fed a live item instead.
    expect(gatherSelectionMaterials).toHaveBeenCalledTimes(1);
    const [itemsArg] = vi.mocked(gatherSelectionMaterials).mock.calls[0] as [Array<{ source: string }>, unknown];
    expect(itemsArg).toHaveLength(1);
    expect(itemsArg.every((item) => item.source === "export")).toBe(true);

    // THE NEGATIVE HALF: every real Canvas write/read action this file
    // mocks, built once - not the four this test used to hand-pick - stays
    // uncalled. expandModuleSelection is included too: an export selection
    // is already expanded client-side, so this action must not re-expand it.
    const ALL_MOCKED_CANVAS_ACTIONS = [
      listCourseContentAction,
      createModuleAction,
      createModuleItemAction,
      createCourseAssignmentAction,
      getPageAction,
      previewFileAction,
      createPageAction,
      updatePageAction,
      createGradableAction,
      createQuizQuestionAction,
      bulkUpdateAction,
      createAnnouncementAction,
      expandModuleSelection,
    ];
    for (const fn of ALL_MOCKED_CANVAS_ACTIONS) {
      expect(fn).not.toHaveBeenCalled();
    }
    expect("error" in result).toBe(false);
  });
});

// ── R3's own regression test ────────────────────────────────────────────────
describe("generateFromSelectionAction - R3 unhandled-kind guard", () => {
  it("THE R3 REGRESSION TEST: an unrecognized kind fails LOUDLY by name and calls no generator at all", async () => {
    mockResolvedCourse();
    mockMaterials("grounded materials");

    const result = await generateFromSelectionAction({
      courseUrl: COURSE_URL,
      // A kind the switch has no case for - only reachable by bypassing the
      // type system, exactly like a future/renamed OUTPUT_FAMILIES entry
      // reaching this code at runtime would be.
      kind: "bogusKind" as unknown as GenerationKindId,
      items: [SOME_ITEM],
    });

    expect(result).toEqual({
      error: expect.stringContaining('no generator is wired for kind "bogusKind"'),
    });
    expect(generateLectureQaAction).not.toHaveBeenCalled();
    expect(researchCurrentEventsAction).not.toHaveBeenCalled();
    expect(generateModuleObjectivesForAssignment).not.toHaveBeenCalled();
    expect(generateAssignmentAction).not.toHaveBeenCalled();
    expect(generateKnowledgeCheckAction).not.toHaveBeenCalled();
    expect(draftAnnouncementAction).not.toHaveBeenCalled();
    expect(generateModuleIntroScriptAction).not.toHaveBeenCalled();
    expect(generateLearningResourcesForSelection).not.toHaveBeenCalled();
    expect(saveGeneratedArtifactVersion).not.toHaveBeenCalled();
  });
});

// postGeneratedArtifactAction's own describe block (P1-P5 coverage) moved to
// lms-generation.post-and-list.test.ts - see the comment above the AC1/AC2
// defect-fix describe block earlier in this file, and that file's own
// header comment, for what moved and why.

