// Tests for listBulkItems's Assignment/Quiz split and New Quiz routing
// (docs/assignments-quizzes-tabs-acceptance-criteria.md Contract 1, AC C, E1,
// E3, E4). Mirrors module-content.test.ts's pattern: only globalThis.fetch is
// stubbed, resolveCourse/fetchAll run for real, so the assertions are about
// the actual request/response shape.
//
// No bulk.test.ts existed before this change (checked via Glob before
// writing this file).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { listBulkItems, bulkUpdate } from "./bulk";

const COURSE_URL = "https://canvas.mccneb.edu/courses/123";

function jsonResponse(body: unknown, linkHeader: string | null = null) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    headers: { get: (name: string) => (name.toLowerCase() === "link" ? linkHeader : null) },
  } as unknown as Response;
}

let requested: string[] = [];

function stubCanvas(handlers: { assignments?: unknown[][]; quizzes?: unknown[] }) {
  requested = [];
  const assignmentPages = handlers.assignments ?? [[]];
  const fetchMock = vi.fn(async (url: string | URL) => {
    const href = String(url);
    requested.push(href);

    if (href.includes("/assignments")) {
      // Page-by-page: the first call always hits the base URL (no `page=`
      // param in this app's URLs - pagination is driven purely by the Link
      // header per fetch-helpers.ts), so index by call count.
      const priorAssignmentCalls = requested.filter((u) => u.includes("/assignments")).length - 1;
      const page = assignmentPages[priorAssignmentCalls] ?? [];
      const isLastPage = priorAssignmentCalls >= assignmentPages.length - 1;
      const link = isLastPage ? null : `<${href}&page_marker=${priorAssignmentCalls + 1}>; rel="next"`;
      return jsonResponse(page, link);
    }
    if (href.includes("/quizzes")) {
      return jsonResponse(handlers.quizzes ?? []);
    }
    return jsonResponse([]);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.stubEnv("MCC_CANVAS_API_TOKEN", "test-token");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

// A genuine New Quiz's assignment JSON shape, per new-quiz.ts's evidence.
const NEW_QUIZ_ASSIGNMENT = {
  id: 901,
  name: "Chapter 3 New Quiz",
  published: true,
  due_at: "2026-03-01T00:00:00Z",
  points_possible: 10,
  submission_types: ["external_tool"],
  is_quiz_assignment: true,
  quiz_id: null,
};

const ORDINARY_ASSIGNMENT = {
  id: 902,
  name: "Essay 1",
  published: true,
  due_at: "2026-03-02T00:00:00Z",
  points_possible: 100,
  submission_types: ["online_upload"],
};

const CLASSIC_QUIZ_SHADOW_ASSIGNMENT = {
  id: 903,
  name: "Classic Quiz",
  published: true,
  due_at: null,
  points_possible: 5,
  submission_types: ["online_quiz"],
  quiz_id: 55,
};

const CLASSIC_QUIZ = {
  id: 55,
  title: "Classic Quiz",
  published: true,
  due_at: null,
  points_possible: 5,
};

// A graded discussion's shadow assignment: same shape of hazard as a classic
// quiz's shadow (Finding 1) - Canvas creates one of these for every graded
// discussion, and this app already models discussions as their own BulkKind
// ("Discussion") with their own /discussion_topics listing, never through
// the Assignment tab.
const GRADED_DISCUSSION_SHADOW_ASSIGNMENT = {
  id: 904,
  name: "Week 3 Discussion",
  published: true,
  due_at: "2026-03-06T00:00:00Z",
  points_possible: 20,
  submission_types: ["discussion_topic"],
  discussion_topic: { id: 77 },
};

// Finding 3: the same shape as above, but Canvas's own docs say
// `discussion_topic` is present only "if applicable" - this fixture models a
// row where the field is genuinely absent, which courseItems-modules.ts must
// treat as UNKNOWN module status, never "no module".
const GRADED_DISCUSSION_SHADOW_ASSIGNMENT_NO_TOPIC_ID = {
  id: 905,
  name: "Week 4 Discussion",
  published: true,
  due_at: null,
  points_possible: 10,
  submission_types: ["discussion_topic"],
};

// BUG FIX (live report 2026-08-22): the Assignments tab used to EXCLUDE New
// Quizzes, classic-quiz shadow assignment rows, and graded-discussion shadow
// assignment rows, on the theory that none of them was "an assignment" the
// way the tab means it. That was the reported bug: a real course with one
// ordinary "Syllabus Acknowledgement" assignment plus three classic
// "Syllabus Acknowledgement" quizzes shows all FOUR on Canvas's own
// Assignments page, but this tab silently showed only one. The fix returns
// every assignment-shaped row here now, each labelled for what it really is.
describe("listBulkItems('Assignment') now returns every assignment-shaped row, each labelled (bug fix)", () => {
  it("includes a row the classifier flags as a New Quiz alongside an ordinary assignment, both present and correctly flagged", async () => {
    stubCanvas({ assignments: [[NEW_QUIZ_ASSIGNMENT, ORDINARY_ASSIGNMENT]] });

    const items = await listBulkItems(COURSE_URL, "Assignment", "MCC");

    expect(items.map((i) => i.id).sort()).toEqual(["901", "902"]);
    expect(items.find((i) => i.id === "901")?.isNewQuiz).toBe(true);
    expect(items.find((i) => i.id === "902")?.isNewQuiz).toBeUndefined();
    expect(items.find((i) => i.id === "902")?.title).toBe("Essay 1");
  });

  it("includes a Classic quiz's shadow assignment row (quiz_id populated), flagged isClassicQuizShadow with its own shadowQuizId, alongside an ordinary assignment", async () => {
    stubCanvas({ assignments: [[CLASSIC_QUIZ_SHADOW_ASSIGNMENT, ORDINARY_ASSIGNMENT]] });

    const items = await listBulkItems(COURSE_URL, "Assignment", "MCC");

    expect(items.map((i) => i.id).sort()).toEqual(["902", "903"]);
    const shadow = items.find((i) => i.id === "903");
    expect(shadow?.isClassicQuizShadow).toBe(true);
    expect(shadow?.shadowQuizId).toBe(55);
    expect(shadow?.isNewQuiz).toBeUndefined();
    const ordinary = items.find((i) => i.id === "902");
    expect(ordinary?.isClassicQuizShadow).toBeUndefined();
    expect(ordinary?.shadowQuizId).toBeUndefined();
  });

  it("includes a graded discussion's shadow assignment row (submission_types includes discussion_topic), flagged isGradedDiscussionShadow, carrying the discussion topic's own id (finding 3)", async () => {
    stubCanvas({ assignments: [[GRADED_DISCUSSION_SHADOW_ASSIGNMENT, ORDINARY_ASSIGNMENT]] });

    const items = await listBulkItems(COURSE_URL, "Assignment", "MCC");

    expect(items.map((i) => i.id).sort()).toEqual(["902", "904"]);
    const shadow = items.find((i) => i.id === "904");
    expect(shadow?.isGradedDiscussionShadow).toBe(true);
    expect(shadow?.isClassicQuizShadow).toBeUndefined();
    expect(shadow?.isNewQuiz).toBeUndefined();
    expect(shadow?.shadowDiscussionTopicId).toBe(77);
  });

  it("finding 3: a graded-discussion shadow row whose payload genuinely has no discussion_topic id leaves shadowDiscussionTopicId undefined, never a fabricated 0/null", async () => {
    stubCanvas({ assignments: [[GRADED_DISCUSSION_SHADOW_ASSIGNMENT_NO_TOPIC_ID]] });

    const items = await listBulkItems(COURSE_URL, "Assignment", "MCC");

    const shadow = items.find((i) => i.id === "905");
    expect(shadow?.isGradedDiscussionShadow).toBe(true);
    expect(shadow?.shadowDiscussionTopicId).toBeUndefined();
  });

  it("never mislabels a graded discussion's shadow assignment as a New Quiz in the Quiz tab either", async () => {
    stubCanvas({ assignments: [[GRADED_DISCUSSION_SHADOW_ASSIGNMENT]], quizzes: [CLASSIC_QUIZ] });

    const items = await listBulkItems(COURSE_URL, "Quiz", "MCC");

    // Only the Classic quiz - the graded discussion's shadow row belongs
    // only in the Assignments tab (there is no flat Discussions tab yet).
    expect(items.map((i) => i.id)).toEqual(["55"]);
  });
});

// THE EXACT REPORTED COURSE SHAPE: one real assignment plus three classic
// quizzes, all titled "Syllabus Acknowledgement" (verified against the
// user's own .imscc export). Pins A1 directly: all four Canvas objects must
// surface in the Assignments tab, and the three quiz shadows must also each
// resolve (by their OWN quiz id, never the shadow assignment id) in the
// Quizzes tab.
const SYLLABUS_ACK_ASSIGNMENT = {
  id: 950,
  name: "Syllabus Acknowledgement",
  published: true,
  due_at: "2026-09-04T23:59:00Z",
  points_possible: 100,
  submission_types: ["online_text_entry"],
};
const SYLLABUS_ACK_QUIZ_IDS = [61, 62, 63];
const SYLLABUS_ACK_QUIZ_SHADOWS = SYLLABUS_ACK_QUIZ_IDS.map((quizId, i) => ({
  id: 970 + i,
  name: "Syllabus Acknowledgement",
  published: true,
  due_at: null,
  points_possible: 1,
  submission_types: ["online_quiz"],
  quiz_id: quizId,
}));
const SYLLABUS_ACK_QUIZZES = SYLLABUS_ACK_QUIZ_IDS.map((quizId) => ({
  id: quizId,
  title: "Syllabus Acknowledgement",
  published: true,
  due_at: null,
  points_possible: 1,
}));

describe("THE REPORTED BUG: one real assignment + three classic quizzes, all titled 'Syllabus Acknowledgement'", () => {
  it("the Assignments tab lists all four objects - the real assignment plus every classic-quiz shadow row, none silently dropped", async () => {
    stubCanvas({ assignments: [[SYLLABUS_ACK_ASSIGNMENT, ...SYLLABUS_ACK_QUIZ_SHADOWS]] });

    const items = await listBulkItems(COURSE_URL, "Assignment", "MCC");

    expect(items).toHaveLength(4);
    expect(items.every((i) => i.title === "Syllabus Acknowledgement")).toBe(true);
    const shadows = items.filter((i) => i.isClassicQuizShadow);
    expect(shadows).toHaveLength(3);
    expect(shadows.map((i) => i.shadowQuizId).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual(SYLLABUS_ACK_QUIZ_IDS);
    const ordinary = items.filter((i) => !i.isClassicQuizShadow);
    expect(ordinary).toHaveLength(1);
    expect(ordinary[0].id).toBe("950");
  });

  it("each of the three quiz shadows also resolves in the Quizzes tab by its OWN quiz id (61/62/63), never by its shadow assignment id (970/971/972)", async () => {
    stubCanvas({ assignments: [[SYLLABUS_ACK_ASSIGNMENT, ...SYLLABUS_ACK_QUIZ_SHADOWS]], quizzes: SYLLABUS_ACK_QUIZZES });

    const quizItems = await listBulkItems(COURSE_URL, "Quiz", "MCC");

    expect(quizItems.map((i) => i.id).sort()).toEqual(["61", "62", "63"]);
    expect(quizItems.every((i) => i.isNewQuiz === undefined)).toBe(true);
    // The shadow assignment ids must never leak into the Quiz tab.
    for (const shadowId of ["970", "971", "972"]) {
      expect(quizItems.map((i) => i.id)).not.toContain(shadowId);
    }
  });
});

describe("listBulkItems('Quiz') includes Classic AND New Quizzes, each labelled (C2)", () => {
  it("returns the classic quiz unflagged and the New Quiz flagged isNewQuiz: true", async () => {
    stubCanvas({
      assignments: [[NEW_QUIZ_ASSIGNMENT, ORDINARY_ASSIGNMENT]],
      quizzes: [CLASSIC_QUIZ],
    });

    const items = await listBulkItems(COURSE_URL, "Quiz", "MCC");
    const byId = new Map(items.map((i) => [i.id, i]));

    expect(byId.get("55")?.isNewQuiz).toBeUndefined();
    expect(byId.get("901")?.isNewQuiz).toBe(true);
    expect(byId.get("901")?.title).toBe("Chapter 3 New Quiz");
    // The ordinary (non-quiz) assignment must never leak into the Quiz list.
    expect(byId.has("902")).toBe(false);
  });

  it("excludes a classic quiz's own shadow assignment from the New Quiz set (disqualifying quiz_id)", async () => {
    stubCanvas({
      assignments: [[CLASSIC_QUIZ_SHADOW_ASSIGNMENT]],
      quizzes: [CLASSIC_QUIZ],
    });

    const items = await listBulkItems(COURSE_URL, "Quiz", "MCC");

    // Only one "Classic Quiz" row - the shadow assignment (903) must not
    // also appear as a second, separately-flagged New Quiz row.
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("55");
  });
});

// BUG FIX UPDATE: a Classic quiz and a New Quiz may now legitimately appear
// in BOTH tabs at once - that reversal is the whole point of the fix (Canvas
// itself double-lists a quiz under both its Assignments and Quizzes pages).
// What must NEVER happen is a row appearing TWICE WITHIN the same tab, or the
// shadow assignment id ever being mistaken for the quiz's own id.
describe("Classic and New Quiz rows may legitimately appear in both tabs now, never duplicated WITHIN one tab", () => {
  it("a Classic quiz's shadow assignment row (Assignments tab) and its own /quizzes record (Quizzes tab) are two DIFFERENT ids for the same object - by design, not a bug", async () => {
    stubCanvas({
      assignments: [[NEW_QUIZ_ASSIGNMENT, ORDINARY_ASSIGNMENT, CLASSIC_QUIZ_SHADOW_ASSIGNMENT]],
      quizzes: [CLASSIC_QUIZ],
    });
    const assignmentItems = await listBulkItems(COURSE_URL, "Assignment", "MCC");
    stubCanvas({
      assignments: [[NEW_QUIZ_ASSIGNMENT, ORDINARY_ASSIGNMENT, CLASSIC_QUIZ_SHADOW_ASSIGNMENT]],
      quizzes: [CLASSIC_QUIZ],
    });
    const quizItems = await listBulkItems(COURSE_URL, "Quiz", "MCC");

    // Neither list contains a row twice WITHIN itself.
    expect(new Set(assignmentItems.map((i) => i.id)).size).toBe(assignmentItems.length);
    expect(new Set(quizItems.map((i) => i.id)).size).toBe(quizItems.length);

    // The shadow assignment's own id (903) surfaces in the Assignments tab,
    // labelled - it is a real, distinct row now, not suppressed.
    const shadowRow = assignmentItems.find((i) => i.id === "903");
    expect(shadowRow?.isClassicQuizShadow).toBe(true);
    expect(shadowRow?.shadowQuizId).toBe(55);
    // The quiz's own id (55) surfaces separately in the Quizzes tab.
    expect(quizItems.map((i) => i.id)).toContain("55");
    // 903 must never appear in the Quizzes tab (it is not a quiz id).
    expect(quizItems.map((i) => i.id)).not.toContain("903");

    // A New Quiz (901) now appears in BOTH tabs - both are the SAME
    // assignment id, never a second, different id invented for either tab.
    expect(assignmentItems.find((i) => i.id === "901")?.isNewQuiz).toBe(true);
    expect(quizItems.find((i) => i.id === "901")?.isNewQuiz).toBe(true);

    // The ordinary assignment (902) appears only in the Assignments tab.
    expect(assignmentItems.map((i) => i.id)).toContain("902");
    expect(quizItems.map((i) => i.id)).not.toContain("902");
  });
});

describe("pagination still works for both kinds after the Assignment-branch bug fix (E1)", () => {
  it("Assignment: follows the Link header across pages, keeping every row (including New Quizzes) from EACH page", async () => {
    stubCanvas({
      assignments: [
        [NEW_QUIZ_ASSIGNMENT, ORDINARY_ASSIGNMENT],
        [{ ...ORDINARY_ASSIGNMENT, id: 999, name: "Essay 2 (page 2)" }],
      ],
    });

    const items = await listBulkItems(COURSE_URL, "Assignment", "MCC");

    expect(items.map((i) => i.id).sort()).toEqual(["901", "902", "999"]);
    expect(items.find((i) => i.id === "901")?.isNewQuiz).toBe(true);
  });

  it("Quiz: multi-page assignments AND multi-page quizzes both fully resolve", async () => {
    // Two assignment pages (page 2 carries a New Quiz that must still be
    // picked up even though exclusion removed rows from page 1).
    const fetchMock = vi.fn(async (url: string | URL) => {
      const href = String(url);
      requested.push(href);
      if (href.includes("/assignments")) {
        const priorAssignmentCalls = requested.filter((u) => u.includes("/assignments")).length - 1;
        if (priorAssignmentCalls === 0) {
          return jsonResponse([ORDINARY_ASSIGNMENT], `<${href}&page=2>; rel="next"`);
        }
        return jsonResponse([NEW_QUIZ_ASSIGNMENT], null);
      }
      if (href.includes("/quizzes")) {
        const priorQuizCalls = requested.filter((u) => u.includes("/quizzes")).length - 1;
        if (priorQuizCalls === 0) {
          return jsonResponse([CLASSIC_QUIZ], `<${href}&page=2>; rel="next"`);
        }
        return jsonResponse([{ ...CLASSIC_QUIZ, id: 56, title: "Classic Quiz 2 (page 2)" }], null);
      }
      return jsonResponse([]);
    });
    requested = [];
    vi.stubGlobal("fetch", fetchMock);

    const items = await listBulkItems(COURSE_URL, "Quiz", "MCC");

    expect(items.map((i) => i.id).sort()).toEqual(["55", "56", "901"]);
    expect(items.find((i) => i.id === "901")?.isNewQuiz).toBe(true);
    expect(items.find((i) => i.id === "55")?.isNewQuiz).toBeUndefined();
    expect(items.find((i) => i.id === "56")?.isNewQuiz).toBeUndefined();
  });
});

describe("bulkUpdate's assignment[published]/quiz[published] request shape (B2, E4)", () => {
  it("PUTs assignment[published] for kind Assignment", async () => {
    const calls: { url: string; method: string; body: string }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        calls.push({ url: String(url), method: String(init?.method), body: String(init?.body ?? "") });
        return jsonResponse({});
      })
    );

    await bulkUpdate(COURSE_URL, "Assignment", ["42"], { published: true }, "MCC");

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("/assignments/42");
    expect(calls[0].method).toBe("PUT");
    expect(calls[0].body).toBe("assignment%5Bpublished%5D=true");
  });

  it("PUTs quiz[published] for kind Quiz - the path B2 says has never been exercised by the UI", async () => {
    const calls: { url: string; method: string; body: string }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        calls.push({ url: String(url), method: String(init?.method), body: String(init?.body ?? "") });
        return jsonResponse({});
      })
    );

    await bulkUpdate(COURSE_URL, "Quiz", ["901"], { published: false }, "MCC");

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("/quizzes/901");
    expect(calls[0].method).toBe("PUT");
    expect(calls[0].body).toBe("quiz%5Bpublished%5D=false");
  });
});
