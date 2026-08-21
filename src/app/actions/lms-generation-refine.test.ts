import { describe, it, expect, vi, beforeEach } from "vitest";

// Tests for refineGeneratedArtifactAction and saveEditedGeneratedArtifactAction
// (src/app/actions/lms-generation-refine.ts) - split out of
// lms-generation.test.ts alongside the source split that file's own header
// comment describes, to keep BOTH test files under this project's 1000-line
// ceiling. lms-generation.test.ts had grown to roughly 2.26x that ceiling
// with the refine/saveEdit tests still inside it even after the source
// itself was split, which defeated the point of the split (see that file's
// own report for this wave). This is a MOVE of those describe blocks
// verbatim, not a rewrite - no assertion here was added, dropped, or
// reworded by the move itself; only the mock/import/fixture header below is
// new, trimmed to what these moved tests actually reference (the same
// helpers, kept byte-identical, that lms-generation.test.ts already used for
// them).
//
// requireOwner (auth) and createServiceClient (db handle) are mocked so
// neither action needs a real Supabase session. resolveLmsCourseRowAction/
// resolveLmsCourseRowByIdAction are refineGeneratedArtifactAction's and
// saveEditedGeneratedArtifactAction's own course-resolution path (via
// resolveGenerationCourseRow, imported unmocked from "./lms-generation" -
// see this file's own import below). reviseLectureSlidesAction is the
// deck-specific refine (lecture-plans.ts). callLlm is mocked;
// describeEmptyLlmText/describeLlmFailure are left real (lms-generation-refine.ts
// imports them directly, not through this file) so their exact wording is
// exercised for real. saveGeneratedArtifactVersion/listGeneratedArtifactVersions
// are mocked so persistence/re-reads are asserted by call, not a real
// database.
//
// Every OTHER generator/Canvas-write mock below (generateLectureQaAction
// through createModuleItemAction) exists only because this file also imports
// postGeneratedArtifactAction and resolveGenerationCourseRow from the REAL,
// unmocked "./lms-generation" module (needed for the knowledgeChecks
// "dead-end regression" test below, which drives a refined version through
// the real post path) - that module's own top-level imports pull in every
// one of these, so an unmocked one would load the real action instead of an
// inert double. Mirrors lms-generation.test.ts's own mock list exactly for
// this reason, even though most of these functions are never referenced by
// name in this file - see expectNoGeneratorCalls below for the ones that
// are.
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
import { generateModuleIntroScriptAction } from "./media";
import { listCourseContentAction, createModuleItemAction } from "./canvas-modules";
import { createGradableAction, createQuizQuestionAction, bulkUpdateAction } from "./canvas-files-bulk";
import { saveGeneratedArtifactVersion, listGeneratedArtifactVersions } from "@/lib/supabase/generated-artifacts";
import { callLlm } from "@/lib/llm";
import { postGeneratedArtifactAction } from "./lms-generation";
import { refineGeneratedArtifactAction, saveEditedGeneratedArtifactAction } from "./lms-generation-refine";
import { buildCourseNotLinkedMessage } from "@/lib/lms-generation/course-not-linked";

const COURSE_URL = "https://canvas.example.edu/courses/100";

const FAKE_COURSE = {
  id: "course-1",
  name: "Intro to Widgets",
  canvasUrl: COURSE_URL,
  institution: "MIT",
  courseKind: null,
};

// M15 (adversarial review, WAVE 11C, DEFECT 1): built from the real
// buildCourseNotLinkedMessage rather than hand-spelled - course-not-linked.ts
// is the sole owner of this message's wording (see that file's own header
// comment), so a future rewording updates this fixture for free instead of
// needing a hand-edit here too.
const NOT_LINKED_ERROR = {
  error: buildCourseNotLinkedMessage(COURSE_URL),
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

describe("saveEditedGeneratedArtifactAction", () => {
  // Every generator/model-call mock this file wires up, asserted untouched
  // by a successful edit save (E3: no model call at all) - a single helper
  // so a future generator added to the top-of-file mock list is covered here
  // without hand-editing every test in this block.
  function expectNoGeneratorCalls() {
    expect(callLlm).not.toHaveBeenCalled();
    expect(generateLectureQaAction).not.toHaveBeenCalled();
    expect(researchCurrentEventsAction).not.toHaveBeenCalled();
    expect(reviseLectureSlidesAction).not.toHaveBeenCalled();
    expect(generateModuleObjectivesForAssignment).not.toHaveBeenCalled();
    expect(generateAssignmentAction).not.toHaveBeenCalled();
    expect(generateKnowledgeCheckAction).not.toHaveBeenCalled();
    expect(draftAnnouncementAction).not.toHaveBeenCalled();
    expect(generateModuleIntroScriptAction).not.toHaveBeenCalled();
  }

  it("saves the caller's exact text as a NEW version, with the right artifactKind, and calls no model", async () => {
    mockResolvedCourse();
    mockSavedArtifact();

    const result = await saveEditedGeneratedArtifactAction({
      courseUrl: COURSE_URL,
      kind: "qa",
      text: "Hand-edited Q&A text.",
    });

    expect(saveGeneratedArtifactVersion).toHaveBeenCalledTimes(1);
    const [, , input] = vi.mocked(saveGeneratedArtifactVersion).mock.calls[0];
    expect(input).toMatchObject({ courseId: "course-1", kind: "anticipated-qa" });
    expect(input.text).toBe("Hand-edited Q&A text.");
    expect(result).toEqual({ artifact: { id: "artifact-1", version: 1 } });
    expectNoGeneratorCalls();
  });

  it("E6: a scripts edit carries the exact title forward from currentTitle", async () => {
    mockResolvedCourse();
    mockSavedArtifact();

    await saveEditedGeneratedArtifactAction({
      courseUrl: COURSE_URL,
      kind: "scripts",
      text: "Hand-edited script text.",
      currentTitle: "Week 2 Lecture Script",
    });

    const [, , input] = vi.mocked(saveGeneratedArtifactVersion).mock.calls[0];
    // SABOTAGE TARGET: dropping the title carry-forward saves `title:
    // undefined` here instead - pinned to the exact saved title, not merely
    // that TITLED_GENERIC_KINDS contains "scripts".
    expect(input.title).toBe("Week 2 Lecture Script");
    expect(input.text).toBe("Hand-edited script text.");
  });

  it("E6: a qa edit (not in TITLED_GENERIC_KINDS) never sets a title, even when currentTitle is sent (matches refine's own unchanged behaviour)", async () => {
    mockResolvedCourse();
    mockSavedArtifact();

    await saveEditedGeneratedArtifactAction({
      courseUrl: COURSE_URL,
      kind: "qa",
      text: "Hand-edited Q&A text.",
      currentTitle: "Should never be written",
    });

    const [, , input] = vi.mocked(saveGeneratedArtifactVersion).mock.calls[0];
    expect("title" in input).toBe(false);
  });

  it("E4: refuses 'decks' server-side before any database work, and saves nothing", async () => {
    const result = await saveEditedGeneratedArtifactAction({
      courseUrl: COURSE_URL,
      kind: "decks",
      text: "Some slide text.",
    });

    expect("error" in result).toBe(true);
    const message = (result as { error: string }).error;
    expect(message).toContain("Lecture deck");
    expect(message).toContain("download");
    expect(resolveLmsCourseRowAction).not.toHaveBeenCalled();
    expect(saveGeneratedArtifactVersion).not.toHaveBeenCalled();
  });

  it("E4: refuses 'knowledgeChecks' server-side before any database work, and saves nothing", async () => {
    const result = await saveEditedGeneratedArtifactAction({
      courseUrl: COURSE_URL,
      kind: "knowledgeChecks",
      text: "Some question text.",
    });

    expect("error" in result).toBe(true);
    const message = (result as { error: string }).error;
    expect(message).toContain("Knowledge check");
    expect(resolveLmsCourseRowAction).not.toHaveBeenCalled();
    expect(saveGeneratedArtifactVersion).not.toHaveBeenCalled();
  });

  it("E5: refuses whitespace-only text before resolving the course, and saves nothing", async () => {
    const result = await saveEditedGeneratedArtifactAction({
      courseUrl: COURSE_URL,
      kind: "qa",
      text: "   \n  ",
    });

    expect("error" in result).toBe(true);
    expect(resolveLmsCourseRowAction).not.toHaveBeenCalled();
    expect(saveGeneratedArtifactVersion).not.toHaveBeenCalled();
  });

  it("E7: the saved prompt records that a human wrote this version, not a model prompt", async () => {
    mockResolvedCourse();
    mockSavedArtifact();

    await saveEditedGeneratedArtifactAction({
      courseUrl: COURSE_URL,
      kind: "qa",
      text: "Hand-edited Q&A text.",
    });

    const [, , input] = vi.mocked(saveGeneratedArtifactVersion).mock.calls[0];
    expect(typeof input.prompt).toBe("string");
    expect(input.prompt.length).toBeGreaterThan(0);
    // The FACT this pins: the prompt names the instructor/manual origin of
    // the edit, not a model. Never asserted as a verbatim sentence.
    expect(input.prompt.toLowerCase()).toContain("instructor");
    expect(input.prompt).not.toBe("Hand-edited Q&A text.");
  });

  it("the course-not-linked path returns the named error and saves nothing", async () => {
    vi.mocked(resolveLmsCourseRowAction).mockResolvedValue(NOT_LINKED_ERROR as never);

    const result = await saveEditedGeneratedArtifactAction({
      courseUrl: COURSE_URL,
      kind: "qa",
      text: "Hand-edited Q&A text.",
    });

    expect(result).toEqual({ ...NOT_LINKED_ERROR, courseNotLinked: true });
    expect(saveGeneratedArtifactVersion).not.toHaveBeenCalled();
  });
});

// ── resolveGenerationCourseRow (AC1/AC2 defect fix), refine/saveEdit side ──
//
// Continuation of the "resolveGenerationCourseRow (AC1/AC2 defect fix)"
// describe block in lms-generation.test.ts, which covers
// generateFromSelectionAction and listGeneratedArtifactVersionsAction - see
// that file for the full AC1/AC2 rationale (an export-sourced selection
// blanks `courseUrl` to "", so `courseId` is what actually identifies the
// course row for this action). This half covers only
// refineGeneratedArtifactAction/saveEditedGeneratedArtifactAction, moved
// here with the rest of this file's tests (see this file's header comment).
describe("resolveGenerationCourseRow (AC1/AC2 defect fix)", () => {
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

  // GAP THIS WAVE CLOSES: unlike generateFromSelectionAction,
  // refineGeneratedArtifactAction and saveEditedGeneratedArtifactAction did
  // not accept an `acronym` field at all before this wave - their own
  // resolveGenerationCourseRow call always passed none, so a host-less
  // courseUrl (the ONLY shape CoursePicker.tsx/LmsCell.tsx ever emit) could
  // not resolve its course row on a refine or a hand-edit save, even though
  // generation itself already could. resolveLmsCourseRowAction is mocked in
  // this file (never the real matcher - course-canvas-url-match.test.ts owns
  // that), so this mock is written to depend on the acronym argument the
  // same way the real matcher does for a host-less URL (M12: no acronym, no
  // host -> false, never a guess) - proving the acronym genuinely reaches the
  // resolve call and changes the outcome, not merely that it is present
  // somewhere in the payload.
  it("M12: refineGeneratedArtifactAction resolves a host-less courseUrl only when acronym is threaded through", async () => {
    vi.mocked(resolveLmsCourseRowAction).mockImplementation(
      ((url: string, acronym?: string) => Promise.resolve(acronym ? { course: FAKE_COURSE } : NOT_LINKED_ERROR)) as never
    );
    vi.mocked(callLlm).mockResolvedValue({ ok: true, text: "Revised text", status: 200, body: "" } as never);
    mockSavedArtifact();

    const withAcronym = await refineGeneratedArtifactAction({
      courseUrl: "/courses/10287",
      acronym: "WNCC",
      kind: "qa",
      currentText: "Original text",
      instructions: "make it shorter",
    });
    expect(resolveLmsCourseRowAction).toHaveBeenCalledWith("/courses/10287", "WNCC");
    expect("error" in withAcronym).toBe(false);

    const withoutAcronym = await refineGeneratedArtifactAction({
      courseUrl: "/courses/10287",
      kind: "qa",
      currentText: "Original text",
      instructions: "make it shorter",
    });
    expect(resolveLmsCourseRowAction).toHaveBeenCalledWith("/courses/10287");
    expect("error" in withoutAcronym).toBe(true);
  });

  it("M12: saveEditedGeneratedArtifactAction resolves a host-less courseUrl only when acronym is threaded through", async () => {
    vi.mocked(resolveLmsCourseRowAction).mockImplementation(
      ((url: string, acronym?: string) => Promise.resolve(acronym ? { course: FAKE_COURSE } : NOT_LINKED_ERROR)) as never
    );
    mockSavedArtifact();

    const withAcronym = await saveEditedGeneratedArtifactAction({
      courseUrl: "/courses/10287",
      acronym: "WNCC",
      kind: "qa",
      text: "Hand-edited text.",
    });
    expect(resolveLmsCourseRowAction).toHaveBeenCalledWith("/courses/10287", "WNCC");
    expect("error" in withAcronym).toBe(false);

    const withoutAcronym = await saveEditedGeneratedArtifactAction({
      courseUrl: "/courses/10287",
      kind: "qa",
      text: "Hand-edited text.",
    });
    expect(resolveLmsCourseRowAction).toHaveBeenCalledWith("/courses/10287");
    expect("error" in withoutAcronym).toBe(true);
  });
});
