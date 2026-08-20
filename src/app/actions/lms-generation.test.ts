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
// by call, not by a real database. callLlm (used only by the qa/currentEvents
// refine path) is mocked; describeEmptyLlmText/describeLlmFailure are left
// real via importActual so their exact wording is exercised for real.
// reviseLectureSlidesAction is the deck-specific refine (lecture-plans.ts) -
// mocked the same way, at the exact specifier lms-generation.ts imports it
// from.
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
vi.mock("./lecture-plans", () => ({ reviseLectureSlidesAction: vi.fn() }));
vi.mock("./module-objectives-generator", () => ({ generateModuleObjectivesForAssignment: vi.fn() }));
vi.mock("./llm-content", () => ({ generateAssignmentAction: vi.fn() }));
vi.mock("./knowledge-check", () => ({ generateKnowledgeCheckAction: vi.fn() }));
vi.mock("./messaging", () => ({ draftAnnouncementAction: vi.fn() }));
// CHUNK 3d adds "scripts" - its own generator, generateLectureScriptAction
// (src/app/actions/media.ts), mocked at the exact specifier lms-generation.ts
// imports it from, same "inert mock fails loudly" reason as every other
// generator above.
vi.mock("./media", () => ({ generateLectureScriptAction: vi.fn() }));
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
vi.mock("@/lib/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm")>("@/lib/llm");
  return { ...actual, callLlm: vi.fn() };
});

import { requireOwner } from "@/lib/supabase/auth";
import { resolveLmsCourseRowAction, resolveLmsCourseRowByIdAction } from "./lms-syllabus-buttons";
import { generateLectureQaAction } from "./course-planning-lecture";
import { researchCurrentEventsAction } from "./current-events";
import { reviseLectureSlidesAction } from "./lecture-plans";
import { generateModuleObjectivesForAssignment } from "./module-objectives-generator";
import { generateAssignmentAction } from "./llm-content";
import { generateKnowledgeCheckAction } from "./knowledge-check";
import { draftAnnouncementAction } from "./messaging";
import { generateLectureScriptAction } from "./media";
import { listCourseContentAction, createModuleAction, createModuleItemAction, createCourseAssignmentAction } from "./canvas-modules";
import {
  createPageAction,
  updatePageAction,
  createGradableAction,
  createQuizQuestionAction,
  bulkUpdateAction,
} from "./canvas-files-bulk";
import { createAnnouncementAction } from "./canvas-inbox";
import { gatherSelectionMaterials, expandModuleSelection } from "@/lib/lms-generation/materials";
import { saveGeneratedArtifactVersion, listGeneratedArtifactVersions } from "@/lib/supabase/generated-artifacts";
import { callLlm } from "@/lib/llm";
import {
  generateFromSelectionAction,
  refineGeneratedArtifactAction,
  listGeneratedArtifactVersionsAction,
  postGeneratedArtifactAction,
} from "./lms-generation";
import type { GenerationKindId } from "@/lib/lms-generation/kinds";

const COURSE_URL = "https://canvas.example.edu/courses/100";

const FAKE_COURSE = {
  id: "course-1",
  name: "Intro to Widgets",
  canvasUrl: COURSE_URL,
  institution: "MIT",
  courseKind: null,
};

const NOT_LINKED_ERROR = {
  error: `No saved course is linked to ${COURSE_URL}. Set this course's Canvas URL on its course row, then try again.`,
};

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

function mockOwner() {
  vi.mocked(requireOwner).mockResolvedValue({ id: "user-1", email: "owner@example.com" } as never);
}

function mockResolvedCourse() {
  vi.mocked(resolveLmsCourseRowAction).mockResolvedValue({ course: FAKE_COURSE } as never);
}

// AC1/AC2 defect fix (docs/REGRESSION.md - "generate from an export
// selection" defect): a saved course with no Canvas connection at all -
// `canvasUrl`/`institution` both absent, unlike FAKE_COURSE above. Only
// resolveLmsCourseRowByIdAction (the courseId path) can ever resolve one of
// these; resolveLmsCourseRowAction (the courseUrl path) would never see it.
const FAKE_EXPORT_ONLY_COURSE = {
  id: "export-course-1",
  name: "WNCC Intro to Widgets",
  canvasUrl: null,
  institution: null,
  courseKind: null,
};

function mockResolvedCourseById() {
  vi.mocked(resolveLmsCourseRowByIdAction).mockResolvedValue({ course: FAKE_EXPORT_ONLY_COURSE } as never);
}

function mockMaterials(materialsText: string, notes: string[] = []) {
  vi.mocked(gatherSelectionMaterials).mockResolvedValue({ materialsText, notes } as never);
}

function mockSavedArtifact() {
  vi.mocked(saveGeneratedArtifactVersion).mockResolvedValue({ id: "artifact-1", version: 1 } as never);
}

const FAKE_MODULES = [
  { id: 10, name: "Week 1", position: 1, published: true, itemsCount: 1, items: [] },
];

function mockCourseContent(modules: unknown = FAKE_MODULES) {
  vi.mocked(listCourseContentAction).mockResolvedValue({
    courseName: "Intro to Widgets",
    modules,
    pages: [],
  } as never);
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

describe("refineGeneratedArtifactAction", () => {
  it("rejects blank current text without resolving the course or calling the model", async () => {
    const result = await refineGeneratedArtifactAction({
      courseUrl: COURSE_URL,
      kind: "qa",
      currentText: "   ",
      instructions: "make it shorter",
    });
    expect(result).toEqual({ error: "There is no generated document to refine." });
    expect(resolveLmsCourseRowAction).not.toHaveBeenCalled();
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("rejects blank instructions without calling the model", async () => {
    const result = await refineGeneratedArtifactAction({
      courseUrl: COURSE_URL,
      kind: "qa",
      currentText: "Q1: ...",
      instructions: "   ",
    });
    expect(result).toEqual({ error: "Say what you would like changed." });
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("the course-not-linked path returns the named error and calls no model", async () => {
    vi.mocked(resolveLmsCourseRowAction).mockResolvedValue(NOT_LINKED_ERROR as never);
    const result = await refineGeneratedArtifactAction({
      courseUrl: COURSE_URL,
      kind: "qa",
      currentText: "Q1: ...",
      instructions: "make it shorter",
    });
    expect(result).toEqual({ ...NOT_LINKED_ERROR, courseNotLinked: true });
    expect(callLlm).not.toHaveBeenCalled();
    expect(saveGeneratedArtifactVersion).not.toHaveBeenCalled();
  });

  it("saves a NEW version from the revised text on success", async () => {
    mockResolvedCourse();
    vi.mocked(callLlm).mockResolvedValue({ ok: true, text: "Revised document body", status: 200, body: "" } as never);
    mockSavedArtifact();

    const result = await refineGeneratedArtifactAction({
      courseUrl: COURSE_URL,
      kind: "qa",
      currentText: "Q1: old",
      instructions: "make it shorter",
    });

    expect(saveGeneratedArtifactVersion).toHaveBeenCalledTimes(1);
    const [, , input] = vi.mocked(saveGeneratedArtifactVersion).mock.calls[0];
    expect(input).toMatchObject({ courseId: "course-1", kind: "anticipated-qa", text: "Revised document body" });
    expect(result).toEqual({ artifact: { id: "artifact-1", version: 1 } });
  });

  it("sends both the current document and the instructions to the model", async () => {
    mockResolvedCourse();
    vi.mocked(callLlm).mockResolvedValue({ ok: true, text: "revised", status: 200, body: "" } as never);
    mockSavedArtifact();

    await refineGeneratedArtifactAction({
      courseUrl: COURSE_URL,
      kind: "qa",
      currentText: "Q1: original question",
      instructions: "add a question about grading",
    });

    const prompt = String(
      (vi.mocked(callLlm).mock.calls[0][0] as { contents: Array<{ parts: Array<{ text: string }> }> }).contents[0]
        .parts[0].text
    );
    expect(prompt).toContain("Q1: original question");
    expect(prompt).toContain("add a question about grading");
  });

  it("an empty LLM response produces a described error, not a parse error", async () => {
    mockResolvedCourse();
    vi.mocked(callLlm).mockResolvedValue({ ok: true, text: "   ", status: 200, body: "", finishReason: "MAX_TOKENS" } as never);

    const result = await refineGeneratedArtifactAction({
      courseUrl: COURSE_URL,
      kind: "qa",
      currentText: "Q1: old",
      instructions: "make it shorter",
    });

    expect(result).toEqual({
      error: "Refine Anticipated lecture Q&A: the model returned an empty response (finishReason: MAX_TOKENS).",
    });
    expect(String((result as { error: string }).error)).not.toContain("parse");
    expect(saveGeneratedArtifactVersion).not.toHaveBeenCalled();
  });

  it("reports a described HTTP failure without saving a version", async () => {
    mockResolvedCourse();
    vi.mocked(callLlm).mockResolvedValue({ ok: false, status: 503, body: "upstream unavailable" } as never);

    const result = await refineGeneratedArtifactAction({
      courseUrl: COURSE_URL,
      kind: "qa",
      currentText: "Q1: old",
      instructions: "make it shorter",
    });

    expect(result).toEqual({ error: "Refine Anticipated lecture Q&A: HTTP 503 — upstream unavailable" });
    expect(saveGeneratedArtifactVersion).not.toHaveBeenCalled();
  });
});

describe("refineGeneratedArtifactAction - decks", () => {
  const DECK_TEXT = "# Week 3: Loops\n\n## Loops\n- for\n- while";
  const DECK_STRUCTURED = [{ title: "Loops", bullets: ["for", "while"] }];

  it("REFINE SAVES A NEW VERSION: uses reviseLectureSlidesAction (not callLlm) and saves BOTH text and structured", async () => {
    mockResolvedCourse();
    vi.mocked(reviseLectureSlidesAction).mockResolvedValue({
      slides: [{ title: "Loops", bullets: ["for", "while", "do-while"] }],
    } as never);
    mockSavedArtifact();

    const result = await refineGeneratedArtifactAction({
      courseUrl: COURSE_URL,
      kind: "decks",
      currentText: DECK_TEXT,
      currentTitle: "Week 3: Loops",
      currentStructured: DECK_STRUCTURED,
      instructions: "add a do-while bullet",
    });

    expect(reviseLectureSlidesAction).toHaveBeenCalledWith(
      "Week 3: Loops",
      DECK_STRUCTURED,
      "add a do-while bullet",
      "gemini"
    );
    expect(callLlm).not.toHaveBeenCalled();
    expect(saveGeneratedArtifactVersion).toHaveBeenCalledTimes(1);
    const [, , input] = vi.mocked(saveGeneratedArtifactVersion).mock.calls[0];
    expect(input).toMatchObject({ courseId: "course-1", kind: "deck", title: "Week 3: Loops" });
    expect(input.text).toBe("# Week 3: Loops\n\n## Loops\n- for\n- while\n- do-while");
    expect(input.structured).toEqual([{ title: "Loops", bullets: ["for", "while", "do-while"] }]);
    expect(result).toEqual({ artifact: { id: "artifact-1", version: 1 }, notes: [] });
  });

  it("falls back to 'Presentation' when no title was carried on the version being refined", async () => {
    mockResolvedCourse();
    vi.mocked(reviseLectureSlidesAction).mockResolvedValue({ slides: DECK_STRUCTURED } as never);
    mockSavedArtifact();

    await refineGeneratedArtifactAction({
      courseUrl: COURSE_URL,
      kind: "decks",
      currentText: DECK_TEXT,
      currentTitle: null,
      currentStructured: DECK_STRUCTURED,
      instructions: "shorten it",
    });

    expect(reviseLectureSlidesAction).toHaveBeenCalledWith("Presentation", DECK_STRUCTURED, "shorten it", "gemini");
  });

  it("SABOTAGE TARGET: refuses when the version being refined has no usable structured slides, without calling the model", async () => {
    mockResolvedCourse();

    const result = await refineGeneratedArtifactAction({
      courseUrl: COURSE_URL,
      kind: "decks",
      currentText: DECK_TEXT,
      currentTitle: "Week 3: Loops",
      currentStructured: null,
      instructions: "shorten it",
    });

    expect(result).toEqual({ error: "There is no generated deck to refine." });
    expect(reviseLectureSlidesAction).not.toHaveBeenCalled();
    expect(saveGeneratedArtifactVersion).not.toHaveBeenCalled();
  });

  it("propagates a reviseLectureSlidesAction error without saving a version", async () => {
    mockResolvedCourse();
    vi.mocked(reviseLectureSlidesAction).mockResolvedValue({ error: "LLM quota exhausted" } as never);

    const result = await refineGeneratedArtifactAction({
      courseUrl: COURSE_URL,
      kind: "decks",
      currentText: DECK_TEXT,
      currentTitle: "Week 3: Loops",
      currentStructured: DECK_STRUCTURED,
      instructions: "shorten it",
    });

    expect(result).toEqual({ error: "LLM quota exhausted" });
    expect(saveGeneratedArtifactVersion).not.toHaveBeenCalled();
  });

  it("does not save a version when the revision succeeds but returns zero slides", async () => {
    mockResolvedCourse();
    vi.mocked(reviseLectureSlidesAction).mockResolvedValue({ slides: [] } as never);

    const result = await refineGeneratedArtifactAction({
      courseUrl: COURSE_URL,
      kind: "decks",
      currentText: DECK_TEXT,
      currentTitle: "Week 3: Loops",
      currentStructured: DECK_STRUCTURED,
      instructions: "remove everything",
    });

    expect(result).toEqual({ error: "The model returned no slides for this selection." });
    expect(saveGeneratedArtifactVersion).not.toHaveBeenCalled();
  });

  it("MERGES the revision back over the version being refined, so notes/graphic reviseLectureSlidesAction's own contract never returns survive", async () => {
    mockResolvedCourse();
    const currentStructured = [
      {
        title: "Loops",
        bullets: ["for", "while"],
        notes: "explain iteration before moving on",
        graphic: { kind: "table", headers: ["x"], rows: [["1"]] },
      },
    ];
    // Exactly what reviseLectureSlidesAction really returns: no notes/graphic
    // keys at all, since its own prompt never asks for them.
    vi.mocked(reviseLectureSlidesAction).mockResolvedValue({
      slides: [{ title: "Loops", bullets: ["for", "while", "do-while"] }],
    } as never);
    mockSavedArtifact();

    const result = await refineGeneratedArtifactAction({
      courseUrl: COURSE_URL,
      kind: "decks",
      currentText: DECK_TEXT,
      currentTitle: "Week 3: Loops",
      currentStructured,
      instructions: "add a do-while bullet",
    });

    const [, , input] = vi.mocked(saveGeneratedArtifactVersion).mock.calls[0];
    expect(input.structured).toEqual([
      {
        title: "Loops",
        bullets: ["for", "while", "do-while"],
        notes: "explain iteration before moving on",
        graphic: { kind: "table", headers: ["x"], rows: [["1"]] },
      },
    ]);
    expect(result).toEqual({ artifact: { id: "artifact-1", version: 1 }, notes: [] });
  });

  it("SABOTAGE TARGET: reports (and does not resurrect) a slide's notes when the revision drops that slide entirely", async () => {
    mockResolvedCourse();
    const currentStructured = [
      { title: "A", bullets: ["a1"], notes: "noteA" },
      { title: "B", bullets: ["b1"], notes: "noteB" },
    ];
    vi.mocked(reviseLectureSlidesAction).mockResolvedValue({
      slides: [{ title: "A", bullets: ["a1-edited"] }],
    } as never);
    mockSavedArtifact();

    const result = await refineGeneratedArtifactAction({
      courseUrl: COURSE_URL,
      kind: "decks",
      currentText: DECK_TEXT,
      currentTitle: "Week 3: Loops",
      currentStructured,
      instructions: "remove slide B",
    });

    const [, , input] = vi.mocked(saveGeneratedArtifactVersion).mock.calls[0];
    expect(input.structured).toEqual([{ title: "A", bullets: ["a1-edited"], notes: "noteA" }]);
    if ("error" in result) throw new Error("expected success");
    expect(result.notes).toHaveLength(1);
    expect(result.notes![0]).toContain("B");
  });
});

// ── Bug fix: refine must carry a posting kind's title/structured forward ───
//
// generateFromSelectionAction sets a real `title` for objectives/assignments/
// knowledgeChecks/announcements (and `structured` for knowledgeChecks), but
// the ORIGINAL refineGeneratedArtifactAction saved only `{text, prompt}` for
// every kind except decks - so refining any of these four kinds silently
// dropped the title (degrading it to the generic kind label at post time,
// postGeneratedArtifactAction's own `title = artifact.title ?? "" ||
// config.label`) and, for knowledgeChecks, dropped `structured` entirely,
// which made buildPostContentForKind's "quiz" branch refuse to ever post the
// refined version - a genuine dead end. docs/REGRESSION.md entry 266 checks
// 6-8 record the identical class of bug already caught for decks.
describe("refineGeneratedArtifactAction - title carry-forward (objectives/assignments/announcements)", () => {
  it("objectives: refine preserves the exact title from the version being refined", async () => {
    mockResolvedCourse();
    vi.mocked(callLlm).mockResolvedValue({ ok: true, text: "Revised objectives text", status: 200, body: "" } as never);
    mockSavedArtifact();

    const result = await refineGeneratedArtifactAction({
      courseUrl: COURSE_URL,
      kind: "objectives",
      currentText: "# Module Objectives: Week 2\n\n- Do X",
      currentTitle: "Week 2 Objectives",
      instructions: "add a note about grading",
    });

    expect(saveGeneratedArtifactVersion).toHaveBeenCalledTimes(1);
    const [, , input] = vi.mocked(saveGeneratedArtifactVersion).mock.calls[0];
    // SABOTAGE TARGET: dropping the title carry-forward saves `title:
    // undefined`, which saveGeneratedArtifactVersion stores as `null` - this
    // assertion is on the EXACT string, not merely "is not null".
    expect(input.title).toBe("Week 2 Objectives");
    expect(input.text).toBe("Revised objectives text");
    expect(result).toEqual({ artifact: { id: "artifact-1", version: 1 } });
  });

  it("assignments: refine preserves the exact title from the version being refined", async () => {
    mockResolvedCourse();
    vi.mocked(callLlm).mockResolvedValue({ ok: true, text: "Revised assignment text", status: 200, body: "" } as never);
    mockSavedArtifact();

    await refineGeneratedArtifactAction({
      courseUrl: COURSE_URL,
      kind: "assignments",
      currentText: "# Build a Widget Tracker\n\n## Overview\no",
      currentTitle: "Build a Widget Tracker",
      instructions: "add a stretch goal",
    });

    const [, , input] = vi.mocked(saveGeneratedArtifactVersion).mock.calls[0];
    expect(input.title).toBe("Build a Widget Tracker");
  });

  it("announcements: refine does not degrade the title to the generic kind label", async () => {
    mockResolvedCourse();
    vi.mocked(callLlm).mockResolvedValue({ ok: true, text: "Revised announcement body", status: 200, body: "" } as never);
    mockSavedArtifact();

    await refineGeneratedArtifactAction({
      courseUrl: COURSE_URL,
      kind: "announcements",
      currentText: "Body text",
      currentTitle: "Heads up!",
      instructions: "make it friendlier",
    });

    const [, , input] = vi.mocked(saveGeneratedArtifactVersion).mock.calls[0];
    expect(input.title).toBe("Heads up!");
    // The exact defect this fix closes: the generic label ("Announcement")
    // silently standing in for the real title once the version is posted.
    expect(input.title).not.toBe("Announcement");
  });

  it("S8: scripts refine preserves the exact title from the version being refined, and writes no structured payload", async () => {
    mockResolvedCourse();
    vi.mocked(callLlm).mockResolvedValue({ ok: true, text: "Revised script text", status: 200, body: "" } as never);
    mockSavedArtifact();

    const result = await refineGeneratedArtifactAction({
      courseUrl: COURSE_URL,
      kind: "scripts",
      currentText: "Original script text.",
      currentTitle: "Week 2 Lecture Script",
      instructions: "make the opening hook punchier",
    });

    expect(saveGeneratedArtifactVersion).toHaveBeenCalledTimes(1);
    const [, , input] = vi.mocked(saveGeneratedArtifactVersion).mock.calls[0];
    // SABOTAGE TARGET: leaving "scripts" out of TITLED_GENERIC_KINDS saves
    // `title: undefined` here instead - this asserts the exact saved title,
    // not merely that the constant's array contains the string "scripts".
    expect(input.title).toBe("Week 2 Lecture Script");
    expect(input.text).toBe("Revised script text");
    // S9: the generic text refine path must never write `structured` for a
    // kind that has none.
    expect("structured" in input).toBe(false);
    expect(result).toEqual({ artifact: { id: "artifact-1", version: 1 } });
  });

  it("qa/currentEvents refine still never sets a title, even when a caller sends currentTitle (unchanged behaviour)", async () => {
    mockResolvedCourse();
    vi.mocked(callLlm).mockResolvedValue({ ok: true, text: "revised", status: 200, body: "" } as never);
    mockSavedArtifact();

    await refineGeneratedArtifactAction({
      courseUrl: COURSE_URL,
      kind: "qa",
      currentText: "Q1: old",
      currentTitle: "Should never be written",
      instructions: "shorten",
    });

    const [, , input] = vi.mocked(saveGeneratedArtifactVersion).mock.calls[0];
    expect("title" in input).toBe(false);
  });
});

describe("refineGeneratedArtifactAction - knowledgeChecks", () => {
  const CURRENT_QUESTIONS = [
    {
      prompt: "What is a variable?",
      choices: [
        { text: "A named storage location", correct: true, explanation: "" },
        { text: "A loop", correct: false, explanation: "A loop repeats code, it does not store a value." },
      ],
    },
  ];

  it("THE DEAD-END REGRESSION: refine saves BOTH text and a NON-EMPTY structured, and the saved version can then be posted", async () => {
    mockResolvedCourse();
    const revisedQuestions = [
      {
        prompt: "What is a variable, revised?",
        choices: [
          { text: "A named storage location", correct: true },
          { text: "A loop", correct: false, explanation: "A loop repeats code, it does not store a value." },
        ],
      },
    ];
    vi.mocked(callLlm).mockResolvedValue({
      ok: true,
      text: JSON.stringify({ questions: revisedQuestions }),
      status: 200,
      body: "",
    } as never);
    mockSavedArtifact();

    const result = await refineGeneratedArtifactAction({
      courseUrl: COURSE_URL,
      kind: "knowledgeChecks",
      currentText: "Q1: What is a variable?\n[x] A named storage location",
      currentTitle: "Week 3 Knowledge Check",
      currentStructured: CURRENT_QUESTIONS,
      instructions: "reword question 1",
    });

    expect(callLlm).toHaveBeenCalledTimes(1);
    expect(saveGeneratedArtifactVersion).toHaveBeenCalledTimes(1);
    const [, , input] = vi.mocked(saveGeneratedArtifactVersion).mock.calls[0];
    expect(input.title).toBe("Week 3 Knowledge Check");
    expect(input.structured).toEqual(revisedQuestions);
    expect(input.text).toContain("What is a variable, revised?");
    expect(result).toEqual({ artifact: { id: "artifact-1", version: 1 } });

    // THE REGRESSION THAT MATTERS MOST: prove the saved version is actually
    // postable, not merely that `structured` is non-empty in isolation.
    // Simulates the DB returning exactly this refined row, then drives it
    // through the REAL postGeneratedArtifactAction -> buildPostContentForKind
    // "quiz" branch, which refuses (named error, never calls
    // createGradableAction) any version with no usable saved questions -
    // exactly the dead end the original bug produced on every knowledgeChecks
    // refine.
    vi.mocked(listGeneratedArtifactVersions).mockResolvedValue([
      {
        id: "kc-refined-1",
        courseId: "course-1",
        kind: "knowledge-check",
        version: 2,
        isCurrent: true,
        title: input.title ?? null,
        text: input.text,
        structured: input.structured ?? null,
        prompt: input.prompt,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    ] as never);
    mockCourseContent();
    vi.mocked(createGradableAction).mockResolvedValue({ id: 88 } as never);
    vi.mocked(createQuizQuestionAction).mockResolvedValue({ question: {} } as never);
    vi.mocked(bulkUpdateAction).mockResolvedValue({ updated: 1, failures: [] } as never);
    vi.mocked(createModuleItemAction).mockResolvedValue({ ok: true } as never);

    const postResult = await postGeneratedArtifactAction({
      courseUrl: COURSE_URL,
      kind: "knowledgeChecks",
      artifactId: "kc-refined-1",
      target: { kind: "existing", moduleId: 10 },
    });

    expect(createGradableAction).toHaveBeenCalled();
    if ("error" in postResult) throw new Error(`expected a post summary, got error: ${postResult.error}`);
    expect(postResult.summary.status).toBe("success");
  });

  it("SABOTAGE TARGET: refuses when the version being refined has no usable structured questions, without calling the model", async () => {
    mockResolvedCourse();

    const result = await refineGeneratedArtifactAction({
      courseUrl: COURSE_URL,
      kind: "knowledgeChecks",
      currentText: "Q1: ...",
      currentTitle: "Week 3 Knowledge Check",
      currentStructured: null,
      instructions: "shorten it",
    });

    expect(result).toEqual({ error: "There is no generated knowledge check to refine." });
    expect(callLlm).not.toHaveBeenCalled();
    expect(saveGeneratedArtifactVersion).not.toHaveBeenCalled();
  });

  it("SABOTAGE TARGET: a model response with no usable questions errors by name rather than saving an empty version", async () => {
    mockResolvedCourse();
    vi.mocked(callLlm).mockResolvedValue({
      ok: true,
      text: JSON.stringify({ questions: [] }),
      status: 200,
      body: "",
    } as never);

    const result = await refineGeneratedArtifactAction({
      courseUrl: COURSE_URL,
      kind: "knowledgeChecks",
      currentText: "Q1: ...",
      currentTitle: "Week 3 Knowledge Check",
      currentStructured: CURRENT_QUESTIONS,
      instructions: "remove everything",
    });

    expect(result).toEqual({ error: "The revised knowledge check has no usable questions - nothing was saved." });
    expect(saveGeneratedArtifactVersion).not.toHaveBeenCalled();
  });

  it("a malformed (non-JSON) model response also errors by name rather than saving an empty version", async () => {
    mockResolvedCourse();
    vi.mocked(callLlm).mockResolvedValue({ ok: true, text: "not json at all", status: 200, body: "" } as never);

    const result = await refineGeneratedArtifactAction({
      courseUrl: COURSE_URL,
      kind: "knowledgeChecks",
      currentText: "Q1: ...",
      currentTitle: "Week 3 Knowledge Check",
      currentStructured: CURRENT_QUESTIONS,
      instructions: "shorten it",
    });

    expect(result).toEqual({ error: "The revised knowledge check has no usable questions - nothing was saved." });
    expect(saveGeneratedArtifactVersion).not.toHaveBeenCalled();
  });

  it("propagates a described LLM failure without saving a version", async () => {
    mockResolvedCourse();
    vi.mocked(callLlm).mockResolvedValue({ ok: false, status: 503, body: "upstream unavailable" } as never);

    const result = await refineGeneratedArtifactAction({
      courseUrl: COURSE_URL,
      kind: "knowledgeChecks",
      currentText: "Q1: ...",
      currentTitle: "Week 3 Knowledge Check",
      currentStructured: CURRENT_QUESTIONS,
      instructions: "shorten it",
    });

    expect(result).toEqual({ error: "Refine Knowledge check: HTTP 503 — upstream unavailable" });
    expect(saveGeneratedArtifactVersion).not.toHaveBeenCalled();
  });

  it("sends the current QUESTIONS (not the rendered checklist text) and the instructions to the model", async () => {
    mockResolvedCourse();
    vi.mocked(callLlm).mockResolvedValue({
      ok: true,
      text: JSON.stringify({ questions: CURRENT_QUESTIONS }),
      status: 200,
      body: "",
    } as never);
    mockSavedArtifact();

    await refineGeneratedArtifactAction({
      courseUrl: COURSE_URL,
      kind: "knowledgeChecks",
      currentText: "Q1: What is a variable?\n[x] A named storage location",
      currentTitle: "Week 3 Knowledge Check",
      currentStructured: CURRENT_QUESTIONS,
      instructions: "add a question about scope",
    });

    const prompt = String(
      (vi.mocked(callLlm).mock.calls[0][0] as { contents: Array<{ parts: Array<{ text: string }> }> }).contents[0]
        .parts[0].text
    );
    expect(prompt).toContain("What is a variable?");
    expect(prompt).toContain("add a question about scope");
  });
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

  it("refineGeneratedArtifactAction resolves an export selection by courseId, never by courseUrl", async () => {
    mockResolvedCourseById();
    vi.mocked(callLlm).mockResolvedValue({ ok: true, text: "Revised text", status: 200, body: "" } as never);
    mockSavedArtifact();

    const result = await refineGeneratedArtifactAction({
      courseUrl: "",
      courseId: "export-course-1",
      kind: "qa",
      currentText: "Original text",
      instructions: "make it shorter",
    });

    expect(resolveLmsCourseRowByIdAction).toHaveBeenCalledWith("export-course-1");
    expect(resolveLmsCourseRowAction).not.toHaveBeenCalled();
    expect("error" in result).toBe(false);
  });

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
      generateLectureScriptAction,
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
});

// ── CHUNK 3d: "scripts", the eighth kind (S5-S7) ────────────────────────────
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
      generateLectureScriptAction,
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
    vi.mocked(generateLectureScriptAction).mockResolvedValue({ script } as never);
  }

  it("a successful scripts generation calls generateLectureScriptAction only, and saves the script verbatim with a derived title and no structured payload", async () => {
    mockResolvedCourse();
    mockMaterials("grounded materials", ["a note"]);
    mockScript("Welcome, everyone. [PAUSE] Let's begin.");
    mockSavedArtifact();

    const result = await generateFromSelectionAction({
      courseUrl: COURSE_URL,
      kind: "scripts",
      items: [SOME_ITEM],
      moduleLabel: "Week 2",
    });

    expectOnlyScriptGeneratorCalled(generateLectureScriptAction);
    expect(saveGeneratedArtifactVersion).toHaveBeenCalledTimes(1);
    const [, userId, input] = vi.mocked(saveGeneratedArtifactVersion).mock.calls[0];
    expect(userId).toBe("user-1");
    expect(input).toMatchObject({ courseId: "course-1", kind: "lecture-script", title: "Week 2 Lecture Script" });
    expect(input.text).toBe("Welcome, everyone. [PAUSE] Let's begin.");
    // S9/S4: a script has no structured payload - the generic text path must
    // never write one.
    expect("structured" in input).toBe(false);
    expect(result).toEqual({ artifact: { id: "artifact-1", version: 1 }, notes: ["a note"] });
  });

  it("S6: the composed topic stays non-empty when the module label falls back to its default and the course name is blank", async () => {
    // Drives the REAL fallback path, not a hardcoded stand-in: courseName is
    // "" and moduleLabel is omitted, so both this function's own moduleLabel
    // fallback ("the selected material") and the "scripts" branch's own
    // course-name fallback are exercised together.
    vi.mocked(resolveLmsCourseRowAction).mockResolvedValue({
      course: { ...FAKE_COURSE, name: "" },
    } as never);
    mockMaterials("grounded materials");
    mockScript("Script text.");
    mockSavedArtifact();

    await generateFromSelectionAction({ courseUrl: COURSE_URL, kind: "scripts", items: [SOME_ITEM] });

    const [topicArg] = vi.mocked(generateLectureScriptAction).mock.calls[0];
    expect(typeof topicArg).toBe("string");
    expect((topicArg as string).trim()).not.toBe("");
    expect(topicArg).toContain("the selected material");
  });

  it("S6: the composed topic carries both the course name and an explicit module label when both are present", async () => {
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

    const [topicArg] = vi.mocked(generateLectureScriptAction).mock.calls[0];
    expect(topicArg).toContain(FAKE_COURSE.name);
    expect(topicArg).toContain("Week 2");
  });

  it("S6: materials.materialsText is passed as generateLectureScriptAction's `objectives` argument", async () => {
    mockResolvedCourse();
    mockMaterials("grounded materials from the selection");
    mockScript("Script text.");
    mockSavedArtifact();

    await generateFromSelectionAction({ courseUrl: COURSE_URL, kind: "scripts", items: [SOME_ITEM] });

    const [, objectivesArg] = vi.mocked(generateLectureScriptAction).mock.calls[0];
    expect(objectivesArg).toBe("grounded materials from the selection");
  });

  it("S7: an offered targetMinutes value reaches the generator unchanged", async () => {
    mockResolvedCourse();
    mockMaterials("grounded materials");
    mockScript("Script text.");
    mockSavedArtifact();

    await generateFromSelectionAction({
      courseUrl: COURSE_URL,
      kind: "scripts",
      items: [SOME_ITEM],
      targetMinutes: 20,
    });

    const [, , minutesArg] = vi.mocked(generateLectureScriptAction).mock.calls[0];
    expect(minutesArg).toBe(20);
  });

  it("S7: an absent targetMinutes resolves to 15, not generateLectureScriptAction's own silent out-of-range fallback to 5", async () => {
    mockResolvedCourse();
    mockMaterials("grounded materials");
    mockScript("Script text.");
    mockSavedArtifact();

    await generateFromSelectionAction({ courseUrl: COURSE_URL, kind: "scripts", items: [SOME_ITEM] });

    const [, , minutesArg] = vi.mocked(generateLectureScriptAction).mock.calls[0];
    expect(minutesArg).toBe(15);
  });

  it("S7: an unrecognised targetMinutes (50 - in generateLectureScriptAction's own 1-30 range but never one of the offered options) resolves to 15", async () => {
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

    const [, , minutesArg] = vi.mocked(generateLectureScriptAction).mock.calls[0];
    expect(minutesArg).toBe(15);
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
    expect(input.prompt).toContain("15");
    expect(input.prompt).not.toContain("50");
  });

  it("propagates a generator error without saving a version", async () => {
    mockResolvedCourse();
    mockMaterials("grounded materials");
    vi.mocked(generateLectureScriptAction).mockResolvedValue({ error: "LLM quota exhausted" } as never);

    const result = await generateFromSelectionAction({ courseUrl: COURSE_URL, kind: "scripts", items: [SOME_ITEM] });

    expect(result).toEqual({ error: "LLM quota exhausted" });
    expect(saveGeneratedArtifactVersion).not.toHaveBeenCalled();
  });

  it("does not save a version when the generator succeeds but returns an empty/whitespace-only script", async () => {
    mockResolvedCourse();
    mockMaterials("grounded materials");
    mockScript("   ");

    const result = await generateFromSelectionAction({ courseUrl: COURSE_URL, kind: "scripts", items: [SOME_ITEM] });

    expect(result).toEqual({ error: "The model returned no lecture script for this selection." });
    expect(saveGeneratedArtifactVersion).not.toHaveBeenCalled();
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
    expect(generateLectureScriptAction).not.toHaveBeenCalled();
    expect(saveGeneratedArtifactVersion).not.toHaveBeenCalled();
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

  it("S10: refuses a save-version kind (scripts) by name, matching every other save-only kind", async () => {
    const result = await postGeneratedArtifactAction({ courseUrl: COURSE_URL, kind: "scripts", artifactId: "x" });
    expect(result).toEqual({
      error: '"Lecture script" only saves a generated version - it has nothing to post to Canvas.',
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
  // that must accept `courseId` too (see the "resolveGenerationCourseRow"
  // describe block above) - AC3 is what actually keeps posting unreachable
  // for an export selection in the product (useLmsGeneration.ts's own
  // client-side courseWrite gate, verified separately in
  // useLmsGeneration.test.ts), but this action's own course resolution must
  // still be source-aware like every other one, rather than being the one
  // exception AC2 would otherwise leave behind.
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
