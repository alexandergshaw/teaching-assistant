import { describe, it, expect, vi, beforeEach } from "vitest";

// createSyllabusAckQuizAction and resolveLmsCourseRowAction are DEFINED in
// the module under test (lms-syllabus-buttons.ts) and call each other as
// ordinary same-module function references - vi.mock cannot intercept that
// self-reference (unlike lms-generation.test.ts, which mocks
// resolveLmsCourseRowAction because lms-generation.ts imports it from a
// DIFFERENT module). So here the course-row lookup is driven for real, by
// mocking only its own dependency, listCourseHubAction (./course-hub-core) -
// findCourseForCanvasUrl (@/lib/course-canvas-url-match) runs unmocked, real.
//
// Every OTHER Canvas/Supabase boundary this file crosses is mocked at its
// exact relative specifier, the same idiom lms-generation.test.ts uses: an
// inert mock fails loudly rather than silently falling through to a real
// network call. The pure decision modules this action leans on -
// @/lib/syllabus-ack-quiz (due-date math, idempotency title match, the task
// patch), @/lib/syllabus-ack-quiz-target (syllabusQuizLinkDecision) and
// @/lib/lms-generation/commit-plan (planModuleTarget, including its
// case/trim-insensitive reuse-by-name match) are left REAL and unmocked -
// their own behaviour is already pinned by syllabus-ack-quiz.test.ts,
// syllabus-ack-quiz-target.test.ts and commit-plan's own tests; this file
// only needs to prove createSyllabusAckQuizAction wires their real outputs
// into the right Canvas calls.
//
// @/lib/institution-fields, @/lib/workflows/registry-helpers,
// @/lib/syllabus-facts, @/lib/workflows/file-names and ./syllabus-templates
// are collaborators of the OTHER button (generateAndInsertSyllabusAction)
// this file also exports; they are mocked here purely so importing the
// module does not pull in @/lib/workflows/registry-helpers's own import of
// the entire "@/app/actions" barrel - none of their mocks are ever exercised
// by a test below, since createSyllabusAckQuizAction never calls them.
vi.mock("@/lib/supabase/auth", () => ({ requireOwner: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: vi.fn(() => ({ __fake: "supabase" })) }));
vi.mock("@/lib/institution-fields", () => ({ loadInstitutionFields: vi.fn() }));
vi.mock("@/lib/workflows/registry-helpers", () => ({ courseToInputPayload: vi.fn() }));
vi.mock("@/lib/syllabus-facts", () => ({ buildSyllabusFactsFromCourse: vi.fn(), resolveSyllabusTemplateId: vi.fn() }));
vi.mock("@/lib/workflows/file-names", () => ({ buildWorkflowFileName: vi.fn() }));
vi.mock("./course-tasks", () => ({ listCourseTasksAction: vi.fn(), setCourseTaskCellsAction: vi.fn() }));
vi.mock("./course-hub-core", () => ({ listCourseHubAction: vi.fn(), updateCourseHubAction: vi.fn() }));
vi.mock("./canvas-files-bulk", () => ({
  createGradableAction: vi.fn(),
  createQuizQuestionAction: vi.fn(),
  bulkUpdateAction: vi.fn(),
  listBulkItemsAction: vi.fn(),
}));
vi.mock("./canvas-modules", () => ({
  listCourseContentAction: vi.fn(),
  createModuleAction: vi.fn(),
  createModuleItemAction: vi.fn(),
  placeSyllabusInModuleAction: vi.fn(),
}));
vi.mock("./syllabus-templates", () => ({
  generateCourseSyllabusAction: vi.fn(),
  createFinalizedSyllabusAction: vi.fn(),
  createSyllabusTemplateAction: vi.fn(),
}));

import { requireOwner } from "@/lib/supabase/auth";
import { listCourseTasksAction, setCourseTaskCellsAction } from "./course-tasks";
import { listCourseHubAction } from "./course-hub-core";
import { createGradableAction, createQuizQuestionAction, bulkUpdateAction, listBulkItemsAction } from "./canvas-files-bulk";
import { listCourseContentAction, createModuleAction, createModuleItemAction } from "./canvas-modules";
import { createSyllabusAckQuizAction, resolveLmsCourseRowAction, resolveLmsCourseRowByIdAction } from "./lms-syllabus-buttons";
import { computeSyllabusAckDueAt, SYLLABUS_ACK_QUIZ_TITLE } from "@/lib/syllabus-ack-quiz";

const COURSE_URL = "https://canvas.example.edu/courses/100";

const FAKE_COURSE = {
  id: "course-1",
  canvasUrl: COURSE_URL,
  startDate: "2026-09-01",
};

const FAKE_COURSE_NO_START_DATE = {
  id: "course-2",
  canvasUrl: COURSE_URL,
  startDate: null,
};

// A module the course already has, unrelated to the quiz being placed -
// present in every "existing module chosen" scenario below.
const WEEK_ONE = { id: 10, name: "Week 1", position: 1, published: true, itemsCount: 0, items: [] };

function moduleWithLinkedQuiz(quizId: number) {
  return {
    id: 10,
    name: "Week 1",
    position: 1,
    published: true,
    itemsCount: 1,
    items: [
      {
        id: 1,
        moduleId: 10,
        title: SYLLABUS_ACK_QUIZ_TITLE,
        type: "Quiz",
        position: 1,
        indent: 0,
        published: true,
        pageUrl: null,
        contentId: quizId,
        dueAt: null,
        pointsPossible: null,
        htmlUrl: null,
        externalUrl: null,
      },
    ],
  };
}

/** The exact due-date label the action's own message would compute, via the
 * REAL (unmocked) computeSyllabusAckDueAt - so assertions never hardcode a
 * locale-formatted date string of our own invention. */
function expectedDueLabel(startDate: string): string {
  const due = computeSyllabusAckDueAt(startDate);
  if (!("dueAt" in due)) throw new Error("test setup: expected a dueAt");
  return new Date(due.dueAt).toLocaleDateString();
}

function mockOwner() {
  vi.mocked(requireOwner).mockResolvedValue({ id: "user-1", email: "owner@example.com" } as never);
}

function mockCourse(course: unknown = FAKE_COURSE) {
  vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [course] } as never);
}

/** No quiz exists yet, and the create/publish sequence all succeeds. */
function mockFreshQuizPipeline(quizId: number) {
  vi.mocked(listBulkItemsAction).mockResolvedValue({ items: [] } as never);
  vi.mocked(createGradableAction).mockResolvedValue({ id: quizId } as never);
  vi.mocked(createQuizQuestionAction).mockResolvedValue({ question: {} } as never);
  vi.mocked(bulkUpdateAction).mockResolvedValue({ updated: 1, failures: [] } as never);
}

function mockExistingQuiz(quizId: string) {
  vi.mocked(listBulkItemsAction).mockResolvedValue({
    items: [{ id: quizId, title: SYLLABUS_ACK_QUIZ_TITLE, published: true, dueAt: null, pointsPossible: 1 }],
  } as never);
}

/** Every Canvas write assertion this action can make, asserted as NOT
 * called - used by tests whose whole point is that nothing is written. */
function expectNoCanvasWrites() {
  expect(createGradableAction).not.toHaveBeenCalled();
  expect(createQuizQuestionAction).not.toHaveBeenCalled();
  expect(bulkUpdateAction).not.toHaveBeenCalled();
  expect(createModuleAction).not.toHaveBeenCalled();
  expect(createModuleItemAction).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  mockOwner();
  mockCourse();
  // Default: the term task is open, and writing it succeeds. Individual
  // tests override this for the already-done / failure / thrown variants.
  vi.mocked(listCourseTasksAction).mockResolvedValue({ records: [] } as never);
  vi.mocked(setCourseTaskCellsAction).mockResolvedValue({ record: { courseId: FAKE_COURSE.id, statuses: {} } } as never);
});

describe("createSyllabusAckQuizAction", () => {
  // ── A. Fresh quiz, existing module chosen ─────────────────────────────────
  it("A: fresh quiz + existing module target creates the quiz, links ONE item into that module, publishes, ticks the task, and names the module", async () => {
    mockFreshQuizPipeline(555);
    vi.mocked(listCourseContentAction).mockResolvedValue({ courseName: "x", modules: [WEEK_ONE], pages: [] } as never);
    vi.mocked(createModuleItemAction).mockResolvedValue({ ok: true } as never);

    const due = computeSyllabusAckDueAt(FAKE_COURSE.startDate);
    if (!("dueAt" in due)) throw new Error("test setup");

    const result = await createSyllabusAckQuizAction(COURSE_URL, "MIT", { kind: "existing", moduleId: 10 });

    expect(createGradableAction).toHaveBeenCalledWith(
      COURSE_URL,
      "Quiz",
      expect.objectContaining({ title: SYLLABUS_ACK_QUIZ_TITLE, dueAt: due.dueAt }),
      "MIT"
    );
    expect(createQuizQuestionAction).toHaveBeenCalledWith(
      COURSE_URL,
      555,
      expect.objectContaining({ type: "true_false_question", points: 1 }),
      "MIT"
    );
    expect(bulkUpdateAction).toHaveBeenCalledWith(COURSE_URL, "Quiz", ["555"], { published: true }, "MIT");
    // The reuse guard: an EXISTING module target never goes through
    // createModuleAction - only createModuleItemAction links into it.
    expect(createModuleAction).not.toHaveBeenCalled();
    expect(createModuleItemAction).toHaveBeenCalledTimes(1);
    expect(createModuleItemAction).toHaveBeenCalledWith(
      COURSE_URL,
      10,
      { type: "Quiz", contentId: 555, title: SYLLABUS_ACK_QUIZ_TITLE },
      "MIT"
    );
    expect(setCourseTaskCellsAction).toHaveBeenCalledTimes(1);

    const dueLabel = expectedDueLabel(FAKE_COURSE.startDate);
    expect(result).toEqual({
      message: `Created and published "${SYLLABUS_ACK_QUIZ_TITLE}" (due ${dueLabel}), linked into "Week 1", Tasks checklist updated: ${COURSE_URL}/quizzes/555`,
    });
  });

  // ── B. Fresh quiz, "new module" matching an existing one - THE DUPLICATE- ──
  // ── MODULE GUARD, the single most valuable test here ──────────────────────
  it('B: fresh quiz + "new module" whose name matches an existing module case/whitespace-insensitively REUSES it - createModuleAction is NEVER called', async () => {
    mockFreshQuizPipeline(600);
    vi.mocked(listCourseContentAction).mockResolvedValue({ courseName: "x", modules: [WEEK_ONE], pages: [] } as never);
    vi.mocked(createModuleItemAction).mockResolvedValue({ ok: true } as never);

    // Different casing AND different surrounding whitespace than the real
    // module's name ("Week 1") - planModuleTarget's collision check is
    // case- and trim-insensitive.
    const result = await createSyllabusAckQuizAction(COURSE_URL, undefined, { kind: "new", name: "  week 1  " });

    expect(createModuleAction).not.toHaveBeenCalled();
    expect(createModuleItemAction).toHaveBeenCalledTimes(1);
    expect(createModuleItemAction).toHaveBeenCalledWith(
      COURSE_URL,
      10,
      { type: "Quiz", contentId: 600, title: SYLLABUS_ACK_QUIZ_TITLE },
      undefined
    );
    if ("error" in result) throw new Error("expected a success message");
    expect(result.message).toContain('linked into "Week 1"');
  });

  // ── C. Fresh quiz, genuinely new module name ───────────────────────────────
  it('C: fresh quiz + "new module" with a genuinely new name creates the module, then links into it', async () => {
    mockFreshQuizPipeline(700);
    vi.mocked(listCourseContentAction).mockResolvedValue({ courseName: "x", modules: [WEEK_ONE], pages: [] } as never);
    vi.mocked(createModuleAction).mockResolvedValue({
      module: { id: 42, name: "Orientation", position: 2, published: true, itemsCount: 0, items: [] },
    } as never);
    vi.mocked(createModuleItemAction).mockResolvedValue({ ok: true } as never);

    const result = await createSyllabusAckQuizAction(COURSE_URL, undefined, { kind: "new", name: "Orientation" });

    expect(createModuleAction).toHaveBeenCalledTimes(1);
    expect(createModuleAction).toHaveBeenCalledWith(COURSE_URL, "Orientation", undefined, undefined);
    expect(createModuleItemAction).toHaveBeenCalledWith(
      COURSE_URL,
      42,
      { type: "Quiz", contentId: 700, title: SYLLABUS_ACK_QUIZ_TITLE },
      undefined
    );
    if ("error" in result) throw new Error("expected a success message");
    expect(result.message).toContain('linked into "Orientation"');
  });

  // ── D. Fresh quiz, no target chosen ─────────────────────────────────────────
  it("D: fresh quiz with no target chosen creates the quiz, links it into NO module, and says so - AC2's floor", async () => {
    mockFreshQuizPipeline(800);

    const result = await createSyllabusAckQuizAction(COURSE_URL, undefined, null);

    expect(createGradableAction).toHaveBeenCalledTimes(1);
    expect(createModuleAction).not.toHaveBeenCalled();
    expect(createModuleItemAction).not.toHaveBeenCalled();
    // No target chosen means no reason to even look at the module list.
    expect(listCourseContentAction).not.toHaveBeenCalled();

    const dueLabel = expectedDueLabel(FAKE_COURSE.startDate);
    expect(result).toEqual({
      message: `Created and published "${SYLLABUS_ACK_QUIZ_TITLE}" (due ${dueLabel}), not linked into any module - no target was chosen, Tasks checklist updated: ${COURSE_URL}/quizzes/800`,
    });
  });

  // ── E. Quiz already exists AND already in a module ─────────────────────────
  it("E: an already-existing quiz already placed in a module writes NOTHING to Canvas, still ticks the term task, and never re-homes it even when a different target is chosen", async () => {
    mockExistingQuiz("777");
    vi.mocked(listCourseContentAction).mockResolvedValue({
      courseName: "x",
      modules: [moduleWithLinkedQuiz(777)],
      pages: [],
    } as never);

    // A DIFFERENT target is chosen this press - AC5 says an already-placed
    // quiz is reported, never re-homed, no matter what is chosen now.
    const result = await createSyllabusAckQuizAction(COURSE_URL, undefined, { kind: "existing", moduleId: 99 });

    expectNoCanvasWrites();
    expect(listCourseContentAction).toHaveBeenCalledTimes(1);
    expect(setCourseTaskCellsAction).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      message: `"${SYLLABUS_ACK_QUIZ_TITLE}" is already present in "Week 1" - nothing created, Tasks checklist updated: ${COURSE_URL}/quizzes/777`,
    });
  });

  // ── F. Quiz already exists, in no module, target chosen ────────────────────
  it("F: an already-existing quiz that sits in NO module gets linked (not re-created) when a target is now chosen", async () => {
    mockExistingQuiz("777");
    vi.mocked(listCourseContentAction).mockResolvedValue({ courseName: "x", modules: [WEEK_ONE], pages: [] } as never);
    vi.mocked(createModuleItemAction).mockResolvedValue({ ok: true } as never);

    const result = await createSyllabusAckQuizAction(COURSE_URL, undefined, { kind: "existing", moduleId: 10 });

    expect(createGradableAction).not.toHaveBeenCalled();
    expect(createQuizQuestionAction).not.toHaveBeenCalled();
    expect(bulkUpdateAction).not.toHaveBeenCalled();
    expect(createModuleAction).not.toHaveBeenCalled();
    expect(createModuleItemAction).toHaveBeenCalledTimes(1);
    expect(createModuleItemAction).toHaveBeenCalledWith(
      COURSE_URL,
      10,
      { type: "Quiz", contentId: 777, title: SYLLABUS_ACK_QUIZ_TITLE },
      undefined
    );
    expect(result).toEqual({
      message: `"${SYLLABUS_ACK_QUIZ_TITLE}" is already present - nothing created, now linked into "Week 1", Tasks checklist updated: ${COURSE_URL}/quizzes/777`,
    });
  });

  // ── G. Quiz already exists, in no module, no target chosen ─────────────────
  it("G: an already-existing, unlinked quiz with no target chosen writes nothing and reports the exact pre-existing wording", async () => {
    // Also proves REGRESSION #249 check 2's ordering: the idempotency check
    // runs before the start-date check, so a course with NO start date still
    // succeeds here - there is nothing left to create.
    mockCourse(FAKE_COURSE_NO_START_DATE);
    mockExistingQuiz("777");
    vi.mocked(listCourseContentAction).mockResolvedValue({ courseName: "x", modules: [WEEK_ONE], pages: [] } as never);

    const result = await createSyllabusAckQuizAction(COURSE_URL, undefined, null);

    expectNoCanvasWrites();
    expect(result).toEqual({
      message: `"${SYLLABUS_ACK_QUIZ_TITLE}" is already present - nothing created, Tasks checklist updated: ${COURSE_URL}/quizzes/777`,
    });
  });

  // ── H. listCourseContentAction fails - THE AC6 BUG FIX ─────────────────────
  it('H: a listCourseContentAction failure still creates the quiz, and the message reports the load failure honestly instead of guessing "Start Here" does not exist', async () => {
    mockFreshQuizPipeline(900);
    vi.mocked(listCourseContentAction).mockResolvedValue({ error: "Canvas is down" } as never);

    const result = await createSyllabusAckQuizAction(COURSE_URL, undefined, { kind: "existing", moduleId: 10 });

    expect(createGradableAction).toHaveBeenCalledTimes(1);
    expect(createModuleItemAction).not.toHaveBeenCalled();
    if ("error" in result) throw new Error(`expected a success message reporting the quiz, got error: ${result.error}`);
    expect(result.message.toLowerCase()).not.toContain("start here");
    expect(result.message).toContain("could not load the course's modules (Canvas is down)");
    expect(result.message).toContain(SYLLABUS_ACK_QUIZ_TITLE);
  });

  // ── M. Quiz already exists, in no module, "New module..." target with a ───
  // ── genuinely new name - REGRESSION #276 check 6's actual fix ──────────────
  it('M: an already-existing, unlinked quiz + "new module" with a genuinely new name creates the module (not the quiz) and says so, never claiming "nothing created"', async () => {
    mockExistingQuiz("777");
    vi.mocked(listCourseContentAction).mockResolvedValue({ courseName: "x", modules: [WEEK_ONE], pages: [] } as never);
    vi.mocked(createModuleAction).mockResolvedValue({
      module: { id: 42, name: "Orientation", position: 2, published: true, itemsCount: 0, items: [] },
    } as never);
    vi.mocked(createModuleItemAction).mockResolvedValue({ ok: true } as never);

    const result = await createSyllabusAckQuizAction(COURSE_URL, undefined, { kind: "new", name: "Orientation" });

    // The quiz itself is never re-created - only the module is new.
    expect(createGradableAction).not.toHaveBeenCalled();
    expect(createQuizQuestionAction).not.toHaveBeenCalled();
    expect(bulkUpdateAction).not.toHaveBeenCalled();
    expect(createModuleAction).toHaveBeenCalledTimes(1);
    expect(createModuleAction).toHaveBeenCalledWith(COURSE_URL, "Orientation", undefined, undefined);
    expect(createModuleItemAction).toHaveBeenCalledWith(
      COURSE_URL,
      42,
      { type: "Quiz", contentId: 777, title: SYLLABUS_ACK_QUIZ_TITLE },
      undefined
    );
    expect(result).toEqual({
      message: `"${SYLLABUS_ACK_QUIZ_TITLE}" is already present - no quiz created, but module "Orientation" was created and the quiz was linked into it, Tasks checklist updated: ${COURSE_URL}/quizzes/777`,
    });
  });

  // ── N. Quiz already exists, module placement check fails ──────────────────
  it("N: an already-existing quiz whose module placement cannot be checked is reported as unknown, never as unlinked, and writes nothing", async () => {
    mockExistingQuiz("777");
    vi.mocked(listCourseContentAction).mockResolvedValue({ error: "Canvas is down" } as never);

    const result = await createSyllabusAckQuizAction(COURSE_URL, undefined, { kind: "existing", moduleId: 10 });

    expectNoCanvasWrites();
    if ("error" in result) throw new Error(`expected a success message, got error: ${result.error}`);
    // Must not read as a claim that the quiz is definitely unlinked - a
    // failed check is a different fact from a known-absent module.
    expect(result.message.toLowerCase()).not.toContain("not linked");
    expect(result.message).toEqual(
      `"${SYLLABUS_ACK_QUIZ_TITLE}" is already present - no quiz created, but whether it is linked into a module could not be checked (Canvas is down), Tasks checklist updated: ${COURSE_URL}/quizzes/777`
    );
  });

  // ── O. Quiz already exists, link into an EXISTING module fails - link ──────
  // ── failed with NO module created (the first of the two "could not be ──────
  // ── linked" shapes) ─────────────────────────────────────────────────────────
  it('O: an already-existing, unlinked quiz whose link into an EXISTING module fails reports "nothing created" - accurate here, since no module was made', async () => {
    mockExistingQuiz("777");
    vi.mocked(listCourseContentAction).mockResolvedValue({ courseName: "x", modules: [WEEK_ONE], pages: [] } as never);
    vi.mocked(createModuleItemAction).mockResolvedValue({ error: "Canvas timed out" } as never);

    const result = await createSyllabusAckQuizAction(COURSE_URL, undefined, { kind: "existing", moduleId: 10 });

    // The target was already-existing "Week 1" - this path never has a
    // reason to call createModuleAction at all.
    expect(createModuleAction).not.toHaveBeenCalled();
    expect(createModuleItemAction).toHaveBeenCalledTimes(1);
    expect(createModuleItemAction).toHaveBeenCalledWith(
      COURSE_URL,
      10,
      { type: "Quiz", contentId: 777, title: SYLLABUS_ACK_QUIZ_TITLE },
      undefined
    );
    expect(result).toEqual({
      message: `"${SYLLABUS_ACK_QUIZ_TITLE}" is already present - nothing created, and could not be linked (could not link it into "Week 1" (Canvas timed out)), Tasks checklist updated: ${COURSE_URL}/quizzes/777`,
    });
  });

  // ── P. Quiz already exists, "new module" target creates the module, but ───
  // ── the SUBSEQUENT link call fails - link failed AFTER a module was ────────
  // ── created (the second, previously-uncovered "could not be linked" ────────
  // ── shape - REGRESSION #276 check 6's other half) ───────────────────────────
  it('P: an already-existing, unlinked quiz + "new module" whose module IS created but the link call then fails must name the module, never claim "nothing created"', async () => {
    mockExistingQuiz("777");
    vi.mocked(listCourseContentAction).mockResolvedValue({ courseName: "x", modules: [WEEK_ONE], pages: [] } as never);
    vi.mocked(createModuleAction).mockResolvedValue({
      module: { id: 42, name: "Orientation", position: 2, published: true, itemsCount: 0, items: [] },
    } as never);
    vi.mocked(createModuleItemAction).mockResolvedValue({ error: "Canvas timed out" } as never);

    const result = await createSyllabusAckQuizAction(COURSE_URL, undefined, { kind: "new", name: "Orientation" });

    // The quiz itself is still never re-created - only the module is new,
    // and it DOES get made even though the link after it fails.
    expect(createGradableAction).not.toHaveBeenCalled();
    expect(createQuizQuestionAction).not.toHaveBeenCalled();
    expect(bulkUpdateAction).not.toHaveBeenCalled();
    expect(createModuleAction).toHaveBeenCalledTimes(1);
    expect(createModuleAction).toHaveBeenCalledWith(COURSE_URL, "Orientation", undefined, undefined);
    expect(createModuleItemAction).toHaveBeenCalledWith(
      COURSE_URL,
      42,
      { type: "Quiz", contentId: 777, title: SYLLABUS_ACK_QUIZ_TITLE },
      undefined
    );
    // The message must say the module exists AND name it - "nothing
    // created" would be false, and omitting the name would leave a retry
    // unable to reuse it through planModuleTarget's name match.
    if ("error" in result) throw new Error(`expected a success message, got error: ${result.error}`);
    expect(result.message.toLowerCase()).not.toContain("nothing created");
    expect(result).toEqual({
      message: `"${SYLLABUS_ACK_QUIZ_TITLE}" is already present - no quiz created, but module "Orientation" was created and the quiz could not be linked into it (could not link it into "Orientation" (Canvas timed out)), Tasks checklist updated: ${COURSE_URL}/quizzes/777`,
    });
  });

  // ── I. No start date ─────────────────────────────────────────────────────
  it("I: a course with no start date refuses before creating anything", async () => {
    mockCourse(FAKE_COURSE_NO_START_DATE);
    vi.mocked(listBulkItemsAction).mockResolvedValue({ items: [] } as never);

    const result = await createSyllabusAckQuizAction(COURSE_URL, undefined, null);

    const due = computeSyllabusAckDueAt(null);
    if (!("error" in due)) throw new Error("test setup");
    expect(result).toEqual({ error: due.error });

    expect(createGradableAction).not.toHaveBeenCalled();
    expect(createQuizQuestionAction).not.toHaveBeenCalled();
    expect(bulkUpdateAction).not.toHaveBeenCalled();
    expect(createModuleAction).not.toHaveBeenCalled();
    expect(createModuleItemAction).not.toHaveBeenCalled();
    expect(listCourseContentAction).not.toHaveBeenCalled();
    // The term task is never touched either - the button did not succeed.
    expect(listCourseTasksAction).not.toHaveBeenCalled();
    expect(setCourseTaskCellsAction).not.toHaveBeenCalled();
  });

  // ── J. Term task marking fails (a RETURNED error) ───────────────────────────
  it("J: a term-task write failure never fails the button - the quiz is still reported (entry 251 check 6)", async () => {
    mockFreshQuizPipeline(1000);
    vi.mocked(setCourseTaskCellsAction).mockResolvedValue({ error: "DB write failed" } as never);

    const result = await createSyllabusAckQuizAction(COURSE_URL, undefined, null);

    const dueLabel = expectedDueLabel(FAKE_COURSE.startDate);
    expect(result).toEqual({
      message: `Created and published "${SYLLABUS_ACK_QUIZ_TITLE}" (due ${dueLabel}), not linked into any module - no target was chosen (could not update the Tasks checklist: DB write failed): ${COURSE_URL}/quizzes/1000`,
    });
  });

  // ── K. Term task marking fails (a THROWN exception) ─────────────────────────
  it("K: a term-task listing that throws is also swallowed - the button still succeeds (the other half of entry 251 check 6)", async () => {
    mockFreshQuizPipeline(1100);
    vi.mocked(listCourseTasksAction).mockRejectedValue(new Error("network exploded"));

    const result = await createSyllabusAckQuizAction(COURSE_URL, undefined, null);

    expect(setCourseTaskCellsAction).not.toHaveBeenCalled();
    const dueLabel = expectedDueLabel(FAKE_COURSE.startDate);
    expect(result).toEqual({
      message: `Created and published "${SYLLABUS_ACK_QUIZ_TITLE}" (due ${dueLabel}), not linked into any module - no target was chosen (could not update the Tasks checklist: network exploded): ${COURSE_URL}/quizzes/1100`,
    });
  });

  // ── L. Term task already done - no pointless write, no stray fragment ──────
  it("L: an already-done term task issues no write and leaves no checklist fragment in the message", async () => {
    mockFreshQuizPipeline(1200);
    vi.mocked(listCourseTasksAction).mockResolvedValue({
      records: [{ courseId: FAKE_COURSE.id, statuses: { "syllabus-ack-quiz": { status: "done", note: "", doneAt: 1 } } }],
    } as never);

    const result = await createSyllabusAckQuizAction(COURSE_URL, undefined, null);

    expect(setCourseTaskCellsAction).not.toHaveBeenCalled();
    const dueLabel = expectedDueLabel(FAKE_COURSE.startDate);
    expect(result).toEqual({
      message: `Created and published "${SYLLABUS_ACK_QUIZ_TITLE}" (due ${dueLabel}), not linked into any module - no target was chosen: ${COURSE_URL}/quizzes/1200`,
    });
  });

  // ── Q. A New Quiz with the same title must NOT count as "already exists" ───
  // (regression: listBulkItemsAction(.., "Quiz") now also returns New
  // Quizzes, flagged isNewQuiz, keyed by their ASSIGNMENT id - not a quiz
  // id. Before this fix, a New Quiz coincidentally titled "Syllabus
  // Acknowledgement" would satisfy findExistingAckQuiz's title match and get
  // treated as the pre-existing CLASSIC quiz this button creates, producing
  // a /quizzes/{assignmentId} URL and a module link typed "Quiz" with an
  // assignment id as its contentId - both wrong.)
  it('Q: a New Quiz sharing the title is ignored by the idempotency check - the button still creates its own Classic quiz, never treats the New Quiz as "already exists"', async () => {
    vi.mocked(listBulkItemsAction).mockResolvedValue({
      items: [
        {
          id: "901",
          title: SYLLABUS_ACK_QUIZ_TITLE,
          published: true,
          dueAt: null,
          pointsPossible: null,
          isNewQuiz: true,
        },
      ],
    } as never);
    vi.mocked(createGradableAction).mockResolvedValue({ id: 800 } as never);
    vi.mocked(createQuizQuestionAction).mockResolvedValue({ question: {} } as never);
    vi.mocked(bulkUpdateAction).mockResolvedValue({ updated: 1, failures: [] } as never);

    const result = await createSyllabusAckQuizAction(COURSE_URL, undefined, null);

    // Fresh-create path taken, exactly as when the list was empty (test D) -
    // the New Quiz row must never short-circuit into the "already exists"
    // branch, and its assignment id (901) must never appear as a quiz id
    // anywhere in the result.
    expect(createGradableAction).toHaveBeenCalledTimes(1);
    const dueLabel = expectedDueLabel(FAKE_COURSE.startDate);
    expect(result).toEqual({
      message: `Created and published "${SYLLABUS_ACK_QUIZ_TITLE}" (due ${dueLabel}), not linked into any module - no target was chosen, Tasks checklist updated: ${COURSE_URL}/quizzes/800`,
    });
    if ("error" in result) throw new Error("expected a success message");
    expect(result.message).not.toContain("/quizzes/901");
    expect(result.message.toLowerCase()).not.toContain("already present");
  });
});

// ── resolveLmsCourseRowByIdAction (AC1/AC2 defect fix) ──────────────────────
//
// The export counterpart of resolveLmsCourseRowAction (already exercised
// indirectly through createSyllabusAckQuizAction above) - resolves a saved
// course row by its course_hub id directly, the identifier a stored-export
// selection actually has (its Canvas URL, if any, is never sent - see this
// function's own doc comment in lms-syllabus-buttons.ts). Owner-scoping is
// the same listCourseHubAction every other lookup in this file already goes
// through - a foreign/stale id is simply absent from the list, not refused
// with a different error shape.
describe("resolveLmsCourseRowByIdAction", () => {
  const EXPORT_ONLY_COURSE = { id: "export-course-1", canvasUrl: null, name: "WNCC Intro to Widgets" };

  it("resolves a course with no Canvas URL at all, by id", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [EXPORT_ONLY_COURSE] } as never);

    const result = await resolveLmsCourseRowByIdAction("export-course-1");

    expect(result).toEqual({ course: EXPORT_ONLY_COURSE });
  });

  it("a foreign/unknown id is reported with a named error, never a course row", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [EXPORT_ONLY_COURSE] } as never);

    const result = await resolveLmsCourseRowByIdAction("someone-elses-course");

    expect(result).toEqual({ error: "Could not find that saved course - it may have been removed." });
  });

  it("SABOTAGE CHECK: never falls back to matching by Canvas URL - a course whose canvasUrl happens to equal the requested id string is not a match", async () => {
    // Guards against a regression that swaps this function's `find` predicate
    // for something URL-shaped instead of id-shaped.
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [{ id: "course-99", canvasUrl: "export-course-1", name: "Decoy" }],
    } as never);

    const result = await resolveLmsCourseRowByIdAction("export-course-1");

    expect(result).toEqual({ error: "Could not find that saved course - it may have been removed." });
  });

  it("propagates listCourseHubAction's own error rather than reporting a bogus 'not found'", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({ error: "Could not list your courses." } as never);

    const result = await resolveLmsCourseRowByIdAction("export-course-1");

    expect(result).toEqual({ error: "Could not list your courses." });
  });
});

// ── resolveLmsCourseRowAction - M11/M12/M12c (docs/module-intro-video-script-
// acceptance-criteria.md) ────────────────────────────────────────────────
//
// findCourseForCanvasUrl runs REAL here too (unmocked, same as
// createSyllabusAckQuizAction's own describe block above) - these tests
// exercise the actual matcher, not a stand-in for it.
describe("resolveLmsCourseRowAction (M11/M12/M13)", () => {
  it("M12b: resolves the host-less '/courses/<id>' shape CoursePicker.tsx/LmsCell.tsx actually emit, given the matching institution acronym", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [{ id: "course-9", canvasUrl: "/courses/10287", institution: "WNCC" }],
    } as never);

    const result = await resolveLmsCourseRowAction("/courses/10287", "WNCC");

    expect(result).toEqual({ course: { id: "course-9", canvasUrl: "/courses/10287", institution: "WNCC" } });
  });

  // M12c (finding 16): tryExportFallbackForFailedLiveRead
  // (src/app/components/ContentTab.tsx) resolves the export-recovery row
  // through exactly this action, by the same host-less canvasUrl its live
  // read just failed on, plus the active institution acronym. Before M12
  // that resolution silently failed for EVERY host-less selection (the ONLY
  // shape the app ever produces), so the recovery could never fire - this is
  // the mechanism-level proof it works again. ContentTab.tsx itself is not
  // separately unit-tested: this repo's vitest is node-env and renders no
  // component (see this project's own documented limits), so
  // tryExportFallbackForFailedLiveRead's own glue is verified by reading, not
  // by a render test.
  it("M12c: the export recovery path's resolution succeeds for a host-less URL when the active institution acronym is supplied", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [{ id: "course-10", canvasUrl: "/courses/555", institution: "WNCC", exportFiles: ["cartridge.imscc"] }],
    } as never);

    const result = await resolveLmsCourseRowAction("/courses/555", "WNCC");

    expect("error" in result).toBe(false);
    if ("error" in result) throw new Error("expected a resolved course row");
    expect(result.course.id).toBe("course-10");
  });

  it("M12c's control: the SAME host-less URL fails to resolve without an acronym - proving the fallback genuinely depends on it, not on the URL alone", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [{ id: "course-10", canvasUrl: "/courses/555", institution: "WNCC" }],
    } as never);

    const result = await resolveLmsCourseRowAction("/courses/555");

    expect("error" in result).toBe(true);
  });

  // M13 (finding 14): the "not linked" message must no longer send the
  // instructor to paste a Canvas URL onto the course row - that is the one
  // action that can never work, per finding 12. It must name the URL and
  // point at the Courses table instead.
  //
  // M14 (adversarial review of M13 itself, "FIX WAVE 7", DEFECT 2): M13's OWN
  // rewrite - "open the Courses table and link it there" - was itself
  // unachievable advice in disguise. Linking from the Courses table's LMS
  // cell (LmsCell.tsx's commit()) saves ONLY canvasUrl, never `institution` -
  // so an instructor whose two saved courses collide on the same numeric
  // Canvas id (the case course-canvas-url-match.ts's M14 fix still requires
  // institution to disambiguate) would follow M13's advice and see this
  // identical error again. The message must now name BOTH real actions the
  // Courses table actually offers: the LMS cell (linking) and the Institution
  // column (disambiguation) - pinned as FACTS below, never the exact prose,
  // since this wording has already been rewritten twice.
  it("M13/M14: the 'not linked' message names the URL, points at the Courses table, and names both real remediation actions (LMS cell to link, Institution column to disambiguate) - never the M13-retired 'paste the URL' advice", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [] } as never);

    const result = await resolveLmsCourseRowAction("https://school.instructure.com/courses/10287");

    expect("error" in result).toBe(true);
    if (!("error" in result)) throw new Error("expected an error");
    expect(result.error).toContain("https://school.instructure.com/courses/10287");
    expect(result.error).toContain("Courses table");
    expect(result.error.toLowerCase()).toContain("lms cell");
    expect(result.error).toContain("Institution column");
    // The exact harmful advice finding 14 identified must be gone.
    expect(result.error).not.toContain("Set this course's Canvas URL on its course row");
  });

  // D1 (docs/import-course-export-to-intro-video-acceptance-criteria.md,
  // finding F4): the Courses-table remedy above assumes a live Canvas
  // connection to link. An instructor holding only a course export had no
  // remedy this message named, and the one path that could help them - the
  // Course Content source picker's import control - was nine undiscoverable
  // clicks away. This message must now also name that route as a third,
  // independent remedy (facts, not exact prose, per D2).
  it("D1: the 'not linked' message also names the Course Content import route, alongside the Courses table remedy", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [] } as never);

    const result = await resolveLmsCourseRowAction("https://school.instructure.com/courses/10287");

    expect("error" in result).toBe(true);
    if (!("error" in result)) throw new Error("expected an error");
    expect(result.error.toLowerCase()).toContain("import");
    expect(result.error).toContain("Course Content");
  });
});
