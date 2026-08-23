import { describe, it, expect, vi, beforeEach } from "vitest";

// A8's own tests for the "introDiscussion" kind
// (docs/intro-discussion-from-modules-acceptance-criteria.md, section 5b) -
// kept OUT of lms-generation.test.ts/lms-generation.post-and-list.test.ts
// (both already at/near this project's 1000-line ceiling) per that AC's own
// W9. Covers exactly what A8 owns in src/app/actions/lms-generation.ts: the
// "introDiscussion" generate case, the W5 module-name hoist, the
// LIVE_CANVAS_WRITERS.createDiscussion wiring to A4's createGradedDiscussionAction,
// and postGeneratedArtifactAction's discussionDeadlines/notes threading -
// including the seam A3 flagged (a classic-path fallback reason riding on the
// "create-discussion" outcome's own `detail` field, commit-execute.ts).
//
// Same mock-everything-lms-generation.ts-imports discipline as its sibling
// test files: this file imports generateFromSelectionAction/
// postGeneratedArtifactAction from the REAL, unmocked "./lms-generation"
// module, so every one of that module's own top-level imports must be an
// inert double or the real implementation loads underneath the test.
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
vi.mock("./learning-resources-generator", () => ({ generateLearningResourcesForSelection: vi.fn() }));
// A8's own two new imports.
vi.mock("./intro-discussion-generator", () => ({ generateIntroDiscussionForSelection: vi.fn() }));
vi.mock("./canvas-discussions", () => ({ createGradedDiscussionAction: vi.fn() }));
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

import { resolveLmsCourseRowAction } from "./lms-syllabus-buttons";
import { generateLectureQaAction } from "./course-planning-lecture";
import { listCourseContentAction, createModuleItemAction } from "./canvas-modules";
import { createPageAction } from "./canvas-files-bulk";
import { gatherSelectionMaterials } from "@/lib/lms-generation/materials";
import { saveGeneratedArtifactVersion, listGeneratedArtifactVersions } from "@/lib/supabase/generated-artifacts";
import { generateIntroDiscussionForSelection } from "./intro-discussion-generator";
import { createGradedDiscussionAction } from "./canvas-discussions";
import { generateFromSelectionAction, postGeneratedArtifactAction } from "./lms-generation";
import { readFileSync } from "fs";
import { join } from "path";
import { NO_DATE_INITIAL_POST_TEXT, NO_DATE_REPLIES_TEXT } from "@/lib/lms-generation/intro-discussion-deadlines";
import { COURSE_URL, FAKE_COURSE, mockOwner } from "./lms-generation.fixtures";

const INTRO_COURSE: typeof FAKE_COURSE & { startDate: string | null; courseCode: string; description: string; topicOutline: string } = {
  ...FAKE_COURSE,
  startDate: "2026-01-05",
  courseCode: "WID101",
  description: "d",
  topicOutline: "t",
};

function mockIntroCourse(overrides: Partial<typeof INTRO_COURSE> = {}) {
  vi.mocked(resolveLmsCourseRowAction).mockResolvedValue({ course: { ...INTRO_COURSE, ...overrides } } as never);
}

const THREE_MODULES = [
  { id: 10, name: "Module 1", position: 1, published: true, itemsCount: 1, items: [] },
  { id: 11, name: "Module 2", position: 2, published: true, itemsCount: 1, items: [] },
  { id: 12, name: "Module 3", position: 3, published: true, itemsCount: 1, items: [] },
];

function mockCourseContent(modules: unknown = THREE_MODULES) {
  vi.mocked(listCourseContentAction).mockResolvedValue({ courseName: "Intro to Widgets", modules, pages: [] } as never);
}

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

function mockMaterials(materialsText = "some material", notes: string[] = []) {
  vi.mocked(gatherSelectionMaterials).mockResolvedValue({ materialsText, notes } as never);
}

function mockSavedArtifact(overrides: Record<string, unknown> = {}) {
  vi.mocked(saveGeneratedArtifactVersion).mockResolvedValue({ id: "art-disc-1", version: 1, ...overrides } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockOwner();
});

describe("generateFromSelectionAction - introDiscussion (W5 hoist, AC18 context)", () => {
  it("fetches the module list even for an items-only selection, sends the target + every OTHER module's name, and returns the course startDate", async () => {
    mockIntroCourse();
    mockCourseContent();
    mockMaterials();
    mockSavedArtifact();
    vi.mocked(generateIntroDiscussionForSelection).mockResolvedValue({
      title: "Introduce Yourself: Module 1",
      message: "Welcome!",
    } as never);

    const result = await generateFromSelectionAction({
      courseUrl: COURSE_URL,
      kind: "introDiscussion",
      items: [SOME_ITEM],
      moduleLabel: "Module 1",
    });

    expect(listCourseContentAction).toHaveBeenCalledTimes(1);
    expect(generateIntroDiscussionForSelection).toHaveBeenCalledWith(
      expect.objectContaining({
        targetModuleName: "Module 1",
        otherModuleNames: ["Module 2", "Module 3"],
        requiredReplyCount: 2,
        pointsPossible: 20,
      }),
      "gemini",
      expect.anything()
    );
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.artifact).toEqual({ id: "art-disc-1", version: 1 });
    expect(result.startDate).toBe("2026-01-05");
    expect(saveGeneratedArtifactVersion).toHaveBeenCalledWith(
      expect.anything(),
      "user-1",
      expect.objectContaining({ title: "Introduce Yourself: Module 1", kind: "intro-discussion" })
    );
  });

  // M2 (step-10b researcher): the module-name read and gatherSelectionMaterials
  // are independent - `items` is not rebuilt from the module list on this
  // items-only path - so they must OVERLAP, not queue. Both are multi-request
  // Canvas reads (listCourseContentAction alone is ~19 requests on a
  // 16-module course), so serialising them costs a full round of latency for
  // nothing.
  //
  // HOW THIS TEST FAILS UNDER SERIALISATION, which is the whole point: the
  // module-list fetch is made to hang until gatherSelectionMaterials has been
  // CALLED. If the action awaits the module list first, the materials fetch is
  // never reached, the deferred never resolves, and the action never settles -
  // so the assertion below times out instead of passing. Asserting call counts
  // or ordering would NOT catch a regression here; only the hang does.
  it("M2: the module-name read and the materials read are IN FLIGHT AT THE SAME TIME, not queued", async () => {
    mockIntroCourse();
    mockSavedArtifact();
    vi.mocked(generateIntroDiscussionForSelection).mockResolvedValue({ title: "T", message: "M" } as never);

    let releaseModuleList: () => void = () => {};
    const moduleListReleased = new Promise<void>((resolve) => {
      releaseModuleList = resolve;
    });

    vi.mocked(listCourseContentAction).mockImplementation(
      (async () => {
        await moduleListReleased;
        return { modules: [{ id: 1, name: "Module 1" }], pages: [], courseName: "C" };
      }) as never
    );
    // Reached ONLY if the module-list read did not block it.
    vi.mocked(gatherSelectionMaterials).mockImplementation(
      (async () => {
        releaseModuleList();
        return { materialsText: "some material", notes: [] };
      }) as never
    );

    const result = await generateFromSelectionAction({
      courseUrl: COURSE_URL,
      kind: "introDiscussion",
      items: [SOME_ITEM],
      moduleLabel: "Module 1",
    });

    expect("error" in result).toBe(false);
    expect(listCourseContentAction).toHaveBeenCalledTimes(1);
    expect(gatherSelectionMaterials).toHaveBeenCalledTimes(1);
  });

  it("DEGRADES TO [] rather than failing generation when the module-list fetch returns an error", async () => {
    mockIntroCourse();
    vi.mocked(listCourseContentAction).mockResolvedValue({ error: "Canvas is down" } as never);
    mockMaterials();
    mockSavedArtifact();
    vi.mocked(generateIntroDiscussionForSelection).mockResolvedValue({ title: "T", message: "M" } as never);

    const result = await generateFromSelectionAction({
      courseUrl: COURSE_URL,
      kind: "introDiscussion",
      items: [SOME_ITEM],
      moduleLabel: "Module 1",
    });

    expect("error" in result).toBe(false);
    expect(generateIntroDiscussionForSelection).toHaveBeenCalledWith(
      expect.objectContaining({ otherModuleNames: [] }),
      expect.anything(),
      expect.anything()
    );
  });

  it("DEGRADES TO [] rather than failing generation when the module-list fetch THROWS", async () => {
    mockIntroCourse();
    vi.mocked(listCourseContentAction).mockRejectedValue(new Error("network down"));
    mockMaterials();
    mockSavedArtifact();
    vi.mocked(generateIntroDiscussionForSelection).mockResolvedValue({ title: "T", message: "M" } as never);

    const result = await generateFromSelectionAction({
      courseUrl: COURSE_URL,
      kind: "introDiscussion",
      items: [SOME_ITEM],
      moduleLabel: "Module 1",
    });

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.artifact).toBeTruthy();
    expect(generateIntroDiscussionForSelection).toHaveBeenCalledWith(
      expect.objectContaining({ otherModuleNames: [] }),
      expect.anything(),
      expect.anything()
    );
  });

  it("AC21: falls back to the NO_DATE_* prompt phrases when the course has no start date", async () => {
    mockIntroCourse({ startDate: null });
    mockCourseContent();
    mockMaterials();
    mockSavedArtifact();
    vi.mocked(generateIntroDiscussionForSelection).mockResolvedValue({ title: "T", message: "M" } as never);

    await generateFromSelectionAction({
      courseUrl: COURSE_URL,
      kind: "introDiscussion",
      items: [SOME_ITEM],
      moduleLabel: "Module 1",
    });

    expect(generateIntroDiscussionForSelection).toHaveBeenCalledWith(
      expect.objectContaining({
        initialPostDeadlineText: NO_DATE_INITIAL_POST_TEXT,
        repliesDeadlineText: NO_DATE_REPLIES_TEXT,
      }),
      expect.anything(),
      expect.anything()
    );
  });

  it("computes real deadline text (a formatted Thursday/Sunday) when the course has a start date", async () => {
    mockIntroCourse();
    mockCourseContent();
    mockMaterials();
    mockSavedArtifact();
    vi.mocked(generateIntroDiscussionForSelection).mockResolvedValue({ title: "T", message: "M" } as never);

    await generateFromSelectionAction({
      courseUrl: COURSE_URL,
      kind: "introDiscussion",
      items: [SOME_ITEM],
      moduleLabel: "Module 1",
    });

    const call = vi.mocked(generateIntroDiscussionForSelection).mock.calls[0][0];
    expect(call.initialPostDeadlineText).toContain("Thursday");
    expect(call.repliesDeadlineText).toContain("Sunday");
  });

  // Researcher finding (fix): otherModuleNames used to exclude the target by
  // matching `moduleLabel` as a STRING. When the caller sends `moduleIds`
  // (the "checkmarked module" case the ask itself describes) but omits
  // `moduleLabel`, the label falls back to DEFAULT_MODULE_LABEL ("the
  // selected material"), which matches no real module name - so the
  // checkmarked module's OWN name used to leak into "other modules" too.
  // Fixed to exclude by IDENTITY (`moduleIds`) instead.
  it("RESEARCHER FINDING: otherModuleNames excludes the checkmarked module by IDENTITY, not by matching a moduleLabel string", async () => {
    mockIntroCourse();
    mockCourseContent(); // THREE_MODULES: Module 1 (id 10), Module 2 (id 11), Module 3 (id 12)
    mockMaterials();
    mockSavedArtifact();
    vi.mocked(generateIntroDiscussionForSelection).mockResolvedValue({ title: "T", message: "M" } as never);

    await generateFromSelectionAction({
      courseUrl: COURSE_URL,
      kind: "introDiscussion",
      items: [],
      moduleIds: [10], // the checkmarked module - Module 1
      // moduleLabel deliberately omitted - falls back to DEFAULT_MODULE_LABEL,
      // which the OLD string-match filter would never have matched.
    });

    const call = vi.mocked(generateIntroDiscussionForSelection).mock.calls[0][0];
    expect(call.otherModuleNames).toEqual(["Module 2", "Module 3"]);
    expect(call.otherModuleNames).not.toContain("Module 1");
  });

  it("NO OTHER KIND'S BEHAVIOUR CHANGED: a 'qa' generate (items-only) never calls listCourseContentAction and carries no startDate", async () => {
    mockIntroCourse();
    mockMaterials();
    vi.mocked(generateLectureQaAction).mockResolvedValue({ questions: [{ question: "q", answer: "a" }] } as never);
    mockSavedArtifact({ id: "art-qa-1" });

    const result = await generateFromSelectionAction({
      courseUrl: COURSE_URL,
      kind: "qa",
      items: [SOME_ITEM],
      moduleLabel: "Module 1",
    });

    expect(listCourseContentAction).not.toHaveBeenCalled();
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.startDate).toBeUndefined();
  });
});

describe("postGeneratedArtifactAction - introDiscussion / createDiscussion wiring", () => {
  const DISCUSSION_ARTIFACT = {
    id: "art-disc-1",
    courseId: "course-1",
    kind: "intro-discussion",
    version: 1,
    isCurrent: true,
    title: "Introduce Yourself: Module 1",
    text: "Welcome! Introduce yourself.",
    structured: null,
    prompt: "p",
    createdAt: "2026-01-06T00:00:00Z",
    updatedAt: "2026-01-06T00:00:00Z",
  };

  function mockVersions(versions: unknown[]) {
    vi.mocked(listGeneratedArtifactVersions).mockResolvedValue(versions as never);
  }

  it("wires LIVE_CANVAS_WRITERS.createDiscussion to createGradedDiscussionAction (A4), passes the client's deadlines through, and surfaces its note", async () => {
    mockIntroCourse();
    mockVersions([DISCUSSION_ARTIFACT]);
    mockCourseContent();
    vi.mocked(createGradedDiscussionAction).mockResolvedValue({ id: 555, path: "checkpoints" } as never);
    vi.mocked(createModuleItemAction).mockResolvedValue({ ok: true } as never);

    const clientNote = "Initial post due Thursday, January 8, 2026 at 11:59 PM. Replies due Sunday, January 11, 2026 at 11:59 PM.";
    const result = await postGeneratedArtifactAction({
      courseUrl: COURSE_URL,
      kind: "introDiscussion",
      artifactId: "art-disc-1",
      target: { kind: "existing", moduleId: 10 },
      discussionDeadlines: {
        initialPostAt: "2026-01-09T04:59:00.000Z",
        repliesDueAt: "2026-01-12T04:59:00.000Z",
        note: clientNote,
      },
    });

    expect(createGradedDiscussionAction).toHaveBeenCalledWith(
      COURSE_URL,
      expect.objectContaining({
        title: "Introduce Yourself: Module 1",
        initialPostAt: "2026-01-09T04:59:00.000Z",
        repliesDueAt: "2026-01-12T04:59:00.000Z",
        pointsPossible: 20,
        requiredReplyCount: 2,
      }),
      "MIT"
    );
    expect(createModuleItemAction).toHaveBeenCalledWith(
      COURSE_URL,
      10,
      { type: "Discussion", contentId: 555, title: "Introduce Yourself: Module 1" },
      "MIT"
    );
    if ("error" in result) throw new Error("expected a summary, not a top-level error");
    expect(result.summary.status).toBe("success");
    // Checkpoints path - the note channel carries ONLY the client's own
    // deadline note, never a fallback line.
    expect(result.notes).toEqual([clientNote]);
  });

  // Finding 1 (fix): this test used to be titled "falls back to
  // planIntroDiscussionPost (server-side, same A1 functions)" and asserted a
  // REAL computed reason ("no start date") - meaning the server used to
  // compute deadlines itself whenever the client omitted them, which is
  // exactly the timezone hazard AC14i exists to prevent (a server-computed
  // `.toISOString()` encodes the SERVER's UTC offset, not the instructor's).
  // The fix removes that computation entirely: the server now emits "" dates
  // and a fixed, generic "not supplied" note regardless of whether a real
  // start date exists - proven here by using a course that DOES have a real
  // start date (mockIntroCourse(), not `{ startDate: null }`) and a target
  // module that DOES carry a real week number. The old, buggy fallback would
  // have produced a DIFFERENT note here ("no week number" - the target
  // module's name was never resolved either, Finding 2) even though it also
  // happened to emit "" dates, so this is a genuine sabotage-checkable pin,
  // not a coincidental match.
  it("Finding 1: emits NO dates and a fixed 'not supplied' note when the caller sends no discussionDeadlines - the server never computes a real instant, even when it could", async () => {
    mockIntroCourse(); // a REAL start date - the server must still refuse to compute from it
    mockVersions([DISCUSSION_ARTIFACT]);
    mockCourseContent();
    vi.mocked(createGradedDiscussionAction).mockResolvedValue({ id: 600, path: "checkpoints" } as never);
    vi.mocked(createModuleItemAction).mockResolvedValue({ ok: true } as never);

    const result = await postGeneratedArtifactAction({
      courseUrl: COURSE_URL,
      kind: "introDiscussion",
      artifactId: "art-disc-1",
      target: { kind: "existing", moduleId: 10 },
    });

    expect(createGradedDiscussionAction).toHaveBeenCalledWith(
      COURSE_URL,
      expect.objectContaining({ initialPostAt: "", repliesDueAt: "" }),
      "MIT"
    );
    if ("error" in result) throw new Error("expected a summary, not a top-level error");
    expect(result.notes).toEqual(["The client did not supply computed deadlines for this discussion, so no due or lock dates were set."]);
  });

  it("THE SEAM (A3's flag): a classic-path fallback reason reaches `notes`, never dying inside commit-execute.ts", async () => {
    mockIntroCourse();
    mockVersions([DISCUSSION_ARTIFACT]);
    mockCourseContent();
    // M1 (fix): this is the REAL shape of F1's describeFallback() output - it
    // already ends with the "only the initial-post deadline..." caveat.
    // commit-execute.ts used to WRAP this in "Classic fallback used (...)"
    // and APPEND that exact caveat a second time; the fix passes it through
    // VERBATIM. Asserting `.toBe` (not `.toContain`) is what makes this test
    // able to catch the doubling: a re-introduced append would make
    // `result.notes?.[1]` a longer string that no longer equals
    // `fallbackReason` exactly.
    const fallbackReason =
      "Canvas checkpoints are not enabled for this account, so a single-deadline " +
      "discussion was created instead. Only the initial-post deadline is graded " +
      "by Canvas; the replies deadline is enforced by the thread closing, not by " +
      "a separate grade.";
    vi.mocked(createGradedDiscussionAction).mockResolvedValue({ id: 700, path: "classic", fallbackReason } as never);
    vi.mocked(createModuleItemAction).mockResolvedValue({ ok: true } as never);

    const result = await postGeneratedArtifactAction({
      courseUrl: COURSE_URL,
      kind: "introDiscussion",
      artifactId: "art-disc-1",
      target: { kind: "existing", moduleId: 10 },
      discussionDeadlines: { initialPostAt: "2026-01-09T04:59:00.000Z", repliesDueAt: "2026-01-12T04:59:00.000Z", note: "N" },
    });

    if ("error" in result) throw new Error("expected a summary, not a top-level error");
    expect(result.summary.status).toBe("success");
    expect(result.notes).toHaveLength(2);
    expect(result.notes?.[0]).toBe("N");
    expect(result.notes?.[1]).toBe(fallbackReason);
  });

  // Frozen contract (checkpoints are explicit opt-in, off by default): the
  // client's own checkbox value must reach the discussion write layer.
  // Default FALSE when the caller omits it - safe by default, since Canvas's
  // createDiscussionTopic mutation is not transactional on a flag-off
  // account (it persists the orphan assignment, THEN raises).
  it("useDiscussionCheckpoints threads through to the discussion fields sent to createGradedDiscussionAction, defaulting to false", async () => {
    mockIntroCourse();
    mockVersions([DISCUSSION_ARTIFACT]);
    mockCourseContent();
    vi.mocked(createGradedDiscussionAction).mockResolvedValue({ id: 555, path: "checkpoints" } as never);
    vi.mocked(createModuleItemAction).mockResolvedValue({ ok: true } as never);

    await postGeneratedArtifactAction({
      courseUrl: COURSE_URL,
      kind: "introDiscussion",
      artifactId: "art-disc-1",
      target: { kind: "existing", moduleId: 10 },
      discussionDeadlines: { initialPostAt: "2026-01-09T04:59:00.000Z", repliesDueAt: "2026-01-12T04:59:00.000Z", note: "N" },
      // useDiscussionCheckpoints omitted entirely.
    });

    expect(createGradedDiscussionAction).toHaveBeenCalledWith(
      COURSE_URL,
      expect.objectContaining({ useCheckpoints: false }),
      "MIT"
    );
  });

  it("SABOTAGE TARGET: useDiscussionCheckpoints: true threads through as useCheckpoints: true", async () => {
    mockIntroCourse();
    mockVersions([DISCUSSION_ARTIFACT]);
    mockCourseContent();
    vi.mocked(createGradedDiscussionAction).mockResolvedValue({ id: 556, path: "checkpoints" } as never);
    vi.mocked(createModuleItemAction).mockResolvedValue({ ok: true } as never);

    await postGeneratedArtifactAction({
      courseUrl: COURSE_URL,
      kind: "introDiscussion",
      artifactId: "art-disc-1",
      target: { kind: "existing", moduleId: 10 },
      discussionDeadlines: { initialPostAt: "2026-01-09T04:59:00.000Z", repliesDueAt: "2026-01-12T04:59:00.000Z", note: "N" },
      useDiscussionCheckpoints: true,
    });

    expect(createGradedDiscussionAction).toHaveBeenCalledWith(
      COURSE_URL,
      expect.objectContaining({ useCheckpoints: true }),
      "MIT"
    );
  });

  // Finding 12: the module-item return path harvests a create-discussion
  // classic-fallback detail into `notes`; the course-level path used to
  // return `notes` too but never called the SAME harvest, an asymmetric-
  // swallow shape unreachable today (a discussion is always module-item
  // placement - there is no course-level discussion kind to construct a real
  // end-to-end test against) but real once one exists. Pinned as a
  // source-text guard rather than a behavioural test for exactly that
  // reason - see this repo's own AC doc on why an unreachable-today branch
  // still needs its fix proven.
  it("Finding 12: harvestPostOutcomeNotes is called on BOTH return paths (course-level and module-item), not only one", () => {
    const source = readFileSync(join(process.cwd(), "src/app/actions/lms-generation.ts"), "utf8");
    const calls = source.match(/harvestPostOutcomeNotes\(outcomes\)/g) ?? [];
    expect(calls.length).toBe(2);
  });

  it("NO OTHER KIND'S BEHAVIOUR CHANGED: an objectives post still returns no `notes` field at all", async () => {
    mockIntroCourse();
    mockVersions([
      {
        id: "art-obj-1",
        courseId: "course-1",
        kind: "module-objectives",
        version: 1,
        isCurrent: true,
        title: "Week 1 Objectives",
        text: "- Do X",
        structured: null,
        prompt: "p",
        createdAt: "2026-01-02T00:00:00Z",
        updatedAt: "2026-01-02T00:00:00Z",
      },
    ]);
    mockCourseContent();
    vi.mocked(createPageAction).mockResolvedValue({ page: { url: "week-1-objectives" } } as never);
    vi.mocked(createModuleItemAction).mockResolvedValue({ ok: true } as never);

    const result = await postGeneratedArtifactAction({
      courseUrl: COURSE_URL,
      kind: "objectives",
      artifactId: "art-obj-1",
      target: { kind: "existing", moduleId: 10 },
    });

    if ("error" in result) throw new Error("expected a summary, not a top-level error");
    expect(result.notes).toBeUndefined();
    expect(createGradedDiscussionAction).not.toHaveBeenCalled();
  });
});
