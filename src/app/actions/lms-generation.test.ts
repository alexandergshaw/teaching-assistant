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
// by call, not by a real database. callLlm (used only by the refine action)
// is mocked; describeEmptyLlmText/describeLlmFailure are left real via
// importActual so their exact wording is exercised for real.
vi.mock("@/lib/supabase/auth", () => ({ requireOwner: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: vi.fn(() => ({ __fake: "supabase" })) }));
vi.mock("./lms-syllabus-buttons", () => ({ resolveLmsCourseRowAction: vi.fn() }));
vi.mock("./course-planning-lecture", () => ({ generateLectureQaAction: vi.fn() }));
vi.mock("./current-events", () => ({ researchCurrentEventsAction: vi.fn() }));
vi.mock("./canvas-modules", () => ({ listCourseContentAction: vi.fn() }));
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
import { resolveLmsCourseRowAction } from "./lms-syllabus-buttons";
import { generateLectureQaAction } from "./course-planning-lecture";
import { researchCurrentEventsAction } from "./current-events";
import { listCourseContentAction } from "./canvas-modules";
import { gatherSelectionMaterials, expandModuleSelection } from "@/lib/lms-generation/materials";
import { saveGeneratedArtifactVersion, listGeneratedArtifactVersions } from "@/lib/supabase/generated-artifacts";
import { callLlm } from "@/lib/llm";
import {
  generateFromSelectionAction,
  refineGeneratedArtifactAction,
  listGeneratedArtifactVersionsAction,
} from "./lms-generation";

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
      expect(expandModuleSelection).toHaveBeenCalledWith([], [10], FAKE_MODULES);
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
      // raw module ids are handed to expandModuleSelection UNMERGED - dedup
      // is expandModuleSelection's own job (see materials.test.ts), not
      // duplicated here.
      expect(expandModuleSelection).toHaveBeenCalledWith([SOME_ITEM], [10], FAKE_MODULES);
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
